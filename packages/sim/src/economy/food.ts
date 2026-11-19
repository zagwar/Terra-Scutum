import type { GameState } from '../core/game-state';
import type { SimSystem } from '../core/systems';
import type { GameData } from '../data/game-data';
import type { WorldMap } from '../world/world-map';
import type { BuildingsState } from './buildings';
import { type MarketState, packageValueAt } from './market';
import type { PopulationState } from './population';
import type { TradeState } from './trade';

/**
 * Food (F08, section 8.5), on Victoria 3's rules (version 1.8) unless said
 * otherwise. All numbers are in `data/food.json` [DEFAULT].
 *
 * - **Food** is the food goods (grain, livestock and fish, processed food).
 *   People buy it on their market as part of their needs (F65): **basic
 *   food** and **better food**.
 * - **Food security** (weekly, per pop): 1 − the share of its income a pop
 *   spends on basic food − `shortageWeight` × the share of its country's
 *   basic food that went undelivered last week (Victoria 3 counts the
 *   shortage once; we count it 1.5×: our 2025 pops spend little of their
 *   income on food); it moves half the way there a week. Below `mild` a pop is in **mild starvation**, below
 *   `severe` in **severe starvation**: fewer births, more deaths (we add
 *   extra deaths in severe starvation: our death rates are real ones), and
 *   a lower standard of living (a stand-in for Victoria 3's radicals).
 * - **Famine** (weekly, per province; Victoria 3: per state): while at
 *   least `starvingShare` of its people starve and `severeShare` starve
 *   severely. It records since when, its deaths and the births lost.
 * - **Food reserves:** the national stockpile's food goods, with their own
 *   starting, target and most days (`buildings.ts`, `trade.ts`).
 * - **Rationing** (section 8.8's Rationing law, ahead of laws, F16): the
 *   levels cut the rest of the economy's food, then the people's better
 *   food, and stop food exports; each costs standard of living. Countries
 *   ration by themselves as their reserves fall; the player chooses
 *   (automatic by default) with the `setRationing` command.
 *
 * The weekly step (Mondays) works out food security, rationing and famine
 * and writes what they do into the population (births, deaths, standard of
 * living), the markets (rationing) and trade (no food exports); the daily
 * step counts the basic food delivered and the deaths and births lost.
 * Typed arrays; nothing is allocated in either step; no random numbers.
 */
export interface FoodState {
  readonly countryCount: number;
  readonly provinceCount: number;
  readonly groupCount: number;
  readonly goodCount: number;
  /** The food goods' indexes. */
  readonly foodGoods: Int32Array;
  /** The basic food need's index (in the markets' needs). */
  readonly basicNeed: number;

  // ── From the data ────────────────────────────────────────────────────────
  readonly rules: GameData['food'];
  /** The rationing levels: ids, and per level what it cuts, whether food exports stop, the standard of living it costs, its automatic rule (days below, shortage, days to lift; `Infinity`/`0` for the first). */
  readonly levelIds: readonly string[];
  readonly restCut: Float64Array;
  readonly betterCut: Float64Array;
  readonly stopExports: Uint8Array;
  readonly levelLiving: Float64Array;
  readonly autoBelow: Float64Array;
  readonly autoShortage: Float64Array;
  readonly autoLift: Float64Array;

  // ── The state (saved) ────────────────────────────────────────────────────
  /** Per country: the rationing level in force (an index into `levelIds`). */
  readonly rationing: Uint8Array;
  /** Per country: the level the country chose, or -1 for automatic (the player's choice; other countries stay automatic). */
  readonly rationingChoice: Int8Array;
  /** Per country: the share of basic food its pops got, summed over this week's days so far. */
  readonly weekBasicGot: Float64Array;
  weekDays: number;
  /** Per country: the share of its pops' basic food that went undelivered last week (0–1). */
  readonly basicShortage: Float32Array;
  /** Per pop: its food security (0–1), worked out last Monday. */
  readonly security: Float32Array;
  /** Per province: the day its famine began, or -1; its deaths and the births lost since then. */
  readonly famineSince: Int32Array;
  readonly famineDeaths: Float64Array;
  readonly famineLostBirths: Float64Array;
  /** Per country (its people's own count, wherever they live): deaths from starvation and births lost to it since the campaign began. */
  readonly starvationDeaths: Float64Array;
  readonly lostBirths: Float64Array;

