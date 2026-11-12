import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { feature, neighbors } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { CountriesConfig, MapSettings } from './config';
import {
  type Polygons,
  areaKm2,
  bboxOf,
  distanceKm,
  labelPoint,
  polygonsContain,
  toPolygons,
} from './geometry';
import type { SourceData } from './natural-earth';
import { cleanName } from './text';

/**
 * Units: the source provinces/states (Natural Earth "admin-1"), assigned to
 * the game's countries. Provinces are built from units by merging and splitting.
 */
export interface City {
  readonly name: string;
  readonly population: number;
  readonly lon: number;
  readonly lat: number;
  /** National capital in the source data. */
  readonly capital: boolean;
  /** True if the city lies in the country's main territory (not a merged-in one). */
  readonly homeTerritory: boolean;
}

export interface Unit {
  readonly index: number;
  readonly name: string;
  /** Game country id. */
  readonly country: string;
  /** Natural Earth territory code the unit came from. */
  readonly sourceCode: string;
  /** The source's grouping of units (for example a French région); merges prefer staying inside it. */
  readonly grouping: string | null;
  /** Name of the source territory (for example "Bermuda" for a parish of Bermuda). */
  readonly territoryName: string;
  /** False for units from a territory merged into the country (dependencies, merged small countries). */
  readonly homeTerritory: boolean;
  readonly polygons: Polygons;
  readonly areaKm2: number;
  readonly center: [number, number];
  readonly cities: City[];
  /** Estimated population (used only to decide how many provinces a country gets). */
  population: number;
  cluster: number;
}

export interface UnitSet {
  readonly units: Unit[];
  /** Units sharing a land border, by unit index. */
  readonly neighbors: number[][];
  /** The topology the units were built in; merges use it so shared borders stay exact. */
  readonly topology: Topology<{ units: GeometryCollection<{ index: number }> }>;
  /** Cluster id → unit indices. A cluster is one country's land that hangs together. */
  readonly clusters: Map<number, number[]>;
  /** Clusters left out because nobody lives there. */
  readonly droppedClusters: { country: string; names: string[] }[];
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Natural Earth territory code → game country id (or null if left out). Throws if a code isn't covered. */
export function buildCountryLookup(
  config: CountriesConfig,
  codes: Iterable<string>,
): Map<string, string | null> {
  const lookup = new Map<string, string | null>();
  const claim = (code: string, country: string | null) => {
    if (lookup.has(code)) {
      throw new Error(`countries.json: the Natural Earth code ${code} is listed more than once`);
    }
    lookup.set(code, country);
  };
  for (const country of config.countries) {
    claim(country.source, country.id);
    for (const code of country.includes ?? []) claim(code, country.id);
  }
  for (const code of config.leftOut) claim(code, null);
  const missing = [...codes].filter((code) => !lookup.has(code)).sort();
  if (missing.length > 0) {
    throw new Error(
      `countries.json does not say what to do with these Natural Earth territories: ${missing.join(', ')}. ` +
        'Add each to a country (as "source" or in "includes") or to "leftOut".',
    );
  }
  return lookup;
}

export function buildUnits(
  sources: SourceData,
  config: CountriesConfig,
  settings: MapSettings,
  log: (line: string) => void = () => {},
): UnitSet {
  // 1. Collect source features: admin-1 units, plus whole territories that have no admin-1 data.
  const raw: Feature<
    Polygon | MultiPolygon,
    { name: string; code: string; grouping: string | null }
  >[] = [];
  const withAdmin1 = new Set<string>();
  for (const f of sources.provinces.features) {
    const p = f.properties;
    const code = str(p.adm0_a3);
    if (
      !code ||
      !f.geometry ||
      (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')
    )
      continue;
    withAdmin1.add(code);
    raw.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        name: cleanName((str(p.name_en) ?? str(p.name) ?? code).replace(/ Prefecture$/, '')),
        code,
        grouping: str(p.region),
      },
    });
  }
  const territoryPopulation = new Map<string, number>();
  const territoryNames = new Map<string, string>();
  for (const f of sources.countries.features) {
    const p = f.properties;
    const code = str(p.ADM0_A3);
    if (!code) continue;
    territoryPopulation.set(code, Math.max(0, num(p.POP_EST)));
    territoryNames.set(code, cleanName(str(p.NAME_LONG) ?? str(p.NAME) ?? code));
    if (withAdmin1.has(code) || !f.geometry) continue;
    if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') continue;
    raw.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: { name: cleanName(str(p.NAME) ?? code), code, grouping: null },
    });
  }

  // Drop islets early (each feature keeps its largest piece): it keeps every later step fast.
  for (const f of raw) {
    const pieces = toPolygons(f.geometry).map((polygon) => ({ polygon, area: areaKm2([polygon]) }));
    const largest = Math.max(...pieces.map((p) => p.area));
    const kept = pieces.filter(
      (p) => p.area >= settings.provinces.minIsletAreaKm2 || p.area === largest,
    );
    f.geometry = { type: 'MultiPolygon', coordinates: kept.map((p) => p.polygon) };
  }

  const lookup = buildCountryLookup(config, new Set(raw.map((f) => f.properties.code)));
  const homeCodes = new Set(config.countries.map((c) => c.source));
  const included = raw
    .filter((f) => lookup.get(f.properties.code) !== null)
    .sort(
      (a, b) =>
        a.properties.code.localeCompare(b.properties.code) ||
        a.properties.name.localeCompare(b.properties.name),
    );

  // 2. One topology for all units: shared borders become shared arcs. The quantization snaps
  //    borders from the two source files together.
  const unitFeatures: FeatureCollection = {
    type: 'FeatureCollection',
    features: included.map((f, index) => ({ ...f, properties: { index } })),
  };
  const built = topology({ units: unitFeatures }, settings.geometry.quantization);
  // Simplify once, here: borders stay shared, and every later step works on lighter shapes.
  const topo = simplify(
    presimplify(built as never),
    settings.geometry.provinceMinWeight,
  ) as unknown as UnitSet['topology'];
  const geometries = topo.objects.units.geometries;
  const unitNeighbors = neighbors(geometries);
  log('  topology built');

  // 3. Units with their geometry, area and cities.
  const units: Unit[] = included.map((source, index) => {
    const decoded = feature(topo, geometries[index] as never) as unknown as Feature<
      Polygon | MultiPolygon
    >;
    const polygons = toPolygons(decoded.geometry);
    return {
      index,
      name: source.properties.name,
      country: lookup.get(source.properties.code) as string,
      sourceCode: source.properties.code,
      grouping: source.properties.grouping,
      territoryName: territoryNames.get(source.properties.code) ?? source.properties.code,
      homeTerritory: homeCodes.has(source.properties.code),
      polygons,
      areaKm2: areaKm2(polygons),
      center: labelPoint(polygons),
      cities: [],
      population: 0,
      cluster: -1,
    };
  });
  log('  units decoded');
  assignCities(units, sources);
  estimatePopulation(units, territoryPopulation);
  log('  cities placed');
  const { clusters, dropped } = buildClusters(units, unitNeighbors, settings);
  return { units, neighbors: unitNeighbors, topology: topo, clusters, droppedClusters: dropped };
}

