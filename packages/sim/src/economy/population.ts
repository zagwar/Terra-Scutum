import type { GameData } from '../data/game-data';
import type { SimSystem } from '../core/systems';
import type { GameState } from '../core/game-state';
import type { CountryStartTable } from '../world/country-start';
import type { WorldMap } from '../world/world-map';
import type { PopsConfig } from './pops-data';

/**
 * The population model (F06, section 8.1).
 *
 * Every province has **dependents** (children, the elderly and others who
 * don't work) and a **workforce** split into **pops**: one per pop group
 * (laborers, skilled workers, professionals, owners, officials, soldiers).
 * A pop has a size, jobs, a wage, a **wealth** (F65, Victoria 3) and a
 * standard of living.
 *
 * - **Every day:** births, deaths, young people entering the workforce and
 *   old ones leaving it. A handful of multiplications per province.
 * - **Every week:** the stand-in economy's jobs follow the workforce and
 *   people change group where jobs are open. A pop's jobs are the ones
 *   buildings offer (F07, `buildings.ts`) plus the stand-in's: "the rest of
 *   the economy", everything the building catalog doesn't cover yet.
 * - **The report** (employment, incomes, standard of living, totals per
 *   province and country) is worked out from the state when it is asked
 *   for, at most once a day. What people buy and how their wealth moves is
 *   the market's (F65, `market.ts`).
 *
 * All numbers live in typed arrays; a pop's place in a per-pop array is
 * `province * groupCount + group`. Nothing is allocated after creation.
 * The model draws no random numbers.
 */
export interface PopulationState {
  /** The pop groups' ids, in the order of the arrays (`data/pops.json`). */
  readonly groupIds: readonly string[];
  readonly groupCount: number;
  /** The index of the military group (soldiers). */
  readonly militaryGroup: number;

  // ── The state (saved) ────────────────────────────────────────────────────
  /** People who don't work, per province. */
  readonly dependents: Float64Array;
  /** People in each pop. */
  readonly size: Float64Array;
  /**
   * The jobs the stand-in economy offers each pop: the rest of the economy,
   * everything buildings don't cover yet [DEFAULT].
   */
  readonly standInJobs: Float64Array;
  /**
   * F65 (Victoria 3): each pop's wealth, 1–99. It sets what the pop buys
   * (its buy package) and its standard of living; the market moves it
   * every week with the pop's income. Fractional.
   */
  readonly wealth: Float64Array;
  /** F65: each pop's income last week, in US$ per worker per day (wages, dividends). */
  readonly income: Float64Array;
  /**
   * F09: what each pop had to spend last week, US$ per worker per day: its
   * income after income and dividends taxes, plus unemployment benefits, ÷
   * (1 + the consumption tax). Its wealth follows this (`updateWealth`).
   */
  readonly netIncome: Float64Array;

  // ── Jobs (worked out from the state) ─────────────────────────────────────
  /** The jobs buildings offer each pop (F07): from their levels, kept up to date by `buildings.ts`. */
  readonly buildingJobs: Float64Array;
  /** All jobs open to each pop: `standInJobs` + `buildingJobs`. */
  readonly jobs: Float64Array;

  // ── Fixed for the campaign (worked out from the starting data) ───────────
  /** Per province, per day: births per worker, deaths per worker and per dependent, dependents entering the workforce. */
  readonly birthRate: Float64Array;
  readonly workerDeathRate: Float64Array;
  readonly dependentDeathRate: Float64Array;
  readonly enteringRate: Float64Array;
  /** Per day: the share of the workforce that retires. */
  readonly leavingRate: number;
  /**
   * Each pop's **going wage**, in US$ per worker per day, fixed from the
   * starting data: what the rest of the economy pays. Since F65 a building
   * pays it times its own wage level (`BuildingsState.wageFactor`).
   */
  readonly wage: Float64Array;
  /**
   * Each province's price level (1 = United States prices): since F65 only
   * the price of the needs that have no good yet (housing, services,
   * luxuries); goods are priced on the markets.
   */
  readonly priceLevel: Float64Array;
  /**
   * F65: the standard of living each pop expects (Victoria 3's expected
   * standard of living): its starting wealth less `expectedBelowStart`
   * levels. Buildings whose workers
   * live far below it raise wages; far above it, they may cut them.
   */
  readonly expectedLiving: Float32Array;
  /**
   * F08: what starvation does to births and deaths, per pop (`food.ts` sets
   * them from food security; 1, 1 and 0 when nobody starves): its workers
   * have births × `birthKeep` and die at their rate × `deathFactor` +
   * `extraDeaths` (a share a day). A province's dependents share the
   * average of its pops (by their size that day).
   */
  readonly birthKeep: Float32Array;
  readonly deathFactor: Float32Array;
  readonly extraDeaths: Float32Array;
  /** F08: standard of living each pop loses to starvation and rationing (`food.ts`). */
  readonly livingPenalty: Float32Array;
  /** F09: standard of living everyone in a country loses to inflation and a default (`budget.ts`), per country. */
  readonly countryLivingPenalty: Float32Array;
  /** F09: per province, how fast people train for better jobs (the education budget; 1 = as F06 set it). */
  readonly trainingFactor: Float32Array;
  /** The share of each pop in work at the start: its country's real employment (1 for groups that are always employed). */
  readonly employmentTarget: Float64Array;
  /**
   * The stand-in economy: the share of each pop it keeps in work. At the
   * start that is `employmentTarget` less the jobs the starting buildings
   * offer (`linkStartingBuildings`).
   */
  readonly standInTarget: Float64Array;

