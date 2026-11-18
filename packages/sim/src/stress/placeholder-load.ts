import type { GameState } from '../core/game-state';
import type { SystemRegistry } from '../core/systems';
import { fillStockpile, setBuildingLevel } from '../economy/buildings';
import { economySystems } from '../economy/economy';
import { populationSystem } from '../economy/population';
import { neighborsOf } from '../world/world-map';
import type { SimStressConfig } from './stress-config';

/**
 * The sim stress test's **placeholder load** (F139, [DEFAULT] sizes in
 * `data/stress_test.json` → `sim`): systems that do about the work the
 * late-game sim will do, so the campaign runner can measure tick times and
 * memory before the real systems exist. They are NOT the game's rules: the
 * numbers they compute mean nothing and nothing reads them. They only have
 * the right size and shape: typed arrays, loops over provinces, pop groups,
 * buildings, markets, trade routes, units and the province graph, random
 * choices from the sim's RNG, no allocation in the daily tick.
 *
 * **Since F06 the pops are the real ones** (`GameState.population`, six pop
 * groups per province): the real population system runs in its slot, and the
 * placeholder pieces that need pops (buying needs on the markets, staffing
 * buildings, paying taxes) read the real pops' sizes.
 *
 * **Since F07 the real buildings run too** (`GameState.buildings`): the
 * building systems run in their slots (energy, resourceProduction,
 * industry), with every building type in every province, as in a late game.
 * The placeholder buildings only make up the rest of `buildingsPerProvince`;
 * since the building catalog (F85, 26 types) there are none left.
 *
 * **Since F65 the real markets run too** (the `market` slot): pops buy their
 * needs there, prices, wages and wealth move weekly. The placeholder's own
 * markets only feed the placeholder trade routes (until trade, F19).
 *
 * Daily: buildings produce from recipes (industry), trade routes move goods (trade), taxes are collected (budget),
 * supply flows over the province graph and units draw it (supply), the
 * Swarm grows and spreads (swarmGrowth, swarmSpread), laser coverage
 * (laserCoverage), battles (combat).
 * Weekly: market prices (trade), corporations weigh investments (industry),
 * every country's AI scores its options (diplomacyAi).
 *
 * Each placeholder sits in the slot of the system it stands in for, so the
 * runner's per-system times already point at the future hot spots.
 */
export interface PlaceholderLoad {
  /** The systems to give `GameState` (its `systems` option). */
  readonly systems: SystemRegistry;
  /**
   * Makes the load's arrays for a new campaign, as starting a new game will
   * (otherwise the first day does it, which makes it look slow).
   */
  prepare(state: GameState): void;
  /** Bytes the load keeps in typed arrays (0 until `prepare` or the first day made them). */
  bytes(): number;
}

export function createPlaceholderLoad(
  config: SimStressConfig,
  scaleOverride?: number,
): PlaceholderLoad {
  const scale = scaleOverride ?? config.scale;
  const scaled = (n: number) => Math.max(0, Math.round(n * scale));
  let load: Load | null = null;
  const loadOf = (state: GameState) => (load ??= createLoad(state, config, scaled));

  const systems: SystemRegistry = {
    // The real population system (F06).
    population: populationSystem,
    // The real buildings (F07): power plants, then farms and mines, then the rest.
    energy: economySystems.energy,
    resourceProduction: economySystems.resourceProduction,
    industry: {
      // The real industry step, then the placeholder buildings that make up the number.
      daily: (state) => {
        economySystems.industry?.daily?.(state);
        loadOf(state).produce(state);
      },
      weekly: (state) => loadOf(state).corporationsInvest(state),
    },
    // The real markets (F65): the pops' shopping, prices, wages and wealth.
    market: economySystems.market,
    trade: {
      daily: (state) => loadOf(state).trade(),
      weekly: (state) => loadOf(state).updatePrices(),
    },
    budget: { daily: (state) => loadOf(state).collectTaxes(state) },
    supply: { daily: (state) => loadOf(state).supply(state) },
    diplomacyAi: { weekly: (state) => loadOf(state).countryAi(state) },
    swarmGrowth: { daily: (state) => loadOf(state).swarmGrowth(state) },
    swarmSpread: { daily: (state) => loadOf(state).swarmSpread(state) },
    laserCoverage: { daily: (state) => loadOf(state).laserCoverage(state) },
    combat: { daily: (state) => loadOf(state).combat(state) },
  };
  return { systems, prepare: (state) => void loadOf(state), bytes: () => load?.bytes ?? 0 };
}

