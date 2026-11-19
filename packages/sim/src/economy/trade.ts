import type { GameData } from '../data/game-data';
import type { WorldMap } from '../world/world-map';
import type { BuildingsState } from './buildings';
import { HISTORY_WEEKS, type MarketState, marketPrice } from './market';

/**
 * Trade between the national markets (F19, section 8.6), on Victoria 3's
 * rules since its version 1.9: there are no trade routes; every country
 * trades with **one World Market** per good.
 *
 * - **The world price** (weekly): Victoria 3's formula on the world's buy
 *   and sell orders, as if the world were one market (what every market
 *   wants against what they make and the "rest of the world" sells),
 *   between `min` and `max` times the base price; it moves `speed` of the
 *   way there each week. (Counting only what is traded made it swing: a
 *   big exporter's own market is far larger than its exports.)
 * - **How much** (weekly, Victoria 3's weekly trades): each country moves
 *   its import or export of a good by `gapShare` of its market's gap (what
 *   is wanted less what is on sale), plus what brings its stockpile back
 *   toward its target days (`stockTargetDays`; F08: food has its own). Imports are sold on its market, exports bought
 *   from it, so prices meet.
 * - **Who sells to whom** (weekly): each importer buys from every exporter
 *   in proportion to what it offers, halved for every `halvingShare` of the
 *   base price that shipping and tariffs add; a few rounds of fitting make
 *   every exporter sell what it offers. Embargoed pairs don't trade.
 * - **What it costs:** shipping by the cheapest route between the capitals
 *   over provinces and sea zones (worked out once, at the start), plus
 *   tariffs on the base price (none between countries with a trade
 *   agreement).
 * - **Where we differ from Victoria 3:** our goods are real tonnes in a real
 *   stockpile, so trade fills the gap and the cost of bringing goods in shows
 *   in the price: a market's **reference price** (what Victoria 3's formula
 *   starts from instead of the base price) is the average of what its own
 *   goods cost (the base price) and what its imports cost delivered (world
 *   price + shipping + tariff); an exporter's is the average of the base
 *   price and what its exports fetch (world price − export tariff).
 * - **Every day** exporters' goods leave their stockpiles (they buy on their
 *   market like everyone else, `MarketState.exportOrder`), and importers share
 *   what arrived, which reaches their stockpiles the next morning
 *   (`BuildingsState.imports`). Nothing appears from nowhere, except what
 *   the "rest of the world" stand-in sells.
 *
 * Per country and good at `country * goodCount + good`; per pair of
 * countries at `from * countryCount + to`; the flows per good, exporter (the
 * rest of the world is exporter number `countryCount`) and importer. Nothing
 * is allocated in the daily step. No random numbers.
 */
export interface TradeState {
  readonly goodCount: number;
  readonly countryCount: number;
  /** Per good: 1 if it can be traded (not a local good such as electricity). */
  readonly tradable: Uint8Array;

  // ── From the data ────────────────────────────────────────────────────────
  readonly gapShare: number;
  /** Per good: trade tops the stockpile up toward this many days of what is bought (F08: food goods have their own). */
  readonly stockTargetDays: Float64Array;
  readonly restoreDays: number;
  readonly halvingShare: number;
  readonly rounds: number;
  /** The rest of the world's shipping, as a share of the base price. */
  readonly restOfWorldShipping: number;
  /** How far the world price moves toward its target in a week (0–1). */
  readonly worldPriceSpeed: number;

  // ── Fixed for the campaign (from the map and the start) ──────────────────
  /** Per pair of countries: shipping from one's capital to the other's (US$ per tonne), and the route's km on land and at sea. */
  readonly shipping: Float32Array;
  readonly landKm: Float32Array;
  readonly seaKm: Float32Array;
  /** Per country: its tariffs, as a share of the base price (until trade-policy laws). */
  readonly importTariff: Float64Array;
  readonly exportTariff: Float64Array;
  /** Per good: what the rest of the world sells on the World Market a day (what the world couldn't make at the start), and that per person of the world. */
  readonly restOfWorld: Float64Array;
  readonly restOfWorldPerPerson: Float64Array;

  /** Per country and good: 1 while the country doesn't export it (F08: food, while it rations strictly; set by `food.ts`). */
  readonly exportBan: Uint8Array;

