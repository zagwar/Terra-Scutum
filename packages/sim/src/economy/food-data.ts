import { z } from 'zod';
import type { DataCrossCheck } from '../data/game-data';

/**
 * `data/food.json` (F08, section 8.5): food security, starvation, famine,
 * food reserves and rationing, on Victoria 3's rules (version 1.8) unless
 * said otherwise. Every value is a [DEFAULT] the designer can change.
 */
const share = z.number().min(0).max(1);
const id = z.string().min(1);

const rationingAuto = z.strictObject({
  /** Other countries (and the player on "automatic") ration at this level when their food reserves fall below this many days… */
  belowDays: z.number().min(0).max(365),
  /** …or when at least this share of their people's basic food went undelivered last week. */
  shortage: share,
  /** They step back down once their reserves are above this many days again and the shortage is below `shortage`. */
  liftAboveDays: z.number().min(0).max(365),
});

export const foodSchema = z.strictObject({
  /** The food goods (grain stands for all crops): what the food reserves and the Food screen count. */
  goods: z.array(id).min(1),
  /** The need whose goods decide food security (Victoria 3: basic food). */
  basicNeed: id,
  /** The need rationing cuts first among the people's own food (better food). */
  betterNeed: id,
  /**
   * Food security (Victoria 3 1.8): 1 − the share of income a pop spends on
   * basic food − `shortageWeight` × the share of its country's basic food
   * that went undelivered last week. Below `mild` a pop is in mild
   * starvation, below `severe` in severe starvation. We differ: Victoria 3
   * counts the shortage once; our 2025 pops spend little of their income on
   * food, so we count it 1.5×. We add: a pop's food security moves
   * `weeklyChange` of the way to that value each week (hunger takes weeks to
   * turn into starvation, and people need a week to turn to other foods).
   */
  security: z.strictObject({
    shortageWeight: z.number().min(0).max(10),
    weeklyChange: z.number().positive().max(1),
    mild: share,
    severe: share,
  }),
  /**
   * What starvation does (Victoria 3 1.8): mild starvation grows from
   * nothing at `security.mild` to its full effect at `security.severe`
   * (`births` fewer births, `deaths` more deaths, as shares); severe
   * starvation grows from there to its full effect at no food security at
   * all. We add `extraDeathsPerYear` (a share of the starving people a year,
   * on top: our death rates are real ones, far lower than Victoria 3's) and
   * a loss of standard of living (`living` points; a stand-in for Victoria
   * 3's radicals until stability, F10, and movements, F121).
   */
  starvation: z.strictObject({
    mild: z.strictObject({
      births: share,
      deaths: z.number().min(0).max(100),
      living: z.number().min(0).max(98),
    }),
    severe: z.strictObject({
      births: share,
      deaths: z.number().min(0).max(100),
      extraDeathsPerYear: share,
      living: z.number().min(0).max(98),
    }),
  }),
  /** A province is in famine (Victoria 3: a state) while at least these shares of its people starve, and starve severely. */
  famine: z.strictObject({ starvingShare: share, severeShare: share }),
  /**
   * Food reserves: the national stockpile's food goods. A campaign starts
   * with `startingDays` of what the country buys of them, trade tops them up
   * toward `targetDays`, and the stockpile keeps at most `maxDays` of them
   * (other goods: `data/buildings.json` and `data/trade.json`). Below
   * `lowDays` the game warns.
   */
  reserves: z.strictObject({
    startingDays: z.number().min(0).max(365),
    targetDays: z.number().min(0).max(365),
    maxDays: z.number().min(1).max(3650),
    lowDays: z.number().min(0).max(365),
  }),
  /**
   * The rationing levels (section 8.8's Rationing law, from none to
   * emergency; the first is "none"): the share of the rest of the economy's
   * food purchases cut (`restCut`), of the people's better food cut
   * (`betterCut`), whether food exports stop, and the standard of living it
   * costs. `auto` says when a country rations by itself.
   */
  rationing: z
    .array(
      z.strictObject({
        id,
        restCut: share,
        betterCut: share,
        stopExports: z.boolean(),
        living: z.number().min(0).max(98),
        auto: rationingAuto.optional(),
      }),
    )
    .min(1)
    .max(8),
});

export type FoodConfig = z.infer<typeof foodSchema>;

/** Checks `data/food.json` against the goods and the needs, and its own order. */
export const checkFood: DataCrossCheck = (data, report) => {
  const food = data.food;
  const goods = new Set(data.goods.goods.map((good) => good.id));
  const issue = (path: string, message: string) => report({ file: 'food.json', path, message });
  food.goods.forEach((good, index) => {
    if (!goods.has(good)) issue(`goods.${index}`, `unknown good "${good}"`);
    else if (good === data.goods.electricity)
      issue(`goods.${index}`, "electricity can't be kept as food");
  });
  if (new Set(food.goods).size !== food.goods.length) issue('goods', 'a good is listed twice');
  const needs = new Map(data.pops.needs.map((need) => [need.id, need]));
  for (const key of ['basicNeed', 'betterNeed'] as const) {
    const need = needs.get(food[key]);
    if (!need) issue(key, `unknown need "${food[key]}" (not in pops.json)`);
    else if (!need.goods?.some((entry) => food.goods.includes(entry.good)))
      issue(key, `none of the need "${food[key]}"'s goods is a food good`);
  }
  if (food.security.severe >= food.security.mild)
    issue('security.severe', 'severe starvation must start below mild starvation');
  const { mild, severe } = food.starvation;
  if (severe.births < mild.births || severe.deaths < mild.deaths || severe.living < mild.living)
    issue('starvation.severe', 'severe starvation must do at least what mild starvation does');
  if (food.famine.severeShare > food.famine.starvingShare)
    issue('famine.severeShare', 'the severely starving are part of the starving');
  const [first, ...rest] = food.rationing;
  if (
    first.restCut > 0 ||
    first.betterCut > 0 ||
    first.stopExports ||
    first.living > 0 ||
    first.auto
  )
    issue('rationing.0', 'the first level is "no rationing": it cuts nothing and costs nothing');
  if (new Set(food.rationing.map((level) => level.id)).size !== food.rationing.length)
    issue('rationing', 'two levels have the same id');
  rest.forEach((level, i) => {
    const path = `rationing.${i + 1}`;
    if (!level.auto) issue(`${path}.auto`, 'every level but the first needs its automatic rule');
    else if (level.auto.liftAboveDays < level.auto.belowDays)
      issue(`${path}.auto.liftAboveDays`, 'a level is lifted above the days it starts below');
    const before = food.rationing[i];
    if (level.restCut < before.restCut || level.betterCut < before.betterCut)
      issue(path, 'each level cuts at least as much as the one before');
    if (before.auto && level.auto && level.auto.belowDays > before.auto.belowDays)
      issue(`${path}.auto.belowDays`, 'a stricter level starts at fewer days of reserves');
  });
};
