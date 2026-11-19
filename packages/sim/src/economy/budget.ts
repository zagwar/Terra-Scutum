import type { GameData } from '../data/game-data';
import type { GameState } from '../core/game-state';
import type { SimSystem } from '../core/systems';
import type { CountryStartTable } from '../world/country-start';
import type { WorldMap } from '../world/world-map';
import type { MarketState } from './market';
import type { PopulationState } from './population';
import type { TradeState } from './trade';

/**
 * The budget (F09, section 8.2), on Victoria 3's rules unless said otherwise
 * (designer decision: Victoria 3 is the foundation for the economy).
 *
 * - **The treasury** (Victoria 3's gold reserves) holds real US$. Every
 *   Monday the week's income and spending are added up: a deficit comes out
 *   of the treasury, and once it is empty the country **borrows** (Victoria
 *   3); a surplus pays debt back from what the treasury holds above
 *   `keepWeeks` of spending.
 * - **Income:** Victoria 3's taxes on the pops (income tax on wages by
 *   stratum, none on subsistence shares; dividends tax; consumption tax on
 *   what people buy), tariffs (F19), **other revenue** (a stand-in for
 *   everything the pops don't cover yet: corporate taxes, oil money), and
 *   printed money. The **tax level** (five steps) multiplies every rate.
 * - **Spending:** administration (the officials' wages: Victoria 3's
 *   government wages; less funding also collects less tax), the military
 *   (the soldiers' wages: Victoria 3's military wages), welfare
 *   (unemployment benefits), education (speeds up training), interest, and
 *   **other spending** (a stand-in for health, pensions, roads…). Each line
 *   has a funding level (designer decision: Victoria 3's levels, not the
 *   design's percentages).
 * - **At the start** every country has its real 2025 revenue, spending,
 *   debt, inflation and interest rate (IMF); the stand-ins make up the
 *   difference between what the pops pay and get and the real figures.
 * - **Debt:** a credit limit (the starting debt plus a share of GDP), a
 *   credit rating by how much of it is used, interest rising near the limit
 *   (we differ: Victoria 3 keeps it flat; section 8.2 raises it), and a
 *   **default** above the limit (Victoria 3): part of the debt written off,
 *   no borrowing for years, spending cut to what comes in, a premium on
 *   interest and a loss of standard of living.
 * - **Inflation** (section 8.2; Victoria 3 has none): starts at the real
 *   rate and drifts to `normal`; printing money pushes it up. Our prices
 *   stay in 2025 dollars, so it shows as people's money buying less (a loss
 *   of standard of living) and dearer borrowing.
 * - **Other countries** (and the player, if they choose) run their budgets
 *   automatically: tighten near the credit limit or in a big deficit,
 *   loosen in comfortable surpluses, print money only when they can't borrow.
 *
 * The money is a ledger: the taxes come out of the pops' incomes and the
 * government pays its officials, soldiers and the unemployed, but the
 * stand-ins neither come from nor go to anyone (like F65's rest of the
 * economy). Everything is weekly, in typed arrays; the daily step only
 * adds up the tariffs. No random numbers.
 */

/** The budget's income lines, then its spending lines (the order of `lines`). */
export const BUDGET_LINES = [
  'income_tax',
  'dividends_tax',
  'consumption_tax',
  'tariffs',
  'other_revenue',
  'printed_money',
  'administration',
  'military',
  'welfare',
  'education',
  'interest',
  'other_spending',
] as const;
export type BudgetLineId = (typeof BUDGET_LINES)[number];
/** The first `INCOME_LINE_COUNT` lines are income, the rest spending. */
export const INCOME_LINE_COUNT = 6;
const LINE = Object.fromEntries(BUDGET_LINES.map((id, i) => [id, i])) as Record<
  BudgetLineId,
  number
>;

/** The settings with a level (very low … very high). */
export const BUDGET_SETTINGS = [
  'taxes',
  'administration',
  'military',
  'welfare',
  'education',
] as const;
export type BudgetSettingId = (typeof BUDGET_SETTINGS)[number];
const TAXES = 0;
const ADMINISTRATION = 1;
const MILITARY = 2;
const WELFARE = 3;
const EDUCATION = 4;
const SETTING_COUNT = BUDGET_SETTINGS.length;

const DAYS_PER_YEAR = 365;
const WEEKS_PER_YEAR = DAYS_PER_YEAR / 7;
/** Weeks of balances kept for the screens. */
export const BUDGET_HISTORY_WEEKS = 52;
/** A country can't cut its spending below this share of its full budget (it still pays something). */
const MIN_SPENDING_CUT = 0.25;

export interface BudgetState {
  readonly countryCount: number;
  readonly groupCount: number;
  readonly levelCount: number;
  /** Per pop group: its income tax at the medium level (by its stratum). */
  readonly strataRate: Float64Array;
  readonly officialsGroup: number;
  readonly soldiersGroup: number;

