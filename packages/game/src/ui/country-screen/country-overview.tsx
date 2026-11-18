import {
  type CountryStartTable,
  type PopsConfig,
  type PopulationSnapshot,
  type WorldMap,
  countryNameKey,
  provinceNameKey,
  summarizeCountry,
} from '@terra-scutum/sim';
import {
  formatArea,
  formatMoney,
  formatMoneyMillions,
  formatPercent,
  formatPopulation,
  t,
  tKey,
} from '../i18n';
import { standardOfLivingHint } from '../population/population-parts';
import { countrySummary } from '../population/population-view';
import { COUNTRY_SCREEN_COMES_WITH } from './country-screen-catalog';
import { Missing, Section } from './parts';

/**
 * The country screen's overview (both views): the facts of the old country
 * panel (F02, F71): capital, population, GDP, provinces, area and neighbors,
 * worked out from the current owners, plus military strength once it exists.
 * Since F06 the population is the living one (with unemployment and the
 * standard of living); GDP is still the real-world starting figure.
 */
export function CountryOverview({
  world,
  countryStart,
  provinceOwner,
  population: living,
  pops,
  country,
  onSelectCountry,
  onSelectProvince,
}: {
  readonly world: WorldMap;
  readonly countryStart: CountryStartTable;
  readonly provinceOwner: Uint16Array;
  /** The population (F06) and the pop groups; null until the sim has sent them. */
  readonly population: PopulationSnapshot | null;
  readonly pops: PopsConfig | null;
  readonly country: number;
  readonly onSelectCountry: (country: number) => void;
  readonly onSelectProvince: (province: number) => void;
}) {
  const summary = summarizeCountry(world, provinceOwner, country);
  const neighbors = summary.neighbors
    .map((index) => ({ index, name: tKey(countryNameKey(world.countryIds[index])) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const capital = world.countryCapital[country];
  const people = living ? countrySummary(living, country) : null;
  // GDP per person stays the real-world starting figure until the economy is simulated (F65).
  const startPopulation = countryStart.population[country];
  const population = people ? people.people : startPopulation;
  const gdpMillionUsd = countryStart.gdpMillionUsd[country];

  return (
    <Section title={t('COUNTRY_SCREEN_OVERVIEW')} testId="country-overview">
      <div className="cs-overview">
        <dl className="facts">
          <dt>{t('COUNTRY_PANEL_CAPITAL')}</dt>
          <dd>
            <button
              type="button"
              className="link-button"
              data-testid="country-capital"
              onClick={() => onSelectProvince(capital)}
            >
              {tKey(provinceNameKey(world.provinceIds[capital]))}
            </button>
          </dd>
          <dt>{t('COUNTRY_PANEL_POPULATION')}</dt>
          <dd data-testid="country-population">{formatPopulation(population)}</dd>
          <dt title={t('COUNTRY_PANEL_GDP_TOOLTIP')}>{t('COUNTRY_PANEL_GDP')}</dt>
          <dd data-testid="country-gdp">{formatMoneyMillions(gdpMillionUsd)}</dd>
          <dt>{t('COUNTRY_PANEL_GDP_PER_PERSON')}</dt>
          <dd data-testid="country-gdp-per-person">
            {formatMoney((gdpMillionUsd * 1e6) / startPopulation)}
          </dd>
          {people && pops && (
            <>
              <dt>{t('POPULATION_UNEMPLOYMENT')}</dt>
              <dd data-testid="country-unemployment">{formatPercent(people.unemployment)}</dd>
              <dt title={standardOfLivingHint()}>{t('POPULATION_STANDARD_OF_LIVING')}</dt>
              <dd data-testid="country-living">
                {t('POPULATION_SCORE', { value: Math.round(people.standardOfLiving) })}
              </dd>
            </>
          )}
        </dl>
        <dl className="facts">
          <dt>{t('COUNTRY_PANEL_PROVINCES')}</dt>
          <dd data-testid="country-provinces">{summary.provinces.length.toLocaleString('en')}</dd>
          <dt>{t('COUNTRY_PANEL_AREA')}</dt>
          <dd data-testid="country-area">{formatArea(summary.areaKm2)}</dd>
          <dt>{t('COUNTRY_SCREEN_MILITARY_STRENGTH')}</dt>
          <dd>
            <Missing
              label={t('COUNTRY_SCREEN_MILITARY_STRENGTH')}
              comesWith={COUNTRY_SCREEN_COMES_WITH.militaryStrength}
              testId="country-military-strength"
            />
          </dd>
        </dl>
      </div>
      <p className="panel-note">{t('COUNTRY_PANEL_SOURCE', { year: countryStart.year })}</p>

      <h4 className="list-title">{t('COUNTRY_PANEL_NEIGHBORS', { count: neighbors.length })}</h4>
      {neighbors.length === 0 ? (
        <p className="list-empty">{t('PANEL_NONE')}</p>
      ) : (
        <ul className="link-list cs-neighbors" data-testid="country-neighbors">
          {neighbors.map(({ index, name }) => (
            <li key={index}>
              <button type="button" className="link-button" onClick={() => onSelectCountry(index)}>
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
