import { z } from 'zod';
import type { DataCrossCheck } from '../data/game-data';

/**
 * `data/budget.json` (F09, section 8.2): the treasury, taxes, the budget
 * lines, debt, interest, default and inflation, on Victoria 3's rules
 * unless said otherwise. Every value is a [DEFAULT] the designer can change.
 *
 * Arrays "by level" have one value per entry of `levels` (Victoria 3's five
 * steps: very low … very high), in that order.
 */
const share = z.number().min(0).max(1);
const id = z.string().regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, 'ids are lowercase with underscores');
const byLevel = z.array(z.number().min(0).max(10)).min(2).max(9);
const stratum = z.enum(['lower', 'middle', 'upper']);

export const budgetSchema = z.strictObject({
  /** The levels of every setting, lowest first (Victoria 3: very low, low, medium, high, very high). */
  levels: z.array(id).min(2).max(9),
  taxes: z.strictObject({
    /** Each pop group's stratum (Victoria 3's lower, middle and upper strata). */
    strata: z.record(id, stratum),
    /** Income tax on wages by stratum at the medium level (subsistence workers pay none). */
    incomeTax: z.strictObject({ lower: share, middle: share, upper: share }),
    /** Dividends tax on the owners' dividends at the medium level. */
    dividendsTax: share,
    /** Consumption tax: what the people's goods cost them on top of the price, at the medium level. */
    consumptionTax: share,
    /** By level: what every tax rate (and the other revenue) is multiplied by. */
    levelFactor: byLevel,
    /** A country starts at the first level, or the level after each of these shares of GDP its real revenue is above. */
    startLevelRevenueAbove: z.array(share),
    /**
     * At most this share of a country's real revenue comes from its pops'
     * taxes at the start; where the rates would raise more, its collection
     * is scaled down (informal work, tax evasion).
     */
    maxPopShareOfRevenue: share,
  }),
  administration: z.strictObject({
    /** By level: the officials' wages (Victoria 3's government wages). */
    payFactor: byLevel,
    /** By level: the share of the taxes collected. */
    collection: byLevel,
  }),
  military: z.strictObject({
    /** By level: the soldiers' wages (Victoria 3's military wages). */
    payFactor: byLevel,
  }),
  welfare: z.strictObject({
    /** By level: what an unemployed worker gets, as a share of the going wage. */
    benefitShare: byLevel,
  }),
  education: z.strictObject({
    /** At the start, the education line is this share of the country's real spending. */
    shareOfSpending: share,
    /** By level: its cost, relative to the start. */
    costFactor: byLevel,
    /** By level: how fast people train for better jobs (F06's training job changes). */
    trainingFactor: byLevel,
  }),
  /** Budget lines that do nothing yet, with the feature that brings them. */
  placeholderLines: z.array(
    z.strictObject({ id, comesWith: z.string().regex(/^F\d+$/, 'a feature id like F12') }),
  ),
  treasury: z.strictObject({
    /** The treasury starts with this many weeks of the country's spending. */
    startingWeeks: z.number().min(0).max(520),
    /** A surplus pays debt back only from what the treasury holds above this many weeks of spending. */
    keepWeeks: z.number().min(0).max(520),
    /**
     * At the start, spending is at most revenue plus this share of GDP: the
     * few countries with bigger real deficits pay them from oil funds or
     * foreign aid the game doesn't have yet (Timor-Leste, Libya, Ukraine).
     */
    maxStartingDeficitShareOfGdp: share,
  }),
  credit: z.strictObject({
    /** The credit limit: the starting debt plus this share of GDP… */
    headroomShareOfGdp: z.number().min(0).max(5),
    /** …and at least this share of GDP. */
    minShareOfGdp: z.number().min(0).max(5),
    /** Interest rises once this share of the credit limit is used… */
    premiumFrom: share,
    /** …up to this many points (a share a year) at the limit. */
    premiumAtLimit: share,
    /** Credit ratings by the share of the credit limit used (below it), best first. */
    ratings: z
      .array(z.strictObject({ id: z.string().min(1), below: z.number().positive() }))
      .min(1),
  }),
  interest: z.strictObject({
    /** Interest rates are kept within these (a share a year). */
    min: share,
    max: share,
    /** Where the data has no rate: by GDP per person (US$), interpolated. */
    fallback: z.array(z.strictObject({ gdpPerPerson: z.number().positive(), rate: share })).min(1),
    /** Lenders add this share of inflation above normal (or above the starting inflation, which the real rates already carry)… */
    inflationShare: share,
    /** …at most this much. */
    inflationPremiumMax: share,
  }),
  /** A default (Victoria 3: debt above the credit limit): the financial crisis. */
  default: z.strictObject({
    /** The share of the debt written off. */
    writeOff: share,
    noBorrowingYears: z.number().min(0).max(50),
    /** Extra interest afterwards, for so many years. */
    premium: share,
    premiumYears: z.number().min(0).max(50),
    /** Standard of living lost, for so many years. */
    living: z.number().min(0).max(98),
    livingYears: z.number().min(0).max(50),
  }),
  inflation: z.strictObject({
    /** Where inflation settles by itself (a share a year). */
    normal: z.number().min(-0.5).max(1),
    /** It moves halfway toward where it is heading in this many weeks. */
    halfLifeWeeks: z.number().positive().max(520),
    /** Printing money: the levels (the first is none), each adding a share of GDP a year to the treasury. */
    printing: z
      .array(z.strictObject({ id, shareOfGdpPerYear: z.number().min(0).max(5) }))
      .min(1)
      .max(8),
    /** Inflation heads to `normal` + this × the share of GDP printed a year. */
    pointsPerPrintedShare: z.number().min(0).max(100),
    /** Standard of living lost: none at `livingFrom`, growing to `livingMax` at `livingAt`. */
    livingFrom: z.number().min(0).max(10),
    livingAt: z.number().min(0).max(100),
    livingMax: z.number().min(0).max(98),
    /** Above this the game warns of high inflation. */
    high: z.number().min(0).max(100),
  }),
  /** For a country the starting data has no finances for (test data). */
  fallback: z.strictObject({
    revenueShare: share,
    spendingShare: z.number().min(0).max(1.5),
    debtShare: z.number().min(0).max(5),
    inflationRate: z.number().min(-0.5).max(10),
  }),
  /** How countries run their budgets by themselves (every country but the player's, unless the player turns it on). */
  auto: z.strictObject({
    /** At most one change in this many weeks. */
    cooldownWeeks: z.number().min(1).max(520),
    /** Tighten (higher taxes or lower spending) above this share of the credit limit used with any deficit, or with a deficit above this share of GDP… */
    tightenAbove: share,
    tightenDeficitShareOfGdp: share,
    /** …loosen below this share used with a surplus above this share of GDP. */
    loosenBelow: share,
    loosenSurplusShareOfGdp: share,
  }),
  alerts: z.strictObject({
    /** Warn above this share of the credit limit used. */
    nearLimit: share,
  }),
});

