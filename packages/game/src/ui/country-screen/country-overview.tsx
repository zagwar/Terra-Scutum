import {
  type CountryStartTable,
  type WorldMap,
  countryNameKey,
  provinceNameKey,
  summarizeCountry,
} from '@terra-scutum/sim';
import { formatArea, formatMoney, formatMoneyMillions, formatPopulation, t, tKey } from '../i18n';
import { COUNTRY_SCREEN_COMES_WITH } from './country-screen-catalog';
import { Missing, Section } from './parts';

/**
 * The country screen's overview (both views): the facts of the old country
 * panel (F02, F71): capital, population, GDP, provinces, area and neighbors,
 * worked out from the current owners, plus military strength once it exists.
 */
export function CountryOverview({
  world,
  countryStart,
  provinceOwner,
  country,
  onSelectCountry,
  onSelectProvince,
}: {
  readonly world: WorldMap;
  readonly countryStart: CountryStartTable;
  readonly provinceOwner: Uint16Array;
  readonly country: number;
  readonly onSelectCountry: (country: number) => void;
  readonly onSelectProvince: (province: number) => void;
}) {
  const summary = summarizeCountry(world, provinceOwner, country);
  const neighbors = summary.neighbors
    .map((index) => ({ index, name: tKey(countryNameKey(world.countryIds[index])) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const capital = world.countryCapital[country];
  const population = countryStart.population[country];
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
            {formatMoney((gdpMillionUsd * 1e6) / population)}
          </dd>
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
