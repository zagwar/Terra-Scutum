/**
 * `npm run import:province-population`: counts the people living in every
 * province (F06) from the Kontur Population dataset (hexagons 400 m across,
 * built from the Global Human Settlement Layer, Meta's population maps and
 * OpenStreetMap; CC BY 4.0) and saves the counts as
 * `packages/tools/starting-data/sources/province-population.json`.
 *
 * Run it again after `npm run import:map` changed the provinces, then run
 * `npm run import:starting-data`, which shares each country's population
 * among its provinces in these proportions. How-to and the download command:
 * `packages/tools/starting-data/README.md`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { DATA_DIR, REPO_ROOT } from './load-data';
import { toPolygons } from './map-import/geometry';
import {
  type ProvincePopulationSnapshot,
  createProvinceGrid,
  hexagonLonLat,
} from './starting-data/province-population';

const DATASET = 'kontur_population_20231101';
const DATASET_URL = `https://geodata-eu-central-1-kontur-public.s3.amazonaws.com/kontur_datasets/${DATASET}.gpkg.gz`;
const CACHE_FILE = join(REPO_ROOT, '.cache/population', `${DATASET}.gpkg`);
const OUTPUT = join(REPO_ROOT, 'packages/tools/starting-data/sources/province-population.json');
/** The province grid's pixel size (about 2.8 km), and how far off a coast a hexagon may lie (about 30 km). */
const DEGREES_PER_PIXEL = 0.025;
const REACH_PIXELS = 12;

function main(): void {
  if (!existsSync(CACHE_FILE))
    throw new Error(
      `${CACHE_FILE} is missing. Download and unpack it first (2.4 GB, 9 GB unpacked; host ` +
        `"geodata-eu-central-1-kontur-public.s3.amazonaws.com"):\n` +
        `  mkdir -p .cache/population\n` +
        `  curl -sS -o .cache/population/${DATASET}.gpkg.gz "${DATASET_URL}"\n` +
        `  gunzip .cache/population/${DATASET}.gpkg.gz`,
    );

  const topology = JSON.parse(
    readFileSync(join(DATA_DIR, 'geometry/provinces.topo.json'), 'utf8'),
  ) as Topology;
  const collection = topology.objects.provinces as GeometryCollection;
  const ids: string[] = [];
  const shapes = collection.geometries.map((geometry) => {
    ids.push(String(geometry.id));
    const shape = feature(topology, geometry) as unknown as Feature<Polygon | MultiPolygon>;
    return toPolygons(shape.geometry);
  });
  const lookup = createProvinceGrid(shapes, DEGREES_PER_PIXEL, REACH_PIXELS);

  const counts = new Float64Array(ids.length);
  let unassigned = 0;
  let total = 0;
  const database = new DatabaseSync(CACHE_FILE, { readOnly: true });
  const rows = database.prepare('select geom, population from population').iterate() as Iterable<{
    geom: Uint8Array;
    population: number;
  }>;
  for (const row of rows) {
    const [lon, lat] = hexagonLonLat(row.geom);
    const province = lookup.provinceAt(lon, lat);
    total += row.population;
    if (province < 0) unassigned += row.population;
    else counts[province] += row.population;
  }
  database.close();

  const provinces: Record<string, number> = {};
  [...ids]
    .map((id, index) => ({ id, people: Math.round(counts[index]) }))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .forEach(({ id, people }) => (provinces[id] = people));
  const snapshot: ProvincePopulationSnapshot = {
    title: 'Kontur Population: Global Population Density for 400m H3 Hexagons',
    url: 'https://data.humdata.org/dataset/kontur-population-dataset',
    licence: 'CC BY 4.0',
    edition: DATASET,
    downloaded: new Date().toISOString().slice(0, 10),
    unassigned: Math.round(unassigned),
    provinces,
  };
  const lines = Object.entries(provinces).map(
    ([id, people]) => `  ${JSON.stringify(id)}: ${people}`,
  );
  const { provinces: _provinces, ...head } = snapshot;
  void _provinces;
  writeFileSync(
    OUTPUT,
    `${JSON.stringify(head, null, 1).slice(0, -2)},\n "provinces": {\n${lines.join(',\n')}\n }\n}\n`,
  );
  const empty = Object.values(provinces).filter((people) => people === 0).length;
  console.log(
    `Done: ${(total / 1e9).toFixed(3)} billion people counted, ` +
      `${((unassigned / total) * 100).toFixed(2)} % in no province, ` +
      `${empty} province(s) with nobody. Now run: npm run import:starting-data`,
  );
}

try {
  main();
} catch (error) {
  console.error(
    `\nProvince population import failed:\n${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
