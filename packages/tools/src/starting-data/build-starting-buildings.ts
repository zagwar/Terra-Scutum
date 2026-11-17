import {
  type BuildingStartFile,
  type BuildingsConfig,
  type CountryStartFile,
  type PopsConfig,
  startingGroupShares,
} from '@terra-scutum/sim';
import { z } from 'zod';
import { shareWholeNumbers } from './province-population';
import type { ProductionSnapshot } from './snapshot-production';

/**
 * Builds `data/building_start.json` (F85): every country's starting
 * buildings from real production figures. Pure: no files, no network, so it
 * is unit tested with small inputs. The rules (all [DEFAULT], numbers in
 * `starting-data/production.json`):
 *
 * - **How much each country makes** (a day): coal, crude oil and natural gas
 *   from the energy dataset (2024; converted from TWh to tonnes); oil
 *   refining from the country's oil use; electricity of each kind of power
 *   plant from what it really generated (other renewables, bioenergy and
 *   geothermal count as hydro, oil-fired as gas); steel, iron ore, copper,
 *   bauxite, aluminum and silicon from the hand-written tables; fish from
 *   the World Bank; grain half from the real cereal harvest and half from
 *   the farm economy (value added at local prices), scaled to the world's
 *   grain; livestock from the farm economy; chemicals, plastic, processed
 *   food, electronics and consumer goods from manufacturing (value added at local prices),
 *   scaled to world totals; quarries for the stone the silicon plants need.
 * - **Levels:** what a country makes ÷ what one level makes, rounded (at
 *   least one level from `minimumShareOfALevel` of a level).
 * - **Production methods:** a country's **productivity** sets how many
 *   workers a level needs on average, and the levels are split between the
 *   two methods around that number (the more labor-intensive one in the more
 *   rural provinces). In farming it is whatever makes the farms, ranches and
 *   fisheries employ the country's real farm workers (World Bank); in
 *   industry it is value added per worker at local prices compared with the
 *   reference country. Industry jobs the catalog doesn't cover yet
 *   (construction, vehicles, machinery, textiles…) stay with the stand-in
 *   economy.
 * - **Power:** a country whose power plants can't make what its buildings
 *   need gets more of its biggest kind of plant (or gas plants).
 * - **Where:** the main producing provinces of `mainProvinces`, else the rule
 *   of `placement` (population, rural, coastal or land).
 */

const countryCode = z.string().regex(/^[A-Z]{3}$/);
const weights = z.record(z.string(), z.number().positive());

export const productionConfigSchema = z.strictObject({
  year: z.int(),
  note: z.string(),
  handTables: z.strictObject({
    note: z.string(),
    sources: z.record(z.string(), z.string()),
    steel: z.record(countryCode, z.number().min(0)),
    ironOre: z.record(countryCode, z.number().min(0)),
    copperMine: z.record(countryCode, z.number().min(0)),
    copperRefined: z.record(countryCode, z.number().min(0)),
    bauxite: z.record(countryCode, z.number().min(0)),
    aluminum: z.record(countryCode, z.number().min(0)),
    silicon: z.record(countryCode, z.number().min(0)),
  }),
  mainProvinces: z
    .object({ note: z.string() })
    .catchall(z.union([z.string(), z.record(countryCode, weights)])),
  placement: z.strictObject({
    note: z.string(),
    cityDensity: z.number().positive(),
    cityTimesAverage: z.number().min(1),
    cityWeight: z.number().min(0).max(1),
    emptyTimesAverage: z.number().min(0).max(1),
    rules: z.record(z.string(), z.enum(['population', 'rural', 'coastal', 'land'])),
  }),
  rules: z.strictObject({
    note: z.string(),
    conversions: z.strictObject({
      coalMwhPerTonne: z.number().positive(),
      oilMwhPerTonne: z.number().positive(),
      gasMwhPerTonne: z.number().positive(),
      copperOrePerCopper: z.number().positive(),
      refineryShareOfOilUse: z.number().min(0).max(2),
    }),
    farming: z.strictObject({
      worldGrainMt: z.number().positive(),
      realCerealWeight: z.number().min(0).max(1),
      worldLivestockMt: z.number().positive(),
    }),
    manufacturingWorldMt: z.record(z.string(), z.number().positive()),
    productivity: z.strictObject({
      referenceCountry: countryCode,
      maxFactor: z.number().min(1),
      /**
       * Types whose productivity is set so they employ a real number of
       * workers: the country's farm workers (agriculture), or this share of
       * its industry workers (lightIndustry: textiles, furniture, appliances…).
       */
      sectors: z.record(z.string(), z.enum(['agriculture', 'lightIndustry'])),
      lightIndustryShareOfIndustryJobs: z.number().min(0).max(1),
    }),
    levels: z.strictObject({ minimumShareOfALevel: z.number().min(0).max(1) }),
    power: z.strictObject({ note: z.string(), fallbackPlant: z.string() }),
  }),
});
export type ProductionConfig = z.infer<typeof productionConfigSchema>;

