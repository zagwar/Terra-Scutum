import type { GameData } from '../data/game-data';
import type { WorldMap } from '../world/world-map';
import { type BuildingsState, refreshBuildingJobs } from './buildings';
import type { PopulationState } from './population';

/**
 * National markets (F65, section 8.6), on Victoria 3's rules (designer
 * decision: Victoria 3 is the foundation for the economy).
 *
 * - **One market per country** for every good. Buildings sell what they make
 *   there and buy their inputs; pops buy their needs; the rest of the
 *   economy (a stand-in for what the building catalog doesn't cover yet)
 *   buys what is left over at the start after exports; exports (F19,
 *   `trade.ts`) buy like everyone else, imports are sold like the country's
 *   own goods.
 * - **Prices** (weekly): reference price × (1 + sensitivity × (buy − sell) ÷
 *   the smaller of the two), from the past week's buy and sell orders,
 *   between `min` and `max` times the base price. The reference price is the
 *   base price, or (F19) for a good the country trades the average of its
 *   own goods at the base price and its imports' delivered cost (or its
 *   exports' world price). The national stockpile is the market's reserve:
 *   buyers draw on it, prices ignore it.
 * - **Pops** have a **wealth** (1–99, `PopulationState.wealth`) and buy its
 *   **buy package** every day: so many US$ (at base prices) per worker of
 *   each need; a dependent counts as `dependentWeight` of a worker. A need
 *   with goods is split among them (**substitution**: by each good's sell
 *   orders less half of what others buy, times its weight, at most its
 *   `maxShare`); a need without goods is paid at the stand-in price level.
 *   Every week wealth moves toward what the pop's income pays for.
 * - **Buildings** (weekly, `buildingsWeek`): profit = sales − inputs −
 *   wages. Part of a profit fills the building's cash reserves, the rest goes
 *   to the province's owners as dividends. Buildings raise wages when they
 *   make a good profit and can't fill their jobs (or their workers live
 *   below what they expect), cut them when they lose money with low
 *   reserves (or barely profit while their workers live well above what
 *   they expect), and lay workers off when they lose money at their lowest
 *   wage; they hire back once they make money again.
 *
 * All numbers live in typed arrays: per country and good at
 * `country * goodCount + good`; substitution shares per country and need
 * entry at `country * entryCount + entry`. Nothing is allocated in the daily
 * step. No random numbers.
 */
export interface MarketState {
  readonly goodCount: number;
  readonly countryCount: number;
  readonly electricityGood: number;
  /** Each good's base price, US$ per unit. */
  readonly basePrice: Float64Array;

  // ── From the data, ready for the loops ───────────────────────────────────
  readonly needIds: readonly string[];
  readonly needCount: number;
  /** A need's goods (entries) are `needOffsets[n]` … `needOffsets[n + 1] - 1`; a need with none is paid at the stand-in price. */
  readonly needOffsets: Int32Array;
  readonly entryGood: Int32Array;
  readonly entryWeight: Float64Array;
  readonly entryMaxShare: Float64Array;
  readonly entryCount: number;
  /** The buy packages' rows: their wealth levels, and US$ per worker a day per need (`row * needCount + need`). */
  readonly packageLevel: Float64Array;
  readonly packageValue: Float64Array;
  readonly dependentWeight: number;
  /** How much less the rest of the economy buys of a dearer good (`data/market.json` → `restOfEconomy.priceElasticity`). */
  readonly restElasticity: number;

  // ── Fixed for the campaign (from the start, `calibrateMarkets`) ──────────
  /** Per country and good: what the rest of the economy buys a day per person (never electricity: that is `BuildingsState.otherPowerPerPerson`). */
  readonly restPerPerson: Float64Array;
  /** Per country and good: the price at the start; the rest of the economy buys less of a good dearer than this. */
  readonly restReference: Float64Array;

  // ── The state (saved) ────────────────────────────────────────────────────
  /** Per country and good: this week's price, US$ per unit. */
  readonly price: Float64Array;
  /** Per country and good: where the price formula starts from (F19: the base price, or what trade makes it; saved with trade). */
  readonly referencePrice: Float64Array;
  /** Per country and good: what the country's exporters buy a day to ship abroad (F19: this week's plan, set by trade). */
  readonly exportOrder: Float64Array;
  /** Per country and good: what a unit fetches abroad (F19: world price less export tariff; 0 for goods that can't be traded). */
  readonly exportPrice: Float64Array;
  /** Per country and need entry: the share of the need that good covers (0–1). */
  readonly shares: Float64Array;
  /** Per country and good: this week's buy and sell orders so far, and the pops' part of the buy orders. */
  readonly weekBuy: Float64Array;
  readonly weekSell: Float64Array;
  readonly weekPopBuy: Float64Array;
  /** Per country: the value (at base prices) of the goods its pops wanted and got this week so far. */
  readonly weekPopWanted: Float64Array;
  readonly weekPopGot: Float64Array;
  /** Per country: the share of its pops' goods that went undelivered last week (0–1). */
  readonly shortage: Float32Array;
  /** Per pop: its income this week so far (US$, all its workers together). */
  readonly weekIncome: Float64Array;
  /** Per pop: the dividends it receives a day (US$), from last week's profits. */
  readonly dividend: Float64Array;
  /** Days counted in this week's sums. */
  weekDays: number;