  // ── The state (saved) ────────────────────────────────────────────────────
  /** Per country and good: what it imports and exports a day (this week's plan, after the split among partners). */
  readonly imports: Float64Array;
  readonly exports: Float64Array;
  /** Per good: this week's world price (US$ per unit). */
  readonly worldPrice: Float64Array;
  /** Per pair of countries (both directions set together): 1 if they don't trade (embargo), 1 if no tariffs between them (trade agreement). */
  readonly embargo: Uint8Array;
  readonly agreement: Uint8Array;
  /** Per country and good: what arrived and what was shipped this week so far. */
  readonly weekArrived: Float64Array;
  readonly weekShipped: Float64Array;
  /** Days counted in this week's sums. */
  weekDays: number;

  // ── The report (from the week's split; worked out again after a load) ────
  /** Per good, exporter (the rest of the world last) and importer: the tonnes a day. */
  readonly flows: Float32Array;
  /** Per country and good: what a unit of its imports costs delivered (world price + shipping + tariff). */
  readonly landed: Float64Array;
  /** Per country and good: the value of its imports (delivered) and exports (what they fetch) a day, US$. */
  readonly importValue: Float64Array;
  readonly exportValue: Float64Array;
  /** Per country: its tariff income a day, US$ (into the treasury with F09). */
  readonly tariffIncome: Float64Array;
  /** Per good: the share of the planned imports that arrived today (1 unless the world is short). */
  readonly delivered: Float64Array;
  /** Per good, the weekly world prices of the last `HISTORY_WEEKS` weeks (a ring; not saved). */
  readonly history: Float32Array;
  historyCount: number;
  historyNext: number;

  // ── Scratch ──────────────────────────────────────────────────────────────
  readonly want: Float64Array;
  readonly offer: Float64Array;
  readonly rowTarget: Float64Array;
  readonly colTarget: Float64Array;
  readonly rowSum: Float64Array;
  readonly colSum: Float64Array;
  readonly activeExporters: Int32Array;
  readonly activeImporters: Int32Array;
}

/** How a country's shipping is worked out: US$ per tonne for every 1,000 km by sea and by land. */
interface ShippingRates {
  readonly sea: number;
  readonly land: number;
}

const EARTH_RADIUS_KM = 6371;
const RADIANS = Math.PI / 180;

function greatCircleKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * RADIANS;
  const dLon = (lon2 - lon1) * RADIANS;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RADIANS) * Math.cos(lat2 * RADIANS) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The cheapest route between every two countries' capitals, over the map's
 * provinces (land) and sea zones (sea): Dijkstra from each capital on the
 * graph of province and sea zone centers. A province touching a sea zone is
 * a port; that leg counts as sea. `blocked` (per province, then per sea
 * zone) leaves places out, for the Swarm and blockades later. Run once at
 * the start (it allocates).
 */