interface Load {
  produce(state: GameState): void;
  corporationsInvest(state: GameState): void;
  trade(): void;
  updatePrices(): void;
  collectTaxes(state: GameState): void;
  supply(state: GameState): void;
  countryAi(state: GameState): void;
  swarmGrowth(state: GameState): void;
  swarmSpread(state: GameState): void;
  laserCoverage(state: GameState): void;
  combat(state: GameState): void;
  /** Bytes held in typed arrays (for the runner's memory report). */
  readonly bytes: number;
}

function createLoad(
  state: GameState,
  config: SimStressConfig,
  scaled: (n: number) => number,
): Load {
  const { world, rng } = state;
  const provinces = world.provinceIds.length;
  const countries = world.countryIds.length;
  const goods = config.goods;
  // The real pops (F06): their number isn't scaled.
  const groups = state.population.groupCount;
  const needs = config.needsPerPop;
  // The real buildings (F07): every type in every province, as in a late
  // game, with stockpiles to run on. Placeholder buildings make up the rest.
  const real = state.buildings;
  for (let province = 0; province < provinces; province++)
    for (let type = 0; type < real.typeCount; type++)
      if (real.level[province * real.typeCount + type] === 0)
        setBuildingLevel(state, province, type, 1);
  for (let country = 0; country < countries; country++)
    fillStockpile(state, country, real.startingDays);
  const perProvince = Math.max(0, scaled(config.buildingsPerProvince) - real.typeCount);
  const inputs = config.inputsPerBuilding;
  const outputs = config.outputsPerBuilding;
  const routes = scaled(config.tradeRoutes);
  const units = scaled(config.units);
  const battles = scaled(config.battles);
  const side = scaled(config.unitsPerBattleSide);
  const corporations = scaled(config.corporations);
  const investments = scaled(config.investmentsPerCorporation);
  const aiOptions = scaled(config.aiOptionsPerCountry);

  const arrays: ArrayBufferView[] = [];
  const keep = <T extends ArrayBufferView>(array: T): T => {
    arrays.push(array);
    return array;
  };

  // ── Pops ──────────────────────────────────────────────────────────────
  const pops = provinces * groups;
  const popSize = state.population.size;
  const popWealth = keep(new Float64Array(pops));
  const popNeed = keep(new Uint16Array(pops * needs));
  const popJob = keep(new Int32Array(pops));
  const popSatisfaction = keep(new Float32Array(pops));
  for (let p = 0; p < pops; p++) {
    popWealth[p] = rng.nextFloat() * 10;
    for (let n = 0; n < needs; n++) popNeed[p * needs + n] = rng.nextInt(0, goods);
    popJob[p] =
      perProvince > 0 ? Math.floor(p / groups) * perProvince + rng.nextInt(0, perProvince) : -1;
  }

  // ── Markets (one per country) ─────────────────────────────────────────
  const marketSize = countries * goods;
  const supplyToday = keep(new Float64Array(marketSize));
  const demandToday = keep(new Float64Array(marketSize));
  const supplyWeek = keep(new Float64Array(marketSize));
  const demandWeek = keep(new Float64Array(marketSize));
  const price = keep(new Float64Array(marketSize).fill(1));
  const treasury = keep(new Float64Array(countries));

  // ── Buildings ─────────────────────────────────────────────────────────
  const buildings = provinces * perProvince;
  const level = keep(new Float32Array(buildings));
  const recipeIn = keep(new Uint16Array(buildings * inputs));
  const recipeOut = keep(new Uint16Array(buildings * outputs));
  const wage = keep(new Float32Array(buildings));
  const workers = keep(new Float64Array(buildings));
  for (let b = 0; b < buildings; b++) {
    level[b] = 1 + rng.nextInt(0, 10);
    wage[b] = 1 + rng.nextFloat();
    for (let i = 0; i < inputs; i++) recipeIn[b * inputs + i] = rng.nextInt(0, goods);
    for (let o = 0; o < outputs; o++) recipeOut[b * outputs + o] = rng.nextInt(0, goods);
  }

  // ── Trade routes ──────────────────────────────────────────────────────
  const routeFrom = keep(new Uint16Array(routes));
  const routeTo = keep(new Uint16Array(routes));
  for (let r = 0; r < routes; r++) {
    routeFrom[r] = rng.nextInt(0, countries);
    routeTo[r] = rng.nextInt(0, countries);
  }

  // ── Province values: supply, infestation, laser coverage ──────────────
  const supplyValue = keep(new Float32Array(provinces));
  const supplyNext = keep(new Float32Array(provinces));
  const infestation = keep(new Float32Array(provinces));
  const infestationNext = keep(new Float32Array(provinces));
  const laser = keep(new Float32Array(provinces));
  const provinceWealth = keep(new Float64Array(provinces));
  // The Swarm starts in a few provinces, as after the landings.
  for (let h = 0; h < 8 && provinces > 0; h++) infestation[rng.nextInt(0, provinces)] = 60;

  // ── Units and battles ─────────────────────────────────────────────────
  const unitProvince = keep(new Int32Array(units));
  const unitSupply = keep(new Float32Array(units).fill(1));
  const unitStrength = keep(new Float32Array(units).fill(1));
  for (let u = 0; u < units; u++) unitProvince[u] = rng.nextInt(0, provinces);
  const fighters = battles * side * 2;
  const fighterStrength = keep(new Float32Array(fighters).fill(1));
  const fighterMorale = keep(new Float32Array(fighters).fill(1));

  // ── Corporations and AI ───────────────────────────────────────────────
  const corporationCash = keep(new Float64Array(corporations).fill(100));
  const aiWeights = keep(new Float32Array(countries * aiOptions * 4));
  for (let i = 0; i < aiWeights.length; i++) aiWeights[i] = rng.nextFloat() * 2 - 1;
  const aiBest = keep(new Int32Array(countries));

  const bytes = arrays.reduce((sum, array) => sum + array.byteLength, 0);

  return {
    bytes,

    produce(current) {
      workers.fill(0);
      for (let p = 0; p < pops; p++) if (popJob[p] >= 0) workers[popJob[p]] += popSize[p] * 0.4;
      const owner = current.provinceOwner;
      for (let b = 0; b < buildings; b++) {
        const market = owner[(b / perProvince) | 0] * goods;
        let input = 1;
        for (let i = 0; i < inputs; i++) {
          const good = market + recipeIn[b * inputs + i];
          demandToday[good] += level[b];
          const available = supplyWeek[good] / (demandWeek[good] + 1e-9);
          if (available < input) input = available;
        }
        const staffed = Math.min(1, workers[b] / (level[b] * 5000));
        const made = level[b] * input * staffed;
        for (let o = 0; o < outputs; o++) supplyToday[market + recipeOut[b * outputs + o]] += made;
        wage[b] = 0.9 * wage[b] + 0.1 * (1 + made * 0.01);
      }
    },

    corporationsInvest(current) {
      // Each corporation weighs investments in random provinces and makes the best one.
      for (let c = 0; c < corporations; c++) {
        let bestScore = -Infinity;
        let bestProvince = 0;
        for (let i = 0; i < investments; i++) {
          const province = current.rng.nextInt(0, provinces);
          let score = provinceWealth[province] - infestation[province] * 10 + laser[province];
          for (let b = 0; b < perProvince; b++) score += wage[province * perProvince + b] * 0.01;
          if (score > bestScore) {
            bestScore = score;
            bestProvince = province;
          }
        }
        if (perProvince > 0 && corporationCash[c] > 50) {
          level[bestProvince * perProvince + current.rng.nextInt(0, perProvince)] += 0.01;
          corporationCash[c] -= 1;
        }
        corporationCash[c] += 1;
      }
    },

    trade() {
      for (let r = 0; r < routes; r++) {
        const from = routeFrom[r] * goods;
        const to = routeTo[r] * goods;
        for (let g = 0; g < goods; g++) {
          const gap = price[to + g] - price[from + g];
          if (gap <= 0) continue;
          const moved = Math.min(supplyToday[from + g] * 0.05, gap * 10);
          supplyToday[from + g] -= moved;
          supplyToday[to + g] += moved;
        }
      }
      // Today's market becomes the one the next days see (smoothed), then starts again.
      for (let m = 0; m < marketSize; m++) {
        supplyWeek[m] = 0.8 * supplyWeek[m] + 0.2 * supplyToday[m];
        demandWeek[m] = 0.8 * demandWeek[m] + 0.2 * demandToday[m];
        supplyToday[m] = 0;
        demandToday[m] = 0;
      }
    },

    updatePrices() {
      for (let m = 0; m < marketSize; m++) {
        const ratio = (demandWeek[m] + 1) / (supplyWeek[m] + 1);
        const target = Math.min(10, Math.max(0.1, ratio));
        price[m] = 0.7 * price[m] + 0.3 * target;
      }
    },

    collectTaxes(current) {
      const owner = current.provinceOwner;
      provinceWealth.fill(0);
      for (let p = 0; p < pops; p++) {
        const province = (p / groups) | 0;
        const tax = popWealth[p] * popSize[p] * 1e-7 * popSatisfaction[p];
        treasury[owner[province]] += tax;
        provinceWealth[province] += popWealth[p];
      }
    },

    supply(current) {
      const graph = world.provinceNeighbors;
      const owner = current.provinceOwner;
      for (let p = 0; p < provinces; p++) supplyValue[p] = provinceWealth[p] * 1e-3;
      for (let pass = 0; pass < config.supplyPasses; pass++) {
        for (let p = 0; p < provinces; p++) {
          let best = supplyValue[p];
          const from = graph.offsets[p];
          const to = graph.offsets[p + 1];
          for (let k = from; k < to; k++) {
            const q = graph.targets[k];
            const carried = supplyValue[q] * (owner[q] === owner[p] ? 0.9 : 0.5);
            if (carried > best) best = carried;
          }
          supplyNext[p] = best;
        }
        supplyValue.set(supplyNext);
      }
      for (let u = 0; u < units; u++) {
        const province = unitProvince[u];
        const drawn = Math.min(1 - unitSupply[u], supplyValue[province] * 0.01);
        unitSupply[u] += drawn - 0.02;
        if (unitSupply[u] < 0) unitSupply[u] = 0;
        unitStrength[u] = Math.min(1, unitStrength[u] + unitSupply[u] * 0.01);
        // Some units move to a neighboring province.
        if (current.rng.nextFloat() < 0.05) {
          const neighbors = neighborsOf(graph, province);
          if (neighbors.length > 0)
            unitProvince[u] = neighbors[current.rng.nextInt(0, neighbors.length)];
        }
      }
    },

    countryAi(current) {
      const byCountry = world.countryProvinces;
      for (let c = 0; c < countries; c++) {
        const from = byCountry.offsets[c];
        const to = byCountry.offsets[c + 1];
        let best = -1;
        let bestScore = -Infinity;
        for (let o = 0; o < aiOptions; o++) {
          const w = (c * aiOptions + o) * 4;
          let score = treasury[c] * aiWeights[w] * 1e-6;
          for (let k = from; k < to; k++) {
            const p = byCountry.targets[k];
            score +=
              aiWeights[w + 1] * infestation[p] +
              aiWeights[w + 2] * supplyValue[p] +
              aiWeights[w + 3] * laser[p];
          }
          if (score > bestScore) {
            bestScore = score;
            best = o;
          }
        }
        aiBest[c] = best;
        // A small random change, as an AI that learns would make.
        if (aiOptions > 0)
          aiWeights[(c * aiOptions + current.rng.nextInt(0, aiOptions)) * 4] *= 0.99;
      }
    },

    swarmGrowth(current) {
      for (let p = 0; p < provinces; p++) {
        const value = infestation[p];
        if (value <= 0) continue;
        infestation[p] = Math.min(100, value + 0.05 + (current.rng.nextFloat() - 0.4) * 0.1);
      }
    },

    swarmSpread() {
      const graph = world.provinceNeighbors;
      for (let p = 0; p < provinces; p++) {
        let value = infestation[p];
        const from = graph.offsets[p];
        const to = graph.offsets[p + 1];
        for (let k = from; k < to; k++) {
          const neighbor = infestation[graph.targets[k]];
          if (neighbor > 50) value += (neighbor - 50) * 0.002;
        }
        infestationNext[p] = Math.min(100, value);
      }
      infestation.set(infestationNext);
    },

    laserCoverage() {
      const graph = world.provinceNeighbors;
      for (let p = 0; p < provinces; p++) {
        let coverage = infestation[p];
        const from = graph.offsets[p];
        const to = graph.offsets[p + 1];
        for (let k = from; k < to; k++) {
          const q = graph.targets[k];
          // Coverage reaches two provinces out.
          const from2 = graph.offsets[q];
          const to2 = graph.offsets[q + 1];
          let around = infestation[q];
          for (let j = from2; j < to2; j++)
            around = Math.max(around, infestation[graph.targets[j]] * 0.5);
          coverage = Math.max(coverage, around * 0.8);
        }
        laser[p] = coverage;
      }
    },

    combat(current) {
      for (let b = 0; b < battles; b++) {
        const first = b * side * 2;
        for (let f = 0; f < side * 2; f++) {
          const fighter = first + f;
          if (fighterStrength[fighter] <= 0) {
            // A fresh unit takes the fallen one's place.
            fighterStrength[fighter] = 1;
            fighterMorale[fighter] = 1;
            continue;
          }
          const enemySide = f < side ? side : 0;
          const target = first + enemySide + current.rng.nextInt(0, side);
          const hit = 0.02 * fighterStrength[fighter] * fighterMorale[fighter];
          fighterStrength[target] -= hit * (0.5 + current.rng.nextFloat());
          fighterMorale[target] -= hit * 0.5;
          if (fighterMorale[fighter] < 1) fighterMorale[fighter] += 0.01;
        }
      }
    },
  };
}