  // ── The report (today; not saved) ────────────────────────────────────────
  /** Per country and good: what the pops and the rest of the economy want today, and what they got. */
  readonly popOrder: Float64Array;
  readonly restOrder: Float64Array;
  readonly popGot: Float64Array;
  readonly restGot: Float64Array;
  /** Per country and good: what the exporters got today (it leaves for the World Market). */
  readonly exportGot: Float64Array;
  /** Per country and good: today's sell orders (made + imported; electricity: what the plants could make) and buy orders (everyone). */
  readonly sell: Float64Array;
  readonly buy: Float64Array;
  /** Per country and good: what went over the stockpile's limit today and was lost. */
  readonly lost: Float64Array;
  /** Per country and good: last week's buy and sell orders a day (for trade's week; worked out every Monday). */
  readonly lastBuy: Float64Array;
  readonly lastSell: Float64Array;
  /** Per country: its people today, and the electricity its pops ask for (their heating). */
  readonly countryPeople: Float64Array;
  readonly popPower: Float64Array;
  /** Per country and good, the weekly prices of the last `HISTORY_WEEKS` weeks (a ring; not saved). */
  readonly history: Float32Array;
  historyCount: number;
  historyNext: number;

  // ── Scratch ──────────────────────────────────────────────────────────────
  readonly needIndex: Float64Array;
  readonly rowCost: Float64Array;
  readonly raw: Float64Array;
}

/** Weeks of price history kept for the screens. */
export const HISTORY_WEEKS = 52;

/** Creates the markets: base prices everywhere, nothing counted yet. `calibrateMarkets` sets the start. */
export function createMarket(data: GameData, world: WorldMap, groupCount: number): MarketState {
  const goods = data.goods.goods;
  const goodCount = goods.length;
  const countries = world.countryIds.length;
  const provinces = world.provinceIds.length;
  const goodIndex = (id: string) => goods.findIndex((good) => good.id === id);
  const { needs, wealth } = data.pops;
  const needOffsets = new Int32Array(needs.length + 1);
  needs.forEach((need, n) => (needOffsets[n + 1] = needOffsets[n] + (need.goods?.length ?? 0)));
  const entries = needs.flatMap((need) => need.goods ?? []);
  const rows = wealth.packages;
  const basePrice = Float64Array.from(goods, (good) => good.basePrice);
  const price = new Float64Array(countries * goodCount);
  for (let c = 0; c < countries; c++) price.set(basePrice, c * goodCount);
  return {
    goodCount,
    countryCount: countries,
    electricityGood: goodIndex(data.goods.electricity),
    basePrice,
    needIds: needs.map((need) => need.id),
    needCount: needs.length,
    needOffsets,
    entryGood: Int32Array.from(entries, (entry) => goodIndex(entry.good)),
    entryWeight: Float64Array.from(entries, (entry) => entry.weight ?? 1),
    entryMaxShare: Float64Array.from(
      entries,
      (entry) => entry.maxShare ?? wealth.substitution.maxShare,
    ),
    entryCount: entries.length,
    packageLevel: Float64Array.from(rows, (row) => row.level),
    packageValue: Float64Array.from(
      rows.flatMap((row) => needs.map((need) => row.needs[need.id] ?? 0)),
    ),
    dependentWeight: wealth.dependentWeight,
    restElasticity: data.market.restOfEconomy.priceElasticity,
    restPerPerson: new Float64Array(countries * goodCount),
    restReference: price.slice(),
    price,
    referencePrice: price.slice(),
    exportOrder: new Float64Array(countries * goodCount),
    exportPrice: new Float64Array(countries * goodCount),
    shares: new Float64Array(countries * entries.length),
    weekBuy: new Float64Array(countries * goodCount),
    weekSell: new Float64Array(countries * goodCount),
    weekPopBuy: new Float64Array(countries * goodCount),
    weekPopWanted: new Float64Array(countries),
    weekPopGot: new Float64Array(countries),
    shortage: new Float32Array(countries),
    weekIncome: new Float64Array(provinces * groupCount),
    dividend: new Float64Array(provinces * groupCount),
    weekDays: 0,
    popOrder: new Float64Array(countries * goodCount),
    restOrder: new Float64Array(countries * goodCount),
    popGot: new Float64Array(countries * goodCount),
    restGot: new Float64Array(countries * goodCount),
    exportGot: new Float64Array(countries * goodCount),
    sell: new Float64Array(countries * goodCount),
    buy: new Float64Array(countries * goodCount),
    lost: new Float64Array(countries * goodCount),
    lastBuy: new Float64Array(countries * goodCount),
    lastSell: new Float64Array(countries * goodCount),
    countryPeople: new Float64Array(countries),
    popPower: new Float64Array(countries),
    history: new Float32Array(countries * goodCount * HISTORY_WEEKS),
    historyCount: 0,
    historyNext: 0,
    needIndex: new Float64Array(needs.length),
    rowCost: new Float64Array(rows.length),
    raw: new Float64Array(Math.max(1, ...needs.map((need) => need.goods?.length ?? 0))),
  };
}