function assignCities(units: Unit[], sources: SourceData): void {
  const boxes = units.map((unit) => bboxOf(unit.polygons));
  // Mostly the city-proper population (pop_min): metro-area figures (pop_max) overlap and count
  // suburbs twice. But never less than 30% of the metro figure: some pop_min values are wrong
  // (Paris is listed with 11,177 people).
  const cityPopulation = (p: Record<string, unknown>) =>
    Math.max(num(p.pop_min), 0.3 * num(p.pop_max));
  const places = [...sources.places.features].sort(
    (a, b) => cityPopulation(b.properties) - cityPopulation(a.properties),
  );
  for (const place of places) {
    const population = cityPopulation(place.properties);
    if (population <= 0) continue;
    const [lon, lat] = place.geometry.coordinates as [number, number];
    const index = units.findIndex((unit, i) => {
      const box = boxes[i];
      return (
        lon >= box.minX &&
        lon <= box.maxX &&
        lat >= box.minY &&
        lat <= box.maxY &&
        polygonsContain(unit.polygons, lon, lat)
      );
    });
    if (index < 0) continue;
    units[index].cities.push({
      name: cleanName(str(place.properties.nameascii) ?? str(place.properties.name) ?? '?'),
      population,
      lon,
      lat,
      capital: str(place.properties.featurecla) === 'Admin-0 capital',
      homeTerritory: units[index].homeTerritory,
    });
  }
}

/**
 * Spreads each territory's population over its units: city populations stay
 * where the cities are; the rest is spread mostly by area and partly by where
 * the cities are (towns and countryside cluster around cities). A rough estimate,
 * used only to decide where provinces go (real starting data comes with F71).
 */
