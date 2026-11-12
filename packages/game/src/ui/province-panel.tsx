import {
  type WorldMap,
  countryNameKey,
  neighborsOf,
  provinceNameKey,
  regionNameKey,
  seaZoneNameKey,
} from '@terra-scutum/sim';
import { t, tKey } from './i18n';

export interface ProvincePanelProps {
  readonly world: WorldMap;
  /** Index of the province to show. */
  readonly province: number;
  readonly onSelectProvince: (province: number | null) => void;
}

/**
 * The province info panel (F01): name, country, region and what the province
 * borders. Population, buildings and construction join it with their features.
 * The country shown is the starting owner until ownership arrives with F02.
 */
export function ProvincePanel({ world, province, onSelectProvince }: ProvincePanelProps) {
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
          aria-label={t('PROVINCE_PANEL_CLOSE')}
          title={t('PROVINCE_PANEL_CLOSE')}
          data-testid="province-close"
          onClick={() => onSelectProvince(null)}
        >
          ×
        </button>
      </div>
      <dl className="facts">
        <dt>{t('PROVINCE_PANEL_COUNTRY')}</dt>
        <dd data-testid="province-country">
          {tKey(countryNameKey(world.countryIds[world.provinceCountry[province]]))}
        </dd>
        <dt>{t('PROVINCE_PANEL_REGION')}</dt>
        <dd data-testid="province-region">
          {tKey(regionNameKey(world.regionIds[world.provinceRegion[province]]))}
        </dd>
        <dt>{t('PROVINCE_PANEL_AREA')}</dt>
        <dd>
          {t('PROVINCE_PANEL_AREA_VALUE', {
            area: Math.round(world.provinceAreaKm2[province]).toLocaleString('en'),
          })}
        </dd>
      </dl>

      <h3 className="list-title">{t('PROVINCE_PANEL_NEIGHBORS', { count: neighbors.length })}</h3>
      {neighbors.length === 0 ? (
        <p className="list-empty">{t('PROVINCE_PANEL_NONE')}</p>
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
        {seaZones.length === 0 ? t('PROVINCE_PANEL_NONE') : seaZones.join(', ')}
      </p>
    </section>
  );
}