/**
 * The substitution shares of every need in every market (Victoria 3): a
 * good's raw share is its weight × (its sell orders − `otherBuyersWeight` ×
 * what buildings and the rest of the economy buy of it), never below
 * nothing, counted by value at base prices (our goods have real units:
 * tonnes and MWh are not comparable as they are); for electricity, which
 * can't be stored, all of what others buy counts. The shares are the raw
 * ones in proportion, each at most its
 * `maxShare` (what one good can't cover goes to the others). A need none of
 * whose goods are on sale is split evenly. `sell`, `buy` and `popBuy` are
 * per country and good (a week's or a day's orders).
 */
export function updateShares(
  market: MarketState,
  sell: Float64Array,
  buy: Float64Array,
  popBuy: Float64Array,
  otherBuyersWeight: number,
): void {
  const { needOffsets, entryGood, entryWeight, entryMaxShare, shares, raw, goodCount } = market;
  for (let c = 0; c < market.countryCount; c++) {
    const at = c * goodCount;
    const out = c * market.entryCount;
    for (let n = 0; n < market.needCount; n++) {
      const first = needOffsets[n];
      const count = needOffsets[n + 1] - first;
      if (count === 0) continue;
      let total = 0;
      for (let e = 0; e < count; e++) {
        const good = entryGood[first + e];
        const g = at + good;
        // Electricity can't be stored: what others take is gone, all of it.
        const others = good === market.electricityGood ? 1 : otherBuyersWeight;
        const free = sell[g] - others * (buy[g] - popBuy[g]);
        // Our goods have real units (tonnes, MWh): compare the value on sale.
        raw[e] = free > 0 ? entryWeight[first + e] * free * market.basePrice[good] : 0;
        total += raw[e];
      }
      if (total <= 0) for (let e = 0; e < count; e++) raw[e] = entryWeight[first + e];
      // Water-filling: cap a good at its most, give the rest to the others.
      for (let e = 0; e < count; e++) shares[out + first + e] = -1;
      let left = 1;
      for (let round = 0; round < count; round++) {
        let open = 0;
        for (let e = 0; e < count; e++) if (shares[out + first + e] < 0) open += raw[e];
        if (open <= 0) break;
        let capped = false;
        for (let e = 0; e < count; e++) {
          if (shares[out + first + e] >= 0) continue;
          const most = entryMaxShare[first + e];
          if ((left * raw[e]) / open > most) {
            shares[out + first + e] = most;
            left -= most;
            capped = true;
          }
        }
        if (!capped) {
          for (let e = 0; e < count; e++)
            if (shares[out + first + e] < 0) shares[out + first + e] = (left * raw[e]) / open;
          break;
        }
      }
      // Every good is capped (or had no raw share): spread what is left in proportion.
      let sum = 0;
      for (let e = 0; e < count; e++) {
        if (shares[out + first + e] < 0) shares[out + first + e] = 0;
        sum += shares[out + first + e];
      }
      if (sum > 0 && Math.abs(sum - 1) > 1e-12)
        for (let e = 0; e < count; e++) shares[out + first + e] /= sum;
    }
  }
}

/** Where wealth `w` falls among the package rows: the row below it (`row`) and how far toward the next (0–1). */
function packageRow(market: MarketState, w: number): number {
  const levels = market.packageLevel;
  let row = 0;
  while (row < levels.length - 2 && w >= levels[row + 1]) row++;
  return row;
}

/**
 * Today's buy orders of the pops (per country and good, from their wealth,
 * the substitution shares and their numbers) and of the rest of the economy
 * (per person), and each country's people.
 */