  // ── Worked out from the state (every Monday and after a load) ───────────
  /** Per province: the average food security (0–1), and the shares of its people starving and severely starving. */
  readonly provinceSecurity: Float32Array;
  readonly provinceStarving: Float32Array;
  readonly provinceSevere: Float32Array;
  /** Per country (the provinces it owns now): the same, its provinces in famine, and its food reserves in days (last Monday). */
  readonly countrySecurity: Float32Array;
  readonly countryStarving: Float32Array;
  readonly countrySevere: Float32Array;
  readonly famineCount: Int32Array;
  readonly reserveDays: Float32Array;

  // ── Scratch ──────────────────────────────────────────────────────────────
  readonly basicIndex: Float64Array;
  readonly countryPeople: Float64Array;
}

const DAYS_PER_YEAR = 365;

/** The food of a new campaign: nobody starves, no rationing, no famine. */
export function createFood(data: GameData, world: WorldMap, groupCount: number): FoodState {
  const rules = data.food;
  const goods = data.goods.goods;
  const countries = world.countryIds.length;
  const provinces = world.provinceIds.length;
  const levels = rules.rationing;
  return {
    countryCount: countries,
    provinceCount: provinces,
    groupCount,
    goodCount: goods.length,
    foodGoods: Int32Array.from(rules.goods, (id) => goods.findIndex((good) => good.id === id)),
    basicNeed: data.pops.needs.findIndex((need) => need.id === rules.basicNeed),
    rules,
    levelIds: levels.map((level) => level.id),
    restCut: Float64Array.from(levels, (level) => level.restCut),
    betterCut: Float64Array.from(levels, (level) => level.betterCut),
    stopExports: Uint8Array.from(levels, (level) => (level.stopExports ? 1 : 0)),
    levelLiving: Float64Array.from(levels, (level) => level.living),
    autoBelow: Float64Array.from(levels, (level) => level.auto?.belowDays ?? 0),
    autoShortage: Float64Array.from(levels, (level) => level.auto?.shortage ?? Infinity),
    autoLift: Float64Array.from(levels, (level) => level.auto?.liftAboveDays ?? 0),
    rationing: new Uint8Array(countries),
    rationingChoice: new Int8Array(countries).fill(-1),
    weekBasicGot: new Float64Array(countries),
    weekDays: 0,
    basicShortage: new Float32Array(countries),
    security: new Float32Array(provinces * groupCount).fill(1),
    famineSince: new Int32Array(provinces).fill(-1),
    famineDeaths: new Float64Array(provinces),
    famineLostBirths: new Float64Array(provinces),
    starvationDeaths: new Float64Array(countries),
    lostBirths: new Float64Array(countries),
    provinceSecurity: new Float32Array(provinces).fill(1),
    provinceStarving: new Float32Array(provinces),
    provinceSevere: new Float32Array(provinces),
    countrySecurity: new Float32Array(countries).fill(1),
    countryStarving: new Float32Array(countries),
    countrySevere: new Float32Array(countries),
    famineCount: new Int32Array(countries),
    reserveDays: new Float32Array(countries),
    basicIndex: new Float64Array(countries),
    countryPeople: new Float64Array(countries),
  };
}

/**
 * A country's food reserves in days: the value (at base prices) of the food
 * in its stockpile ÷ the value of what it buys of food a day (`daily`: per
 * country and good, for example the market's `lastBuy` or today's `buy`).
 * `Infinity` when it buys none.
 */
export function foodReserveDays(
  food: FoodState,
  market: MarketState,
  stock: Float64Array,
  daily: Float64Array,
  country: number,
): number {
  const at = country * market.goodCount;
  let held = 0;
  let used = 0;
  for (let k = 0; k < food.foodGoods.length; k++) {
    const g = food.foodGoods[k];
    held += stock[at + g] * market.basePrice[g];
    used += daily[at + g] * market.basePrice[g];
  }
  return used > 0 ? held / used : Infinity;
}

/**
 * The share of the basic food a country's pops needed today that they got
 * (1 when they asked for none). Each good counts at most its `maxShare` of
 * the need (`data/pops.json`): when nothing else is on sale, the markets let
 * people buy livestock and fish for all their basic food (F65's
 * substitution), but they can live on it for at most 40 % (we add: our needs
 * are counted in money, and a little meat costs as much as a lot of grain).
 */