function estimatePopulation(units: Unit[], territoryPopulation: Map<string, number>): void {
  const byTerritory = new Map<string, Unit[]>();
  for (const unit of units) {
    const list = byTerritory.get(unit.sourceCode) ?? [];
    list.push(unit);
    byTerritory.set(unit.sourceCode, list);
  }
  for (const [code, list] of byTerritory) {
    const total = territoryPopulation.get(code) ?? 0;
    const area = list.reduce((sum, unit) => sum + unit.areaKm2, 0);
    const citySum = list.reduce(
      (sum, unit) => sum + unit.cities.reduce((s, c) => s + c.population, 0),
      0,
    );
    const cityScale = citySum > 0 ? Math.min(1, (0.85 * total) / citySum) : 0;
    const rural = Math.max(0, total - citySum * cityScale);
    for (const unit of list) {
      const cities = unit.cities.reduce((s, c) => s + c.population, 0);
      const areaShare = area > 0 ? unit.areaKm2 / area : 1 / list.length;
      const cityShare = citySum > 0 ? cities / citySum : areaShare;
      unit.population = cities * cityScale + rural * (0.7 * areaShare + 0.3 * cityShare);
    }
  }
}

function sampleVertices(unit: Unit, max: number): [number, number][] {
  const all: [number, number][] = [];
  for (const polygon of unit.polygons) for (const [x, y] of polygon[0] ?? []) all.push([x, y]);
  if (all.length <= max) return all;
  const step = all.length / max;
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) out.push(all[Math.floor(i * step)]);
  return out;
}

/** Groups each country's units into clusters of land that hangs together (by border or short sea distance). */
function buildClusters(
  units: Unit[],
  unitNeighbors: number[][],
  settings: MapSettings,
): { clusters: Map<number, number[]>; dropped: { country: string; names: string[] }[] } {
  const parent = units.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]]!;
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  units.forEach((unit, i) => {
    for (const j of unitNeighbors[i] ?? []) if (units[j].country === unit.country) union(i, j);
  });

  // Separate pieces of a country (islands, exclaves: groups of units with no land link to the
  // rest) join each other when they are within the cluster distance.
  const maxKm = settings.provinces.clusterDistanceKm;
  const marginDeg = maxKm / 111;
  const byCountry = new Map<string, number[]>();
  units.forEach((unit, i) =>
    byCountry.set(unit.country, [...(byCountry.get(unit.country) ?? []), i]),
  );
  for (const members of byCountry.values()) {
    const pieces = new Map<number, number[]>();
    for (const i of members) {
      const root = find(i);
      pieces.set(root, [...(pieces.get(root) ?? []), i]);
    }
    if (pieces.size < 2) continue;
    const list = [...pieces.values()].map((piece) => {
      const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      const points: [number, number][] = [];
      for (const i of piece) {
        const b = bboxOf(units[i].polygons);
        box.minX = Math.min(box.minX, b.minX);
        box.minY = Math.min(box.minY, b.minY);
        box.maxX = Math.max(box.maxX, b.maxX);
        box.maxY = Math.max(box.maxY, b.maxY);
        points.push(...sampleVertices(units[i], 60));
      }
      return { first: piece[0], box, points };
    });
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const pa = list[a];
        const pb = list[b];
        if (find(pa.first) === find(pb.first)) continue;
        const lat = Math.max(
          Math.abs(pa.box.minY),
          Math.abs(pa.box.maxY),
          Math.abs(pb.box.minY),
          Math.abs(pb.box.maxY),
        );
        const lonMargin = marginDeg / Math.max(0.1, Math.cos((Math.min(lat, 85) * Math.PI) / 180));
        const apart =
          pb.box.minX > pa.box.maxX + lonMargin ||
          pb.box.maxX < pa.box.minX - lonMargin ||
          pb.box.minY > pa.box.maxY + marginDeg ||
          pb.box.maxY < pa.box.minY - marginDeg;
        const wraps =
          (pa.box.minX < -170 && pb.box.maxX > 170) || (pb.box.minX < -170 && pa.box.maxX > 170);
        if (apart && !wraps) continue;
        if (pa.points.some((p) => pb.points.some((q) => distanceKm(p, q) <= maxKm)))
          union(pa.first, pb.first);
      }
    }
  }

  const clusters = new Map<number, number[]>();
  units.forEach((_, i) => {
    const root = find(i);
    clusters.set(root, [...(clusters.get(root) ?? []), i]);
  });
  const dropped: { country: string; names: string[] }[] = [];
  for (const [root, members] of [...clusters]) {
    const population = members.reduce((sum, i) => sum + units[i].population, 0);
    if (population < settings.provinces.minClusterPopulation) {
      clusters.delete(root);
      dropped.push({ country: units[root].country, names: members.map((i) => units[i].name) });
      continue;
    }
    for (const i of members) units[i].cluster = root;
  }
  return { clusters, dropped };
}
