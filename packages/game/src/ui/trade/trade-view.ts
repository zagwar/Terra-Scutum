import type {
  BuildingsSnapshot,
  GoodsConfig,
  MarketSnapshot,
  TradeSnapshot,
} from '@terra-scutum/sim';

/**
 * Reads the trade snapshot (F19) for the Trade screen: what a country
 * imports and exports, from and to whom, at what prices, and the World
 * Market. The partner numbers are the player's country's (`trade.country`).
 * Pure code, unit tested. Values are US$ a day; amounts in the good's unit a day.
 */

/** The "rest of the world" stand-in, where a partner index is expected. */
export const REST_OF_WORLD = -1;

/** The country's trade in a day. */
export interface TradeTotals {
  readonly importValue: number;
  readonly exportValue: number;
  /** Exports less imports (positive: a surplus). */
  readonly balance: number;
  readonly tariffIncome: number;
  /** Countries it buys from or sells to (the rest of the world not counted). */
  readonly partners: number;
  /** What it buys from the rest of the world. */
  readonly restOfWorldValue: number;
}

export function tradeTotals(trade: TradeSnapshot, market: MarketSnapshot): TradeTotals {
  const c = trade.country;
  const goods = trade.goodCount;
  const n = trade.countryCount;
  let importValue = 0;
  let exportValue = 0;
  for (let g = 0; g < goods; g++) {
    importValue += trade.importValue[c * goods + g];
    exportValue += trade.exportValue[c * goods + g];
  }
  let partners = 0;
  for (let p = 0; p < n; p++) {
    if (p === c) continue;
    for (let g = 0; g < goods; g++) {
      if (trade.fromPartner[g * (n + 1) + p] > 0 || trade.toPartner[g * n + p] > 0) {
        partners += 1;
        break;
      }
    }
  }
  let restOfWorldValue = 0;
  for (let g = 0; g < goods; g++) {
    const amount = trade.fromPartner[g * (n + 1) + n];
    if (amount > 0) restOfWorldValue += amount * deliveredPrice(trade, market, g, REST_OF_WORLD);
  }
  return {
    importValue,
    exportValue,
    balance: exportValue - importValue,
    tariffIncome: trade.tariffIncome[c],
    partners,
    restOfWorldValue,
  };
}

/** What a unit from `partner` costs the country delivered: world price + shipping + its import tariff. */
export function deliveredPrice(
  trade: TradeSnapshot,
  market: MarketSnapshot,
  g: number,
  partner: number,
): number {
  const base = market.basePrice[g];
  const world = trade.worldPrice[g];
  if (partner === REST_OF_WORLD)
    return world + (trade.restOfWorldShipping + trade.importTariff) * base;
  const tariff = trade.agreement[partner] ? 0 : trade.importTariff;
  return world + trade.shipping[partner] + tariff * base;
}

/** What a unit sold abroad fetches: the world price less the country's export tariff. */
export function exportPrice(trade: TradeSnapshot, market: MarketSnapshot, g: number): number {
  return trade.worldPrice[g] - trade.exportTariff * market.basePrice[g];
}

/** One good the country trades, makes or uses. */
export interface TradeGoodRow {
  readonly good: string;
  readonly index: number;
  readonly unit: GoodsConfig['goods'][number]['unit'];
  /** This week's price at home, the world price, and the world price as a share of the base. */
  readonly homePrice: number;
  readonly worldPrice: number;
  readonly worldFactor: number;
  /** A day: imported and exported, and their values. */
  readonly imported: number;
  readonly exported: number;
  readonly importValue: number;
  readonly exportValue: number;
  /** What a unit of the imports costs delivered (null if it imports none), and what shipping and tariffs add to the world price (a share). */
  readonly delivered: number | null;
  readonly deliveryShare: number | null;
  /** What the country makes as a share of what it uses itself (null if it uses none). */
  readonly selfSufficiency: number | null;
  /** The share of the world's planned imports that arrived today (below 1 when exporters can't ship it all). */
  readonly arrived: number;
}