function basicDelivered(food: FoodState, market: MarketState, country: number): number {
  const { needOffsets, entryGood, entryMaxShare, shares, popOrder, popGot } = market;
  const at = country * market.goodCount;
  const out = country * market.entryCount;
  let got = 0;
  let weight = 0;
  for (let e = needOffsets[food.basicNeed]; e < needOffsets[food.basicNeed + 1]; e++) {
    const m = at + entryGood[e];
    const share = shares[out + e];
    weight += share;
    const counted = share < entryMaxShare[e] ? share : entryMaxShare[e];
    got += counted * (popOrder[m] > 0 ? popGot[m] / popOrder[m] : 1);
  }
  return weight > 0 ? got / weight : 1;
}

/**
 * Picks every country's rationing level for the coming week: the player's
 * choice, or the automatic rule (a stricter level as soon as reserves fall
 * below its days or the shortage reaches its share; one level back a week
 * once reserves are above the level's lifting days and the shortage is
 * below its share).
 */
function chooseRationing(food: FoodState, market: MarketState, buildings: BuildingsState): void {
  const { rationing, rationingChoice, autoBelow, autoShortage, autoLift } = food;
  const levels = food.levelIds.length;
  for (let c = 0; c < food.countryCount; c++) {
    const days = foodReserveDays(food, market, buildings.stock, market.lastBuy, c);
    food.reserveDays[c] = days;
    if (rationingChoice[c] >= 0) {
      rationing[c] = rationingChoice[c];
      continue;
    }
    const shortage = food.basicShortage[c];
    let target = 0;
    for (let l = 1; l < levels; l++)
      if (days < autoBelow[l] || shortage >= autoShortage[l]) target = l;
    let level = rationing[c];
    if (target > level) level = target;
    else if (target < level && days >= autoLift[level] && shortage < autoShortage[level])
      level -= 1;
    rationing[c] = level;
  }
}

/**
 * Every pop's food security from its income, its wealth's buy package, the
 * price of basic food and last week's basic food shortage (Victoria 3 1.8).
 */
function updateSecurity(
  food: FoodState,
  population: PopulationState,
  market: MarketState,
  provinceOwner: Uint16Array,
): void {
  const { needOffsets, entryGood, shares, price, basePrice, goodCount, entryCount } = market;
  const { basicIndex, basicNeed, security } = food;
  const weight = food.rules.security.shortageWeight;
  const change = food.rules.security.weeklyChange;
  // What basic food costs against its base price, by what people eat of it.
  for (let c = 0; c < food.countryCount; c++) {
    let index = 0;
    for (let e = needOffsets[basicNeed]; e < needOffsets[basicNeed + 1]; e++) {
      const g = entryGood[e];
      index += (shares[c * entryCount + e] * price[c * goodCount + g]) / basePrice[g];
    }
    basicIndex[c] = index;
  }
  const { size, dependents, wealth, income } = population;
  const groups = food.groupCount;
  for (let p = 0; p < food.provinceCount; p++) {
    const row = p * groups;
    const c = provinceOwner[p];
    let workforce = 0;
    for (let g = 0; g < groups; g++) workforce += size[row + g];
    const consumers = workforce > 0 ? 1 + (market.dependentWeight * dependents[p]) / workforce : 1;
    const short = weight * food.basicShortage[c];
    for (let g = 0; g < groups; g++) {
      const i = row + g;
      if (size[i] <= 0) {
        security[i] = 1;
        continue;
      }
      const budget = income[i] / consumers;
      const spend = packageValueAt(market, wealth[i], basicNeed) * basicIndex[c];
      const expense = budget > 0 ? Math.min(1, spend / budget) : spend > 0 ? 1 : 0;
      let value = 1 - expense - short;
      value = value < 0 ? 0 : value > 1 ? 1 : value;
      // It takes weeks for hunger to turn into starvation (and back).
      security[i] += change * (value - security[i]);
    }
  }
}

/**
 * Writes what food security and rationing do (from the state, so a loaded
 * game does the same): the population's births, deaths and standard of
 * living, the markets' rationing, trade's food exports, and the shares of
 * people starving per province and country.
 */
