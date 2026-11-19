import type { BudgetSnapshot } from '@terra-scutum/sim';

/**
 * Reads the budget snapshot (F09) for the Budget screen, the top bar and
 * the alerts. Pure code, unit tested.
 */

/** How a country's budget is doing, worst first: in default, near its credit limit, in deficit, fine. */
export type BudgetMood = 'default' | 'near_limit' | 'deficit' | 'fine';

export interface BudgetSummary {
  readonly mood: BudgetMood;
  /** US$: the treasury, last week's income, spending and balance, the debt, the credit limit, GDP a year. */
  readonly treasury: number;
  readonly income: number;
  readonly spending: number;
  readonly balance: number;
  readonly debt: number;
  readonly creditLimit: number;
  readonly gdp: number;
  /** The share of the credit limit used; debt as a share of GDP. */
  readonly used: number;
  readonly debtShare: number;
  /** Its credit rating (id), interest rate and inflation (a share a year). */
  readonly rating: string;
  readonly interestRate: number;
  readonly inflation: number;
  /** The share of its spending it can pay (1 unless it can't borrow after a default). */
  readonly spendingCut: number;
  readonly defaults: number;
  /** Its real 2025 revenue and spending as shares of GDP. */
  readonly realRevenueShare: number;
  readonly realSpendingShare: number;
  /** Its levels by setting id; its money printing level; whether its budget runs itself. */
  readonly settings: Readonly<Record<string, string>>;
  readonly printing: string;
  readonly automatic: boolean;
}

/** A country's budget. */
export function countryBudget(budget: BudgetSnapshot, country: number): BudgetSummary {
  const lineCount = budget.lineIds.length;
  let income = 0;
  let spending = 0;
  for (let l = 0; l < lineCount; l++) {
    const amount = budget.lines[country * lineCount + l];
    if (l < budget.incomeLineCount) income += amount;
    else spending += amount;
  }
  const limit = budget.creditLimit[country];
  const debt = budget.debt[country];
  const used = limit > 0 ? debt / limit : 0;
  const gdp = budget.gdp[country];
  const balance = income - spending;
  const mood: BudgetMood =
    budget.defaulted[country] === 1
      ? 'default'
      : used >= budget.nearLimit
        ? 'near_limit'
        : balance < 0
          ? 'deficit'
          : 'fine';
  const settings: Record<string, string> = {};
  budget.settingIds.forEach((id, s) => {
    settings[id] = budget.levels[budget.settings[country * budget.settingIds.length + s]];
  });
  return {
    mood,
    treasury: budget.treasury[country],
    income,
    spending,
    balance,
    debt,
    creditLimit: limit,
    gdp,
    used,
    debtShare: gdp > 0 ? debt / gdp : 0,
    rating: budget.ratings[budget.rating[country]],
    interestRate: budget.interestRate[country],
    inflation: budget.inflation[country],
    spendingCut: budget.spendingCut[country],
    defaults: budget.defaults[country],
    realRevenueShare: budget.realRevenueShare[country],
    realSpendingShare: budget.realSpendingShare[country],
    settings,
    printing: budget.printingLevels[budget.printing[country]],
    automatic: budget.automatic[country] === 1,
  };
}

/** One budget line of a country: its amount last week and as a share of GDP a year. */
export interface BudgetLineRow {
  readonly id: string;
  readonly income: boolean;
  /** US$ last week. */
  readonly amount: number;
  /** A year's worth as a share of GDP. */
  readonly shareOfGdp: number;
  /** The setting that changes it (taxes for the taxes, a spending line's own), or null. */
  readonly setting: string | null;
}

/** The setting each line follows (the taxes and other revenue follow the tax level). */
const LINE_SETTING: Readonly<Record<string, string>> = {
  income_tax: 'taxes',
  dividends_tax: 'taxes',
  consumption_tax: 'taxes',
  other_revenue: 'taxes',
  administration: 'administration',
  military: 'military',
  welfare: 'welfare',
  education: 'education',
};

/** A country's budget lines, income first. */
export function budgetLines(budget: BudgetSnapshot, country: number): BudgetLineRow[] {
  const lineCount = budget.lineIds.length;
  const gdp = budget.gdp[country];
  return budget.lineIds.map((id, l) => {
    const amount = budget.lines[country * lineCount + l];
    return {
      id,
      income: l < budget.incomeLineCount,
      amount,
      shareOfGdp: gdp > 0 ? (amount * 52) / gdp : 0,
      setting: LINE_SETTING[id] ?? null,
    };
  });
}

/** The tone a budget shows in: fine, a warning (a deficit), bad (near the limit or in default). */
export function budgetTone(summary: BudgetSummary): 'ok' | 'warn' | 'bad' {
  if (summary.mood === 'default' || summary.mood === 'near_limit') return 'bad';
  return summary.mood === 'deficit' ? 'warn' : 'ok';
}

/** The countries with the biggest debts as a share of GDP (for the Budget screen's world list). */
export function worldDebts(budget: BudgetSnapshot, count: number): number[] {
  const order = Array.from(budget.debt, (_, c) => c).filter((c) => budget.gdp[c] > 0);
  order.sort((a, b) => budget.debt[b] / budget.gdp[b] - budget.debt[a] / budget.gdp[a] || a - b);
  return order.slice(0, count);
}

/** Points for the balance line: the weeks left to right, zero in the middle. */
export function balancePoints(history: Float32Array, width: number, height: number): string {
  if (history.length === 0) return '';
  let most = 0;
  for (const value of history) most = Math.max(most, Math.abs(value));
  if (most === 0) most = 1;
  const step = history.length > 1 ? width / (history.length - 1) : 0;
  return Array.from(history, (value, i) => {
    const x = i * step;
    const y = height / 2 - (value / most) * (height / 2 - 1);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}
