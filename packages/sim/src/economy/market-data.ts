import { z } from 'zod';
import type { DataCrossCheck } from '../data/game-data';

/**
 * `data/market.json` (F65, section 8.6): how the national markets set prices
 * and how buildings handle their money, wages and workers. The rules are
 * Victoria 3's (designer decision: Victoria 3 is the foundation for the
 * economy); every value is a [DEFAULT] the designer can change.
 */
const share = z.number().min(0).max(1);

export const marketSchema = z.strictObject({
  /**
   * Prices (Victoria 3): every week each market's price of a good is
   * base price × (1 + `sensitivity` × (buy − sell) ÷ the smaller of the two),
   * from the past week's buy and sell orders, kept between `min` and `max`
   * times the base price.
   */
  prices: z.strictObject({
    sensitivity: z.number().min(0).max(10),
    min: z.number().positive(),
    max: z.number().positive(),
  }),
  /** Buildings' money, wages and workers (Victoria 3, version 1.2 rules). */
  buildings: z.strictObject({
    /** A building's cash reserves hold at most this many days of its wages at full staff (Victoria 3: £25,000 per level). */
    reserveDays: z.number().min(0).max(3650),
    /** A campaign starts with this share of the most a building's reserves hold. */
    startingReserves: share,
    /** Of a profit, this share goes into the reserves when they are empty, `depositAtFull` when nearly full (Victoria 3: 50 % to 25 %); the rest is paid to the province's owners as dividends. */
    depositWhenEmpty: share,
    depositAtFull: share,
    /** A building raises its wages when its profit is at least `raiseMargin` of its sales and it can't fill its jobs, or at least `largeMargin` and its workers live below what they expect. */
    raiseMargin: share,
    largeMargin: share,
    /** It lowers its wages (or lays workers off) when it loses money with reserves below `lowReserves` of the most, or when its profit is below `minimalMargin` of its sales and its workers live more than `wellAbove` times what they expect. */
    lowReserves: share,
    minimalMargin: share,
    wellAbove: z.number().min(1).max(10),
    /** Each change of wages is this share of the wage. */
    wageStep: share,
    /** At least this many weeks between two raises. */
    raiseCooldownWeeks: z.int().min(0).max(520),
    /** Wages stay between these multiples of the going local wage (F06). */
    minWage: z.number().min(0).max(1),
    maxWage: z.number().min(1).max(100),
    /** A building that loses money at its lowest wage lays off this share of its jobs a week; one that makes money hires this share back. */
    firingRate: share,
    hiringRate: share,
    /** At the start, a building pays the going wage, or less if it can't: the wage that leaves it this share of its sales as profit. */
    startingMargin: share,
    /** People with a job move to another employer only for this much more pay (Victoria 3: 10 %). */
    switchForMorePay: z.number().min(0).max(10),
  }),
});

export type MarketConfig = z.infer<typeof marketSchema>;

/** Checks `data/market.json`. */
export const checkMarket: DataCrossCheck = (data, report) => {
  const { prices, buildings } = data.market;
  if (prices.min > 1 || prices.max < 1)
    report({
      file: 'market.json',
      path: 'prices',
      message: 'min must be at most 1 and max at least 1',
    });
  if (buildings.depositAtFull > buildings.depositWhenEmpty)
    report({
      file: 'market.json',
      path: 'buildings.depositAtFull',
      message: 'the reserves take less of a profit as they fill, not more',
    });
};