  // ── Fixed for the campaign (from the start) ──────────────────────────────
  /** Per country: its real GDP at the start, US$ a day. */
  readonly startGdp: Float64Array;
  /** Per country: its pops' income at the start, US$ a day (GDP moves with it). */
  readonly startGross: Float64Array;
  /** Per country: its real 2025 revenue and spending (shares of GDP), for the screens. */
  readonly realRevenueShare: Float64Array;
  readonly realSpendingShare: Float64Array;
  /** Per country: the share of the pops' taxes it collects (≤ 1: informal work, evasion). */
  readonly collection: Float64Array;
  /** Per country: other revenue as a share of GDP at the start, and the tax factor it was set at. */
  readonly otherRevenueShare: Float64Array;
  readonly startTaxFactor: Float64Array;
  /** Per country: other spending, and education at the medium level, as shares of GDP. */
  readonly otherSpendingShare: Float64Array;
  readonly educationShare: Float64Array;
  /** Per country: its interest rate before premiums (a share a year). */
  readonly baseRate: Float64Array;
  /** Per country: its inflation at the start (its real interest rate already carries it). */
  readonly startInflation: Float64Array;
  /** Per country: its credit limit as a share of a year's GDP. */
  readonly creditLimitShare: Float64Array;
  /** Per country and setting: the level it started at (the automatic budget loosens back toward it). */
  readonly startSettings: Uint8Array;

  // ── The state (saved) ────────────────────────────────────────────────────
  /** Per country and setting (`BUDGET_SETTINGS`): its level. */
  readonly settings: Uint8Array;
  /** Per country: its money printing level (`data/budget.json` → `inflation.printing`). */
  readonly printing: Uint8Array;
  /** Per country: 1 if it runs its budget by itself (every country but the player's at the start). */
  readonly automatic: Uint8Array;
  /** Per country: weeks before the automatic budget may change something again. */
  readonly cooldown: Int16Array;
  /** Per country, US$: the treasury and the debt. */
  readonly treasury: Float64Array;
  readonly debt: Float64Array;
  /** Per country: inflation, a share a year. */
  readonly inflation: Float64Array;
  /** Per country: the day of its last default (-1: never). */
  readonly defaultDay: Int32Array;
  readonly defaults: Uint16Array;
  /** Per country: the share of its spending it can pay while it can't borrow (1 = all). */
  readonly spendingCut: Float64Array;
  /** Per country and line (`BUDGET_LINES`): last week's amounts, US$ a week. */
  readonly lines: Float64Array;
  /** Per country: its GDP now (US$ a day) and its interest rate now (a share a year). */
  readonly gdp: Float64Array;
  readonly interestRate: Float64Array;
  /** Per country: tariffs this week so far (US$), and days counted. */
  readonly weekTariffs: Float64Array;
  weekDays: number;

  // ── Not saved ────────────────────────────────────────────────────────────
  /** Per country, the weekly balance of the last `BUDGET_HISTORY_WEEKS` weeks (a ring). */
  readonly history: Float32Array;
  historyCount: number;
  historyNext: number;
  /** Goes up whenever the budget changes, so hosts know when to resend it. */
  version: number;
}

/** The saved part of the budget. */
export interface BudgetRestore {
  readonly settings: Uint8Array;
  readonly printing: Uint8Array;
  readonly automatic: Uint8Array;
  readonly cooldown: Int16Array;
  readonly treasury: Float64Array;
  readonly debt: Float64Array;
  readonly inflation: Float64Array;
  readonly defaultDay: Int32Array;
  readonly defaults: Uint16Array;
  readonly spendingCut: Float64Array;
  readonly lines: Float64Array;
  readonly gdp: Float64Array;
  readonly interestRate: Float64Array;
  readonly weekTariffs: Float64Array;
  readonly weekDays: number;
  /** The market's tax sums this week (`PopTaxes`). */
  readonly weekIncomeTax: Float64Array;
  readonly weekDividendTax: Float64Array;
  readonly weekConsumptionTax: Float64Array;
  readonly weekBenefits: Float64Array;
  readonly weekGross: Float64Array;
  readonly weekGovPay: Float64Array;
}

/** The parts of `BudgetState` a save keeps, in the order a save lists them. */
export const BUDGET_SAVED_ARRAYS = [
  'settings',
  'printing',
  'automatic',
  'cooldown',
  'treasury',
  'debt',
  'inflation',
  'defaultDay',
  'defaults',
  'spendingCut',
  'lines',
  'gdp',
  'interestRate',
  'weekTariffs',
] as const;
/** The market's tax sums a save keeps with the budget. */
export const BUDGET_SAVED_TAX_ARRAYS = [
  'weekIncomeTax',
  'weekDividendTax',
  'weekConsumptionTax',
  'weekBenefits',
  'weekGross',
  'weekGovPay',
] as const;

