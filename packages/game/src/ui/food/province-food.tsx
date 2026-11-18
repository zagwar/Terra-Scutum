import type { CalendarDate, FoodSnapshot, PopulationSnapshot } from '@terra-scutum/sim';
import { formatDate, formatPercent, formatPopulation, t } from '../i18n';
import { dateOfDay } from './food-screen';
import { provinceFood } from './food-view';

/**
 * The province panel's food part (F08, section 8.5): how well the
 * province's people are fed (food security, Victoria 3 1.8), how many
 * starve, and its famine.
 */
export function ProvinceFood({
  food,
  population,
  province,
  today,
  todayDay,
}: {
  readonly food: FoodSnapshot;
  readonly population: PopulationSnapshot;
  readonly province: number;
  readonly today: CalendarDate;
  readonly todayDay: number;
}) {
  const row = provinceFood(food, population, province);
  return (
    <div className="province-food" data-testid="province-food">
      <h3 className="list-title">{t('FOOD_TITLE')}</h3>
      <dl className="facts">
        <dt title={t('FOOD_SECURITY_HINT')}>{t('FOOD_SECURITY')}</dt>
        <dd data-testid="province-food-security">{formatPercent(row.security, 0)}</dd>
        <dt title={t('FOOD_STARVING_HINT')}>{t('FOOD_STARVING')}</dt>
        <dd
          className={row.starving > 0 ? 'price-dear' : undefined}
          data-testid="province-food-starving"
        >
          {t('FOOD_STARVING_VALUE', {
            starving: formatPercent(row.starving),
            severe: formatPercent(row.severe),
          })}
        </dd>
        {row.famineSince !== null && (
          <>
            <dt title={t('FOOD_FAMINE_HINT')}>{t('FOOD_FAMINE_SINCE')}</dt>
            <dd className="price-dear" data-testid="province-famine">
              {t('FOOD_FAMINE_VALUE', {
                date: formatDate(dateOfDay(row.famineSince, today, todayDay)),
                deaths: formatPopulation(row.deaths),
              })}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
