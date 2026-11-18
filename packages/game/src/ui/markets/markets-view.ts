import type { BuildingsSnapshot, GoodsConfig, MarketSnapshot } from '@terra-scutum/sim';

/**
 * Reads the market snapshot (F65) for the Markets screen: a country's goods
 * with their prices, today's buying and selling, the stock and the price
 * history. Pure code, unit tested.
 */

/** One good of a country's market. */
export interface MarketRow {
  readonly good: string;
  readonly unit: GoodsConfig['goods'][number]['unit'];
  /** True for electricity: made and used the same day, never in stock. */
  readonly stored: boolean;
  /** US$ per unit: this week's price, the base price, and the price as a share of the base (0.25–1.75). */
  readonly price: number;
  readonly basePrice: number;
  readonly priceFactor: number;
  /** A day's sell orders: what the country makes plus its standing imports (electricity: what the plants could make). */
  readonly sell: number;
  readonly imported: number;
  /** A day's buy orders: everyone's, then by buyer. */
  readonly buy: number;
  readonly buildingsBuy: number;
  readonly popsBuy: number;
  readonly restBuy: number;
  /** What the pops got of what they wanted today (0–1). */
  readonly popsGot: number;
  /** In stock, and how many days of today's buying it holds (null for electricity or when nobody buys). */
  readonly stock: number;
  readonly stockDays: number | null;
  /** The price of the past weeks as shares of the base price, oldest first. */
  readonly history: readonly number[];
}

/** A country's market: every good that is made, bought, imported or in stock there. */
export function countryMarket(
  market: MarketSnapshot,
  buildings: BuildingsSnapshot,
  goods: GoodsConfig,
  country: number,
  /** True for the player's country: the snapshot's price history is the player's. */
  withHistory: boolean,
): MarketRow[] {
  const rows: MarketRow[] = [];
  goods.goods.forEach((good, g) => {
    const at = country * market.goodCount + g;
    const sell = market.sell[at];
    const buy = market.buy[at];
    const stock = buildings.stock[at];
    const imported = buildings.imports[at];
    if (sell <= 0 && buy <= 0 && stock <= 0 && imported <= 0) return;
    const stored = good.id !== goods.electricity;
    const base = market.basePrice[g];
    const history: number[] = [];
    if (withHistory)
      for (let w = 0; w < market.historyWeeks; w++)
        history.push(market.history[g * market.historyWeeks + w] / base);
    const popsBuy = market.popOrder[at];
    // Electricity: the rest of the economy's is F85's (`otherPowerWanted`), inside the buildings' orders.
    const restBuy = stored ? market.restOrder[at] : buildings.otherPowerWanted[country];
    rows.push({
      good: good.id,
      unit: good.unit,
      stored,
      price: market.price[at],
      basePrice: base,
      priceFactor: market.price[at] / base,
      sell,
      imported,
      buy,
      buildingsBuy: stored
        ? market.buildingOrder[at]
        : Math.max(0, market.buildingOrder[at] - popsBuy - restBuy),
      popsBuy,
      restBuy,
      popsGot: popsBuy > 0 ? market.popGot[at] / popsBuy : 1,
      stock,
      stockDays: stored && buy > 0 ? stock / buy : null,
      history,
    });
  });
  return rows;
}

/** How a price compares with its base price, for its color: cheap, normal or dear. */
export function priceMood(factor: number): 'cheap' | 'normal' | 'dear' {
  if (factor <= 0.9) return 'cheap';
  if (factor >= 1.1) return 'dear';
  return 'normal';
}

/**
 * The points of a small price line (an SVG polyline) for the price history:
 * `width` × `height`, the base price in the middle, the limits (×0.25 and
 * ×1.75) at the edges. Empty for fewer than two weeks.
 */
export function sparklinePoints(history: readonly number[], width: number, height: number): string {
  if (history.length < 2) return '';
  const step = width / (history.length - 1);
  return history
    .map((factor, i) => {
      const clamped = Math.max(0.25, Math.min(1.75, factor));
      const y = height - ((clamped - 0.25) / 1.5) * height;
      return `${(i * step).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