/** A value from the starting data, or the fallback where it has none (NaN). */
const orElse = (value: number, fallback: number) => (Number.isNaN(value) ? fallback : value);

/** The interest rate the data gives a country, or the fallback by GDP per person (interpolated). */
function startingRate(
  data: GameData,
  countryStart: CountryStartTable,
  c: number,
  gdpPerPerson: number,
): number {
  const rules = data.budget.interest;
  let rate = countryStart.interestRate[c];
  if (Number.isNaN(rate)) {
    const rows = rules.fallback;
    if (gdpPerPerson <= rows[0].gdpPerPerson) rate = rows[0].rate;
    else if (gdpPerPerson >= rows[rows.length - 1].gdpPerPerson) rate = rows[rows.length - 1].rate;
    else {
      rate = rows[0].rate;
      for (let i = 1; i < rows.length; i++) {
        if (gdpPerPerson <= rows[i].gdpPerPerson) {
          const t =
            (gdpPerPerson - rows[i - 1].gdpPerPerson) /
            (rows[i].gdpPerPerson - rows[i - 1].gdpPerPerson);
          rate = rows[i - 1].rate + t * (rows[i].rate - rows[i - 1].rate);
          break;
        }
      }
    }
  }
  return Math.min(rules.max, Math.max(rules.min, rate));
}

/**
 * The budget at the start of a campaign, before the markets settle: each
 * country's starting levels (its tax level from its real revenue; welfare
 * at the same level; the rest medium) and its tax rates with full
 * collection. `calibrateBudget` (during the markets' calibration) and
 * `finishStartingBudget` (after it) set the rest.
 */
export function createBudget(
  data: GameData,
  world: WorldMap,
  countryStart: CountryStartTable,
  market: MarketState,
  population: PopulationState,
): BudgetState {
  const rules = data.budget;
  const countries = world.countryIds.length;
  const groups = population.groupCount;
  const levels = rules.levels.length;
  const medium = Math.floor((levels - 1) / 2);
  const strataRate = Float64Array.from(
    data.pops.groups,
    (group) => rules.taxes.incomeTax[rules.taxes.strata[group.id] ?? 'lower'],
  );
  const settings = new Uint8Array(countries * SETTING_COUNT).fill(medium);
  const realRevenueShare = new Float64Array(countries);
  const realSpendingShare = new Float64Array(countries);
  for (let c = 0; c < countries; c++) {
    const revenue = orElse(countryStart.revenueShare[c], rules.fallback.revenueShare);
    realRevenueShare[c] = revenue;
    realSpendingShare[c] = orElse(countryStart.spendingShare[c], rules.fallback.spendingShare);
    let level = 0;
    for (const above of rules.taxes.startLevelRevenueAbove) if (revenue > above) level += 1;
    settings[c * SETTING_COUNT + TAXES] = level;
    settings[c * SETTING_COUNT + WELFARE] = level;
  }
  const automatic = new Uint8Array(countries).fill(1);
  const budget: BudgetState = {
    countryCount: countries,
    groupCount: groups,
    levelCount: levels,
    strataRate,
    officialsGroup: data.pops.groups.findIndex((group) => group.id === 'officials'),
    soldiersGroup: data.pops.groups.findIndex((group) => group.military === true),
    startGdp: Float64Array.from(countryStart.gdpMillionUsd, (gdp) => (gdp * 1e6) / DAYS_PER_YEAR),
    startGross: new Float64Array(countries),
    realRevenueShare,
    realSpendingShare,
    collection: new Float64Array(countries).fill(1),
    otherRevenueShare: new Float64Array(countries),
    startTaxFactor: new Float64Array(countries).fill(1),
    otherSpendingShare: new Float64Array(countries),
    educationShare: new Float64Array(countries),
    baseRate: new Float64Array(countries),
    startInflation: new Float64Array(countries),
    creditLimitShare: new Float64Array(countries),
    startSettings: settings.slice(),
    settings,
    printing: new Uint8Array(countries),
    automatic,
    cooldown: new Int16Array(countries),
    treasury: new Float64Array(countries),
    debt: new Float64Array(countries),
    inflation: new Float64Array(countries),
    defaultDay: new Int32Array(countries).fill(-1),
    defaults: new Uint16Array(countries),
    spendingCut: new Float64Array(countries).fill(1),
    lines: new Float64Array(countries * BUDGET_LINES.length),
    gdp: new Float64Array(countries),
    interestRate: new Float64Array(countries),
    weekTariffs: new Float64Array(countries),
    weekDays: 0,
    history: new Float32Array(countries * BUDGET_HISTORY_WEEKS),
    historyCount: 0,
    historyNext: 0,
    version: 0,
  };
  for (let c = 0; c < countries; c++) applyRates(budget, market, data, c);
  return budget;
}