export function applyFood(
  food: FoodState,
  population: PopulationState,
  market: MarketState,
  trade: TradeState,
  provinceOwner: Uint16Array,
): void {
  const { rules, rationing, security, foodGoods } = food;
  const { mild, severe } = rules.security;
  const starve = rules.starvation;
  const extraPerDay = starve.severe.extraDeathsPerYear / DAYS_PER_YEAR;
  for (let c = 0; c < food.countryCount; c++) {
    const level = rationing[c];
    market.rationRest[c] = 1 - food.restCut[level];
    market.rationBetter[c] = 1 - food.betterCut[level];
    for (let k = 0; k < foodGoods.length; k++)
      trade.exportBan[c * food.goodCount + foodGoods[k]] = food.stopExports[level];
  }
  const { size, dependents, deathFactor, extraDeaths, livingPenalty, birthKeep } = population;
  const { countrySecurity, countryStarving, countrySevere, countryPeople } = food;
  countrySecurity.fill(0);
  countryStarving.fill(0);
  countrySevere.fill(0);
  countryPeople.fill(0);
  const groups = food.groupCount;
  for (let p = 0; p < food.provinceCount; p++) {
    const row = p * groups;
    const c = provinceOwner[p];
    const rationLiving = food.levelLiving[rationing[c]];
    let workforce = 0;
    let securitySum = 0;
    let starving = 0;
    let severely = 0;
    for (let g = 0; g < groups; g++) {
      const i = row + g;
      const people = size[i];
      const fs = security[i];
      // Mild starvation grows from `mild` to `severe`, severe from `severe` to nothing.
      let m = (mild - fs) / (mild - severe);
      m = m < 0 ? 0 : m > 1 ? 1 : m;
      let s = (severe - fs) / severe;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      deathFactor[i] = 1 + starve.mild.deaths * m + (starve.severe.deaths - starve.mild.deaths) * s;
      extraDeaths[i] = extraPerDay * s;
      livingPenalty[i] =
        starve.mild.living * m + (starve.severe.living - starve.mild.living) * s + rationLiving;
      birthKeep[i] = 1 - starve.mild.births * m - (starve.severe.births - starve.mild.births) * s;
      workforce += people;
      securitySum += people * fs;
      if (fs < mild) starving += people;
      if (fs < severe) severely += people;
    }
    const share = workforce > 0 ? 1 / workforce : 0;
    food.provinceSecurity[p] = workforce > 0 ? securitySum * share : 1;
    food.provinceStarving[p] = starving * share;
    food.provinceSevere[p] = severely * share;
    const people = workforce + dependents[p];
    countryPeople[c] += people;
    countrySecurity[c] += people * food.provinceSecurity[p];
    countryStarving[c] += people * food.provinceStarving[p];
    countrySevere[c] += people * food.provinceSevere[p];
  }
  for (let c = 0; c < food.countryCount; c++) {
    const people = countryPeople[c];
    countrySecurity[c] = people > 0 ? countrySecurity[c] / people : 1;
    countryStarving[c] = people > 0 ? countryStarving[c] / people : 0;
    countrySevere[c] = people > 0 ? countrySevere[c] / people : 0;
  }
  population.reportOwnershipVersion = -1;
}

/** Counts every country's provinces in famine (by their owner now). */
function countFamines(food: FoodState, provinceOwner: Uint16Array): void {
  food.famineCount.fill(0);
  for (let p = 0; p < food.provinceCount; p++)
    if (food.famineSince[p] >= 0) food.famineCount[provinceOwner[p]] += 1;
}

/**
 * Food's week (Mondays, after the market's and trade's): last week's basic
 * food shortage, the rationing levels, every pop's food security, what they
 * do, and which provinces are in famine.
 */
export function foodWeek(state: GameState): void {
  const { food, population, market, trade, buildings, provinceOwner } = state;
  const days = food.weekDays;
  if (days > 0)
    for (let c = 0; c < food.countryCount; c++) {
      const got = food.weekBasicGot[c] / days;
      food.basicShortage[c] = got >= 1 ? 0 : got <= 0 ? 1 : 1 - got;
    }
  food.weekBasicGot.fill(0);
  food.weekDays = 0;
  chooseRationing(food, market, buildings);
  updateSecurity(food, population, market, provinceOwner);
  applyFood(food, population, market, trade, provinceOwner);
  // Famine (Victoria 3: a state's status): while enough of a province's people starve.
  const { starvingShare, severeShare } = food.rules.famine;
  const { world } = state;
  for (let p = 0; p < food.provinceCount; p++) {
    const famine =
      food.provinceStarving[p] > 0 &&
      food.provinceStarving[p] >= starvingShare &&
      food.provinceSevere[p] >= severeShare;
    if (famine && food.famineSince[p] < 0) {
      food.famineSince[p] = state.day;
      food.famineDeaths[p] = 0;
      food.famineLostBirths[p] = 0;
      state.emit({
        type: 'famineStarted',
        province: world.provinceIds[p],
        country: world.countryIds[provinceOwner[p]],
      });
    } else if (!famine && food.famineSince[p] >= 0) {
      food.famineSince[p] = -1;
      state.emit({
        type: 'famineEnded',
        province: world.provinceIds[p],
        country: world.countryIds[provinceOwner[p]],
        deaths: Math.round(food.famineDeaths[p]),
      });
    }
  }
  countFamines(food, provinceOwner);
  buildings.changes += 1;
}