/** A province as the builder needs it. */
export interface StartProvince {
  readonly id: string;
  readonly country: string;
  readonly areaKm2: number;
  readonly coastal: boolean;
  readonly population: number;
}

/** One country's line in the report. */
export interface CountryBuildingsRow {
  readonly id: string;
  readonly employed: number;
  /** Real jobs in farming and in industry (World Bank). */
  readonly agricultureJobs: number;
  readonly industryJobs: number;
  /** Workers per level compared with the reference country, in farming and in industry. */
  readonly agricultureFactor: number;
  readonly industryFactor: number;
  /** The same for the consumer goods factories (light industry). */
  readonly lightIndustryFactor: number;
  /** Jobs the starting buildings offer: on farms, ranches and fisheries, and in the rest. */
  readonly buildingAgricultureJobs: number;
  readonly buildingIndustryJobs: number;
  /** Levels per building type. */
  readonly levels: Readonly<Record<string, number>>;
}

export interface StartingBuildingsResult {
  readonly file: BuildingStartFile;
  readonly rows: readonly CountryBuildingsRow[];
  /** Per good: what the starting buildings make in a year at full output, in the good's unit. */
  readonly worldMade: Readonly<Record<string, number>>;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

const DAYS = 365;

/** Which good a building type is sized by: its first method's first output. */
function mainOutput(type: BuildingsConfig['buildings'][number]): [string, number] {
  const [good, amount] = Object.entries(type.methods[0].outputs)[0];
  return [good, amount];
}

const jobsOf = (method: BuildingsConfig['buildings'][number]['methods'][number]) =>
  Object.values(method.workers).reduce((a, b) => a + b, 0);

/**
 * How a country's levels of a type are split between its methods, for an
 * average of `target` jobs a level: the share of levels on each method.
 * Methods are in the data's order (the first is the modern one).
 */
export function methodMix(jobs: readonly number[], target: number): number[] {
  const mix = jobs.map(() => 0);
  const order = jobs.map((_, i) => i).sort((a, b) => jobs[a] - jobs[b] || a - b);
  if (target <= jobs[order[0]]) mix[order[0]] = 1;
  else if (target >= jobs[order[order.length - 1]]) mix[order[order.length - 1]] = 1;
  else
    for (let k = 0; k + 1 < order.length; k++) {
      const low = jobs[order[k]];
      const high = jobs[order[k + 1]];
      if (target <= high) {
        const share = high > low ? (target - low) / (high - low) : 0;
        mix[order[k]] = 1 - share;
        mix[order[k + 1]] = share;
        break;
      }
    }
  return mix;
}

/** Rounds what a country makes to levels: nearest, but at least one from `minimum` of a level. */
export function levelsFor(perDay: number, perLevel: number, minimum: number): number {
  if (!(perDay > 0) || !(perLevel > 0)) return 0;
  const exact = perDay / perLevel;
  const rounded = Math.round(exact);
  if (rounded > 0) return Math.min(65535, rounded);
  return exact >= minimum && minimum > 0 ? 1 : 0;
}

export function buildStartingBuildings(input: {
  readonly config: ProductionConfig;
  readonly snapshot: ProductionSnapshot;
  readonly countries: CountryStartFile['countries'];
  readonly provinces: readonly StartProvince[];
  readonly buildings: BuildingsConfig;
  readonly pops: PopsConfig;
  readonly year: number;
}): StartingBuildingsResult {
  const { config, snapshot, countries, provinces, buildings, pops } = input;
  const rules = config.rules;
  const warnings: string[] = [];
  const errors: string[] = [];
  const types = buildings.buildings;
  const typeById = new Map(types.map((type) => [type.id, type]));
  const countryIds = new Set(countries.map((c) => c.id));
  const provinceById = new Map(provinces.map((p) => [p.id, p]));

  // Checks of the hand-written config.
  for (const [table, values] of Object.entries(config.handTables)) {
    if (typeof values !== 'object' || table === 'sources') continue;
    for (const code of Object.keys(values))
      if (!countryIds.has(code))
        warnings.push(`handTables.${table}: "${code}" is not a country of the game (left out)`);
  }
  for (const [typeId, byCountry] of Object.entries(config.mainProvinces)) {
    if (typeId === 'note' || typeof byCountry === 'string') continue;
    if (!typeById.has(typeId)) errors.push(`mainProvinces: unknown building "${typeId}"`);
    for (const [code, list] of Object.entries(byCountry))
      for (const id of Object.keys(list)) {
        const province = provinceById.get(id);
        if (!province) errors.push(`mainProvinces.${typeId}.${code}: unknown province "${id}"`);
        else if (province.country !== code)
          errors.push(`mainProvinces.${typeId}.${code}: "${id}" belongs to ${province.country}`);
      }
  }
  for (const type of types)
    if (!config.placement.rules[type.id])
      errors.push(`placement.rules: no rule for the building "${type.id}"`);
  const reference = countries.find((c) => c.id === rules.productivity.referenceCountry);
  if (!reference)
    errors.push(
      `productivity.referenceCountry "${rules.productivity.referenceCountry}" is not a country`,
    );
  if (errors.length > 0)
    return {
      file: { year: input.year, sources: [], provinces: [] },
      rows: [],
      worldMade: {},
      warnings,
      errors,
    };

  const wb = snapshot.worldBank.values;
  const figure = (indicator: string, country: string) => wb[indicator]?.[country]?.[1];
  const energy = (country: string, column: string) =>
    snapshot.energy.values[country]?.[column] ?? 0;
  const economy = pops.placeholderEconomy;

  // Per country: the economy the rules need.
  interface Economy {
    employed: number;
    agricultureJobs: number;
    industryJobs: number;
    agricultureValue: number;
    industryValue: number;
    manufacturingValue: number;
  }
  const economyOf = new Map<string, Economy>();
  for (const c of countries) {
    const employed = c.population * c.laborForceShare * (1 - c.unemploymentRate);
    const gdp = c.gdpMillionUsd * 1e6;
    const perPerson = c.population > 0 ? gdp / c.population : 0;
    // The farm and factory economy at local prices (F06's price level), so
    // it measures how much is made, not what it sells for.
    const priceLevel = Math.max(
      0.05,
      Math.pow(perPerson / economy.priceReferenceGdpPerPerson, economy.priceLevelExponent),
    );
    const share = (indicator: string, fallback: number) => {
      const value = figure(indicator, c.id);
      if (value === undefined) {
        warnings.push(`${c.id}: no World Bank figure for ${indicator}, ${fallback} % used`);
        return fallback / 100;
      }
      return value / 100;
    };
    economyOf.set(c.id, {
      employed,
      agricultureJobs: employed * share('agricultureJobsPercent', 2),
      industryJobs: employed * share('industryJobsPercent', 20),
      agricultureValue: (gdp * share('agricultureValuePercent', 1)) / priceLevel,
      industryValue: (gdp * share('industryValuePercent', 20)) / priceLevel,
      manufacturingValue: (gdp * share('manufacturingValuePercent', 10)) / priceLevel,
    });
  }
  const ref = economyOf.get(rules.productivity.referenceCountry)!;
  const factor = (value: number, jobs: number, refValue: number, refJobs: number) => {
    if (!(jobs > 0) || !(value > 0)) return 1;
    const f = refValue / refJobs / (value / jobs);
    return Math.min(rules.productivity.maxFactor, Math.max(1, f));
  };
  const sum = (f: (e: Economy, id: string) => number) =>
    countries.reduce((total, c) => total + f(economyOf.get(c.id)!, c.id), 0);
  const worldAgriculture = sum((e) => e.agricultureValue);
  const worldManufacturing = sum((e) => e.manufacturingValue);
  const worldCereal = sum((_, id) => figure('cerealTonnes', id) ?? 0);

  const conv = rules.conversions;
  const tables = config.handTables;
  const kt = (table: Record<string, number>, id: string) => ((table[id] ?? 0) * 1000) / DAYS;
  const twh = (id: string, ...columns: string[]) =>
    (columns.reduce((t, column) => t + energy(id, column), 0) * 1e6) / DAYS;

  // Per province, by country.
  const provincesOf = new Map<string, StartProvince[]>();
  for (const p of provinces) {
    const list = provincesOf.get(p.country) ?? [];
    list.push(p);
    provincesOf.set(p.country, list);
  }
  const density = (p: StartProvince) => (p.areaKm2 > 0 ? p.population / p.areaKm2 : 0);

  const placed = new Map<string, [string, string, number][]>();
  const provinceJobs = new Map<string, number>();
  const rows: CountryBuildingsRow[] = [];
  const worldMade: Record<string, number> = {};
  const minimum = rules.levels.minimumShareOfALevel;

  for (const c of countries) {
    const e = economyOf.get(c.id)!;
    const own = provincesOf.get(c.id) ?? [];
    const ownArea = own.reduce((t, p) => t + p.areaKm2, 0);
    const averageDensity = ownArea > 0 ? own.reduce((t, p) => t + p.population, 0) / ownArea : 0;
    const industryFactor = factor(
      e.industryValue,
      e.industryJobs,
      ref.industryValue,
      ref.industryJobs,
    );
    const agricultureShare = worldAgriculture > 0 ? e.agricultureValue / worldAgriculture : 0;
    const manufacturingShare =
      worldManufacturing > 0 ? e.manufacturingValue / worldManufacturing : 0;
    const farming = rules.farming;
    const cereal = figure('cerealTonnes', c.id) ?? 0;

    // What the country makes a day, by building type.
    const perDay: Record<string, number> = {
      farm:
        ((farming.worldGrainMt * 1e6) / DAYS) *
        (farming.realCerealWeight * (worldCereal > 0 ? cereal / worldCereal : 0) +
          (1 - farming.realCerealWeight) * agricultureShare),
      ranch: ((farming.worldLivestockMt * 1e6) / DAYS) * agricultureShare,
      fishery: (figure('fishTonnes', c.id) ?? 0) / DAYS,
      iron_mine: kt(tables.ironOre, c.id),
      coal_mine: twh(c.id, 'coal_production') / conv.coalMwhPerTonne,
      copper_mine: kt(tables.copperMine, c.id) * conv.copperOrePerCopper,
      bauxite_mine: kt(tables.bauxite, c.id),
      oil_field: twh(c.id, 'oil_production') / conv.oilMwhPerTonne,
      gas_field: twh(c.id, 'gas_production') / conv.gasMwhPerTonne,
      coal_power_plant: twh(c.id, 'coal_electricity'),
      gas_power_plant: twh(c.id, 'gas_electricity', 'oil_electricity'),
      nuclear_power_plant: twh(c.id, 'nuclear_electricity'),
      hydro_power_plant: twh(c.id, 'hydro_electricity', 'other_renewable_electricity'),
      wind_farm: twh(c.id, 'wind_electricity'),
      solar_farm: twh(c.id, 'solar_electricity'),
      steel_mill: kt(tables.steel, c.id),
      oil_refinery:
        (twh(c.id, 'oil_consumption') / conv.oilMwhPerTonne) * conv.refineryShareOfOilUse,
      copper_smelter: kt(tables.copperRefined, c.id),
      aluminum_smelter: kt(tables.aluminum, c.id),
      silicon_plant: kt(tables.silicon, c.id),
    };
    for (const [typeId, worldMt] of Object.entries(rules.manufacturingWorldMt))
      perDay[typeId] = ((worldMt * 1e6) / DAYS) * manufacturingShare;

    const levels: Record<string, number> = {};
    for (const type of types) {
      if (type.id === 'quarry') continue;
      const output = perDay[type.id];
      if (output === undefined) {
        warnings.push(`no production rule for "${type.id}": none placed`);
        continue;
      }
      // The refinery is sized by the crude oil it takes in, the rest by what they make.
      const perLevel =
        type.id === 'oil_refinery' ? (type.methods[0].inputs?.crude_oil ?? 0) : mainOutput(type)[1];
      levels[type.id] = levelsFor(output, perLevel, minimum);
    }
    // Quarries for the stone the silicon plants need.
    const quarry = typeById.get('quarry');
    const silicon = typeById.get('silicon_plant');
    if (quarry && silicon) {
      const stone = (levels.silicon_plant ?? 0) * (silicon.methods[0].inputs?.stone ?? 0);
      levels.quarry = levelsFor(stone, mainOutput(quarry)[1], minimum);
    }

    // The method mix of each type, and the jobs it offers on average a level.
    const mixAt = (typeId: string, sectorFactor: number) => {
      const jobs = typeById.get(typeId)!.methods.map(jobsOf);
      return { mix: methodMix(jobs, jobs[0] * sectorFactor), jobs };
    };
    const averageAt = (typeId: string, sectorFactor: number) => {
      const { mix, jobs } = mixAt(typeId, sectorFactor);
      return mix.reduce((t, share, m) => t + share * jobs[m], 0);
    };
    const sectorJobsAt = (sector: string, f: number) =>
      Object.entries(levels).reduce(
        (t, [typeId, count]) =>
          rules.productivity.sectors[typeId] === sector ? t + count * averageAt(typeId, f) : t,
        0,
      );
    // The factor at which a sector's buildings employ its real workers (as
    // near as the most labor-intensive methods allow).
    const solve = (sector: string, target: number) => {
      if (!(sectorJobsAt(sector, 1) < target)) return 1;
      let low = 1;
      let high = rules.productivity.maxFactor;
      for (let step = 0; step < 50; step++) {
        const middle = (low + high) / 2;
        if (sectorJobsAt(sector, middle) < target) low = middle;
        else high = middle;
      }
      return high;
    };
    const agricultureFactor = solve('agriculture', e.agricultureJobs);
    const lightIndustryFactor = solve(
      'lightIndustry',
      e.industryJobs * rules.productivity.lightIndustryShareOfIndustryJobs,
    );
    const sectorFactor = (typeId: string) => {
      const sector = rules.productivity.sectors[typeId];
      return sector === 'agriculture'
        ? agricultureFactor
        : sector === 'lightIndustry'
          ? lightIndustryFactor
          : industryFactor;
    };
    const mixOf = (typeId: string) => mixAt(typeId, sectorFactor(typeId));

    // Enough power plants for what the buildings need (the rest of the
    // economy gets `otherElectricityShare` of what they make).
    const electricityOf = (typeId: string) => {
      const type = typeById.get(typeId)!;
      const { mix } = mixOf(typeId);
      return type.methods.reduce((t, method, m) => t + mix[m] * (method.electricity ?? 0), 0);
    };
    const powerOf = (typeId: string) => typeById.get(typeId)!.methods[0].outputs.electricity ?? 0;
    let demand = 0;
    let capacity = 0;
    let biggest = '';
    for (const [typeId, count] of Object.entries(levels)) {
      demand += count * electricityOf(typeId);
      const made = count * powerOf(typeId);
      capacity += made;
      if (made > 0 && (!biggest || made > (levels[biggest] ?? 0) * powerOf(biggest)))
        biggest = typeId;
    }
    const needed = demand / Math.max(0.01, buildings.standIns.otherElectricityShare);
    if (capacity < needed && demand > 0) {
      const plant = biggest || rules.power.fallbackPlant;
      const per = powerOf(plant);
      if (per > 0) {
        const extra = Math.ceil((needed - capacity) / per);
        levels[plant] = (levels[plant] ?? 0) + extra;
        warnings.push(
          `${c.id}: ${extra} more level(s) of ${plant} so its buildings have electricity (its real generation is too small for them)`,
        );
      }
    }

    // The workers of each pop group the country has (F06's split by GDP per
    // person): the buildings' jobs must leave room for the rest of the economy.
    const civilians = pops.groups.filter((group) => !group.military);
    const groupShares = startingGroupShares(
      pops,
      c.population > 0 ? (c.gdpMillionUsd * 1e6) / c.population : 0,
    );
    const groupRoom = new Map<string, number>();
    civilians.forEach((group, i) => {
      if (group.alwaysEmployed) return;
      groupRoom.set(group.id, e.employed * (1 - c.armedForcesShare) * groupShares[i] * 0.97);
    });
    const fitsGroups = (method: (typeof types)[number]['methods'][number], levels: number) =>
      Object.entries(method.workers).every(
        ([group, count]) => levels * count <= (groupRoom.get(group) ?? Infinity),
      );
    const takeGroups = (method: (typeof types)[number]['methods'][number], levels: number) => {
      for (const [group, count] of Object.entries(method.workers))
        groupRoom.set(group, (groupRoom.get(group) ?? 0) - levels * count);
    };

    // Place the levels in the provinces, and give each its method.
    let placedAgricultureJobs = 0;
    let placedIndustryJobs = 0;
    for (const type of types) {
      const total = levels[type.id] ?? 0;
      if (total <= 0 || own.length === 0) continue;
      const main = config.mainProvinces[type.id];
      const listed = typeof main === 'object' ? main[c.id] : undefined;
      const rule = config.placement.rules[type.id];
      const notCity = own.filter(
        (p) =>
          density(p) <= config.placement.cityDensity ||
          density(p) <= config.placement.cityTimesAverage * averageDensity,
      );
      // Land: not cities, and not near-empty provinces (Greenland) where the country has others.
      const settled = notCity.filter(
        (p) => density(p) >= config.placement.emptyTimesAverage * averageDensity,
      );
      const landProvinces = settled.length > 0 ? settled : notCity.length > 0 ? notCity : own;
      const pick = (p: StartProvince): number => {
        if (listed) return listed[p.id] ?? 0;
        switch (rule) {
          case 'population':
            return p.population;
          case 'rural':
            return notCity.includes(p) ? p.population : p.population * config.placement.cityWeight;
          case 'coastal':
            return own.some((q) => q.coastal) ? (p.coastal ? p.population : 0) : p.population;
          case 'land':
            return landProvinces.includes(p) ? p.areaKm2 : 0;
          default:
            return p.population;
        }
      };
      const shares = shareWholeNumbers(
        total,
        own.map(pick),
        own.map((p) => p.population),
      );
      // The more labor-intensive methods go where there are the most workers
      // per level, as far as the province (and the country's pop groups)
      // have the workers for them.
      const { mix, jobs } = mixOf(type.id);
      const budget = (p: StartProvince) =>
        p.population * c.laborForceShare * (1 - c.unemploymentRate) * 0.9 -
        (provinceJobs.get(p.id) ?? 0);
      const order = own
        .map((p, i) => ({ i, room: shares[i] > 0 ? budget(p) / shares[i] : 0 }))
        .filter(({ i }) => shares[i] > 0)
        .sort((a, b) => b.room - a.room || (own[a.i].id < own[b.i].id ? -1 : 1));
      const byIntensity = jobs.map((_, m) => m).sort((a, b) => jobs[b] - jobs[a] || a - b);
      const remaining = byIntensity.map((m) => mix[m] * total);
      for (const { i } of order) {
        const room = budget(own[i]);
        let pick = byIntensity.findIndex(
          (m, q) =>
            remaining[q] >= shares[i] / 2 &&
            shares[i] * jobs[m] <= room &&
            fitsGroups(type.methods[m], shares[i]),
        );
        if (pick < 0) pick = byIntensity.length - 1;
        remaining[pick] -= shares[i];
        const method = type.methods[byIntensity[pick]];
        takeGroups(method, shares[i]);
        const list = placed.get(own[i].id) ?? [];
        list.push([type.id, method.id, shares[i]]);
        provinceJobs.set(
          own[i].id,
          (provinceJobs.get(own[i].id) ?? 0) + shares[i] * jobsOf(method),
        );
        placed.set(own[i].id, list);
        if (rules.productivity.sectors[type.id] === 'agriculture')
          placedAgricultureJobs += shares[i] * jobsOf(method);
        else placedIndustryJobs += shares[i] * jobsOf(method);
      }
      for (const [good, amount] of Object.entries(type.methods[0].outputs))
        worldMade[good] = (worldMade[good] ?? 0) + total * amount * DAYS;
    }

    // A province whose buildings need more people than it has workers.
    for (const p of own) {
      const jobs = provinceJobs.get(p.id) ?? 0;
      const workers = p.population * c.laborForceShare * (1 - c.unemploymentRate);
      if (jobs > workers * 0.9 && jobs > 1000)
        warnings.push(
          `${p.id}: its buildings offer ${Math.round(jobs).toLocaleString('en')} jobs for about ${Math.round(workers).toLocaleString('en')} workers`,
        );
    }

    rows.push({
      id: c.id,
      employed: e.employed,
      agricultureJobs: e.agricultureJobs,
      industryJobs: e.industryJobs,
      agricultureFactor,
      industryFactor,
      lightIndustryFactor,
      buildingAgricultureJobs: placedAgricultureJobs,
      buildingIndustryJobs: placedIndustryJobs,
      levels,
    });
  }

  // Each province's buildings in the order of `data/buildings.json`.
  const typeOrder = new Map(types.map((type, t) => [type.id, t]));
  const file: BuildingStartFile = {
    year: input.year,
    sources: [
      {
        title: snapshot.energy.title,
        url: snapshot.energy.url,
        licence: snapshot.energy.licence,
        edition: `downloaded ${snapshot.downloaded}`,
      },
      {
        title:
          'World Bank, World Development Indicators (employment and value added by sector, cereal and fisheries production)',
        url: 'https://data.worldbank.org',
        licence: 'CC BY 4.0',
        edition: `last updated ${snapshot.worldBank.lastUpdated}`,
      },
      ...Object.values(config.handTables.sources).map((title) => ({
        title,
        url: '',
        licence: 'approximate figures typed in by hand',
        edition: String(config.year),
      })),
    ],
    provinces: provinces
      .filter((p) => placed.has(p.id))
      .map((p) => ({
        id: p.id,
        buildings: placed.get(p.id)!.sort((a, b) => typeOrder.get(a[0])! - typeOrder.get(b[0])!),
      })),
  };
  return { file, rows, worldMade, warnings, errors };
}