export function computeRoutes(
  world: WorldMap,
  rates: ShippingRates,
  blocked?: Uint8Array,
): { shipping: Float32Array; landKm: Float32Array; seaKm: Float32Array } {
  const provinces = world.provinceIds.length;
  const zones = world.seaZoneIds.length;
  const nodes = provinces + zones;
  const countries = world.countryIds.length;
  const lon = new Float64Array(nodes);
  const lat = new Float64Array(nodes);
  for (let p = 0; p < provinces; p++) {
    lon[p] = world.provinceCenter[2 * p];
    lat[p] = world.provinceCenter[2 * p + 1];
  }
  for (let z = 0; z < zones; z++) {
    lon[provinces + z] = world.seaZoneCenter[2 * z];
    lat[provinces + z] = world.seaZoneCenter[2 * z + 1];
  }
  // The graph's edges: target, km, and whether the leg is at sea.
  const targets: number[] = [];
  const kms: number[] = [];
  const sea: number[] = [];
  const offsets = new Int32Array(nodes + 1);
  const edge = (from: number, to: number, atSea: boolean) => {
    targets.push(to);
    kms.push(greatCircleKm(lon[from], lat[from], lon[to], lat[to]));
    sea.push(atSea ? 1 : 0);
  };
  for (let p = 0; p < provinces; p++) {
    const n = world.provinceNeighbors;
    for (let k = n.offsets[p]; k < n.offsets[p + 1]; k++) edge(p, n.targets[k], false);
    const s = world.provinceSeaZones;
    for (let k = s.offsets[p]; k < s.offsets[p + 1]; k++) edge(p, provinces + s.targets[k], true);
    offsets[p + 1] = targets.length;
  }
  for (let z = 0; z < zones; z++) {
    const n = world.seaZoneNeighbors;
    for (let k = n.offsets[z]; k < n.offsets[z + 1]; k++)
      edge(provinces + z, provinces + n.targets[k], true);
    const s = world.seaZoneProvinces;
    for (let k = s.offsets[z]; k < s.offsets[z + 1]; k++) edge(provinces + z, s.targets[k], true);
    offsets[provinces + z + 1] = targets.length;
  }

  const shipping = new Float32Array(countries * countries).fill(Infinity);
  const landKm = new Float32Array(countries * countries);
  const seaKm = new Float32Array(countries * countries);
  const cost = new Float64Array(nodes);
  const land = new Float64Array(nodes);
  const water = new Float64Array(nodes);
  const done = new Uint8Array(nodes);
  // A binary heap of (cost, node), with stale entries skipped.
  const heapCost = new Float64Array(targets.length + 1);
  const heapNode = new Int32Array(targets.length + 1);
  for (let a = 0; a < countries; a++) {
    const source = world.countryCapital[a];
    if (source < 0 || blocked?.[source]) continue;
    cost.fill(Infinity);
    done.fill(0);
    cost[source] = 0;
    land[source] = 0;
    water[source] = 0;
    let size = 0;
    const push = (c: number, node: number) => {
      let i = size++;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (heapCost[parent] < c || (heapCost[parent] === c && heapNode[parent] <= node)) break;
        heapCost[i] = heapCost[parent];
        heapNode[i] = heapNode[parent];
        i = parent;
      }
      heapCost[i] = c;
      heapNode[i] = node;
    };
    const pop = (): number => {
      const top = heapNode[0];
      const lastCost = heapCost[--size];
      const lastNode = heapNode[size];
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= size) break;
        const right = child + 1;
        if (
          right < size &&
          (heapCost[right] < heapCost[child] ||
            (heapCost[right] === heapCost[child] && heapNode[right] < heapNode[child]))
        )
          child = right;
        if (
          heapCost[child] > lastCost ||
          (heapCost[child] === lastCost && heapNode[child] >= lastNode)
        )
          break;
        heapCost[i] = heapCost[child];
        heapNode[i] = heapNode[child];
        i = child;
      }
      heapCost[i] = lastCost;
      heapNode[i] = lastNode;
      return top;
    };
    push(0, source);
    while (size > 0) {
      const u = pop();
      if (done[u]) continue;
      done[u] = 1;
      for (let k = offsets[u]; k < offsets[u + 1]; k++) {
        const v = targets[k];
        if (done[v] || blocked?.[v]) continue;
        const atSea = sea[k] === 1;
        const c = cost[u] + (kms[k] * (atSea ? rates.sea : rates.land)) / 1000;
        if (c < cost[v]) {
          cost[v] = c;
          land[v] = land[u] + (atSea ? 0 : kms[k]);
          water[v] = water[u] + (atSea ? kms[k] : 0);
          push(c, v);
        }
      }
    }
    for (let b = 0; b < countries; b++) {
      const target = world.countryCapital[b];
      if (target < 0 || !Number.isFinite(cost[target])) continue;
      shipping[a * countries + b] = cost[target];
      landKm[a * countries + b] = land[target];
      seaKm[a * countries + b] = water[target];
    }
  }
  return { shipping, landKm, seaKm };
}