/**
 * F09's step in the markets' calibration (after each round's trial day):
 * where the pops' taxes at full collection would raise more than
 * `maxPopShareOfRevenue` of the country's real revenue, its collection is
 * scaled down so they raise that much.
 */
export function calibrateBudget(budget: BudgetState, market: MarketState, data: GameData): void {
  const taxes = market.taxes;
  const most = data.budget.taxes.maxPopShareOfRevenue;
  for (let c = 0; c < budget.countryCount; c++) {
    const now = budget.collection[c];
    const raised = taxes.dayIncomeTax[c] + taxes.dayDividendTax[c] + taxes.dayConsumptionTax[c];
    const full = now > 0 ? raised / now : raised;
    const real = budget.realRevenueShare[c] * budget.startGdp[c];
    budget.collection[c] = full > 0 ? Math.min(1, (most * real) / full) : 1;
    applyRates(budget, market, data, c);
  }
}

/**
 * The rest of the start (after the markets settle, from the last trial
 * day): the stand-ins that make each country's revenue and spending its
 * real ones, its debt, credit limit, interest rate, inflation and treasury,
 * and a first week's lines (the trial day × 7) for the screens.
 */
export function finishStartingBudget(
  budget: BudgetState,
  market: MarketState,
  trade: TradeState,
  data: GameData,
  countryStart: CountryStartTable,
  playerCountry: number,
): void {
  const rules = data.budget;
  const taxes = market.taxes;
  const groups = budget.groupCount;
  for (let c = 0; c < budget.countryCount; c++) {
    const gdp = budget.startGdp[c];
    budget.gdp[c] = gdp;
    budget.startGross[c] = taxes.dayGross[c];
    const at = c * SETTING_COUNT;
    budget.startTaxFactor[c] =
      rules.taxes.levelFactor[budget.settings[at + TAXES]] *
      rules.administration.collection[budget.settings[at + ADMINISTRATION]];
    const pops = taxes.dayIncomeTax[c] + taxes.dayDividendTax[c] + taxes.dayConsumptionTax[c];
    const tariffs = trade.tariffIncome[c];
    const revenue = budget.realRevenueShare[c] * gdp;
    budget.otherRevenueShare[c] = gdp > 0 ? Math.max(0, revenue - pops - tariffs) / gdp : 0;

    const debtShare = orElse(countryStart.debtShare[c], rules.fallback.debtShare);
    budget.debt[c] = debtShare * gdp * DAYS_PER_YEAR;
    budget.creditLimitShare[c] = Math.max(
      rules.credit.minShareOfGdp,
      debtShare + rules.credit.headroomShareOfGdp,
    );
    const people = countryStart.population[c];
    budget.baseRate[c] = startingRate(
      data,
      countryStart,
      c,
      people > 0 ? (gdp * DAYS_PER_YEAR) / people : 0,
    );
    budget.inflation[c] = orElse(countryStart.inflationRate[c], rules.fallback.inflationRate);
    budget.startInflation[c] = budget.inflation[c];
    budget.interestRate[c] = interestRate(budget, data, c, 0);

    const spending =
      Math.min(
        budget.realSpendingShare[c],
        budget.realRevenueShare[c] + rules.treasury.maxStartingDeficitShareOfGdp,
      ) * gdp;
    budget.educationShare[c] = rules.education.shareOfSpending * budget.realSpendingShare[c];
    const fixed =
      groupPay(taxes.dayGovPay, c, groups, budget.officialsGroup) +
      groupPay(taxes.dayGovPay, c, groups, budget.soldiersGroup) +
      taxes.dayBenefits[c] +
      budget.educationShare[c] * gdp +
      (budget.debt[c] * budget.interestRate[c]) / DAYS_PER_YEAR;
    budget.otherSpendingShare[c] = gdp > 0 ? Math.max(0, spending - fixed) / gdp : 0;
  }
  // The first week's lines, from the trial day.
  for (let c = 0; c < budget.countryCount; c++) {
    writeLines(budget, market, data, c, 7, trade.tariffIncome[c]);
    budget.treasury[c] = rules.treasury.startingWeeks * spendingOf(budget, c);
  }
  budget.automatic[playerCountry] = 0;
  budget.version += 1;
}

/** What the government pays a pop group in a country (0 for a group the data doesn't have). */
const groupPay = (pay: Float64Array, c: number, groups: number, g: number) =>
  g >= 0 ? pay[c * groups + g] : 0;

