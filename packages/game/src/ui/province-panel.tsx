import {
  type WorldMap,
  countryNameKey,
  neighborsOf,
  provinceNameKey,
  regionNameKey,
  seaZoneNameKey,
} from '@terra-scutum/sim';
import { formatArea, t, tKey } from './i18n';

export interface ProvincePanelProps {
  readonly world: WorldMap;
  /** The country (index) that owns each province right now. */
  readonly provinceOwner: Uint16Array;
  /** Index of the province to show. */
  readonly province: number;
  readonly onSelectProvince: (province: number | null) => void;
  /** Opens a country's panel. */
  readonly onSelectCountry: (country: number) => void;
}

/**
 * The province info panel (F01): name, country, region and what the province
 * borders. Population, buildings and construction join it with their features.
 * The country is the province's current owner (F02); clicking it opens the country panel.
 */
export function ProvincePanel({
  world,
  provinceOwner,
  province,
  onSelectProvince,
  onSelectCountry,
}: ProvincePanelProps) {
  const owner = provinceOwner[province];
  const provinceName = (index: number) => tKey(provinceNameKey(world.provinceIds[index]));
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const neighbors = Array.from(neighborsOf(world.provinceNeighbors, province), (index) => ({
    index,
    name: provinceName(index),
  })).sort(byName);
  const seaZones = Array.from(neighborsOf(world.provinceSeaZones, province), (index) =>
    tKey(seaZoneNameKey(world.seaZoneIds[index])),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <section className="panel province-panel" data-testid="province-panel">
      <div className="province-panel-header">
        <h2 className="province-panel-name" data-testid="province-name">
          {provinceName(province)}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('PANEL_CLOSE')}
          title={t('PANEL_CLOSE')}
          data-testid="province-close"
          onClick={() => onSelectProvince(null)}
        >
          ×
        </button>
      </div>
      <dl className="facts">
        <dt>{t('PROVINCE_PANEL_COUNTRY')}</dt>
        <dd>
          <button
            type="button"
            className="link-button"
            title={t('PROVINCE_PANEL_COUNTRY_HINT')}
            data-testid="province-country"
            onClick={() => onSelectCountry(owner)}
          >
            {tKey(countryNameKey(world.countryIds[owner]))}
          </button>
        </dd>
        <dt>{t('PROVINCE_PANEL_REGION')}</dt>
        <dd data-testid="province-region">
          {tKey(regionNameKey(world.regionIds[world.provinceRegion[province]]))}
        </dd>
        <dt>{t('PROVINCE_PANEL_AREA')}</dt>
        <dd data-testid="province-area">{formatArea(world.provinceAreaKm2[province])}</dd>
      </dl>

      <h3 className="list-title">{t('PROVINCE_PANEL_NEIGHBORS', { count: neighbors.length })}</h3>
      {neighbors.length === 0 ? (
        <p className="list-empty">{t('PANEL_NONE')}</p>
      ) : (
        <ul className="link-list" data-testid="province-neighbors">
          {neighbors.map(({ index, name }) => (
            <li key={index}>
              <button type="button" className="link-button" onClick={() => onSelectProvince(index)}>
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="list-title">{t('PROVINCE_PANEL_SEA_ZONES', { count: seaZones.length })}</h3>
      <p
        className={seaZones.length === 0 ? 'list-empty' : 'list-text'}
        data-testid="province-sea-zones"
      >
        {seaZones.length === 0 ? t('PANEL_NONE') : seaZones.join(', ')}
      </p>
    </section>
  );
}
