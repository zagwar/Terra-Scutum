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

/** The three tiers of needs, bought in this order (section 8.1). */
export const NEED_TIERS = ['basic', 'everyday', 'luxury'] as const;
export type NeedTier = (typeof NEED_TIERS)[number];

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
         * How well the group is paid compared with laborers (1). Until
         * buildings pay wages (F07), a pop's wage is this times its country's
         * base wage.
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
   * What people need, each with its tier and what one person's share costs a
   * day in US$ at United States prices. Until markets set prices (F65), a
   * need costs this times the province's price level.
   */
  needs: z
    .array(z.strictObject({ id, tier: z.enum(NEED_TIERS), costPerDay: z.number().positive() }))
    .min(1),
  /**
   * Standard of living (0–100): each tier of needs counts this much when it
   * is fully met. The three add up to 100.
   */
  standardOfLiving: z.strictObject({
    basic: z.number().min(0),
    everyday: z.number().min(0),
    luxury: z.number().min(0),
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
   * The stand-in for the economy until buildings (F07) and markets (F65)
   * exist: where jobs, wages and prices come from in the meantime.
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
     * Each week the jobs of a pop close this share of the gap to the number
     * that keeps its employment where it started: the economy keeps pace
     * with its workforce.
     */
    jobsFollowWeekly: share,
  }),
});

export type PopsConfig = z.infer<typeof popsSchema>;

export const popGroupNameKey = (groupId: string) => `POP_GROUP_${groupId.toUpperCase()}`;
export const needNameKey = (needId: string) => `NEED_${needId.toUpperCase()}`;
export const needTierNameKey = (tier: NeedTier) => `NEED_TIER_${tier.toUpperCase()}`;

/** Checks inside `data/pops.json`: ids are unique and known, shares add up. */
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
  needIds.forEach((needId, index) => {
    if (needIds.indexOf(needId) !== index) issue(`needs.${index}.id`, `duplicate need "${needId}"`);
  });
  for (const tier of NEED_TIERS)
    if (!pops.needs.some((need) => need.tier === tier))
      issue('needs', `no need in the "${tier}" tier`);
  const { basic, everyday, luxury } = pops.standardOfLiving;
  if (Math.abs(basic + everyday + luxury - 100) > 1e-6)
    issue('standardOfLiving', `the three tiers add up to ${basic + everyday + luxury}, not 100`);

  pops.jobChanges.forEach((change, index) => {
    const at = `jobChanges.${index}`;
    for (const end of ['from', 'to'] as const)
      if (!civilians.includes(change[end]))
        issue(`${at}.${end}`, `"${change[end]}" is not a civilian pop group`);
    if (change.from === change.to) issue(at, 'a job change must lead to another group');
  });
};