export type BudgetConfig = z.infer<typeof budgetSchema>;

/** Checks `data/budget.json` against the pop groups and its own levels. */
export const checkBudget: DataCrossCheck = (data, report) => {
  const budget = data.budget;
  const issue = (path: string, message: string) => report({ file: 'budget.json', path, message });
  const levels = budget.levels.length;
  const groups = data.pops.groups.map((group) => group.id);
  for (const group of groups)
    if (!budget.taxes.strata[group])
      issue('taxes.strata', `the pop group "${group}" has no stratum`);
  for (const group of Object.keys(budget.taxes.strata))
    if (!groups.includes(group)) issue(`taxes.strata.${group}`, `unknown pop group "${group}"`);
  const byLevel: [string, readonly number[]][] = [
    ['taxes.levelFactor', budget.taxes.levelFactor],
    ['administration.payFactor', budget.administration.payFactor],
    ['administration.collection', budget.administration.collection],
    ['military.payFactor', budget.military.payFactor],
    ['welfare.benefitShare', budget.welfare.benefitShare],
    ['education.costFactor', budget.education.costFactor],
    ['education.trainingFactor', budget.education.trainingFactor],
  ];
  for (const [path, values] of byLevel) {
    if (values.length !== levels)
      issue(path, `needs one value per level (${levels}), has ${values.length}`);
    for (let i = 1; i < values.length; i++)
      if (values[i] < values[i - 1]) issue(path, 'must not fall from one level to the next');
  }
  if (budget.taxes.startLevelRevenueAbove.length !== levels - 1)
    issue('taxes.startLevelRevenueAbove', `needs ${levels - 1} thresholds`);
  for (let i = 1; i < budget.taxes.startLevelRevenueAbove.length; i++)
    if (budget.taxes.startLevelRevenueAbove[i] <= budget.taxes.startLevelRevenueAbove[i - 1])
      issue('taxes.startLevelRevenueAbove', 'thresholds must rise');
  const ratings = budget.credit.ratings;
  for (let i = 1; i < ratings.length; i++)
    if (ratings[i].below <= ratings[i - 1].below)
      issue(`credit.ratings.${i}`, 'ratings go from best to worst, with rising thresholds');
  if (ratings[ratings.length - 1].below < 1)
    issue('credit.ratings', 'the last rating must cover the whole credit limit');
  if (budget.interest.min > budget.interest.max)
    issue('interest.min', 'the lowest rate is above the highest');
  const fallback = budget.interest.fallback;
  for (let i = 1; i < fallback.length; i++)
    if (fallback[i].gdpPerPerson <= fallback[i - 1].gdpPerPerson)
      issue(`interest.fallback.${i}`, 'rows go from poorer to richer');
  if (budget.inflation.printing[0].shareOfGdpPerYear !== 0)
    issue('inflation.printing.0', 'the first level prints nothing');
  if (budget.inflation.livingAt <= budget.inflation.livingFrom)
    issue('inflation.livingAt', 'must be above livingFrom');
  if (budget.auto.loosenBelow >= budget.auto.tightenAbove)
    issue('auto.loosenBelow', 'must be below tightenAbove');
  const ids = budget.placeholderLines.map((line) => line.id);
  if (new Set(ids).size !== ids.length) issue('placeholderLines', 'a line is listed twice');
};