/** A country's spending last week (US$). */
function spendingOf(budget: BudgetState, c: number): number {
  let total = 0;
  const at = c * BUDGET_LINES.length;
  for (let l = INCOME_LINE_COUNT; l < BUDGET_LINES.length; l++) total += budget.lines[at + l];
  return total;
}

/** A country's income last week (US$). */
function incomeOf(budget: BudgetState, c: number): number {
  let total = 0;
  const at = c * BUDGET_LINES.length;
  for (let l = 0; l < INCOME_LINE_COUNT; l++) total += budget.lines[at + l];
  return total;
}

/**
 * A country's lines for a week: the taxes, benefits and pay the market
 * counted this week (`days` of them, scaled to a week), or with `tariffsDay`
 * set, today's × 7 (the start, before any week); the stand-ins from its GDP
 * and levels; interest on its debt.
 */
function writeLines(
  budget: BudgetState,
  market: MarketState,
  data: GameData,
  c: number,
  days: number,
  tariffsDay?: number,
): void {
  const rules = data.budget;
  const taxes = market.taxes;
  const groups = budget.groupCount;
  const lines = budget.lines;
  const at = c * BUDGET_LINES.length;
  const set = c * SETTING_COUNT;
  const week = tariffsDay === undefined;
  const scale = days > 0 ? 7 / days : 0;
  const gdpWeek = budget.gdp[c] * 7;
  const cut = budget.spendingCut[c];
  const sum = (weekly: Float64Array, daily: Float64Array, i: number) =>
    week ? weekly[i] * scale : daily[i] * 7;
  const taxFactor =
    rules.taxes.levelFactor[budget.settings[set + TAXES]] *
    rules.administration.collection[budget.settings[set + ADMINISTRATION]];
  lines[at + LINE.income_tax] = sum(taxes.weekIncomeTax, taxes.dayIncomeTax, c);
  lines[at + LINE.dividends_tax] = sum(taxes.weekDividendTax, taxes.dayDividendTax, c);
  lines[at + LINE.consumption_tax] = sum(taxes.weekConsumptionTax, taxes.dayConsumptionTax, c);
  lines[at + LINE.tariffs] = week ? budget.weekTariffs[c] * scale : (tariffsDay ?? 0) * 7;
  lines[at + LINE.other_revenue] =
    budget.otherRevenueShare[c] * gdpWeek * (taxFactor / budget.startTaxFactor[c]);
  lines[at + LINE.printed_money] =
    rules.inflation.printing[budget.printing[c]].shareOfGdpPerYear * budget.gdp[c] * 7;
  lines[at + LINE.administration] =
    budget.officialsGroup >= 0
      ? sum(taxes.weekGovPay, taxes.dayGovPay, c * groups + budget.officialsGroup)
      : 0;
  lines[at + LINE.military] =
    budget.soldiersGroup >= 0
      ? sum(taxes.weekGovPay, taxes.dayGovPay, c * groups + budget.soldiersGroup)
      : 0;
  lines[at + LINE.welfare] = sum(taxes.weekBenefits, taxes.dayBenefits, c);
  lines[at + LINE.education] =
    budget.educationShare[c] *
    gdpWeek *
    rules.education.costFactor[budget.settings[set + EDUCATION]] *
    cut;
  lines[at + LINE.interest] = (budget.debt[c] * budget.interestRate[c] * 7) / DAYS_PER_YEAR;
  lines[at + LINE.other_spending] = budget.otherSpendingShare[c] * gdpWeek * cut;
}

/**
 * Writes a country's rates into the market for the coming days (`PopTaxes`):
 * its taxes by its tax level, collection and administration; the
 * government's pay for officials and soldiers; unemployment benefits; all
 * spending less what a cut takes.
 */
export function applyRates(
  budget: BudgetState,
  market: MarketState,
  data: GameData,
  c: number,
): void {
  const rules = data.budget;
  const taxes = market.taxes;
  const groups = budget.groupCount;
  const set = c * SETTING_COUNT;
  const factor =
    rules.taxes.levelFactor[budget.settings[set + TAXES]] *
    budget.collection[c] *
    rules.administration.collection[budget.settings[set + ADMINISTRATION]];
  const cut = budget.spendingCut[c];
  for (let g = 0; g < groups; g++) {
    taxes.incomeTax[c * groups + g] = Math.min(0.95, budget.strataRate[g] * factor);
    taxes.payFactor[c * groups + g] = 1;
  }
  taxes.dividendTax[c] = Math.min(0.95, rules.taxes.dividendsTax * factor);
  taxes.consumptionTax[c] = rules.taxes.consumptionTax * factor;
  if (budget.officialsGroup >= 0)
    taxes.payFactor[c * groups + budget.officialsGroup] =
      rules.administration.payFactor[budget.settings[set + ADMINISTRATION]] * cut;
  if (budget.soldiersGroup >= 0)
    taxes.payFactor[c * groups + budget.soldiersGroup] =
      rules.military.payFactor[budget.settings[set + MILITARY]] * cut;
  taxes.benefitShare[c] = rules.welfare.benefitShare[budget.settings[set + WELFARE]] * cut;
}