export function computeOrders(
  market: MarketState,
  population: PopulationState,
  provinceOwner: Uint16Array,
): void {
  const { popOrder, restOrder, countryPeople, packageLevel, packageValue, needCount } = market;
  const { needOffsets, entryGood, shares, basePrice, goodCount, dependentWeight } = market;
  const { size, dependents, wealth } = population;
  const groups = population.groupCount;
  popOrder.fill(0);
  countryPeople.fill(0);
  for (let p = 0; p < dependents.length; p++) {
    const row = p * groups;
    const c = provinceOwner[p];
    let workforce = 0;
    for (let g = 0; g < groups; g++) workforce += size[row + g];
    countryPeople[c] += workforce + dependents[p];
    if (workforce <= 0) continue;
    const consumers = 1 + (dependentWeight * dependents[p]) / workforce;
    const at = c * goodCount;
    const out = c * market.entryCount;
    for (let g = 0; g < groups; g++) {
      const people = size[row + g] * consumers;
      if (people <= 0) continue;
      const w = wealth[row + g];
      const r = packageRow(market, w);
      let t = (w - packageLevel[r]) / (packageLevel[r + 1] - packageLevel[r]);
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      for (let n = 0; n < needCount; n++) {
        const first = needOffsets[n];
        const last = needOffsets[n + 1];
        if (first === last) continue;
        const value =
          (1 - t) * packageValue[r * needCount + n] + t * packageValue[(r + 1) * needCount + n];
        if (value <= 0) continue;
        for (let e = first; e < last; e++) {
          const good = entryGood[e];
          popOrder[at + good] += (people * value * shares[out + e]) / basePrice[good];
        }
      }
    }
  }
  // The rest of the economy buys less of what has become dearer: in
  // proportion to (starting price ÷ price) to the power of `restElasticity`.
  // F19: a good that fetches more abroad than at home costs it what it
  // fetches abroad (so a high world price frees goods for export).
  const { restPerPerson, restReference, price, exportPrice, restElasticity } = market;
  for (let c = 0; c < market.countryCount; c++) {
    const at = c * goodCount;
    market.popPower[c] = popOrder[at + market.electricityGood];
    for (let g = 0; g < goodCount; g++) {
      const wanted = restPerPerson[at + g] * countryPeople[c];
      if (wanted <= 0) {
        restOrder[at + g] = 0;
        continue;
      }
      const p = exportPrice[at + g] > price[at + g] ? exportPrice[at + g] : price[at + g];
      const ratio = restReference[at + g] / p;
      restOrder[at + g] =
        restElasticity === 1 ? wanted * ratio : wanted * Math.pow(ratio, restElasticity);
    }
  }
}

/**
 * The market's part of a day, after the buildings produced: the pops and the
 * rest of the economy buy from what is in the stock, with equal shares in a
 * shortage, then the exporters (F19) take what is left; what is above the
 * stockpile's limit is lost; the day's buy and sell orders are counted.
 * With `real`, also this week's sums: orders, incomes, deliveries and each
 * building's sales and costs (the report's trial run passes false).
 */
