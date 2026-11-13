import {
  type WorldMap,
  isCoastZone,
  neighborsOf,
  provinceNameKey,
  seaZoneNameKey,
} from '@terra-scutum/sim';
import { t, tKey } from './i18n';
import { LinkList } from './link-list';

export interface SeaZonePanelProps {
  readonly world: WorldMap;
  /** Index of the sea zone to show. */
  readonly seaZone: number;
  readonly onSelectSeaZone: (seaZone: number | null) => void;
  readonly onSelectProvince: (province: number) => void;
}

/**
 * The sea zone panel (F70): name, type (coast zone or open sea), depth, the
 * sea zones it borders and its coastal provinces. It takes the province panel's place: one of the two is
 * shown at a time. Naval units, trade routes and seabed infestation join it
 * with their features.
 */
export function SeaZonePanel({
  world,
  seaZone,
  onSelectSeaZone,
  onSelectProvince,
}: SeaZonePanelProps) {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const seaZoneName = (index: number) => tKey(seaZoneNameKey(world.seaZoneIds[index]));
  const neighbors = Array.from(neighborsOf(world.seaZoneNeighbors, seaZone), (index) => ({
    index,
    name: seaZoneName(index),
  })).sort(byName);
  const coasts = Array.from(neighborsOf(world.seaZoneProvinces, seaZone), (index) => ({
    index,
    name: tKey(provinceNameKey(world.provinceIds[index])),
  })).sort(byName);

  return (
    <section className="panel province-panel" data-testid="sea-zone-panel">
      <div className="province-panel-header">
        <h2 className="province-panel-name" data-testid="sea-zone-name">
          {seaZoneName(seaZone)}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('PANEL_CLOSE')}
          title={t('PANEL_CLOSE')}
          data-testid="sea-zone-close"
          onClick={() => onSelectSeaZone(null)}
        >
          ×
        </button>
      </div>
      <dl className="facts">
        <dt>{t('SEA_ZONE_PANEL_TYPE')}</dt>
        <dd data-testid="sea-zone-type">
          {t(isCoastZone(world, seaZone) ? 'SEA_ZONE_TYPE_COAST' : 'SEA_ZONE_TYPE_SEA')}
        </dd>
        <dt>{t('SEA_ZONE_PANEL_DEPTH')}</dt>
        <dd data-testid="sea-zone-depth">
          {t(world.seaZoneDeep[seaZone] ? 'SEA_ZONE_DEPTH_DEEP' : 'SEA_ZONE_DEPTH_SHALLOW')}
        </dd>
      </dl>

      <h3 className="list-title">{t('SEA_ZONE_PANEL_NEIGHBORS', { count: neighbors.length })}</h3>
      <LinkList items={neighbors} testId="sea-zone-neighbors" onSelect={onSelectSeaZone} />

      <h3 className="list-title">{t('SEA_ZONE_PANEL_COASTS', { count: coasts.length })}</h3>
      <LinkList items={coasts} testId="sea-zone-coasts" onSelect={onSelectProvince} />
    </section>
  );
}