/** Creates trade: the routes, the tariffs, nothing traded yet. `settleStartingTrade` sets the start. */
export function createTrade(data: GameData, world: WorldMap): TradeState {
  const goods = data.goods.goods;
  const goodCount = goods.length;
  const countries = world.countryIds.length;
  const rules = data.trade;
  const local = new Set(rules.localGoods);
  const routes = computeRoutes(world, {
    sea: rules.shipping.seaPerThousandKm,
    land: rules.shipping.landPerThousandKm,
  });
  return {
    goodCount,
    countryCount: countries,
    tradable: Uint8Array.from(goods, (good) => (local.has(good.id) ? 0 : 1)),
    gapShare: rules.volumes.gapShare,
    stockTargetDays: Float64Array.from(goods, (good) =>
      data.food.goods.includes(good.id)
        ? data.food.reserves.targetDays
        : rules.volumes.stockTargetDays,
    ),
    exportBan: new Uint8Array(countries * goodCount),
    restoreDays: rules.volumes.stockRestoreWeeks * 7,
    halvingShare: rules.partners.halvingShare,
    rounds: rules.partners.rounds,
    restOfWorldShipping: rules.restOfWorld.shippingShare,
    worldPriceSpeed: rules.worldPrice.speed,
    shipping: routes.shipping,
    landKm: routes.landKm,
    seaKm: routes.seaKm,
    importTariff: new Float64Array(countries).fill(rules.tariffs.import),
    exportTariff: new Float64Array(countries).fill(rules.tariffs.export),
    restOfWorld: new Float64Array(goodCount),
    restOfWorldPerPerson: new Float64Array(goodCount),
    imports: new Float64Array(countries * goodCount),
    exports: new Float64Array(countries * goodCount),
    worldPrice: Float64Array.from(goods, (good) => good.basePrice),
    embargo: new Uint8Array(countries * countries),
    agreement: new Uint8Array(countries * countries),
    weekArrived: new Float64Array(countries * goodCount),
    weekShipped: new Float64Array(countries * goodCount),
    weekDays: 0,
    flows: new Float32Array(goodCount * (countries + 1) * countries),
    landed: new Float64Array(countries * goodCount),
    importValue: new Float64Array(countries * goodCount),
    exportValue: new Float64Array(countries * goodCount),
    tariffIncome: new Float64Array(countries),
    delivered: new Float64Array(goodCount).fill(1),
    history: new Float32Array(goodCount * HISTORY_WEEKS),
    historyCount: 0,
    historyNext: 0,
    want: new Float64Array(countries),
    offer: new Float64Array(countries + 1),
    rowTarget: new Float64Array(countries + 1),
    colTarget: new Float64Array(countries),
    rowSum: new Float64Array(countries + 1),
    colSum: new Float64Array(countries),
    activeExporters: new Int32Array(countries + 1),
    activeImporters: new Int32Array(countries),
  };
}

/** What one unit costs to bring from exporter `e` (the rest of the world: `countryCount`) to importer `i`, beyond the world price, US$. */
function deliveryCost(trade: TradeState, e: number, i: number, base: number): number {
  const countries = trade.countryCount;
  if (e === countries) return (trade.restOfWorldShipping + trade.importTariff[i]) * base;
  const pair = e * countries + i;
  const tariffs = trade.agreement[pair] ? 0 : trade.importTariff[i] + trade.exportTariff[e];
  return trade.shipping[pair] + tariffs * base;
}

/**
 * Who sells to whom, for one good: importers' `want` and exporters' `offer`
 * (the rest of the world's at index `countryCount`), fitted so that what is
 * traded is the smaller of the world's two totals; an importer buys from
 * every exporter in proportion to what it offers, halved for every
 * `halvingShare` of the base price that shipping and tariffs add. Writes the
 * flows, and per country `colSum` (what it imports) and `rowSum` (what it
 * exports), its delivered cost (`landed`), the values and tariffs.
 */
