/**
 * `npm run import:starting-data`: builds `data/country_start.json` (F71),
 * `data/province_start.json` (F06: where in each country its people live),
 * `data/building_start.json` (F85: every province's starting buildings),
 * `packages/tools/starting-data/report.md` and `buildings-report.md` from the source tables in
 * `packages/tools/starting-data/sources/` and the hand-written
 * `packages/tools/starting-data/countries.json` and `production.json`. Works offline.
 *
 * `npm run import:starting-data -- --snapshot` first remakes the source
 * tables from fresh downloads in `.cache/starting-data/` (see the README);
 * `--snapshot-fiscal` only the government finance table (F09).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type BuildingStartFile,
  type CountryStartFile,
  type ProvinceStartFile,
  buildingsSchema,
  countryNameKey,
  popsSchema,
} from '@terra-scutum/sim';
import { DATA_DIR, LOCALES_DIR, REPO_ROOT, loadGameDataFromDisk } from './load-data';
import {
  type ImfSnapshot,
  type MapCountry,
  type WorldBankSnapshot,
  buildProvinceStart,
  buildStartingData,
  fiscalSnapshotSchema,
  imfSnapshotSchema,
  startingDataConfigSchema,
  worldBankSnapshotSchema,
} from './starting-data/build-starting-data';
import { provincePopulationSnapshotSchema } from './starting-data/province-population';
import { writeStartingDataReport } from './starting-data/report';
import { snapshotFiscal, snapshotSources } from './starting-data/snapshot-sources';
import {
  buildStartingBuildings,
  productionConfigSchema,
} from './starting-data/build-starting-buildings';
import { writeBuildingsReport } from './starting-data/report-buildings';
import { productionSnapshotSchema, snapshotProduction } from './starting-data/snapshot-production';

const CONFIG_DIR = join(REPO_ROOT, 'packages/tools/starting-data');
const SOURCES_DIR = join(CONFIG_DIR, 'sources');
const RAW_DIR = join(REPO_ROOT, '.cache/starting-data');
const IMF_FILE = join(SOURCES_DIR, 'imf-weo.json');
const WORLD_BANK_FILE = join(SOURCES_DIR, 'world-bank-wdi.json');
const PROVINCE_POPULATION_FILE = join(SOURCES_DIR, 'province-population.json');
const PRODUCTION_FILE = join(SOURCES_DIR, 'production.json');
const FISCAL_FILE = join(SOURCES_DIR, 'imf-fiscal.json');

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as unknown;

function main(): void {
  const config = startingDataConfigSchema.parse(readJson(join(CONFIG_DIR, 'countries.json')));
  const mapCountries = (
    readJson(join(REPO_ROOT, 'packages/tools/map-config/countries.json')) as {
      countries: MapCountry[];
    }
  ).countries;

  if (process.argv.includes('--snapshot')) {
    const codes = mapCountries.flatMap((c) => [c.id, ...(c.includes ?? [])]);
    const today = new Date().toISOString().slice(0, 10);
    const { imf, worldBank } = snapshotSources(RAW_DIR, config, codes, today);
    mkdirSync(SOURCES_DIR, { recursive: true });
    writeFileSync(IMF_FILE, `${JSON.stringify(imf, null, 1)}\n`);
    writeFileSync(WORLD_BANK_FILE, `${JSON.stringify(worldBank, null, 1)}\n`);
    console.log(`Source tables remade from ${RAW_DIR} (${imf.edition}).`);
  }

  if (process.argv.includes('--snapshot') || process.argv.includes('--snapshot-production')) {
    // F85: the production figures (World Bank, Our World in Data energy).
    const today = new Date().toISOString().slice(0, 10);
    const production = snapshotProduction(RAW_DIR, config, mapCountries, today);
    writeFileSync(PRODUCTION_FILE, formatProductionSnapshot(production));
    console.log(`Production table remade from ${RAW_DIR}.`);
  }

  if (process.argv.includes('--snapshot') || process.argv.includes('--snapshot-fiscal')) {
    // F09: the government finance figures (IMF).
    const codes = mapCountries.map((c) => c.id);
    const today = new Date().toISOString().slice(0, 10);
    const fiscal = snapshotFiscal(RAW_DIR, config, codes, today);
    writeFileSync(FISCAL_FILE, `${JSON.stringify(fiscal, null, 1)}\n`);
    console.log(`Government finance table remade from ${RAW_DIR}.`);
  }

  const imf: ImfSnapshot = imfSnapshotSchema.parse(readJson(IMF_FILE));
  const worldBank: WorldBankSnapshot = worldBankSnapshotSchema.parse(readJson(WORLD_BANK_FILE));
  const fiscal = fiscalSnapshotSchema.parse(readJson(FISCAL_FILE));
  const result = buildStartingData(config, imf, worldBank, mapCountries, fiscal);
  if (result.errors.length > 0) {
    throw new Error(result.errors.map((e) => `  - ${e}`).join('\n'));
  }

  writeFileSync(join(DATA_DIR, 'country_start.json'), formatCountryStart(result.file));

  // Province populations (F06): each country's people shared among its provinces.
  const counted = provincePopulationSnapshotSchema.parse(readJson(PROVINCE_POPULATION_FILE));
  const mapProvinces = (
    readJson(join(DATA_DIR, 'provinces.json')) as {
      provinces: { id: string; country: string; areaKm2: number }[];
    }
  ).provinces;
  const provinceStart = buildProvinceStart(
    result.file,
    counted,
    mapProvinces,
    config.provinceEstimates,
  );
  if (provinceStart.errors.length > 0) {
    throw new Error(provinceStart.errors.map((e) => `  - ${e}`).join('\n'));
  }
  writeFileSync(join(DATA_DIR, 'province_start.json'), formatProvinceStart(provinceStart.file));

  // Starting buildings (F85): real production, shared among the provinces.
  const seaProvinces = new Set(
    (
      readJson(join(DATA_DIR, 'provinces.json')) as {
        provinces: { id: string; adjacentSeaZones: string[] }[];
      }
    ).provinces
      .filter((p) => p.adjacentSeaZones.length > 0)
      .map((p) => p.id),
  );
  const people = new Map(provinceStart.file.provinces.map((p) => [p.id, p.population]));
  const startingBuildings = buildStartingBuildings({
    config: productionConfigSchema.parse(readJson(join(CONFIG_DIR, 'production.json'))),
    snapshot: productionSnapshotSchema.parse(readJson(PRODUCTION_FILE)),
    countries: result.file.countries,
    provinces: mapProvinces.map((p) => ({
      id: p.id,
      country: p.country,
      areaKm2: p.areaKm2,
      coastal: seaProvinces.has(p.id),
      population: people.get(p.id) ?? 0,
    })),
    buildings: buildingsSchema.parse(readJson(join(DATA_DIR, 'buildings.json'))),
    pops: popsSchema.parse(readJson(join(DATA_DIR, 'pops.json'))),
    year: result.file.year,
  });
  if (startingBuildings.errors.length > 0) {
    throw new Error(startingBuildings.errors.map((e) => `  - ${e}`).join('\n'));
  }
  writeFileSync(join(DATA_DIR, 'building_start.json'), formatBuildingStart(startingBuildings.file));
  // Check the result with the game's own schema and cross-checks (throws a list of problems).
  loadGameDataFromDisk();
  const names = readJson(join(LOCALES_DIR, 'en.map.json')) as Record<string, string>;
  writeStartingDataReport(
    join(CONFIG_DIR, 'report.md'),
    config,
    result,
    imf,
    worldBank,
    (id) => names[countryNameKey(id)] ?? id,
  );

  writeBuildingsReport(
    join(CONFIG_DIR, 'buildings-report.md'),
    startingBuildings,
    (id) => names[countryNameKey(id)] ?? id,
  );

  const world = result.file.countries.reduce(
    (sum, c) => ({ population: sum.population + c.population, gdp: sum.gdp + c.gdpMillionUsd }),
    { population: 0, gdp: 0 },
  );
  console.log(
    `Done: ${result.file.countries.length} countries, ` +
      `${(world.population / 1e9).toFixed(2)} billion people, ` +
      `GDP US$${(world.gdp / 1e6).toFixed(1)} trillion (${result.file.year}). ` +
      `Report: packages/tools/starting-data/report.md`,
  );
  const levels = startingBuildings.file.provinces.reduce(
    (t, p) => t + p.buildings.reduce((u, b) => u + b[2], 0),
    0,
  );
  console.log(
    `Starting buildings: ${startingBuildings.file.provinces.reduce((t, p) => t + p.buildings.length, 0)} ` +
      `with ${levels} levels. Report: packages/tools/starting-data/buildings-report.md`,
  );
}

/** One country per line, so a change shows up as a one-line difference. */
function formatCountryStart(file: CountryStartFile): string {
  const { countries, ...rest } = file;
  const head = JSON.stringify(rest, null, 2).slice(0, -2);
  const lines = countries.map((c) => `    ${JSON.stringify(c)}`);
  return `${head},\n  "countries": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

/** One province per line. */
function formatProvinceStart(file: ProvinceStartFile): string {
  const { provinces, ...rest } = file;
  const head = JSON.stringify(rest, null, 2).slice(0, -2);
  const lines = provinces.map((p) => `    ${JSON.stringify(p)}`);
  return `${head},\n  "provinces": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

/** One province per line. */
function formatBuildingStart(file: BuildingStartFile): string {
  const { provinces, ...rest } = file;
  const head = JSON.stringify(rest, null, 2).slice(0, -2);
  const lines = provinces.map((p) => `    ${JSON.stringify(p)}`);
  return `${head},\n  "provinces": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

/** One country per line. */
function formatProductionSnapshot(snapshot: unknown): string {
  return `${JSON.stringify(snapshot, null, 1)}\n`;
}

try {
  main();
} catch (error) {
  console.error(
    `\nStarting data import failed:\n${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