  // ── The report (worked out from the state; not saved) ────────────────────
  /** People of each pop with a job. */
  readonly employed: Float64Array;
  /** Each pop's standard of living, 1–99 (F65: its wealth less what shortages take). */
  readonly standardOfLiving: Float32Array;
  /** Per province: everyone, the people with a job, the average standard of living. */
  readonly provincePopulation: Float64Array;
  readonly provinceEmployed: Float64Array;
  readonly provinceStandardOfLiving: Float32Array;
  /** Per country (the provinces it owns now): everyone, and the dependents among them. */
  readonly countryPopulation: Float64Array;
  readonly countryDependents: Float64Array;
  /**
   * Per country and pop group: people, people with a job, average going
   * wage (US$ per day), standard of living, and (F65) income last week (US$
   * per worker per day).
   */
  readonly countryGroupSize: Float64Array;
  readonly countryGroupEmployed: Float64Array;
  readonly countryGroupWage: Float64Array;
  readonly countryGroupStandardOfLiving: Float32Array;
  readonly countryGroupIncome: Float64Array;
  /** Goes up every time the report is redone, so hosts know when to resend it. */
  version: number;
  /** The `ownershipVersion` the report's country totals were made with; -1 when the report is out of date. */
  reportOwnershipVersion: number;

  // ── From the data, ready for the loops ───────────────────────────────────
  /** The job changes of `data/pops.json`: from, to (group indices), weekly share, in order. */
  readonly changeFrom: Int32Array;
  readonly changeTo: Int32Array;
  readonly changeShare: Float64Array;
  /** F09: 1 for a job change that needs training (the education budget speeds it up). */
  readonly changeTraining: Uint8Array;
  readonly jobsFollowWeekly: number;
}

/** The saved part of the population. */
export interface PopulationRestore {
  readonly dependents: Float64Array;
  readonly size: Float64Array;
  readonly standInJobs: Float64Array;
  /** F65; missing in older saves (the starting wealth stays). */
  readonly wealth?: Float64Array;
  readonly income?: Float64Array;
  /** F09; missing in older saves (the income before taxes stands in until the next Monday). */
  readonly netIncome?: Float64Array;
}

const DAYS_PER_YEAR = 365;

/**
 * How a country's civilian workforce is split into groups, from its GDP per
 * person: the rows of `startingShares`, mixed by the logarithm of GDP per person.
 */
export function startingGroupShares(pops: PopsConfig, gdpPerPerson: number): number[] {
  const rows = pops.startingShares;
  const civilians = pops.groups.filter((group) => !group.military);
  let low = rows[0];
  let high = rows[rows.length - 1];
  let mix = 0;
  if (gdpPerPerson <= low.gdpPerPerson) high = low;
  else if (gdpPerPerson >= high.gdpPerPerson) low = high;
  else {
    for (let i = 1; i < rows.length; i++) {
      if (gdpPerPerson <= rows[i].gdpPerPerson) {
        low = rows[i - 1];
        high = rows[i];
        mix =
          Math.log(gdpPerPerson / low.gdpPerPerson) /
          Math.log(high.gdpPerPerson / low.gdpPerPerson);
        break;
      }
    }
  }
  return civilians.map(
    (group) => (low.shares[group.id] ?? 0) * (1 - mix) + (high.shares[group.id] ?? 0) * mix,
  );
}

