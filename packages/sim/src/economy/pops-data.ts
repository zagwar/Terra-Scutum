import { z } from 'zod';
import type { DataCrossCheck } from '../data/game-data';

/**
 * `data/pops.json` (F06, section 8.1): the population groups (pops), what
 * people need, how the standard of living is measured, how the population
 * grows and how people change jobs. Every value is a [DEFAULT] the designer
 * can change in the data file.
 */
const id = z
  .string()
  .regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, 'ids are lowercase letters, digits and single underscores');

const share = z.number().min(0).max(1);

export const popsSchema = z.strictObject({
  /**
   * The pop groups, in the order every per-pop array uses. Exactly one group
   * is the military (soldiers).
   */
  groups: z
    .array(
      z.strictObject({
        id,
        /**
         * How well the group is paid compared with laborers (1): a pop's
         * wage is this times its country's base wage. Buildings pay it too,
         * until markets let their profits set wages (F65).
         */
        wage: z.number().positive(),
        /** True for groups that are never unemployed (owners, soldiers). */
        alwaysEmployed: z.boolean().optional(),
        /** True for the soldiers: their number comes from the armed forces, not from the job market. */
        military: z.boolean().optional(),
      }),
    )
    .min(2)
    .max(32),
  /**
   * How a country's civilian workforce is split into groups at the start,
   * by its GDP per person (US$ a year). Between two rows the shares are
   * mixed (by the logarithm of GDP per person); below the first and above
   * the last row they stay as they are.
   */
  startingShares: z
    .array(z.strictObject({ gdpPerPerson: z.number().positive(), shares: z.record(id, share) }))
    .min(1),
  /**
   * What people need (F65, Victoria 3's pop needs). A need with `goods` is
   * bought on its country's market: its share of the buy package is split
   * among those goods (substitution, see `wealth.substitution`). A need
   * without goods has no good yet (housing, services, luxuries): people pay
   * for it at the stand-in price of `placeholderEconomy` (how rich the
   * country is) until its good exists.
   */
  needs: z
    .array(
      z.strictObject({
        id,
        goods: z
          .array(
            z.strictObject({
              good: id,
              /** How much pops favor this good over the others of the need (Victoria 3's weight; 1 = normal). */
              weight: z.number().positive().optional(),
              /** At most this share of the need comes from this good (default `wealth.substitution.maxShare`). */
              maxShare: share.optional(),
            }),
          )
          .min(1)
          .optional(),
      }),
    )
    .min(1),
  /**
   * Wealth (F65, Victoria 3): every pop has a wealth level from 1 to 99, and
   * its standard of living is its wealth less what shortages take away.
   * Each level has a **buy package**: what a worker spends a day on each
   * need, in US$ at base prices (a dependent counts as `dependentWeight` of
   * a worker). Between two rows of `packages` the amounts are mixed in
   * proportion. Wealth climbs while income is above `rise.threshold` × the
   * package of the next level (by `rise.speed` of the gap a week) and falls
   * while income is below `fall.threshold` × its own package (by
   * `fall.speed` of the gap a week).
   */
  wealth: z.strictObject({
    dependentWeight: share,
    rise: z.strictObject({ threshold: z.number().min(1).max(2), speed: share }),
    fall: z.strictObject({ threshold: z.number().min(0).max(1), speed: share }),
    /** Standard of living lost when a whole package goes undelivered (a shortage); in proportion when part of it does. */
    shortagePenalty: z.number().min(0).max(99),
    substitution: z.strictObject({
      /** The most of a need one good covers unless it says otherwise (Victoria 3: 80 %). */
      maxShare: share,
      /** A good's share counts its sell orders less this share of what buildings and the rest of the economy buy (Victoria 3: half). */
      otherBuyersWeight: share,
    }),
    packages: z
      .array(
        z.strictObject({
          level: z.number().min(1).max(99),
          /** US$ per worker a day at base prices, by need. */
          needs: z.record(id, z.number().min(0)),
        }),
      )
      .min(2),
  }),
  growth: z.strictObject({
    /** Years a person stays in the workforce before retiring. */
    workingYears: z.number().min(10).max(80),
    /** How much likelier a dependent (a child, an elderly person) is to die in a year than a worker. */
    dependentMortality: z.number().min(1).max(50),
  }),
  /**
   * The ways people change group, tried in this order every week. People
   * move when the group they move to has open jobs and they are unemployed
   * or would earn more; at most `weeklyShare` of the group they leave moves
   * in a week. `training` marks the moves that need education (slow; the
   * education budget will speed them up).
   */
  jobChanges: z.array(
    z.strictObject({ from: id, to: id, weeklyShare: share, training: z.boolean() }),
  ),
  /**
   * The stand-in for the parts of the economy that aren't built yet: the
   * jobs buildings don't offer (the rest of the economy, until the building
   * catalog is complete, F85), its wages, and the price of the needs that
   * have no good yet (F65: the needs with goods are bought on the markets).
   */
  placeholderEconomy: z.strictObject({
    /** The share of a country's GDP that reaches its pops as income. */
    incomeShareOfGdp: share,
    /**
     * A province's price level is (its country's GDP per person ÷
     * `priceReferenceGdpPerPerson`) to this power: poorer countries are cheaper.
     */
    priceLevelExponent: z.number().min(0).max(1),
    priceReferenceGdpPerPerson: z.number().positive(),
    /**
     * Each week the stand-in's jobs for a pop close this share of the gap to
     * the number that keeps the stand-in's share of the pop in work where it
     * started: the rest of the economy keeps pace with its workforce.
     */
    jobsFollowWeekly: share,
  }),
});