/** Writes every province's training speed from its owner's education level (and cut). */
export function applyTraining(
  budget: BudgetState,
  population: PopulationState,
  provinceOwner: Uint16Array,
  data: GameData,
): void {
  const factors = data.budget.education.trainingFactor;
  const training = population.trainingFactor;
  for (let p = 0; p < training.length; p++) {
    const c = provinceOwner[p];
    training[p] = factors[budget.settings[c * SETTING_COUNT + EDUCATION]] * budget.spendingCut[c];
  }
}

/** A country's credit limit now (US$). */
export function creditLimit(budget: BudgetState, c: number): number {
  return budget.creditLimitShare[c] * budget.gdp[c] * DAYS_PER_YEAR;
}

/** Whether a country may borrow on `day` (not within the no-borrowing years after a default). */
export function canBorrow(budget: BudgetState, data: GameData, c: number, day: number): boolean {
  const since = budget.defaultDay[c];
  return since < 0 || day >= since + data.budget.default.noBorrowingYears * DAYS_PER_YEAR;
}

/**
 * A country's interest rate (a share a year): its base rate, plus a premium
 * that grows as it uses its credit limit (from `premiumFrom` to
 * `premiumAtLimit` at the limit, squared), plus lenders' share of inflation
 * above normal and above the starting inflation (real rates already carry
 * that), plus the default premium while it lasts.
 */
function interestRate(budget: BudgetState, data: GameData, c: number, day: number): number {
  const rules = data.budget;
  const limit = creditLimit(budget, c);
  const used = limit > 0 ? budget.debt[c] / limit : 0;
  let rate = budget.baseRate[c];
  const from = rules.credit.premiumFrom;
  if (used > from) {
    const t = Math.min(1.5, (used - from) / (1 - from));
    rate += rules.credit.premiumAtLimit * t * t;
  }
  const over = budget.inflation[c] - Math.max(rules.inflation.normal, budget.startInflation[c]);
  if (over > 0)
    rate += Math.min(rules.interest.inflationPremiumMax, over * rules.interest.inflationShare);
  const since = budget.defaultDay[c];
  if (since >= 0 && day < since + rules.default.premiumYears * DAYS_PER_YEAR)
    rate += rules.default.premium;
  return Math.max(rules.interest.min, Math.min(0.5, rate));
}

/** A country's credit rating: an index into `credit.ratings`, or `ratings.length` ("D") while it can't borrow after a default. */
export function creditRating(budget: BudgetState, data: GameData, c: number, day: number): number {
  const ratings = data.budget.credit.ratings;
  if (!canBorrow(budget, data, c, day)) return ratings.length;
  const limit = creditLimit(budget, c);
  const used = limit > 0 ? budget.debt[c] / limit : 0;
  for (let i = 0; i < ratings.length; i++) if (used < ratings[i].below) return i;
  return ratings.length - 1;
}

/** The standard of living inflation takes (none at `livingFrom`, `livingMax` from `livingAt`). */
function inflationLiving(data: GameData, inflation: number): number {
  const rules = data.budget.inflation;
  if (inflation <= rules.livingFrom) return 0;
  const t = Math.min(1, (inflation - rules.livingFrom) / (rules.livingAt - rules.livingFrom));
  return rules.livingMax * t;
}

/**
 * The budget's week (Mondays, after the day's markets, trade and food): for
 * every country the week's lines, the balance into the treasury, borrowing
 * or paying back, a default above the credit limit, the next week's cut
 * while it can't borrow, inflation, the interest rate, the standard of
 * living lost, the automatic budget, and the new rates.
 */
