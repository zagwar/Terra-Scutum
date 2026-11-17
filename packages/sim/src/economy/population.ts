import type { GameData } from '../data/game-data';
import type { SimSystem } from '../core/systems';
import type { GameState } from '../core/game-state';
import type { CountryStartTable } from '../world/country-start';
import type { WorldMap } from '../world/world-map';
import { NEED_TIERS, type PopsConfig } from './pops-data';

/**
 * The population model (F06, section 8.1).
 *
 * Every province has **dependents** (children, the elderly and others who
 * don't work) and a **workforce** split into **pops**: one per pop group
 * (laborers, skilled workers, professionals, owners, officials, soldiers).
 * A pop has a size, jobs, a wage and a standard of living.
 *
 * - **Every day:** births, deaths, young people entering the workforce and
 *   old ones leaving it. A handful of multiplications per province.
 * - **Every week:** the stand-in economy's jobs follow the workforce and
 *   people change group where jobs are open. A pop's jobs are the ones
 *   buildings offer (F07, `buildings.ts`) plus the stand-in's: "the rest of
 *   the economy", everything the building catalog doesn't cover yet.
 * - **The report** (employment, incomes, needs, standard of living, totals
 *   per province and country) is worked out from the state when it is asked
 *   for, at most once a day.
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
   * Each pop's wage, in US$ per worker per day: the going local wage, fixed
   * from the starting data. Buildings pay it too (F07) until markets let
   * their profits set wages (F65).
   */
  readonly wage: Float64Array;
  /** Each province's price level (1 = United States prices), until markets set prices (F65). */
  readonly priceLevel: Float64Array;
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
  /** Each pop's standard of living, 0–100. */
  readonly standardOfLiving: Float32Array;
  /** Per province: everyone, the people with a job, the average standard of living. */
  readonly provincePopulation: Float64Array;
  readonly provinceEmployed: Float64Array;
  readonly provinceStandardOfLiving: Float32Array;
  /** Per province and need tier (basic, everyday, luxury): how much of it people can afford, 0–1. */
  readonly provinceNeeds: Float32Array;
  /** Per country (the provinces it owns now): everyone, and the dependents among them. */
  readonly countryPopulation: Float64Array;
  readonly countryDependents: Float64Array;
  /** Per country and pop group: people, people with a job, average wage (US$ per day), standard of living. */
  readonly countryGroupSize: Float64Array;
  readonly countryGroupEmployed: Float64Array;
  readonly countryGroupWage: Float64Array;
  readonly countryGroupStandardOfLiving: Float32Array;
  /** Per country, pop group and need tier: how much of the tier the group can afford, 0–1. */
  readonly countryGroupNeeds: Float32Array;
  /** Goes up every time the report is redone, so hosts know when to resend it. */
  version: number;
  /** The `ownershipVersion` the report's country totals were made with; -1 when the report is out of date. */
  reportOwnershipVersion: number;

  // ── From the data, ready for the loops ───────────────────────────────────
  /** What a person's needs of each tier cost a day at price level 1. */
  readonly tierCost: Float64Array;
  /** What each tier adds to the standard of living when fully met (the three add up to 100). */
  readonly tierWeight: Float64Array;
  /** The job changes of `data/pops.json`: from, to (group indices), weekly share, in order. */
  readonly changeFrom: Int32Array;
  readonly changeTo: Int32Array;
  readonly changeShare: Float64Array;
  readonly jobsFollowWeekly: number;
}

/** The saved part of the population. */
export interface PopulationRestore {
  readonly dependents: Float64Array;
  readonly size: Float64Array;
  readonly standInJobs: Float64Array;
}

