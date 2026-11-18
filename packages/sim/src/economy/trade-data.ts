import { z } from 'zod';
import type { DataCrossCheck } from '../data/game-data';

/**
 * `data/trade.json` (F19, section 8.6): how goods move between the national
 * markets through the World Market (Victoria 3, version 1.9). Every value is
 * a [DEFAULT] the designer can change.
 */
const share = z.number().min(0).max(1);

export const tradeSchema = z.strictObject({
  /** Goods that never leave their country (electricity: until the power grid, F74). */
  localGoods: z.array(z.string()),
  /**
   * Shipping, US$ per tonne for every 1,000 km of the cheapest route between
   * two capitals, over provinces (land) and sea zones (sea).
   */
  shipping: z.strictObject({
    seaPerThousandKm: z.number().min(0).max(1000),
    landPerThousandKm: z.number().min(0).max(1000),
  }),
  /**
   * Tariffs (Victoria 3): a share of the good's base price, paid on every
   * unit imported (`import`) or exported (`export`); none between two
   * countries with a trade agreement. Until trade-policy laws, every country
   * has these.
   */
  tariffs: z.strictObject({ import: share, export: share }),
  /**
   * How fast trade follows a market (Victoria 3's weekly trades): every
   * Monday a country changes what it imports or exports of a good by
   * `gapShare` of the gap between what its market wants and what is on sale,
   * plus what brings its stockpile back to `stockTargetDays` of what it uses
   * within `stockRestoreWeeks`.
   */
  volumes: z.strictObject({
    gapShare: share,
    stockTargetDays: z.number().min(0).max(365),
    stockRestoreWeeks: z.number().min(1).max(52),
  }),
  /**
   * Who sells to whom: an importer buys from every exporter in proportion to
   * what it offers, halved for every `halvingShare` of the good's base price
   * that shipping and tariffs add; `rounds` rounds of fitting make every
   * exporter sell what it offers and every importer get its share.
   */
  partners: z.strictObject({
    halvingShare: z.number().positive().max(10),
    rounds: z.int().min(1).max(50),
  }),
  /**
   * The world price moves this share of the way toward Victoria 3's formula
   * every week (a damping we add: our trade follows the price with a week's
   * delay, and an undamped price swings between its limits).
   */
  worldPrice: z.strictObject({ speed: z.number().positive().max(1) }),
  /**
   * The "rest of the world" (a stand-in): sells on the World Market what the
   * world's buildings can't make at the start (electronics, fuel, iron ore,
   * copper ore), per person of the world's population from then on, at the
   * world price plus shipping of this share of the base price.
   */
  restOfWorld: z.strictObject({ shippingShare: share }),
});

export type TradeConfig = z.infer<typeof tradeSchema>;

/** Checks `data/trade.json`: the local goods exist, electricity is one of them. */
export const checkTrade: DataCrossCheck = (data, report) => {
  const goods = new Set(data.goods.goods.map((good) => good.id));
  data.trade.localGoods.forEach((id, index) => {
    if (!goods.has(id))
      report({ file: 'trade.json', path: `localGoods.${index}`, message: `unknown good "${id}"` });
  });
  if (!data.trade.localGoods.includes(data.goods.electricity))
    report({
      file: 'trade.json',
      path: 'localGoods',
      message: `electricity ("${data.goods.electricity}") can't be shipped: list it here`,
    });
};