export function budgetWeek(state: GameState): void {
  const { budget, market, data, population } = state;
  const rules = data.budget;
  const taxes = market.taxes;
  const days = budget.weekDays;
  const day = state.day;
  const drift = 1 - Math.pow(0.5, 1 / rules.inflation.halfLifeWeeks);
  for (let c = 0; c < budget.countryCount; c++) {
    // GDP moves with what the pops earn (a stand-in until the economy has its own).
    const gross = days > 0 ? taxes.weekGross[c] / days : 0;
    const start = budget.startGross[c];
    budget.gdp[c] =
      start > 0
        ? budget.startGdp[c] * Math.max(0.05, Math.min(20, gross / start))
        : budget.startGdp[c];
    budget.interestRate[c] = interestRate(budget, data, c, day);
    writeLines(budget, market, data, c, days);
    const income = incomeOf(budget, c);
    const spending = spendingOf(budget, c);
    const balance = income - spending;
    budget.treasury[c] += balance;
    const borrow = canBorrow(budget, data, c, day);
    if (budget.treasury[c] < 0) {
      // Victoria 3: an empty treasury borrows; a country that can't leaves bills unpaid.
      if (borrow) budget.debt[c] -= budget.treasury[c];
      budget.treasury[c] = 0;
    } else if (budget.debt[c] > 0) {
      const spare = budget.treasury[c] - rules.treasury.keepWeeks * spending;
      if (spare > 0) {
        const pay = Math.min(spare, budget.debt[c]);
        budget.debt[c] -= pay;
        budget.treasury[c] -= pay;
      }
    }
    // A default (Victoria 3: debt above the credit limit).
    if (borrow && budget.debt[c] > creditLimit(budget, c)) {
      budget.debt[c] *= 1 - rules.default.writeOff;
      budget.defaultDay[c] = day;
      budget.defaults[c] += 1;
      state.emit({ type: 'countryDefaulted', country: state.world.countryIds[c] });
    }
    // While it can't borrow, it pays only what comes in (and a little of its treasury).
    if (!canBorrow(budget, data, c, day)) {
      const at = c * BUDGET_LINES.length;
      const interest = budget.lines[at + LINE.interest];
      const full = (spending - interest) / Math.max(1e-9, budget.spendingCut[c]);
      const available = income - interest + budget.treasury[c] / 4;
      budget.spendingCut[c] =
        full > 0 ? Math.max(MIN_SPENDING_CUT, Math.min(1, available / full)) : 1;
    } else budget.spendingCut[c] = 1;
    // Inflation drifts toward normal, pushed up by printing money.
    const printed = rules.inflation.printing[budget.printing[c]].shareOfGdpPerYear;
    const target = rules.inflation.normal + rules.inflation.pointsPerPrintedShare * printed;
    budget.inflation[c] += (target - budget.inflation[c]) * drift;
    let living = inflationLiving(data, budget.inflation[c]);
    const since = budget.defaultDay[c];
    if (since >= 0 && day < since + rules.default.livingYears * DAYS_PER_YEAR)
      living += rules.default.living;
    population.countryLivingPenalty[c] = living;
    if (budget.automatic[c] === 1) autoBudget(budget, data, c, day, balance);
    applyRates(budget, market, data, c);
    // The balance line for the screens.
    budget.history[c * BUDGET_HISTORY_WEEKS + budget.historyNext] = balance;
  }
  applyTraining(budget, population, state.provinceOwner, data);
  budget.historyNext = (budget.historyNext + 1) % BUDGET_HISTORY_WEEKS;
  if (budget.historyCount < BUDGET_HISTORY_WEEKS) budget.historyCount += 1;
  taxes.weekIncomeTax.fill(0);
  taxes.weekDividendTax.fill(0);
  taxes.weekConsumptionTax.fill(0);
  taxes.weekBenefits.fill(0);
  taxes.weekGross.fill(0);
  taxes.weekGovPay.fill(0);
  budget.weekTariffs.fill(0);
  budget.weekDays = 0;
  population.reportOwnershipVersion = -1;
  budget.version += 1;
}

/**
 * The automatic budget (other countries; the player if they choose it), at
 * most one step every `cooldownWeeks`: **tighten** above `tightenAbove` of
 * the credit limit in a deficit, or with a deficit above `tightenDeficitShareOfGdp` of
 * GDP once it uses more than `loosenBelow` (taxes up, then welfare,
 * education, the military and administration down); **loosen** below
 * `loosenBelow` with a surplus (welfare and education back to where they
 * started, then taxes down to where they started). It prints money only
 * while it can't borrow and has to cut spending.
 */