export function marketDay(
  market: MarketState,
  buildings: BuildingsState,
  population: PopulationState,
  stock: Float64Array,
  real: boolean,
): void {
  const { goodCount, electricityGood, popOrder, restOrder, popGot, restGot, sell, buy, lost } =
    market;
  const { exportOrder, exportGot } = market;
  const { made, imports, ordered, powerPotential, popPowerUsed, otherPowerUsed } = buildings;
  const { capacityUse, capacityMake, maxDays } = buildings;
  const basePrice = market.basePrice;
  for (let c = 0; c < market.countryCount; c++) {
    const at = c * goodCount;
    let wanted = 0;
    let got = 0;
    for (let g = 0; g < goodCount; g++) {
      const m = at + g;
      if (g === electricityGood) {
        // Electricity was shared out when the plants ran (`runStage`).
        popGot[m] = popPowerUsed[c];
        restGot[m] = otherPowerUsed[c];
        exportGot[m] = 0;
        sell[m] = powerPotential[c];
        buy[m] = ordered[m];
        lost[m] = 0;
      } else {
        // In a shortage everyone gets the same share (Victoria 3): the pops
        // and the rest of the economy leave the buildings theirs for
        // tomorrow. Exporters (F19) ship what is left after that: a country
        // looks after its own buyers first (Victoria 3 shares equally).
        let there = stock[m];
        const asked = popOrder[m] + restOrder[m] + ordered[m];
        const share = asked > there ? there / asked : 1;
        popGot[m] = popOrder[m] * share;
        restGot[m] = restOrder[m] * share;
        there -= popGot[m] + restGot[m];
        if (there < 0) there = 0;
        const spare = there - ordered[m] * share;
        exportGot[m] = spare <= 0 ? 0 : spare < exportOrder[m] ? spare : exportOrder[m];
        there -= exportGot[m];
        sell[m] = made[m] + imports[m];
        buy[m] = ordered[m] + popOrder[m] + restOrder[m] + exportOrder[m];
        // A country keeps only so many days of what its market buys or sells.
        let daily = buy[m] > sell[m] ? buy[m] : sell[m];
        if (capacityUse[m] > daily) daily = capacityUse[m];
        if (capacityMake[m] > daily) daily = capacityMake[m];
        const most = maxDays * daily;
        lost[m] = there > most ? there - most : 0;
        stock[m] = there - lost[m];
      }
      wanted += popOrder[m] * basePrice[g];
      got += popGot[m] * basePrice[g];
    }
    if (real) {
      market.weekPopWanted[c] += wanted;
      market.weekPopGot[c] += got;
    }
  }
  if (!real) return;

  const { weekBuy, weekSell, weekPopBuy } = market;
  for (let m = 0; m < weekBuy.length; m++) {
    weekBuy[m] += buy[m];
    weekSell[m] += sell[m];
    weekPopBuy[m] += popOrder[m];
  }
  // Incomes: building pay (or a subsistence building's share), the rest of
  // the economy's going wage, dividends.
  const { popPay, standInFill } = buildings;
  const { standInJobs, wage } = population;
  const { weekIncome, dividend } = market;
  for (let i = 0; i < weekIncome.length; i++)
    weekIncome[i] += popPay[i] + standInJobs[i] * standInFill[i] * wage[i] + dividend[i];
  const { cells, cellCount, revenue, inputCost, wages, weekRevenue, weekCost, weekWages } =
    buildings;
  for (let i = 0; i < cellCount; i++) {
    const cell = cells[i];
    weekRevenue[cell] += revenue[cell];
    weekCost[cell] += inputCost[cell];
    weekWages[cell] += wages[cell];
  }
  market.weekDays += 1;
}

/**
 * The market's week (Mondays, before the day's own step): new prices from
 * the week's orders, the substitution shares, last week's shortages and
 * incomes, the buildings' money and decisions (`buildingsWeek`), the pops'
 * wealth, then a fresh week.
 */
export function marketWeek(
  market: MarketState,
  buildings: BuildingsState,
  population: PopulationState,
  provinceOwner: Uint16Array,
  data: GameData,
): void {
  const days = market.weekDays;
  if (days > 0) {
    for (let m = 0; m < market.lastBuy.length; m++) {
      market.lastBuy[m] = market.weekBuy[m] / days;
      market.lastSell[m] = market.weekSell[m] / days;
    }
    updatePrices(market, data);
    updateShares(
      market,
      market.weekSell,
      market.weekBuy,
      market.weekPopBuy,
      data.pops.wealth.substitution.otherBuyersWeight,
    );
    for (let c = 0; c < market.countryCount; c++) {
      const wanted = market.weekPopWanted[c];
      market.shortage[c] = wanted > 0 ? Math.max(0, 1 - market.weekPopGot[c] / wanted) : 0;
    }
    const { size, income } = population;
    for (let i = 0; i < size.length; i++)
      income[i] = size[i] > 0 ? market.weekIncome[i] / days / size[i] : 0;
    buildingsWeek(market, buildings, population, provinceOwner, data);
    updateWealth(market, population, provinceOwner, data);
    recordHistory(market);
  }
  market.weekBuy.fill(0);
  market.weekSell.fill(0);
  market.weekPopBuy.fill(0);
  market.weekPopWanted.fill(0);
  market.weekPopGot.fill(0);
  market.weekIncome.fill(0);
  buildings.weekRevenue.fill(0);
  buildings.weekCost.fill(0);
  buildings.weekWages.fill(0);
  market.weekDays = 0;
  buildings.changes += 1;
  population.reportOwnershipVersion = -1;
}

/** Victoria 3's price: base × (1 + sensitivity × (buy − sell) ÷ min(buy, sell)), within its limits (`base` may be a reference price, F19). */
export function marketPrice(
  base: number,
  buy: number,
  sell: number,
  rules: GameData['market']['prices'],
): number {
  let pressure: number;
  if (buy <= 0 && sell <= 0) pressure = 0;
  else if (sell <= 0) pressure = 1;
  else if (buy <= 0) pressure = -1;
  else {
    pressure = (buy - sell) / (buy < sell ? buy : sell);
    if (pressure > 1) pressure = 1;
    else if (pressure < -1) pressure = -1;
  }
  let factor = 1 + rules.sensitivity * pressure;
  if (factor < rules.min) factor = rules.min;
  else if (factor > rules.max) factor = rules.max;
  return base * factor;
}

