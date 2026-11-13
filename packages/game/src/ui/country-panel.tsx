import {
  type CountryStartTable,
  type WorldMap,
  countryNameKey,
  governmentTypeNameKey,
  provinceNameKey,
  summarizeCountry,
} from '@terra-scutum/sim';
import { formatArea, formatMoney, formatMoneyMillions, formatPopulation, t, tKey } from './i18n';

export interface CountryPanelProps {
  readonly world: WorldMap;
  /** Each country's real-world starting data (F71). */
  readonly countryStart: CountryStartTable;
  /** The country (index) that owns each province right now. */
  readonly provinceOwner: Uint16Array;
  /** Index of the country to show. */
  readonly country: number;
  readonly onSelectCountry: (country: number | null) => void;
  readonly onSelectProvince: (province: number) => void;
}

/**
 * The country panel (F02): name, map color, government type, capital,
 * population and GDP (real-world starting data, F71), and what the country
 * holds right now (provinces, area, neighbors), worked out from the current
 * owners. The full country screen (F138) replaces it.
 */
export function CountryPanel({
  world,
  countryStart,
  provinceOwner,
  country,
  onSelectCountry,
  onSelectProvince,
}: CountryPanelProps) {
  const countryName = (index: number) => tKey(countryNameKey(world.countryIds[index]));
  const summary = summarizeCountry(world, provinceOwner, country);
  const neighbors = summary.neighbors
    .map((index) => ({ index, name: countryName(index) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const capital = world.countryCapital[country];
  const population = countryStart.population[country];
  const gdpMillionUsd = countryStart.gdpMillionUsd[country];

  return (
    <section className="panel country-panel" data-testid="country-panel">
      <div className="province-panel-header">
        <h2 className="province-panel-name" data-testid="country-name">
          <span
            className="country-color"
            style={{ backgroundColor: world.countryMapColor[country] }}
            aria-hidden="true"
          />
          {countryName(country)}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('PANEL_CLOSE')}
          title={t('PANEL_CLOSE')}
          data-testid="country-close"
          onClick={() => onSelectCountry(null)}
        >
          ×
        </button>
      </div>
      <dl className="facts">
        <dt>{t('COUNTRY_PANEL_GOVERNMENT')}</dt>
        <dd data-testid="country-government">
          {tKey(governmentTypeNameKey(countryStart.governmentType[country]))}
        </dd>
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
        <dt>{t('COUNTRY_PANEL_PROVINCES')}</dt>
        <dd data-testid="country-provinces">{summary.provinces.length.toLocaleString('en')}</dd>
        <dt>{t('COUNTRY_PANEL_AREA')}</dt>
        <dd data-testid="country-area">{formatArea(summary.areaKm2)}</dd>
      </dl>
      <p className="panel-note">{t('COUNTRY_PANEL_SOURCE', { year: countryStart.year })}</p>

      <h3 className="list-title">{t('COUNTRY_PANEL_NEIGHBORS', { count: neighbors.length })}</h3>
      {neighbors.length === 0 ? (
        <p className="list-empty">{t('PANEL_NONE')}</p>
      ) : (
        <ul className="link-list" data-testid="country-neighbors">
          {neighbors.map(({ index, name }) => (
            <li key={index}>
              <button type="button" className="link-button" onClick={() => onSelectCountry(index)}>
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