export type PopsConfig = z.infer<typeof popsSchema>;

export const popGroupNameKey = (groupId: string) => `POP_GROUP_${groupId.toUpperCase()}`;
export const needNameKey = (needId: string) => `NEED_${needId.toUpperCase()}`;

/** Checks `data/pops.json`: ids are unique and known, shares add up, packages grow with wealth. */
export const checkPops: DataCrossCheck = (data, report) => {
  const file = 'pops.json';
  const pops = data.pops;
  const issue = (path: string, message: string) => report({ file, path, message });

  const groupIds = pops.groups.map((group) => group.id);
  groupIds.forEach((groupId, index) => {
    if (groupIds.indexOf(groupId) !== index)
      issue(`groups.${index}.id`, `duplicate pop group "${groupId}"`);
  });
  const military = pops.groups.filter((group) => group.military);
  if (military.length !== 1)
    issue('groups', `exactly one group must be the military, found ${military.length}`);
  const civilians = pops.groups.filter((group) => !group.military).map((group) => group.id);

  pops.startingShares.forEach((row, index) => {
    const at = `startingShares.${index}`;
    if (index > 0 && row.gdpPerPerson <= pops.startingShares[index - 1].gdpPerPerson)
      issue(`${at}.gdpPerPerson`, 'the rows must go from poor to rich');
    for (const groupId of Object.keys(row.shares))
      if (!civilians.includes(groupId))
        issue(`${at}.shares.${groupId}`, `"${groupId}" is not a civilian pop group`);
    for (const groupId of civilians)
      if (row.shares[groupId] === undefined)
        issue(`${at}.shares`, `no share for the pop group "${groupId}"`);
    const sum = Object.values(row.shares).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-6)
      issue(`${at}.shares`, `the shares add up to ${sum.toFixed(4)}, not 1`);
  });

  const needIds = pops.needs.map((need) => need.id);
  const goodIds = data.goods.goods.map((good) => good.id);
  pops.needs.forEach((need, index) => {
    if (needIds.indexOf(need.id) !== index)
      issue(`needs.${index}.id`, `duplicate need "${need.id}"`);
    const listed = new Set<string>();
    need.goods?.forEach((entry, g) => {
      if (!goodIds.includes(entry.good))
        issue(`needs.${index}.goods.${g}.good`, `unknown good "${entry.good}"`);
      if (listed.has(entry.good))
        issue(`needs.${index}.goods.${g}.good`, `"${entry.good}" is listed twice`);
      listed.add(entry.good);
    });
  });
  const packages = pops.wealth.packages;
  packages.forEach((row, index) => {
    const at = `wealth.packages.${index}`;
    if (index > 0 && row.level <= packages[index - 1].level)
      issue(`${at}.level`, 'the rows must go from poor to rich');
    for (const needId of Object.keys(row.needs))
      if (!needIds.includes(needId)) issue(`${at}.needs.${needId}`, `unknown need "${needId}"`);
  });
  if (packages[0].level !== 1) issue('wealth.packages.0.level', 'the first row must be level 1');
  if (packages[packages.length - 1].level !== 99)
    issue(`wealth.packages.${packages.length - 1}.level`, 'the last row must be level 99');
  const cost = (row: (typeof packages)[number]) =>
    Object.values(row.needs).reduce((a, b) => a + b, 0);
  packages.forEach((row, index) => {
    if (index > 0 && cost(row) <= cost(packages[index - 1]))
      issue(`wealth.packages.${index}`, 'each row must cost more than the one before');
  });

  pops.jobChanges.forEach((change, index) => {
    const at = `jobChanges.${index}`;
    for (const end of ['from', 'to'] as const)
      if (!civilians.includes(change[end]))
        issue(`${at}.${end}`, `"${change[end]}" is not a civilian pop group`);
    if (change.from === change.to) issue(at, 'a job change must lead to another group');
  });
};