/** The week's prices: Victoria 3's formula from each market's reference price (F19), kept within `min` and `max` times the base price. */
function updatePrices(market: MarketState, data: GameData): void {
  const { price, weekBuy, weekSell, basePrice, referencePrice, goodCount } = market;
  const rules = data.market.prices;
  for (let m = 0; m < price.length; m++) {
    const base = basePrice[m % goodCount];
    let p = marketPrice(referencePrice[m], weekBuy[m], weekSell[m], rules);
    if (p < rules.min * base) p = rules.min * base;
    else if (p > rules.max * base) p = rules.max * base;
    price[m] = p;
  }
}

function recordHistory(market: MarketState): void {
  const { price, history } = market;
  const slot = market.historyNext;
  for (let m = 0; m < price.length; m++) history[m * HISTORY_WEEKS + slot] = price[m];
  market.historyNext = (slot + 1) % HISTORY_WEEKS;
  if (market.historyCount < HISTORY_WEEKS) market.historyCount += 1;
}

/**
 * What one worker's buy package costs a day at each package row, in a
 * province (writes `rowCost`): goods at the market's prices and shares,
 * the needs without a good at the province's stand-in price level.
 */
function fillRowCosts(market: MarketState, country: number, priceLevel: number): void {
  const { needOffsets, entryGood, shares, price, basePrice, needIndex, packageValue, rowCost } =
    market;
  const at = country * market.goodCount;
  const out = country * market.entryCount;
  for (let n = 0; n < market.needCount; n++) {
    const first = needOffsets[n];
    const last = needOffsets[n + 1];
    if (first === last) {
      needIndex[n] = priceLevel;
      continue;
    }
    let index = 0;
    for (let e = first; e < last; e++) {
      const g = entryGood[e];
      index += (shares[out + e] * price[at + g]) / basePrice[g];
    }
    needIndex[n] = index;
  }
  for (let r = 0; r < rowCost.length; r++) {
    let cost = 0;
    for (let n = 0; n < market.needCount; n++)
      cost += packageValue[r * market.needCount + n] * needIndex[n];
    rowCost[r] = cost;
  }
}

/** The package cost at wealth `w` from `rowCost` (per worker, without dependents). */
function costAt(market: MarketState, w: number): number {
  const r = packageRow(market, w);
  const levels = market.packageLevel;
  let t = (w - levels[r]) / (levels[r + 1] - levels[r]);
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return (1 - t) * market.rowCost[r] + t * market.rowCost[r + 1];
}

/** The highest wealth (1–99) whose package (per worker, without dependents) costs at most `budget`. */
function wealthFor(market: MarketState, budget: number): number {
  const { rowCost, packageLevel } = market;
  const rows = rowCost.length;
  if (budget <= rowCost[0]) return packageLevel[0];
  for (let r = rows - 1; r > 0; r--) {
    if (budget >= rowCost[r]) {
      if (r === rows - 1) return packageLevel[r];
      const span = rowCost[r + 1] - rowCost[r];
      const t = span > 0 ? (budget - rowCost[r]) / span : 0;
      return packageLevel[r] + Math.min(1, t) * (packageLevel[r + 1] - packageLevel[r]);
    }
    if (budget >= rowCost[r - 1]) {
      const span = rowCost[r] - rowCost[r - 1];
      const t = span > 0 ? (budget - rowCost[r - 1]) / span : 0;
      return packageLevel[r - 1] + t * (packageLevel[r] - packageLevel[r - 1]);
    }
  }
  return packageLevel[0];
}

/**
 * Wealth moves (Victoria 3): up while a pop's income is above
 * `rise.threshold` × the package of the level above (by `rise.speed` of the
 * gap to what it can afford a week), down while below `fall.threshold` × its
 * own package (by `fall.speed` of the gap). With `settle`, wealth is set
 * straight to what the income affords (the start of a campaign).
 */