function splitGood(trade: TradeState, g: number, base: number, world: number): void {
  const countries = trade.countryCount;
  const goods = trade.goodCount;
  const { want, offer, rowTarget, colTarget, rowSum, colSum, flows, embargo } = trade;
  const { activeExporters, activeImporters, landed, importValue, exportValue, tariffIncome } =
    trade;
  const at = g * (countries + 1) * countries;
  flows.fill(0, at, at + (countries + 1) * countries);
  rowSum.fill(0);
  colSum.fill(0);
  let totalWant = 0;
  let totalOffer = 0;
  let importers = 0;
  let exporters = 0;
  for (let c = 0; c < countries; c++) {
    if (want[c] > 0) {
      totalWant += want[c];
      activeImporters[importers++] = c;
    }
  }
  for (let e = 0; e <= countries; e++) {
    if (offer[e] > 0) {
      totalOffer += offer[e];
      activeExporters[exporters++] = e;
    }
  }
  for (let c = 0; c < countries; c++) {
    const m = c * goods + g;
    landed[m] = world;
    importValue[m] = 0;
    exportValue[m] = 0;
  }
  if (totalWant <= 0 || totalOffer <= 0) return;
  const traded = totalWant < totalOffer ? totalWant : totalOffer;
  for (let k = 0; k < exporters; k++) {
    const e = activeExporters[k];
    rowTarget[e] = (offer[e] * traded) / totalOffer;
  }
  for (let k = 0; k < importers; k++) {
    const i = activeImporters[k];
    colTarget[i] = (want[i] * traded) / totalWant;
  }
  // The starting weights.
  const halving = trade.halvingShare;
  for (let a = 0; a < exporters; a++) {
    const e = activeExporters[a];
    const row = at + e * countries;
    for (let b = 0; b < importers; b++) {
      const i = activeImporters[b];
      if (e === i || (e < countries && embargo[e * countries + i])) continue;
      const cost = deliveryCost(trade, e, i, base);
      if (!Number.isFinite(cost)) continue;
      flows[row + i] = Math.pow(2, -cost / base / halving) * rowTarget[e] * colTarget[i];
    }
  }
  // Fitting: alternately every exporter to what it offers, every importer to what it wants.
  for (let round = 0; round < trade.rounds; round++) {
    for (let a = 0; a < exporters; a++) {
      const e = activeExporters[a];
      const row = at + e * countries;
      let sum = 0;
      for (let b = 0; b < importers; b++) sum += flows[row + activeImporters[b]];
      if (sum <= 0) continue;
      const scale = rowTarget[e] / sum;
      for (let b = 0; b < importers; b++) flows[row + activeImporters[b]] *= scale;
    }
    for (let b = 0; b < importers; b++) {
      const i = activeImporters[b];
      let sum = 0;
      for (let a = 0; a < exporters; a++) sum += flows[at + activeExporters[a] * countries + i];
      if (sum <= 0) continue;
      const scale = colTarget[i] / sum;
      for (let a = 0; a < exporters; a++) flows[at + activeExporters[a] * countries + i] *= scale;
    }
  }
  // What each one trades, what it costs delivered, and the tariffs.
  for (let a = 0; a < exporters; a++) {
    const e = activeExporters[a];
    const row = at + e * countries;
    for (let b = 0; b < importers; b++) {
      const i = activeImporters[b];
      const flow = flows[row + i];
      if (flow <= 0) continue;
      rowSum[e] += flow;
      colSum[i] += flow;
      importValue[i * goods + g] += flow * (world + deliveryCost(trade, e, i, base));
      if (e < countries && trade.agreement[e * countries + i]) continue;
      tariffIncome[i] += flow * trade.importTariff[i] * base;
      if (e < countries) tariffIncome[e] += flow * trade.exportTariff[e] * base;
    }
  }
  for (let c = 0; c < countries; c++) {
    const m = c * goods + g;
    if (colSum[c] > 0) landed[m] = importValue[m] / colSum[c];
    if (rowSum[c] > 0) exportValue[m] = rowSum[c] * (world - trade.exportTariff[c] * base);
  }
}

/**
 * A market's reference price for one good (where Victoria 3's formula
 * starts from instead of the base price): the average of its own goods at
 * the base price and its imports at their delivered cost, or, for an
 * exporter, of what it sells at home at the base price and what its exports
 * fetch on the World Market.
 */
function referencePrice(
  trade: TradeState,
  c: number,
  g: number,
  base: number,
  home: number,
): number {
  const m = c * trade.goodCount + g;
  const imported = trade.imports[m];
  const exported = trade.exports[m];
  if (imported > 0) return (home * base + imported * trade.landed[m]) / (home + imported);
  if (exported > 0) {
    const sold = home > exported ? home - exported : 0;
    const fetch = trade.worldPrice[g] - trade.exportTariff[c] * base;
    return (sold * base + exported * fetch) / (sold + exported);
  }
  return base;
}

/** Splits one good among partners from `want` and `offer` and keeps the result as the plan. */
function planGood(trade: TradeState, market: MarketState, g: number): void {
  const goods = trade.goodCount;
  splitGood(trade, g, market.basePrice[g], trade.worldPrice[g]);
  for (let c = 0; c < trade.countryCount; c++) {
    const m = c * goods + g;
    trade.imports[m] = trade.colSum[c];
    trade.exports[m] = trade.rowSum[c];
    market.exportOrder[m] = trade.rowSum[c];
  }
}

/**
 * The start of a campaign (a step of `calibrateMarkets`): from today's
 * trial of the first day, each country imports exactly what its buildings
 * and pops want but it doesn't make (replacing F85's standing imports);
 * countries with spare export in proportion to it, so the world's imports
 * and exports match; the rest of the world sells what the world can't make;
 * "the rest of the economy" keeps the rest of each country's spare as its
 * own use (`restShare` of it, per person). Prices start at the reference
 * prices, and the arrivals are ready for the first morning.
 */
