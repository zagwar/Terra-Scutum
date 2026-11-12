import {
  type WorldMap,
  countryNameKey,
  provinceNameKey,
  summarizeCountry,
} from '@terra-scutum/sim';
import { formatArea, t, tKey } from './i18n';

export interface CountryPanelProps {
  readonly world: WorldMap;
  /** The country (index) that owns each province right now. */
  readonly provinceOwner: Uint16Array;
  /** Index of the country to show. */
  readonly country: number;
  readonly onSelectCountry: (country: number | null) => void;
  readonly onSelectProvince: (province: number) => void;
}

/**
 * The country panel (F02): name, map color, capital, and what the country
 * holds right now (provinces, area, neighbors), worked out from the current
 * owners. Government, economy and diplomacy join it with their features.
 */
export function CountryPanel({
  world,
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
        <dt>{t('COUNTRY_PANEL_PROVINCES')}</dt>
        <dd data-testid="country-provinces">{summary.provinces.length.toLocaleString('en')}</dd>
        <dt>{t('COUNTRY_PANEL_AREA')}</dt>
        <dd data-testid="country-area">{formatArea(summary.areaKm2)}</dd>
      </dl>

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
