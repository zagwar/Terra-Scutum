import type { GameData } from '../data/game-data';

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
  /** Starting owner (country index) of each province. */
  readonly provinceCountry: Uint16Array;
  readonly provinceRegion: Uint16Array;
  readonly provinceAreaKm2: Float32Array;
  readonly provinceNeighbors: Adjacency;
  readonly provinceSeaZones: Adjacency;
  readonly seaZoneNeighbors: Adjacency;
  /** Coastal provinces of each sea zone. */
  readonly seaZoneProvinces: Adjacency;
  readonly countryProvinces: Adjacency;
  readonly regionProvinces: Adjacency;
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
  };
}
