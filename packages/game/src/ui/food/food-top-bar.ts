import type { AppState } from '../../app-store';
import { formatAmount, formatPercent, t, tKey } from '../i18n';
import type { TopBarValue } from '../shell/top-bar';
import { countryFood, reserveDaysText, reserveTone } from './food-view';

/**
 * The top bar's Food number (F08): the player's food reserves in days,
 * green while fine, yellow when low, red in a shortage or a famine; its
 * tooltip says how the country is fed. Null until the sim has sent food.
 */
export function foodTopBarValue(state: AppState): TopBarValue | null {
  const { food, buildings, playerCountry } = state;
  if (!food || !buildings || playerCountry === null) return null;
  const summary = countryFood(food, buildings, playerCountry, true);
  const lines = [
    tKey(`FOOD_MOOD_${summary.mood.toUpperCase()}`),
    t('TOP_BAR_FOOD_RESERVES', {
      days: reserveDaysText(summary.reserveDays),
      amount: formatAmount(summary.reserveTonnes, 't'),
    }),
    t('TOP_BAR_FOOD_SECURITY', {
      security: formatPercent(summary.security, 0),
      starving: formatPercent(summary.starving),
    }),
    t('TOP_BAR_FOOD_RATIONING', {
      level: tKey(`FOOD_RATIONING_${summary.rationing.toUpperCase()}`),
    }),
  ];
  if (summary.famines > 0) lines.push(t('TOP_BAR_FOOD_FAMINES', { count: summary.famines }));
  lines.push(t('TOP_BAR_FOOD_HINT'));
  return {
    text: t('TOP_BAR_FOOD_DAYS', { days: reserveDaysText(summary.reserveDays) }),
    tone: reserveTone(summary),
    lines,
  };
}