/**
 * The population at the start of a campaign: each province's people
 * (`data/province_start.json`) split into dependents and pops from its
 * country's starting data, plus the rates, wages and price levels that stay
 * fixed during the campaign.
 */
export function createPopulation(
  data: GameData,
  world: WorldMap,
  countryStart: CountryStartTable,
): PopulationState {
  const pops = data.pops;
  const provinces = world.provinceIds.length;
  const countries = world.countryIds.length;
  const groups = pops.groups.length;
  const militaryGroup = pops.groups.findIndex((group) => group.military);
  const groupIndex = new Map(pops.groups.map((group, index) => [group.id, index]));
  const civilianGroups = pops.groups.map((_, index) => index).filter((g) => g !== militaryGroup);
  const economy = pops.placeholderEconomy;

  const startPopulation = new Float64Array(provinces);
  for (const province of data.provinceStart.provinces) {
    const index = world.provinceIndex.get(province.id);
    if (index === undefined)
      throw new Error(`Province start data: unknown province "${province.id}"`);
    startPopulation[index] = province.population;
  }

  const dependents = new Float64Array(provinces);
  const size = new Float64Array(provinces * groups);
  const jobs = new Float64Array(provinces * groups);
  const birthRate = new Float64Array(provinces);
  const workerDeathRate = new Float64Array(provinces);
  const dependentDeathRate = new Float64Array(provinces);
  const enteringRate = new Float64Array(provinces);
  const wage = new Float64Array(provinces * groups);
  const priceLevel = new Float64Array(provinces);
  const employmentTarget = new Float64Array(provinces * groups);
  const leavingRate = 1 / (pops.growth.workingYears * DAYS_PER_YEAR);
  const mortality = pops.growth.dependentMortality;

  // Everything below follows from the province's STARTING country: its people
  // keep their demographics and their pay when the province changes hands.
  const wageWeight = new Float64Array(countries);
  for (let c = 0; c < countries; c++) {
    const population = countryStart.population[c];
    const gdpPerPerson = population > 0 ? (countryStart.gdpMillionUsd[c] * 1e6) / population : 0;
    const laborShare = countryStart.laborForceShare[c];
    const armedShare = countryStart.armedForcesShare[c];
    const civilianShares = startingGroupShares(pops, gdpPerPerson);
    // Unemployment falls on the groups that can be unemployed, so that the
    // country's rate comes out as in the data.
    let canBeUnemployed = 0;
    civilianGroups.forEach((g, i) => {
      if (!pops.groups[g].alwaysEmployed) canBeUnemployed += (1 - armedShare) * civilianShares[i];
    });
    const unemployed =
      canBeUnemployed > 0 ? Math.min(0.95, countryStart.unemploymentRate[c] / canBeUnemployed) : 0;

    const perDay = 1 / (1000 * DAYS_PER_YEAR);
    const births = countryStart.birthsPerThousand[c] * perDay;
    const deaths = countryStart.deathsPerThousand[c] * perDay;
    // Deaths per worker a day, with a dependent `mortality` times likelier to die.
    const workerDeaths = deaths / (laborShare + mortality * (1 - laborShare));
    // Young people enter the workforce at the rate that keeps its share of
    // the population where it started.
    const entering = Math.max(
      0,
      ((leavingRate + workerDeaths + births - deaths) * laborShare) / (1 - laborShare),
    );
    const price = Math.pow(
      gdpPerPerson / economy.priceReferenceGdpPerPerson,
      economy.priceLevelExponent,
    );

    const from = world.countryProvinces.offsets[c];
    const to = world.countryProvinces.offsets[c + 1];
    for (let k = from; k < to; k++) {
      const p = world.countryProvinces.targets[k];
      const people = startPopulation[p];
      const workforce = people * laborShare;
      dependents[p] = people - workforce;
      birthRate[p] = births / laborShare;
      workerDeathRate[p] = workerDeaths;
      dependentDeathRate[p] = workerDeaths * mortality;
      enteringRate[p] = entering;
      priceLevel[p] = price;
      const row = p * groups;
      size[row + militaryGroup] = workforce * armedShare;
      civilianGroups.forEach(
        (g, i) => (size[row + g] = workforce * (1 - armedShare) * civilianShares[i]),
      );
      for (let g = 0; g < groups; g++) {
        const target = pops.groups[g].alwaysEmployed ? 1 : 1 - unemployed;
        employmentTarget[row + g] = target;
        jobs[row + g] = size[row + g] * target;
        wageWeight[c] += jobs[row + g] * pops.groups[g].wage;
      }
    }
    // The country's pops earn `incomeShareOfGdp` of its GDP between them.
    const baseWage =
      wageWeight[c] > 0
        ? (countryStart.gdpMillionUsd[c] * 1e6 * economy.incomeShareOfGdp) /
          DAYS_PER_YEAR /
          wageWeight[c]
        : 0;
    for (let k = from; k < to; k++) {
      const row = world.countryProvinces.targets[k] * groups;
      for (let g = 0; g < groups; g++) wage[row + g] = baseWage * pops.groups[g].wage;
    }
  }

  return {
    groupIds: pops.groups.map((group) => group.id),
    groupCount: groups,
    militaryGroup,
    dependents,
    size,
    standInJobs: jobs.slice(),
    wealth: new Float64Array(provinces * groups).fill(1),
    income: new Float64Array(provinces * groups),
    netIncome: new Float64Array(provinces * groups),
    buildingJobs: new Float64Array(provinces * groups),
    jobs,
    birthRate,
    workerDeathRate,
    dependentDeathRate,
    enteringRate,
    leavingRate,
    wage,
    priceLevel,
    expectedLiving: new Float32Array(provinces * groups),
    birthKeep: new Float32Array(provinces * groups).fill(1),
    deathFactor: new Float32Array(provinces * groups).fill(1),
    extraDeaths: new Float32Array(provinces * groups),
    livingPenalty: new Float32Array(provinces * groups),
    countryLivingPenalty: new Float32Array(countries),
    trainingFactor: new Float32Array(provinces).fill(1),
    employmentTarget,
    standInTarget: employmentTarget.slice(),
    employed: new Float64Array(provinces * groups),
    standardOfLiving: new Float32Array(provinces * groups),
    provincePopulation: new Float64Array(provinces),
    provinceEmployed: new Float64Array(provinces),
    provinceStandardOfLiving: new Float32Array(provinces),
    countryPopulation: new Float64Array(countries),
    countryDependents: new Float64Array(countries),
    countryGroupSize: new Float64Array(countries * groups),
    countryGroupEmployed: new Float64Array(countries * groups),
    countryGroupWage: new Float64Array(countries * groups),
    countryGroupStandardOfLiving: new Float32Array(countries * groups),
    countryGroupIncome: new Float64Array(countries * groups),
    version: 0,
    reportOwnershipVersion: -1,
    changeFrom: Int32Array.from(pops.jobChanges, (change) => groupIndex.get(change.from) ?? 0),
    changeTo: Int32Array.from(pops.jobChanges, (change) => groupIndex.get(change.to) ?? 0),
    changeShare: Float64Array.from(pops.jobChanges, (change) => change.weeklyShare),
    changeTraining: Uint8Array.from(pops.jobChanges, (change) => (change.training ? 1 : 0)),
    jobsFollowWeekly: economy.jobsFollowWeekly,
  };
}

