import {
  type WorldMap,
  countryNameKey,
  neighborsOf,
  provinceNameKey,
  regionNameKey,
} from '@terra-scutum/sim';
import { formatArea, t, tKey } from './i18n';
import { LinkList } from './link-list';
import { PanelHeader, type PanelNav } from './shell/panel-header';

export interface RegionPanelProps {
  readonly world: WorldMap;
  /** The country (index) that owns each province right now. */
  readonly provinceOwner: Uint16Array;
  /** Index of the region to show. */
  readonly region: number;
  readonly nav: PanelNav;
  readonly onSelectRegion: (region: number) => void;
  readonly onSelectCountry: (country: number) => void;
  readonly onSelectProvince: (province: number) => void;
}

/**
 * The region panel (promised by F64, built in F122): name, climate, area, the
 * countries holding land in it right now, its provinces and the regions it
 * borders. A region holds at most one hive (section 4); the hive line shows
 * which feature brings it. Weather (F54) joins it later.
 */
export function RegionPanel({
  world,
  provinceOwner,
  region,
  nav,
  onSelectRegion,
  onSelectCountry,
  onSelectProvince,
}: RegionPanelProps) {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const provinces = Array.from(neighborsOf(world.regionProvinces, region));
  let areaKm2 = 0;
  const countries = new Set<number>();
  const bordering = new Set<number>();
  for (const province of provinces) {
    areaKm2 += world.provinceAreaKm2[province];
    countries.add(provinceOwner[province]);
    for (const neighbor of neighborsOf(world.provinceNeighbors, province)) {
      const other = world.provinceRegion[neighbor];
      if (other !== region) bordering.add(other);
    }
  }
  const list = (indices: Iterable<number>, name: (index: number) => string) =>
    Array.from(indices, (index) => ({ index, name: name(index) })).sort(byName);

  const countryItems = list(countries, (i) => tKey(countryNameKey(world.countryIds[i])));
  const provinceItems = list(provinces, (i) => tKey(provinceNameKey(world.provinceIds[i])));
  const regionItems = list(bordering, (i) => tKey(regionNameKey(world.regionIds[i])));

  return (
    <section className="panel info-panel" data-testid="region-panel">
      <PanelHeader
        nav={nav}
        title={
          <>
            <span
              className="country-color"
              style={{ backgroundColor: world.regionMapColor[region] }}
              aria-hidden="true"
            />
            {tKey(regionNameKey(world.regionIds[region]))}
          </>
        }
        titleTestId="region-name"
        closeTestId="region-close"
      />
      <dl className="facts">
        <dt>{t('REGION_PANEL_CLIMATE')}</dt>
        <dd data-testid="region-climate">
          {tKey(`CLIMATE_${world.regionClimate[region].toUpperCase()}`)}
        </dd>
        <dt>{t('REGION_PANEL_AREA')}</dt>
        <dd data-testid="region-area">{formatArea(areaKm2)}</dd>
        <dt>{t('REGION_PANEL_HIVE')}</dt>
        <dd className="is-missing" data-testid="region-hive">
          {t('SHELL_COMES_WITH_FEATURE', { feature: 'F26' })}
        </dd>
      </dl>

      <h3 className="list-title">{t('REGION_PANEL_COUNTRIES', { count: countryItems.length })}</h3>
      <LinkList items={countryItems} testId="region-countries" onSelect={onSelectCountry} />

      <h3 className="list-title">{t('REGION_PANEL_PROVINCES', { count: provinceItems.length })}</h3>
      <LinkList items={provinceItems} testId="region-provinces" onSelect={onSelectProvince} />

      <h3 className="list-title">{t('REGION_PANEL_NEIGHBORS', { count: regionItems.length })}</h3>
      <LinkList items={regionItems} testId="region-neighbors" onSelect={onSelectRegion} />
    </section>
  );
}