export function settleStartingTrade(
  trade: TradeState,
  market: MarketState,
  buildings: BuildingsState,
  restShare: number,
): void {
  const { goodCount, countryCount, want, offer } = trade;
  const { made, ordered } = buildings;
  const { popOrder, restPerPerson, countryPeople, basePrice, price } = market;
  trade.tariffIncome.fill(0);
  const people = worldPeople(market);
  for (let g = 0; g < goodCount; g++) {
    if (g === market.electricityGood) continue;
    if (!trade.tradable[g]) {
      // A good that stays at home: the rest of the economy buys what is left over.
      for (let c = 0; c < countryCount; c++) {
        const m = c * goodCount + g;
        const left = made[m] - ordered[m] - popOrder[m];
        const here = countryPeople[c];
        restPerPerson[m] = left > 0 && here > 0 ? (restShare * left) / here : 0;
        buildings.imports[m] = 0;
        trade.imports[m] = 0;
        trade.exports[m] = 0;
        market.exportOrder[m] = 0;
      }
      continue;
    }
    let short = 0;
    let spare = 0;
    for (let c = 0; c < countryCount; c++) {
      const m = c * goodCount + g;
      const need = ordered[m] + popOrder[m] - made[m];
      if (need > 0) short += need;
      else spare -= need;
    }
    const ratio = spare > 0 ? Math.min(1, short / spare) : 0;
    trade.restOfWorld[g] = short > spare ? short - spare : 0;
    trade.restOfWorldPerPerson[g] = people > 0 ? trade.restOfWorld[g] / people : 0;
    for (let c = 0; c < countryCount; c++) {
      const m = c * goodCount + g;
      const need = ordered[m] + popOrder[m] - made[m];
      want[c] = need > 0 ? need : 0;
      offer[c] = need < 0 ? -need * ratio : 0;
    }
    offer[countryCount] = trade.restOfWorld[g];
    trade.worldPrice[g] = basePrice[g];
    planGood(trade, market, g);
    for (let c = 0; c < countryCount; c++) {
      const m = c * goodCount + g;
      const need = ordered[m] + popOrder[m] - made[m];
      const left = need < 0 ? -need - trade.exports[m] : 0;
      const here = countryPeople[c];
      restPerPerson[m] = left > 0 && here > 0 ? (restShare * left) / here : 0;
      buildings.imports[m] = trade.imports[m];
      price[m] = referencePrice(trade, c, g, basePrice[g], made[m]);
      market.referencePrice[m] = price[m];
      market.exportPrice[m] = trade.worldPrice[g] - trade.exportTariff[c] * basePrice[g];
    }
  }
}

/**
 * Trade's week (Mondays, after the market's): each country's new import or
 * export of every good, the world prices, who sells to whom, the reference
 * prices for the coming week, then a fresh week.
 */