/**
 * Puts a saved population back (the arrays must be the right length). The
 * buildings' jobs are added when the buildings are put back (`restoreBuildings`).
 */
export function restorePopulation(population: PopulationState, saved: PopulationRestore): void {
  if (
    saved.dependents.length !== population.dependents.length ||
    saved.size.length !== population.size.length ||
    saved.standInJobs.length !== population.standInJobs.length
  )
    throw new Error('Population: the restored arrays do not match the map and the pop groups');
  population.dependents.set(saved.dependents);
  population.size.set(saved.size);
  population.standInJobs.set(saved.standInJobs);
  if (saved.wealth) {
    if (saved.wealth.length !== population.wealth.length)
      throw new Error('Population: the restored wealth does not match the pops');
    population.wealth.set(saved.wealth);
  }
  if (saved.income) {
    if (saved.income.length !== population.income.length)
      throw new Error('Population: the restored incomes do not match the pops');
    population.income.set(saved.income);
  }
  if (saved.netIncome) {
    if (saved.netIncome.length !== population.netIncome.length)
      throw new Error('Population: the restored incomes after taxes do not match the pops');
    population.netIncome.set(saved.netIncome);
  } else population.netIncome.set(population.income);
  for (let i = 0; i < population.jobs.length; i++)
    population.jobs[i] = population.standInJobs[i] + population.buildingJobs[i];
  population.reportOwnershipVersion = -1;
}

/**
 * One day of births, deaths, young people entering the workforce and old
 * ones leaving it (section 8.1, "Growth"). New workers join the groups in
 * the proportions the province's workforce has now.
 */