/**
 * Food's day (after the market's and trade's): the share of basic food each
 * country's pops got, and the deaths and lost births of starvation (as the
 * population grew this morning) in provinces where people starve.
 */
export function foodDay(state: GameState): void {
  const { food, population, market, provinceOwner } = state;
  for (let c = 0; c < food.countryCount; c++)
    food.weekBasicGot[c] += basicDelivered(food, market, c);
  food.weekDays += 1;
  const { size, dependents, birthRate, workerDeathRate, dependentDeathRate } = population;
  const { birthKeep, deathFactor, extraDeaths } = population;
  const groups = food.groupCount;
  for (let p = 0; p < food.provinceCount; p++) {
    if (food.provinceStarving[p] <= 0) continue;
    const row = p * groups;
    let workforce = 0;
    let deaths = 0;
    let more = 0;
    let extra = 0;
    let lost = 0;
    for (let g = 0; g < groups; g++) {
      const i = row + g;
      workforce += size[i];
      deaths += size[i] * (workerDeathRate[p] * (deathFactor[i] - 1) + extraDeaths[i]);
      more += size[i] * (deathFactor[i] - 1);
      extra += size[i] * extraDeaths[i];
      lost += size[i] * (1 - birthKeep[i]);
    }
    if (workforce > 0) {
      // Dependents share their province's lot (as `growPopulation` has it).
      deaths += (dependents[p] * (dependentDeathRate[p] * more + extra)) / workforce;
      lost *= birthRate[p];
    }
    const c = provinceOwner[p];
    food.starvationDeaths[c] += deaths;
    food.lostBirths[c] += lost;
    if (food.famineSince[p] >= 0) {
      food.famineDeaths[p] += deaths;
      food.famineLostBirths[p] += lost;
    }
  }
}

/**
 * Sets a country's rationing: a level (by index) or automatic (-1). It takes
 * effect at once; the automatic rule decides again on Monday.
 */
export function setRationing(state: GameState, country: number, choice: number): void {
  const { food } = state;
  food.rationingChoice[country] = choice;
  if (choice >= 0) food.rationing[country] = choice;
  applyFood(food, state.population, state.market, state.trade, state.provinceOwner);
  state.buildings.changes += 1;
}

/** The food system (tick slot `foodConsumption`): the week on Mondays, then the day. */
export const foodSystem: SimSystem = {
  weekly(state) {
    foodWeek(state);
  },
  daily(state) {
    foodDay(state);
  },
};

/** The saved part of food. */
export interface FoodRestore {
  readonly rationing: Uint8Array;
  readonly rationingChoice: Int8Array;
  readonly weekBasicGot: Float64Array;
  readonly weekDays: number;
  readonly basicShortage: Float32Array;
  readonly security: Float32Array;
  readonly famineSince: Int32Array;
  readonly famineDeaths: Float64Array;
  readonly famineLostBirths: Float64Array;
  readonly starvationDeaths: Float64Array;
  readonly lostBirths: Float64Array;
}

/** The arrays of `FoodState` a save keeps, in the order a save lists them. */
export const FOOD_SAVED_ARRAYS = [
  'rationing',
  'rationingChoice',
  'weekBasicGot',
  'basicShortage',
  'security',
  'famineSince',
  'famineDeaths',
  'famineLostBirths',
  'starvationDeaths',
  'lostBirths',
] as const;

/** Puts saved food back (the arrays must be the right length), then works out what it does. */
export function restoreFood(state: GameState, saved: FoodRestore): void {
  const { food } = state;
  for (const key of FOOD_SAVED_ARRAYS) {
    if (saved[key].length !== food[key].length)
      throw new Error(`Food: the restored "${key}" does not match the map`);
    food[key].set(saved[key]);
  }
  food.weekDays = saved.weekDays;
  for (let c = 0; c < food.countryCount; c++)
    food.reserveDays[c] = foodReserveDays(
      food,
      state.market,
      state.buildings.stock,
      state.market.lastBuy,
      c,
    );
  applyFood(food, state.population, state.market, state.trade, state.provinceOwner);
  countFamines(food, state.provinceOwner);
}