export function tradeGoods(
  trade: TradeSnapshot,
  market: MarketSnapshot,
  buildings: BuildingsSnapshot,
  goods: GoodsConfig,
): TradeGoodRow[] {
  const c = trade.country;
  const rows: TradeGoodRow[] = [];
  goods.goods.forEach((good, g) => {
    if (!trade.tradable[g]) return;
    const at = c * trade.goodCount + g;
    const imported = trade.imports[at];
    const exported = trade.exports[at];
    const made = buildings.made[at];
    const used = Math.max(0, market.buy[at] - market.exportOrder[at]);
    if (imported <= 0 && exported <= 0 && made <= 0 && used <= 0) return;
    const world = trade.worldPrice[g];
    const landed = imported > 0 ? trade.landed[at] : null;
    rows.push({
      good: good.id,
      index: g,
      unit: good.unit,
      homePrice: market.price[at],
      worldPrice: world,
      worldFactor: world / market.basePrice[g],
      imported,
      exported,
      importValue: trade.importValue[at],
      exportValue: trade.exportValue[at],
      delivered: landed,
      deliveryShare: landed !== null && world > 0 ? landed / world - 1 : null,
      selfSufficiency: used > 0 ? made / used : null,
      arrived: trade.delivered[g],
    });
  });
  return rows;
}

/** One partner's part in one good. */
export interface PartnerFlow {
  /** A country index, or `REST_OF_WORLD`. */
  readonly partner: number;
  readonly amount: number;
  /** US$ a day: delivered (imports) or what it fetches (exports). */
  readonly value: number;
  /** Shipping, US$ per unit (null for exports: the buyer pays it). */
  readonly shipping: number | null;
}

/** Where a good's imports come from and its exports go, biggest first. */
export function goodPartners(
  trade: TradeSnapshot,
  market: MarketSnapshot,
  g: number,
): { readonly from: PartnerFlow[]; readonly to: PartnerFlow[] } {
  const n = trade.countryCount;
  const base = market.basePrice[g];
  const from: PartnerFlow[] = [];
  const to: PartnerFlow[] = [];
  for (let p = 0; p <= n; p++) {
    const amount = trade.fromPartner[g * (n + 1) + p];
    if (amount <= 0) continue;
    const partner = p === n ? REST_OF_WORLD : p;
    from.push({
      partner,
      amount,
      value: amount * deliveredPrice(trade, market, g, partner),
      shipping: partner === REST_OF_WORLD ? trade.restOfWorldShipping * base : trade.shipping[p],
    });
  }
  const fetch = exportPrice(trade, market, g);
  for (let p = 0; p < n; p++) {
    const amount = trade.toPartner[g * n + p];
    if (amount > 0) to.push({ partner: p, amount, value: amount * fetch, shipping: null });
  }
  const bigFirst = (a: PartnerFlow, b: PartnerFlow) => b.amount - a.amount;
  return { from: from.sort(bigFirst), to: to.sort(bigFirst) };
}

/** One trading partner of the country. */
export interface PartnerRow {
  /** A country index, or `REST_OF_WORLD`. */
  readonly partner: number;
  /** US$ a day: what the country buys from it (delivered) and sells to it. */
  readonly bought: number;
  readonly sold: number;
  /** The goods (ids) bought from and sold to it, by value, biggest first. */
  readonly goodsBought: readonly string[];
  readonly goodsSold: readonly string[];
  /** The route between the capitals: km on land and at sea, and shipping per tonne (null for the rest of the world). */
  readonly landKm: number | null;
  readonly seaKm: number | null;
  readonly shipping: number | null;
  readonly embargo: boolean;
  readonly agreement: boolean;
}

