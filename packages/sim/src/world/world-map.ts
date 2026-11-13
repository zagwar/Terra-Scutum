import type { GameData } from '../data/game-data';
import type { Climate } from './world-data';

/**
 * Fast lookups over the map, built once when a campaign starts. Systems use
 * these numeric indices and typed arrays in their hot loops instead of string
 * ids. Everything is sorted by id, so indices are the same on every machine.
 */

/** Lists of neighbors stored flat: the neighbors of item i are `targets[offsets[i]]` … `targets[offsets[i + 1] - 1]`. */
export interface Adjacency {
  readonly offsets: Int32Array;
  readonly targets: Int32Array;
}

export interface WorldMap {
  readonly provinceIds: readonly string[];
  readonly countryIds: readonly string[];
  readonly regionIds: readonly string[];
  readonly seaZoneIds: readonly string[];
  readonly provinceIndex: ReadonlyMap<string, number>;
  readonly countryIndex: ReadonlyMap<string, number>;
  readonly regionIndex: ReadonlyMap<string, number>;
  readonly seaZoneIndex: ReadonlyMap<string, number>;
  /**
   * STARTING owner (country index) of each province. Ownership changes during a
   * campaign: the current owner is `GameState.provinceOwner` (in the game: the snapshot).
   */
  readonly provinceCountry: Uint16Array;
  readonly provinceRegion: Uint16Array;
  readonly provinceAreaKm2: Float32Array;
  /** 1 for a deep sea zone, 0 for a shallow one. */
  readonly seaZoneDeep: Uint8Array;
  /** 1 for a coast zone (the water along a shore), 0 for an open-sea zone. */
  readonly seaZoneCoast: Uint8Array;
  /** Each sea zone's label point: longitude and latitude, two numbers per sea zone. */
  readonly seaZoneCenter: Float32Array;
  readonly provinceNeighbors: Adjacency;
  readonly provinceSeaZones: Adjacency;
  readonly seaZoneNeighbors: Adjacency;
  /** Coastal provinces of each sea zone. */
  readonly seaZoneProvinces: Adjacency;
  /** The provinces each country owns at the START of the campaign (see `provinceCountry`). */
  readonly countryProvinces: Adjacency;
  readonly regionProvinces: Adjacency;
  /** The province (index) holding each country's capital at the start of the campaign. */
  readonly countryCapital: Int32Array;
  /** Each country's color on the political map, as #rrggbb. */
  readonly countryMapColor: readonly string[];
  /** Each region's color in the regions map mode, as #rrggbb. */
  readonly regionMapColor: readonly string[];
  /** Each region's climate (section 4.1). */
  readonly regionClimate: readonly Climate[];
}

/** True for a coast zone (the water along a shore), false for an open-sea zone. */
export function isCoastZone(world: WorldMap, seaZone: number): boolean {
  return world.seaZoneCoast[seaZone] === 1;
}

/** The neighbors of item `index` in an adjacency list. */
export function neighborsOf(adjacency: Adjacency, index: number): Int32Array {
  return adjacency.targets.subarray(adjacency.offsets[index], adjacency.offsets[index + 1]);
}

function buildAdjacency(lists: readonly (readonly number[])[]): Adjacency {
  const offsets = new Int32Array(lists.length + 1);
  lists.forEach((list, i) => (offsets[i + 1] = offsets[i] + list.length));
  const targets = new Int32Array(offsets[lists.length]);
  lists.forEach((list, i) =>
    targets.set(
      [...list].sort((a, b) => a - b),
      offsets[i],
    ),
  );
  return { offsets, targets };
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function indexOf(ids: readonly string[]): Map<string, number> {
  return new Map(ids.map((id, i) => [id, i]));
}

function lookup(map: ReadonlyMap<string, number>, id: string, what: string): number {
  const index = map.get(id);
  if (index === undefined) throw new Error(`World map: unknown ${what} "${id}"`);
  return index;
}

export function buildWorldMap(data: GameData): WorldMap {
  const provinces = [...data.provinces.provinces].sort((a, b) => byId(a.id, b.id));
  const seaZones = [...data.seaZones.seaZones].sort((a, b) => byId(a.id, b.id));
  const provinceIds = provinces.map((p) => p.id);
  const countryIds = data.countries.countries.map((c) => c.id).sort(byId);
  const regionIds = data.regions.regions.map((r) => r.id).sort(byId);
  const seaZoneIds = seaZones.map((s) => s.id);
  const provinceIndex = indexOf(provinceIds);
  const countryIndex = indexOf(countryIds);
  const regionIndex = indexOf(regionIds);
  const seaZoneIndex = indexOf(seaZoneIds);

  const provinceCountry = new Uint16Array(provinces.length);
  const provinceRegion = new Uint16Array(provinces.length);
  const provinceAreaKm2 = new Float32Array(provinces.length);
  const countryProvinces: number[][] = countryIds.map(() => []);
  const regionProvinces: number[][] = regionIds.map(() => []);
  const seaZoneProvinces: number[][] = seaZoneIds.map(() => []);
  provinces.forEach((p, i) => {
    const country = lookup(countryIndex, p.country, 'country');
    const region = lookup(regionIndex, p.region, 'region');
    provinceCountry[i] = country;
    provinceRegion[i] = region;
    provinceAreaKm2[i] = p.areaKm2;
    countryProvinces[country].push(i);
    regionProvinces[region].push(i);
    for (const zone of p.adjacentSeaZones)
      seaZoneProvinces[lookup(seaZoneIndex, zone, 'sea zone')].push(i);
  });

  const countries = [...data.countries.countries].sort((a, b) => byId(a.id, b.id));
  const regions = [...data.regions.regions].sort((a, b) => byId(a.id, b.id));

  return {
    provinceIds,
    countryIds,
    regionIds,
    seaZoneIds,
    provinceIndex,
    countryIndex,
    regionIndex,
    seaZoneIndex,
    provinceCountry,
    provinceRegion,
    provinceAreaKm2,
    seaZoneDeep: Uint8Array.from(seaZones, (s) => (s.depth === 'deep' ? 1 : 0)),
    seaZoneCoast: Uint8Array.from(seaZones, (s) => (s.kind === 'coast' ? 1 : 0)),
    seaZoneCenter: Float32Array.from(seaZones.flatMap((s) => s.center)),
    provinceNeighbors: buildAdjacency(
      provinces.map((p) => p.adjacentProvinces.map((n) => lookup(provinceIndex, n, 'province'))),
    ),
    provinceSeaZones: buildAdjacency(
      provinces.map((p) => p.adjacentSeaZones.map((z) => lookup(seaZoneIndex, z, 'sea zone'))),
    ),
    seaZoneNeighbors: buildAdjacency(
      seaZones.map((s) => s.adjacentSeaZones.map((z) => lookup(seaZoneIndex, z, 'sea zone'))),
    ),
    seaZoneProvinces: buildAdjacency(seaZoneProvinces),
    countryProvinces: buildAdjacency(countryProvinces),
    regionProvinces: buildAdjacency(regionProvinces),
    countryCapital: Int32Array.from(countries, (c) =>
      lookup(provinceIndex, c.capitalProvince, 'province'),
    ),
    countryMapColor: countries.map((c) => c.mapColor),
    regionMapColor: regions.map((r) => r.mapColor),
    regionClimate: regions.map((r) => r.climate),
  };
}