export function tradeWeek(
  trade: TradeState,
  market: MarketState,
  buildings: BuildingsState,
  data: GameData,
): void {
  const { goodCount, countryCount, want, offer, gapShare, stockTargetDays, restoreDays } = trade;
  const { lastBuy, lastSell, basePrice, exportOrder } = market;
  const stock = buildings.stock;
  const rules = data.market.prices;
  const days = trade.weekDays;
  const people = worldPeople(market);
  trade.tariffIncome.fill(0);
  for (let g = 0; g < goodCount; g++) {
    if (!trade.tradable[g]) continue;
    trade.restOfWorld[g] = trade.restOfWorldPerPerson[g] * people;
    // The world's buy and sell orders, as if the world were one market:
    // everything every market wants (its exports aside) against everything
    // they make (their imports aside) and the rest of the world sells.
    let worldBuy = 0;
    let worldSell = trade.restOfWorld[g];
    let totalWant = 0;
    let totalOffer = 0;
    for (let c = 0; c < countryCount; c++) {
      const m = c * goodCount + g;
      const arrived = days > 0 ? trade.weekArrived[m] / days : trade.imports[m];
      const home = lastSell[m] > arrived ? lastSell[m] - arrived : 0;
      const use = lastBuy[m] > exportOrder[m] ? lastBuy[m] - exportOrder[m] : 0;
      // The stockpile is refilled toward its target; spare stock is not pushed abroad.
      const low = stockTargetDays[g] * lastBuy[m] - stock[m];
      const fix = low > 0 ? low / restoreDays : 0;
      let net = trade.imports[m] - trade.exports[m] + gapShare * (lastBuy[m] - lastSell[m] + fix);
      // A country imports at most what it uses (and refills), exports at most what it makes.
      const most = use + fix;
      if (net > most) net = most;
      if (net < -home) net = -home;
      // F08: a country rationing strictly stops exporting food.
      if (net < 0 && trade.exportBan[m] === 1) net = 0;
      want[c] = net > 0 ? net : 0;
      offer[c] = net < 0 ? -net : 0;
      worldBuy += use;
      worldSell += home;
      totalWant += want[c];
      totalOffer += offer[c];
      // (`trade.landed` is free until the split: what the country makes, for the step below.)
      trade.landed[m] = home;
    }
    // Exporters follow their buyers (Victoria 3's traders export more where
    // it pays): when importers want more than the rest of the world and the
    // exporters offer, exporters offer more in proportion: at most what they
    // shipped last week and what their rest of the economy gives up at the
    // highest price (the part of their
    // market that gives way when the price rises; their pops and buildings
    // keep theirs) and what they make.
    const missing = totalWant - totalOffer - trade.restOfWorld[g];
    if (missing > 0 && totalOffer > 0) {
      const scale = 1 + missing / totalOffer;
      const freed = 1 - 1 / rules.max;
      for (let c = 0; c < countryCount; c++) {
        if (offer[c] <= 0) continue;
        const m = c * goodCount + g;
        const shipped = days > 0 ? trade.weekShipped[m] / days : trade.exports[m];
        const most = Math.min(trade.landed[m], shipped + freed * market.restOrder[m]);
        offer[c] = Math.max(offer[c], Math.min(most, offer[c] * scale));
      }
    }
    offer[countryCount] = trade.restOfWorld[g];
    const target = marketPrice(basePrice[g], worldBuy, worldSell, rules);
    trade.worldPrice[g] += trade.worldPriceSpeed * (target - trade.worldPrice[g]);
    planGood(trade, market, g);
    for (let c = 0; c < countryCount; c++) {
      const m = c * goodCount + g;
      const arrived = days > 0 ? trade.weekArrived[m] / days : 0;
      const home = lastSell[m] > arrived ? lastSell[m] - arrived : 0;
      market.referencePrice[m] = referencePrice(trade, c, g, basePrice[g], home);
      market.exportPrice[m] = trade.worldPrice[g] - trade.exportTariff[c] * basePrice[g];
    }
  }
  recordWorldHistory(trade);
  trade.weekArrived.fill(0);
  trade.weekShipped.fill(0);
  trade.weekDays = 0;
}

/** Everyone in the world today (the markets' count). */
function worldPeople(market: MarketState): number {
  let people = 0;
  for (let c = 0; c < market.countryCount; c++) people += market.countryPeople[c];
  return people;
}

function recordWorldHistory(trade: TradeState): void {
  const slot = trade.historyNext;
  for (let g = 0; g < trade.goodCount; g++)
    trade.history[g * HISTORY_WEEKS + slot] = trade.worldPrice[g];
  trade.historyNext = (slot + 1) % HISTORY_WEEKS;
  if (trade.historyCount < HISTORY_WEEKS) trade.historyCount += 1;
}

/**
 * Trade's day (after the market's): what exporters got from their markets
 * goes to the World Market with what the rest of the world sells; importers
 * share it in proportion to their plans, and it reaches their stockpiles
 * the next morning.
 */
export function tradeDay(trade: TradeState, market: MarketState, buildings: BuildingsState): void {
  const { goodCount, countryCount, imports, weekArrived, weekShipped, delivered } = trade;
  const { exportGot } = market;
  const arriving = buildings.imports;
  for (let g = 0; g < goodCount; g++) {
    if (!trade.tradable[g]) continue;
    let pool = trade.restOfWorld[g];
    let planned = 0;
    for (let c = 0; c < countryCount; c++) {
      const m = c * goodCount + g;
      pool += exportGot[m];
      planned += imports[m];
      weekShipped[m] += exportGot[m];
    }
    const share = planned > 0 ? (pool < planned ? pool / planned : 1) : 1;
    delivered[g] = share;
    for (let c = 0; c < countryCount; c++) {
      const m = c * goodCount + g;
      const arrive = imports[m] * share;
      arriving[m] = arrive;
      weekArrived[m] += arrive;
    }
  }
  trade.weekDays += 1;
}

/**
 * Splits every good among partners again from the current plans (after an
 * embargo or a trade agreement changes, so it takes effect at once).
 * With `keep`, only the report (flows, delivered costs, values) is redone
 * and the plans stay as they are (after a load).
 */