export function growPopulation(population: PopulationState): void {
  const { dependents, size, birthRate, workerDeathRate, dependentDeathRate, enteringRate } =
    population;
  const { birthKeep, deathFactor, extraDeaths } = population;
  const groups = population.groupCount;
  const leaving = population.leavingRate;
  const provinces = dependents.length;
  for (let p = 0; p < provinces; p++) {
    const row = p * groups;
    let workforce = 0;
    // F08: starvation means fewer births and more deaths; dependents share their province's lot.
    let keep = 0;
    let factor = 0;
    let extra = 0;
    for (let g = 0; g < groups; g++) {
      const people = size[row + g];
      workforce += people;
      keep += people * birthKeep[row + g];
      factor += people * deathFactor[row + g];
      extra += people * extraDeaths[row + g];
    }
    const share = workforce > 0 ? 1 / workforce : 0;
    const birthFactor = workforce > 0 ? keep * share : 1;
    const dependentDeaths =
      workforce > 0
        ? dependentDeathRate[p] * factor * share + extra * share
        : dependentDeathRate[p];
    const dependent = dependents[p];
    if (workforce <= 0) {
      // Nobody of working age: the dependents who are left only die.
      dependents[p] = dependent * Math.max(0, 1 - dependentDeaths);
      continue;
    }
    const entering = enteringRate[p] * dependent;
    const next =
      dependent +
      birthRate[p] * birthFactor * workforce -
      dependentDeaths * dependent -
      entering +
      leaving * workforce;
    dependents[p] = next > 0 ? next : 0;
    const growth = 1 - leaving + entering / workforce;
    const deaths = workerDeathRate[p];
    for (let g = 0; g < groups; g++) {
      const left = growth - deaths * deathFactor[row + g] - extraDeaths[row + g];
      size[row + g] *= left > 0 ? left : 0;
    }
  }
  population.reportOwnershipVersion = -1;
}

/**
 * The weekly job market (section 8.1, "Pops change jobs"):
 * 1. The stand-in economy's jobs follow the workforce; with the jobs
 *    buildings offer (F07) they are the jobs open to each pop.
 * 2. People change group along the paths of `data/pops.json`, in order:
 *    into a group with open jobs, if they are unemployed or would earn more.
 */
export function updateJobs(population: PopulationState): void {
  const { size, jobs, wage, standInJobs, standInTarget, buildingJobs } = population;
  const { changeFrom, changeTo, changeShare, changeTraining, trainingFactor } = population;
  const groups = population.groupCount;
  const follow = population.jobsFollowWeekly;
  const pops = size.length;
  for (let i = 0; i < pops; i++) {
    standInJobs[i] += follow * (size[i] * standInTarget[i] - standInJobs[i]);
    jobs[i] = standInJobs[i] + buildingJobs[i];
  }

  const provinces = population.dependents.length;
  const changes = changeFrom.length;
  for (let p = 0; p < provinces; p++) {
    const row = p * groups;
    for (let c = 0; c < changes; c++) {
      const from = row + changeFrom[c];
      const to = row + changeTo[c];
      const openJobs = jobs[to] - size[to];
      if (openJobs <= 0) continue;
      const unemployed = size[from] > jobs[from] ? size[from] - jobs[from] : 0;
      // The unemployed take any job; people with a job only move for better pay.
      const willing = wage[to] > wage[from] ? size[from] : unemployed;
      // F09: the education budget speeds training up or slows it down.
      const speed = changeTraining[c] === 1 ? trainingFactor[p] : 1;
      let moving = changeShare[c] * speed * size[from];
      if (moving > willing) moving = willing;
      if (moving > openJobs) moving = openJobs;
      if (moving <= 0) continue;
      size[from] -= moving;
      size[to] += moving;
    }
  }
  population.reportOwnershipVersion = -1;
}

/**
 * Redoes the report from the state: who has a job, the standard of living
 * (F65: each pop's wealth, less `shortagePenalty` × the share of its
 * country's pops' goods that went undelivered last week, `shortage`; F08:
 * less what starvation and rationing take, `livingPenalty`; F09: less what
 * inflation and a default take, `countryLivingPenalty`), and
 * the totals per province and per country.
 */
