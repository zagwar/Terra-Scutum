import type { AppState } from '../../app-store';
import { formatMoneyShort, formatMoneySigned, formatPercent, t, tKey } from '../i18n';
import type { TopBarValue } from '../shell/top-bar';
import { budgetTone, countryBudget } from './budget-view';

/**
 * The top bar's Treasury number (F09): the player's treasury and, in
 * brackets, last week's balance; yellow in a deficit, red near the credit
 * limit or in default. Its tooltip sums up the budget. Null until the sim
 * has sent the budget.
 */
export function budgetTopBarValue(state: AppState): TopBarValue | null {
  const { budget, playerCountry } = state;
  if (!budget || playerCountry === null) return null;
  const summary = countryBudget(budget, playerCountry);
  const lines = [
    tKey(`BUDGET_MOOD_${summary.mood.toUpperCase()}`),
    t('TOP_BAR_TREASURY_WEEK', {
      income: formatMoneyShort(summary.income),
      spending: formatMoneyShort(summary.spending),
    }),
    t('TOP_BAR_TREASURY_DEBT', {
      debt: formatMoneyShort(summary.debt),
      share: formatPercent(summary.debtShare, 0),
      used: formatPercent(summary.used, 0),
      rating: summary.rating,
    }),
    t('TOP_BAR_TREASURY_RATES', {
      interest: formatPercent(summary.interestRate),
      inflation: formatPercent(summary.inflation),
    }),
    t('TOP_BAR_TREASURY_OPEN'),
  ];
  return {
    text: t('TOP_BAR_TREASURY_VALUE', {
      treasury: formatMoneyShort(summary.treasury),
      balance: formatMoneySigned(summary.balance),
    }),
    tone: budgetTone(summary),
    lines,
  };
}