/** Every country the player's country trades with (or has an embargo or agreement with), biggest first; the rest of the world last. */
export function tradePartners(
  trade: TradeSnapshot,
  market: MarketSnapshot,
  goods: GoodsConfig,
): PartnerRow[] {
  const n = trade.countryCount;
  const c = trade.country;
  const rows: PartnerRow[] = [];
  const goodIds = goods.goods.map((good) => good.id);
  const fetch = goodIds.map((_, g) => exportPrice(trade, market, g));
  const valueList = (values: number[]) =>
    values
      .map((value, g) => ({ value, good: goodIds[g] }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((entry) => entry.good);
  for (let p = 0; p <= n; p++) {
    if (p === c) continue;
    const partner = p === n ? REST_OF_WORLD : p;
    const bought = goodIds.map((_, g) => {
      const amount = trade.fromPartner[g * (n + 1) + p];
      return amount > 0 ? amount * deliveredPrice(trade, market, g, partner) : 0;
    });
    const sold = goodIds.map((_, g) => {
      if (partner === REST_OF_WORLD) return 0;
      const amount = trade.toPartner[g * n + p];
      return amount > 0 ? amount * fetch[g] : 0;
    });
    const totalBought = bought.reduce((a, b) => a + b, 0);
    const totalSold = sold.reduce((a, b) => a + b, 0);
    const embargo = partner !== REST_OF_WORLD && trade.embargo[p] === 1;
    const agreement = partner !== REST_OF_WORLD && trade.agreement[p] === 1;
    if (totalBought <= 0 && totalSold <= 0 && !embargo && !agreement) continue;
    rows.push({
      partner,
      bought: totalBought,
      sold: totalSold,
      goodsBought: valueList(bought),
      goodsSold: valueList(sold),
      landKm: partner === REST_OF_WORLD ? null : trade.landKm[p],
      seaKm: partner === REST_OF_WORLD ? null : trade.seaKm[p],
      shipping: partner === REST_OF_WORLD ? null : trade.shipping[p],
      embargo,
      agreement,
    });
  }
  return rows.sort((a, b) => {
    if (a.partner === REST_OF_WORLD) return 1;
    if (b.partner === REST_OF_WORLD) return -1;
    return b.bought + b.sold - (a.bought + a.sold);
  });
}

/** One good on the World Market. */
export interface WorldGoodRow {
  readonly good: string;
  readonly unit: GoodsConfig['goods'][number]['unit'];
  readonly worldPrice: number;
  readonly factor: number;
  /** The world price of the past weeks as shares of the base price, oldest first. */
  readonly history: readonly number[];
  /** What all countries import a day, what the rest of the world sells, and the share of the plans that arrived today. */
  readonly traded: number;
  readonly restOfWorld: number;
  readonly arrived: number;
  /** The biggest exporters and importers (country indexes, amounts a day), at most three each. */
  readonly topExporters: readonly { readonly country: number; readonly amount: number }[];
  readonly topImporters: readonly { readonly country: number; readonly amount: number }[];
}

export function worldMarket(
  trade: TradeSnapshot,
  market: MarketSnapshot,
  goods: GoodsConfig,
): WorldGoodRow[] {
  const n = trade.countryCount;
  const top = (values: Float64Array, g: number) => {
    const list: { country: number; amount: number }[] = [];
    for (let c = 0; c < n; c++) {
      const amount = values[c * trade.goodCount + g];
      if (amount > 0) list.push({ country: c, amount });
    }
    return list.sort((a, b) => b.amount - a.amount).slice(0, 3);
  };
  const rows: WorldGoodRow[] = [];
  goods.goods.forEach((good, g) => {
    if (!trade.tradable[g]) return;
    const base = market.basePrice[g];
    let traded = 0;
    for (let c = 0; c < n; c++) traded += trade.imports[c * trade.goodCount + g];
    const history: number[] = [];
    for (let w = 0; w < trade.historyWeeks; w++)
      history.push(trade.worldHistory[g * trade.historyWeeks + w] / base);
    rows.push({
      good: good.id,
      unit: good.unit,
      worldPrice: trade.worldPrice[g],
      factor: trade.worldPrice[g] / base,
      history,
      traded,
      restOfWorld: trade.restOfWorld[g],
      arrived: trade.delivered[g],
      topExporters: top(trade.exports, g),
      topImporters: top(trade.imports, g),
    });
  });
  return rows;
}