export function updateWealth(
  market: MarketState,
  population: PopulationState,
  provinceOwner: Uint16Array,
  data: GameData,
  settle = false,
): void {
  const { size, dependents, wealth, income, priceLevel } = population;
  const groups = population.groupCount;
  const { rise, fall } = data.pops.wealth;
  for (let p = 0; p < dependents.length; p++) {
    const row = p * groups;
    let workforce = 0;
    for (let g = 0; g < groups; g++) workforce += size[row + g];
    if (workforce <= 0) continue;
    const consumers = 1 + (market.dependentWeight * dependents[p]) / workforce;
    fillRowCosts(market, provinceOwner[p], priceLevel[p]);
    for (let g = 0; g < groups; g++) {
      if (size[row + g] <= 0) continue;
      // What a worker's income buys, for the worker and its dependents.
      const budget = income[row + g] / consumers;
      if (settle) {
        wealth[row + g] = wealthFor(market, budget);
        continue;
      }
      const w = wealth[row + g];
      const next = w + 1 > 99 ? 99 : w + 1;
      if (budget > rise.threshold * costAt(market, next)) {
        const target = wealthFor(market, budget / rise.threshold);
        if (target > w) wealth[row + g] = Math.min(99, w + rise.speed * (target - w));
      } else if (budget < fall.threshold * costAt(market, w)) {
        const target = wealthFor(market, budget / fall.threshold);
        if (target < w) wealth[row + g] = Math.max(1, w - fall.speed * (w - target));
      }
    }
  }
  population.reportOwnershipVersion = -1;
}

/**
 * A building's sales, input and electricity costs and wages per level and
 * day at full output and full staff, at its market's prices and its own
 * wage level: what it would earn if nothing held it back.
 */
export function unitEconomics(
  market: MarketState,
  buildings: BuildingsState,
  population: PopulationState,
  cell: number,
  country: number,
  wageFactor: number,
): { sales: number; costs: number; wages: number } {
  const { typeCount, recipeOffsets, method, inputOffsets, inputGood, inputAmount } = buildings;
  const { outputOffsets, outputGood, outputAmount, recipeElectricity, recipePower } = buildings;
  const { workerOffsets, workerGroup, workerCount } = buildings;
  const province = (cell / typeCount) | 0;
  const r = recipeOffsets[cell - province * typeCount] + method[cell];
  const at = country * market.goodCount;
  const price = market.price;
  let sales = recipePower[r] * price[at + market.electricityGood];
  for (let k = outputOffsets[r]; k < outputOffsets[r + 1]; k++)
    sales += outputAmount[k] * price[at + outputGood[k]];
  let costs = recipeElectricity[r] * price[at + market.electricityGood];
  for (let k = inputOffsets[r]; k < inputOffsets[r + 1]; k++)
    costs += inputAmount[k] * price[at + inputGood[k]];
  let wages = 0;
  const row = province * population.groupCount;
  for (let k = workerOffsets[r]; k < workerOffsets[r + 1]; k++)
    wages += workerCount[k] * population.wage[row + workerGroup[k]] * wageFactor;
  return { sales, costs, wages };
}

/** The most a building's cash reserves hold: `reserveDays` of its wages at full staff at the going wage. */
export function reserveCap(
  buildings: BuildingsState,
  population: PopulationState,
  cell: number,
  reserveDays: number,
): number {
  const { typeCount, recipeOffsets, method, workerOffsets, workerGroup, workerCount, level } =
    buildings;
  const province = (cell / typeCount) | 0;
  const r = recipeOffsets[cell - province * typeCount] + method[cell];
  const row = province * population.groupCount;
  let wages = 0;
  for (let k = workerOffsets[r]; k < workerOffsets[r + 1]; k++)
    wages += workerCount[k] * population.wage[row + workerGroup[k]];
  return reserveDays * level[cell] * wages;
}

/**
 * The buildings' week (Victoria 3): profits fill the cash reserves and pay
 * dividends to the province's owners; wages go up or down; buildings that
 * lose money at their lowest wage lay workers off, profitable ones hire
 * back. Subsistence buildings do none of this.
 */
