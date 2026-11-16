import {
  type PopsConfig,
  type PopulationSnapshot,
  type WorldMap,
  countryNameKey,
  neighborsOf,
  provinceNameKey,
  regionNameKey,
  seaZoneNameKey,
} from '@terra-scutum/sim';
import { formatArea, t, tKey } from './i18n';
import { LinkList } from './link-list';
import { ProvincePopulation } from './population/province-population';
import { PanelHeader, type PanelNav } from './shell/panel-header';

export interface ProvincePanelProps {
  readonly world: WorldMap;
  /** The country (index) that owns each province right now. */
  readonly provinceOwner: Uint16Array;
  /** The population (F06) and the pop groups; null until the sim has sent them. */
  readonly population: PopulationSnapshot | null;
  readonly pops: PopsConfig | null;
  /** Index of the province to show. */
  readonly province: number;
  readonly nav: PanelNav;
  readonly onSelectProvince: (province: number) => void;
  /** Selects a sea zone (shows its panel instead of this one). */
  readonly onSelectSeaZone: (seaZone: number) => void;
  /** Opens a country's panel. */
  readonly onSelectCountry: (country: number) => void;
  /** Opens a region's panel. */
  readonly onSelectRegion: (region: number) => void;
}

/**
 * The province info panel (F01): name, country, region and what the province
 * borders, and its population (F06). Buildings and construction join it with
 * their features.
 * The country is the province's current owner (F02); clicking it opens the country panel.
 * Clicking a bordering sea zone shows that sea zone (F70); the region's name
 * opens the region panel (F122).
 */
export function ProvincePanel({
  world,
  provinceOwner,
  population,
  pops,
  province,
  nav,
  onSelectProvince,
  onSelectSeaZone,
  onSelectCountry,
  onSelectRegion,
}: ProvincePanelProps) {
  const region = world.provinceRegion[province];
  const owner = provinceOwner[province];
  const provinceName = (index: number) => tKey(provinceNameKey(world.provinceIds[index]));
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const neighbors = Array.from(neighborsOf(world.provinceNeighbors, province), (index) => ({
    index,
    name: provinceName(index),
  })).sort(byName);
  const seaZones = Array.from(neighborsOf(world.provinceSeaZones, province), (index) => ({
    index,
    name: tKey(seaZoneNameKey(world.seaZoneIds[index])),
  })).sort(byName);

  return (
    <section className="panel info-panel" data-testid="province-panel">
      <PanelHeader
        nav={nav}
        title={provinceName(province)}
        titleTestId="province-name"
        closeTestId="province-close"
      />
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
        <dd>
          <button
            type="button"
            className="link-button"
            title={t('PROVINCE_PANEL_REGION_HINT')}
            data-testid="province-region"
            onClick={() => onSelectRegion(region)}
          >
            {tKey(regionNameKey(world.regionIds[region]))}
          </button>
        </dd>
        <dt>{t('PROVINCE_PANEL_AREA')}</dt>
        <dd data-testid="province-area">{formatArea(world.provinceAreaKm2[province])}</dd>
      </dl>

      {population && pops && (
        <ProvincePopulation
          population={population}
          pops={pops}
          province={province}
          areaKm2={world.provinceAreaKm2[province]}
        />
      )}

      <h3 className="list-title">{t('PROVINCE_PANEL_NEIGHBORS', { count: neighbors.length })}</h3>
      <LinkList items={neighbors} testId="province-neighbors" onSelect={onSelectProvince} />

      <h3 className="list-title">{t('PROVINCE_PANEL_SEA_ZONES', { count: seaZones.length })}</h3>
      <LinkList items={seaZones} testId="province-sea-zones" onSelect={onSelectSeaZone} />
    </section>
  );
}