const TIERS = NEED_TIERS.length;
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

  const tierCost = new Float64Array(TIERS);
  for (const need of pops.needs) tierCost[NEED_TIERS.indexOf(need.tier)] += need.costPerDay;
  const tierWeight = Float64Array.from(NEED_TIERS, (tier) => pops.standardOfLiving[tier]);

  return {
    groupIds: pops.groups.map((group) => group.id),
    groupCount: groups,
    militaryGroup,
    dependents,
    size,
    standInJobs: jobs.slice(),
    buildingJobs: new Float64Array(provinces * groups),
    jobs,
    birthRate,
    workerDeathRate,
    dependentDeathRate,
    enteringRate,
    leavingRate,
    wage,
    priceLevel,
    employmentTarget,
    standInTarget: employmentTarget.slice(),
    employed: new Float64Array(provinces * groups),
    standardOfLiving: new Float32Array(provinces * groups),
    provincePopulation: new Float64Array(provinces),
    provinceEmployed: new Float64Array(provinces),
    provinceStandardOfLiving: new Float32Array(provinces),
    provinceNeeds: new Float32Array(provinces * TIERS),
    countryPopulation: new Float64Array(countries),
    countryDependents: new Float64Array(countries),
    countryGroupSize: new Float64Array(countries * groups),
    countryGroupEmployed: new Float64Array(countries * groups),
    countryGroupWage: new Float64Array(countries * groups),
    countryGroupStandardOfLiving: new Float32Array(countries * groups),
    countryGroupNeeds: new Float32Array(countries * groups * TIERS),
    version: 0,
    reportOwnershipVersion: -1,
    tierCost,
    tierWeight,
    changeFrom: Int32Array.from(pops.jobChanges, (change) => groupIndex.get(change.from) ?? 0),
    changeTo: Int32Array.from(pops.jobChanges, (change) => groupIndex.get(change.to) ?? 0),
    changeShare: Float64Array.from(pops.jobChanges, (change) => change.weeklyShare),
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
  const groups = population.groupCount;
  const leaving = population.leavingRate;
  const provinces = dependents.length;
  for (let p = 0; p < provinces; p++) {
    const row = p * groups;
    let workforce = 0;
    for (let g = 0; g < groups; g++) workforce += size[row + g];
    const dependent = dependents[p];
    if (workforce <= 0) {
      // Nobody of working age: the dependents who are left only die.
      dependents[p] = dependent * (1 - dependentDeathRate[p]);
      continue;
    }
    const entering = enteringRate[p] * dependent;
    dependents[p] =
      dependent +
      birthRate[p] * workforce -
      dependentDeathRate[p] * dependent -
      entering +
      leaving * workforce;
    const factor = 1 - workerDeathRate[p] - leaving + entering / workforce;
    for (let g = 0; g < groups; g++) size[row + g] *= factor;
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
  const { changeFrom, changeTo, changeShare } = population;
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
      let moving = changeShare[c] * size[from];
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
 * Redoes the report from the state: who has a job, what people can afford
 * (needs are bought tier by tier: basic, then everyday, then luxury), the
 * standard of living, and the totals per province and per country.
 */
export function refreshPopulationReport(
  population: PopulationState,
  provinceOwner: Uint16Array,
  ownershipVersion: number,
): void {
  const { dependents, size, jobs, wage, priceLevel, employed, standardOfLiving } = population;
  const { tierCost, tierWeight } = population;
  const groups = population.groupCount;
  const provinces = dependents.length;
  const countryPopulation = population.countryPopulation.fill(0);
  const countryDependents = population.countryDependents.fill(0);
  const countrySize = population.countryGroupSize.fill(0);
  const countryEmployed = population.countryGroupEmployed.fill(0);
  const countryWage = population.countryGroupWage.fill(0);
  const countryLiving = population.countryGroupStandardOfLiving.fill(0);
  const countryNeeds = population.countryGroupNeeds.fill(0);

  for (let p = 0; p < provinces; p++) {
    const row = p * groups;
    const owner = provinceOwner[p];
    let workforce = 0;
    for (let g = 0; g < groups; g++) workforce += size[row + g];
    // Every worker's income also feeds this many dependents.
    const mouths = workforce > 0 ? 1 + dependents[p] / workforce : 1;
    const price = priceLevel[p];
    let working = 0;
    let living = 0;
    let need0 = 0;
    let need1 = 0;
    let need2 = 0;
    for (let g = 0; g < groups; g++) {
      const people = size[row + g];
      const withJob = people < jobs[row + g] ? people : jobs[row + g];
      employed[row + g] = withJob;
      working += withJob;
      // What one person of this pop can spend a day, at price level 1.
      let budget =
        people > 0 && price > 0 ? (wage[row + g] * withJob) / (people * mouths) / price : 0;
      let score = 0;
      const tiers = (owner * groups + g) * TIERS;
      for (let t = 0; t < TIERS; t++) {
        const met = budget >= tierCost[t] ? 1 : budget / tierCost[t];
        budget -= met * tierCost[t];
        score += met * tierWeight[t];
        countryNeeds[tiers + t] += met * people;
        if (t === 0) need0 += met * people;
        else if (t === 1) need1 += met * people;
        else need2 += met * people;
      }
      standardOfLiving[row + g] = score;
      living += score * people;
      const country = owner * groups + g;
      countrySize[country] += people;
      countryEmployed[country] += withJob;
      countryWage[country] += wage[row + g] * withJob;
      countryLiving[country] += score * people;
    }
    population.provincePopulation[p] = workforce + dependents[p];
    population.provinceEmployed[p] = working;
    population.provinceStandardOfLiving[p] = workforce > 0 ? living / workforce : 0;
    population.provinceNeeds[p * TIERS] = workforce > 0 ? need0 / workforce : 0;
    population.provinceNeeds[p * TIERS + 1] = workforce > 0 ? need1 / workforce : 0;
    population.provinceNeeds[p * TIERS + 2] = workforce > 0 ? need2 / workforce : 0;
    countryPopulation[owner] += workforce + dependents[p];
    countryDependents[owner] += dependents[p];
  }

  // Sums become averages.
  for (let i = 0; i < countrySize.length; i++) {
    const people = countrySize[i];
    countryWage[i] = countryEmployed[i] > 0 ? countryWage[i] / countryEmployed[i] : 0;
    countryLiving[i] = people > 0 ? countryLiving[i] / people : 0;
    for (let t = 0; t < TIERS; t++)
      countryNeeds[i * TIERS + t] = people > 0 ? countryNeeds[i * TIERS + t] / people : 0;
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
    refreshPopulationReport(population, state.provinceOwner, state.ownershipVersion);
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