function autoBudget(
  budget: BudgetState,
  data: GameData,
  c: number,
  day: number,
  balance: number,
): void {
  const rules = data.budget.auto;
  const set = c * SETTING_COUNT;
  const top = budget.levelCount - 1;
  const settings = budget.settings;
  budget.printing[c] =
    !canBorrow(budget, data, c, day) && budget.spendingCut[c] < 1
      ? Math.min(1, data.budget.inflation.printing.length - 1)
      : 0;
  if (budget.cooldown[c] > 0) {
    budget.cooldown[c] -= 1;
    return;
  }
  const limit = creditLimit(budget, c);
  const used = limit > 0 ? budget.debt[c] / limit : 0;
  const gdpYear = budget.gdp[c] * DAYS_PER_YEAR;
  const yearly = gdpYear > 0 ? (balance * WEEKS_PER_YEAR) / gdpYear : 0;
  let changed = false;
  if (
    (used > rules.tightenAbove && balance < 0) ||
    (-yearly > rules.tightenDeficitShareOfGdp && used > rules.loosenBelow)
  ) {
    if (settings[set + TAXES] < top) settings[set + TAXES] += 1;
    else if (settings[set + WELFARE] > 0) settings[set + WELFARE] -= 1;
    else if (settings[set + EDUCATION] > 0) settings[set + EDUCATION] -= 1;
    else if (settings[set + MILITARY] > 0) settings[set + MILITARY] -= 1;
    else if (settings[set + ADMINISTRATION] > 0) settings[set + ADMINISTRATION] -= 1;
    else return;
    changed = true;
  } else if (used < rules.loosenBelow && yearly > rules.loosenSurplusShareOfGdp) {
    const start = budget.startSettings;
    if (settings[set + WELFARE] < start[set + WELFARE]) settings[set + WELFARE] += 1;
    else if (settings[set + EDUCATION] < start[set + EDUCATION]) settings[set + EDUCATION] += 1;
    else if (settings[set + MILITARY] < start[set + MILITARY]) settings[set + MILITARY] += 1;
    else if (settings[set + ADMINISTRATION] < start[set + ADMINISTRATION])
      settings[set + ADMINISTRATION] += 1;
    else if (settings[set + TAXES] > start[set + TAXES]) settings[set + TAXES] -= 1;
    else return;
    changed = true;
  }
  if (changed) budget.cooldown[c] = rules.cooldownWeeks;
}

/** The budget system (tick slot `budget`): every day the tariffs; on Mondays then the week. */
export const budgetSystem: SimSystem = {
  daily(state) {
    const { budget, trade } = state;
    for (let c = 0; c < budget.countryCount; c++) budget.weekTariffs[c] += trade.tariffIncome[c];
    budget.weekDays += 1;
    if (state.isWeeklyTickDay) budgetWeek(state);
  },
};

/** Sets one of a country's budget levels (`BUDGET_SETTINGS`); takes effect at once. */
export function setBudgetLevel(state: GameState, c: number, setting: number, level: number): void {
  const { budget, market, data } = state;
  budget.settings[c * SETTING_COUNT + setting] = level;
  applyRates(budget, market, data, c);
  applyTraining(budget, state.population, state.provinceOwner, data);
  changed(state);
}

/** The budget changed outside its week: the snapshot sends it again (with the buildings' report). */
function changed(state: GameState): void {
  state.budget.version += 1;
  state.buildings.changes += 1;
}

/** Sets a country's money printing level; takes effect from the next week. */
export function setMoneyPrinting(state: GameState, c: number, level: number): void {
  state.budget.printing[c] = level;
  changed(state);
}

/** Turns a country's automatic budget on or off. */
export function setAutomaticBudget(state: GameState, c: number, on: boolean): void {
  state.budget.automatic[c] = on ? 1 : 0;
  state.budget.cooldown[c] = 0;
  changed(state);
}

/**
 * Diagnostic: brings a country to the edge of a default (its debt just
 * below its credit limit, its treasury empty), so the next deficit makes it
 * default. For tests and the Budget screen's test tool.
 */
export function debugBudgetCrisis(state: GameState, c: number): void {
  const { budget } = state;
  budget.debt[c] = creditLimit(budget, c) * 0.999;
  budget.treasury[c] = 0;
  changed(state);
}

/** Puts a saved budget back (the arrays must be the right length). */
export function restoreBudget(
  budget: BudgetState,
  market: MarketState,
  population: PopulationState,
  provinceOwner: Uint16Array,
  data: GameData,
  saved: BudgetRestore,
): void {
  for (const key of BUDGET_SAVED_ARRAYS) {
    if (saved[key].length !== budget[key].length)
      throw new Error(`Budget: the restored "${key}" does not match the countries`);
    budget[key].set(saved[key]);
  }
  for (const key of BUDGET_SAVED_TAX_ARRAYS) {
    if (saved[key].length !== market.taxes[key].length)
      throw new Error(`Budget: the restored "${key}" does not match the countries`);
    market.taxes[key].set(saved[key]);
  }
  budget.weekDays = saved.weekDays;
  budget.historyCount = 0;
  budget.historyNext = 0;
  for (let c = 0; c < budget.countryCount; c++) applyRates(budget, market, data, c);
  applyTraining(budget, population, provinceOwner, data);
  budget.version += 1;
}

/** Writes the standard of living each country loses (after a load: what the last week set). */
export function applyBudgetLiving(state: GameState): void {
  const { budget, data, population } = state;
  for (let c = 0; c < budget.countryCount; c++) {
    let living = inflationLiving(data, budget.inflation[c]);
    const since = budget.defaultDay[c];
    if (since >= 0 && state.day < since + data.budget.default.livingYears * DAYS_PER_YEAR)
      living += data.budget.default.living;
    population.countryLivingPenalty[c] = living;
  }
  population.reportOwnershipVersion = -1;
}