export function resplitTrade(trade: TradeState, market: MarketState, keep = false): void {
  const { goodCount, countryCount, want, offer } = trade;
  trade.tariffIncome.fill(0);
  for (let g = 0; g < goodCount; g++) {
    if (!trade.tradable[g]) continue;
    for (let c = 0; c < countryCount; c++) {
      const m = c * goodCount + g;
      want[c] = trade.imports[m];
      offer[c] = trade.exports[m];
    }
    offer[countryCount] = trade.restOfWorld[g];
    if (keep) splitGood(trade, g, market.basePrice[g], trade.worldPrice[g]);
    else planGood(trade, market, g);
  }
}

/** Sets or lifts an embargo between two countries (both directions). Returns whether it changed. */
export function setEmbargo(trade: TradeState, a: number, b: number, on: boolean): boolean {
  const n = trade.countryCount;
  const value = on ? 1 : 0;
  if (a === b || trade.embargo[a * n + b] === value) return false;
  trade.embargo[a * n + b] = value;
  trade.embargo[b * n + a] = value;
  return true;
}

/** Signs or ends a trade agreement between two countries (no tariffs between them). Returns whether it changed. */
export function setTradeAgreement(trade: TradeState, a: number, b: number, on: boolean): boolean {
  const n = trade.countryCount;
  const value = on ? 1 : 0;
  if (a === b || trade.agreement[a * n + b] === value) return false;
  trade.agreement[a * n + b] = value;
  trade.agreement[b * n + a] = value;
  return true;
}

/** The pairs (a < b) whose flag is set, as a save lists them: two numbers each. */
export function pairList(flags: Uint8Array, countries: number): number[] {
  const out: number[] = [];
  for (let a = 0; a < countries; a++)
    for (let b = a + 1; b < countries; b++) if (flags[a * countries + b]) out.push(a, b);
  return out;
}

/** The saved part of trade. */
export interface TradeRestore {
  readonly imports: Float64Array;
  readonly exports: Float64Array;
  readonly arriving: Float64Array;
  readonly worldPrice: Float64Array;
  readonly restOfWorld: Float64Array;
  readonly referencePrice: Float64Array;
  readonly weekArrived: Float64Array;
  readonly weekShipped: Float64Array;
  readonly weekDays: number;
  readonly embargoes: readonly number[];
  readonly agreements: readonly number[];
}

/** Puts saved trade back (the arrays must be the right length) and redoes the report. */
export function restoreTrade(
  trade: TradeState,
  market: MarketState,
  buildings: BuildingsState,
  saved: TradeRestore,
): void {
  const check = (name: string, a: ArrayLike<number>, b: ArrayLike<number>) => {
    if (a.length !== b.length)
      throw new Error(`Trade: the restored "${name}" does not match the map and the goods`);
  };
  check('imports', saved.imports, trade.imports);
  check('exports', saved.exports, trade.exports);
  check('arriving', saved.arriving, buildings.imports);
  check('worldPrice', saved.worldPrice, trade.worldPrice);
  check('restOfWorld', saved.restOfWorld, trade.restOfWorld);
  check('referencePrice', saved.referencePrice, market.referencePrice);
  check('weekArrived', saved.weekArrived, trade.weekArrived);
  check('weekShipped', saved.weekShipped, trade.weekShipped);
  trade.imports.set(saved.imports);
  trade.exports.set(saved.exports);
  market.exportOrder.set(saved.exports);
  buildings.imports.set(saved.arriving);
  trade.worldPrice.set(saved.worldPrice);
  trade.restOfWorld.set(saved.restOfWorld);
  market.referencePrice.set(saved.referencePrice);
  for (let c = 0; c < trade.countryCount; c++)
    for (let g = 0; g < trade.goodCount; g++)
      market.exportPrice[c * trade.goodCount + g] = trade.tradable[g]
        ? trade.worldPrice[g] - trade.exportTariff[c] * market.basePrice[g]
        : 0;
  trade.weekArrived.set(saved.weekArrived);
  trade.weekShipped.set(saved.weekShipped);
  trade.weekDays = saved.weekDays;
  trade.embargo.fill(0);
  trade.agreement.fill(0);
  for (let k = 0; k + 1 < saved.embargoes.length; k += 2)
    setEmbargo(trade, saved.embargoes[k], saved.embargoes[k + 1], true);
  for (let k = 0; k + 1 < saved.agreements.length; k += 2)
    setTradeAgreement(trade, saved.agreements[k], saved.agreements[k + 1], true);
  trade.historyCount = 0;
  trade.historyNext = 0;
  resplitTrade(trade, market, true);
}