function buildingsWeek(
  market: MarketState,
  buildings: BuildingsState,
  population: PopulationState,
  provinceOwner: Uint16Array,
  data: GameData,
): void {
  const rules = data.market.buildings;
  const { cells, cellCount, typeCount, recipeOffsets, method, recipeSubsistence, level } =
    buildings;
  const { weekRevenue, weekCost, weekWages, reserves, wageFactor, open, raiseCooldown } = buildings;
  const { staffing, workerOffsets, workerGroup, workerCount } = buildings;
  const { expectedLiving, wealth } = population;
  const groups = population.groupCount;
  const ownersGroup = data.pops.groups.findIndex((group) => group.id === 'owners');
  const { dividend } = market;
  const days = market.weekDays;
  dividend.fill(0);
  let jobsChanged = false;
  for (let i = 0; i < cellCount; i++) {
    const cell = cells[i];
    const province = (cell / typeCount) | 0;
    const r = recipeOffsets[cell - province * typeCount] + method[cell];
    if (recipeSubsistence[r] === 1 || level[cell] === 0) continue;
    const country = provinceOwner[province];
    const cap = reserveCap(buildings, population, cell, rules.reserveDays);
    let profit = weekRevenue[cell] - weekCost[cell] - weekWages[cell];
    let margin: number;
    if (weekRevenue[cell] > 0 && open[cell] > 0) margin = profit / weekRevenue[cell];
    else {
      // Nothing sold (all laid off, or idle): judge by what it would earn.
      const unit = unitEconomics(market, buildings, population, cell, country, wageFactor[cell]);
      const potential = unit.sales - unit.costs - unit.wages;
      margin = unit.sales > 0 ? potential / unit.sales : -1;
      if (profit === 0) profit = potential;
    }
    // Profits fill the reserves, the rest is paid out; losses empty them.
    if (profit > 0) {
      const full = cap > 0 ? Math.min(1, reserves[cell] / cap) : 1;
      const keep = rules.depositWhenEmpty - (rules.depositWhenEmpty - rules.depositAtFull) * full;
      const room = cap > reserves[cell] ? cap - reserves[cell] : 0;
      const deposit = Math.min(profit * keep, room);
      reserves[cell] += deposit;
      if (ownersGroup >= 0 && days > 0)
        dividend[province * groups + ownersGroup] += (profit - deposit) / days;
    } else {
      reserves[cell] = Math.max(0, reserves[cell] + profit);
    }

    // How its workers live, compared with what they expect.
    let living = 0;
    let expected = 0;
    let weight = 0;
    for (let k = workerOffsets[r]; k < workerOffsets[r + 1]; k++) {
      const pop = province * groups + workerGroup[k];
      living += workerCount[k] * wealth[pop];
      expected += workerCount[k] * expectedLiving[pop];
      weight += workerCount[k];
    }
    if (weight > 0) {
      living /= weight;
      expected /= weight;
    }
    if (raiseCooldown[cell] > 0) raiseCooldown[cell] -= 1;
    const short = staffing[cell] < rules.raiseBelowStaffing;
    const raise =
      raiseCooldown[cell] === 0 &&
      ((margin >= rules.raiseMargin && short) ||
        (margin >= rules.largeMargin && living < expected));
    const losing = profit < 0 && reserves[cell] < rules.lowReserves * cap;
    const cut = losing || (margin < rules.minimalMargin && living > rules.wellAbove * expected);
    if (raise) {
      wageFactor[cell] = Math.min(rules.maxWage, wageFactor[cell] * (1 + rules.wageStep));
      raiseCooldown[cell] = rules.raiseCooldownWeeks;
    } else if (cut && wageFactor[cell] > rules.minWage * (1 + 1e-6)) {
      wageFactor[cell] = Math.max(rules.minWage, wageFactor[cell] * (1 - rules.wageStep));
    } else if (losing && open[cell] > 0) {
      open[cell] = Math.max(0, open[cell] - rules.firingRate);
      jobsChanged = true;
    }
    if (!losing && margin > 0 && open[cell] < 1) {
      open[cell] = Math.min(1, open[cell] + rules.hiringRate);
      jobsChanged = true;
    }
  }
  if (jobsChanged) refreshBuildingJobs(buildings, population, -1);
}

/** The saved part of the markets (per country and good, per country and need entry, per country, per pop). */
export interface MarketRestore {
  readonly price: Float64Array;
  readonly shares: Float64Array;
  readonly weekBuy: Float64Array;
  readonly weekSell: Float64Array;
  readonly weekPopBuy: Float64Array;
  readonly weekPopWanted: Float64Array;
  readonly weekPopGot: Float64Array;
  readonly shortage: Float32Array;
  readonly weekIncome: Float64Array;
  readonly dividend: Float64Array;
  readonly weekDays: number;
}

/** The parts of `MarketState` a save keeps, in the order a save lists them. */
export const MARKET_SAVED_ARRAYS = [
  'price',
  'shares',
  'weekBuy',
  'weekSell',
  'weekPopBuy',
  'weekPopWanted',
  'weekPopGot',
  'shortage',
  'weekIncome',
  'dividend',
] as const;

/** Puts saved markets back (the arrays must be the right length). The price history starts afresh. */
export function restoreMarket(market: MarketState, saved: MarketRestore): void {
  for (const key of MARKET_SAVED_ARRAYS) {
    if (saved[key].length !== market[key].length)
      throw new Error(`Market: the restored "${key}" does not match the map and the goods`);
    market[key].set(saved[key]);
  }
  market.weekDays = saved.weekDays;
  market.historyCount = 0;
  market.historyNext = 0;
}
