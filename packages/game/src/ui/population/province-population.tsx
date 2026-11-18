import type { PopsConfig, PopulationSnapshot } from '@terra-scutum/sim';
import { Missing } from '../country-screen/parts';
import { formatDensity, t } from '../i18n';
import { at } from '../shell/catalog';
import { PopTable, PopulationFacts } from './population-parts';
import { provincePops, provinceSummary } from './population-view';

/**
 * The province panel's population part (F06, section 8.1): the province's
 * people, its workforce and dependents, unemployment, the standard of
 * living, and its pops.
 */
export function ProvincePopulation({
  population,
  pops,
  province,
  areaKm2,
}: {
  readonly population: PopulationSnapshot;
  readonly pops: PopsConfig;
  readonly province: number;
  readonly areaKm2: number;
}) {
  const summary = provinceSummary(population, province);
  return (
    <div className="province-population" data-testid="province-population">
      <h3 className="list-title">{t('POPULATION_TITLE')}</h3>
      <PopulationFacts summary={summary} testId="province" />
      <dl className="facts">
        <dt>{t('POPULATION_DENSITY')}</dt>
        <dd data-testid="province-density">
          {formatDensity(areaKm2 > 0 ? summary.people / areaKm2 : 0)}
        </dd>
        <dt>{t('POPULATION_REFUGEES')}</dt>
        <dd>
          <Missing label={t('POPULATION_REFUGEES')} comesWith={at('F33', 'M9')} />
        </dd>
      </dl>
      <PopTable rows={provincePops(population, province)} pops={pops} testId="province-pops" />
    </div>
  );
}