export function refreshPopulationReport(
  population: PopulationState,
  provinceOwner: Uint16Array,
  ownershipVersion: number,
  shortage: Float32Array,
  shortagePenalty: number,
): void {
  const { dependents, size, jobs, wage, employed, standardOfLiving, wealth, income } = population;
  const livingPenalty = population.livingPenalty;
  const groups = population.groupCount;
  const provinces = dependents.length;
  const countryPopulation = population.countryPopulation.fill(0);
  const countryDependents = population.countryDependents.fill(0);
  const countrySize = population.countryGroupSize.fill(0);
  const countryEmployed = population.countryGroupEmployed.fill(0);
  const countryWage = population.countryGroupWage.fill(0);
  const countryLiving = population.countryGroupStandardOfLiving.fill(0);
  const countryIncome = population.countryGroupIncome.fill(0);

  for (let p = 0; p < provinces; p++) {
    const row = p * groups;
    const owner = provinceOwner[p];
    const penalty = shortagePenalty * shortage[owner] + population.countryLivingPenalty[owner];
    let workforce = 0;
    let working = 0;
    let living = 0;
    for (let g = 0; g < groups; g++) {
      const people = size[row + g];
      workforce += people;
      const withJob = people < jobs[row + g] ? people : jobs[row + g];
      employed[row + g] = withJob;
      working += withJob;
      let score = wealth[row + g] - penalty - livingPenalty[row + g];
      if (score < 1) score = 1;
      else if (score > 99) score = 99;
      standardOfLiving[row + g] = score;
      living += score * people;
      const country = owner * groups + g;
      countrySize[country] += people;
      countryEmployed[country] += withJob;
      countryWage[country] += wage[row + g] * withJob;
      countryLiving[country] += score * people;
      countryIncome[country] += income[row + g] * people;
    }
    population.provincePopulation[p] = workforce + dependents[p];
    population.provinceEmployed[p] = working;
    population.provinceStandardOfLiving[p] = workforce > 0 ? living / workforce : 0;
    countryPopulation[owner] += workforce + dependents[p];
    countryDependents[owner] += dependents[p];
  }

  // Sums become averages.
  for (let i = 0; i < countrySize.length; i++) {
    const people = countrySize[i];
    countryWage[i] = countryEmployed[i] > 0 ? countryWage[i] / countryEmployed[i] : 0;
    countryLiving[i] = people > 0 ? countryLiving[i] / people : 0;
    countryIncome[i] = people > 0 ? countryIncome[i] / people : 0;
  }
  population.reportOwnershipVersion = ownershipVersion;
  population.version += 1;
}

/**
 * Makes sure the report matches the state and the current owners; redoes it
 * if not. Everything that reads the report (the snapshot, later systems such
 * as stability) calls this first, so the report is always the state's own:
 * a campaign continued from a save sees the same numbers.
 */
export function ensurePopulationReport(state: GameState): PopulationState {
  const population = state.population;
  if (population.reportOwnershipVersion !== state.ownershipVersion)
    refreshPopulationReport(
      population,
      state.provinceOwner,
      state.ownershipVersion,
      state.market.shortage,
      state.data.pops.wealth.shortagePenalty,
    );
  return population;
}

/**
 * Takes people out of a province for good (section 8.1: "Casualties are
 * real"): from one pop (`group`, an index) or, with `group` -1, from
 * everyone in proportion. Returns how many were really removed (never more
 * than were there). For wars, Swarm attacks, famine and fallout.
 */
export function removePeople(
  population: PopulationState,
  province: number,
  group: number,
  people: number,
): number {
  if (!(people > 0)) return 0;
  const groups = population.groupCount;
  const row = province * groups;
  population.reportOwnershipVersion = -1;
  if (group >= 0) {
    const removed = Math.min(people, population.size[row + group]);
    population.size[row + group] -= removed;
    return removed;
  }
  let total = population.dependents[province];
  for (let g = 0; g < groups; g++) total += population.size[row + g];
  if (total <= 0) return 0;
  const removed = Math.min(people, total);
  const keep = 1 - removed / total;
  population.dependents[province] *= keep;
  for (let g = 0; g < groups; g++) population.size[row + g] *= keep;
  return removed;
}

/** Everyone in the world (from the state, not the report). */
export function worldPopulation(population: PopulationState): number {
  let total = 0;
  for (let p = 0; p < population.dependents.length; p++) total += population.dependents[p];
  for (let i = 0; i < population.size.length; i++) total += population.size[i];
  return total;
}

/**
 * The population system (tick slot `population`): growth every day, the job
 * market every Monday. The report is redone when someone next asks for it
 * (`ensurePopulationReport`).
 */
export const populationSystem: SimSystem = {
  daily(state) {
    growPopulation(state.population);
  },
  weekly(state) {
    updateJobs(state.population);
  },
};
