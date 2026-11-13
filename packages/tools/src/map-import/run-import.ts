import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';
import { feature, neighbors } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { DATA_DIR, LOCALES_DIR, REPO_ROOT } from '../load-data';
import {
  MIN_BORDER_CONTRAST,
  assignDistinctColors,
  assignTraditionalColors,
  mapColorContrast,
  parseHex,
  varyColor,
} from './colors';
import { type MapConfig, loadMapConfig } from './config';
import {
  type Polygons,
  areaKm2,
  distanceKm,
  innerLabelPoint,
  normalizeWinding,
  roundCoordinate,
  toMultiPolygon,
  toPolygons,
} from './geometry';
import { ensureSources, readSources } from './natural-earth';
import { renderPreview } from './preview';
import { type ProvinceDraft, buildProvinces } from './provinces';
import { type TinyProvinceReport, applyTinyProvinces } from './tiny-provinces';
import {
  createGrid,
  fillPolygons,
  growLabels,
  pixelAt,
  touchingPairs,
  traceLabels,
} from './raster';
import { buildUnits } from './units';

/**
 * The map import (`npm run import:map`): turns Natural Earth's public map data
 * and the files in `packages/tools/map-config/` into the game's map data:
 *
 * - `data/countries.json`, `data/provinces.json`, `data/regions.json`, `data/sea_zones.json`
 * - `data/geometry/provinces.topo.json`, `data/geometry/sea_zones.topo.json` (shapes)
 * - `locales/en.map.json` (names)
 * - `packages/tools/map-config/report/` (a summary and preview pictures)
 *
 * The output is deterministic: the same inputs always give the same files.
 */
export const GEOMETRY_DIR = join(DATA_DIR, 'geometry');
export const REPORT_DIR = join(REPO_ROOT, 'packages/tools/map-config/report');
export const MAP_LOCALE_FILE = join(LOCALES_DIR, 'en.map.json');

const OUTSIDE = 0xffff;
/** A province whose final shape is smaller than this can't be seen or clicked: the import warns. */
const MIN_VISIBLE_AREA_KM2 = 0.5;

export interface ImportSummary {
  readonly countries: number;
  readonly provinces: number;
  readonly regions: number;
  readonly seaZones: number;
  readonly warnings: string[];
}

function key(prefix: string, id: string): string {
  return `${prefix}_${id.toUpperCase()}`;
}

function writeJson(path: string, value: unknown, pretty = true): void {
  writeFileSync(path, `${pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)}\n`);
}

/** Province data rows are written one per line: readable in a diff, and much smaller than fully indented JSON. */
function writeRows(path: string, rootKey: string, rows: readonly unknown[]): void {
  const body = rows.map((row) => `    ${JSON.stringify(row)}`).join(',\n');
  writeFileSync(path, `{\n  "${rootKey}": [\n${body}\n  ]\n}\n`);
}

export async function runMapImport(
  log: (line: string) => void = console.log,
): Promise<ImportSummary> {
  const config: MapConfig = loadMapConfig();
  const { settings } = config;
  const warnings: string[] = [];
  const warn = (line: string) => {
    warnings.push(line);
    log(`  ! ${line}`);
  };

  await ensureSources(settings.naturalEarth.version, log);
  log('Reading Natural Earth data…');
  const sources = readSources(settings.naturalEarth.version);

  log('Building units and clusters…');
  const unitSet = buildUnits(sources, config.countries, settings);
  log('Combining states into provinces…');
  const countryNames = new Map(config.countries.countries.map((c) => [c.id, c.name]));
  const built = buildProvinces(
    unitSet,
    settings,
    config.provinceGroups,
    config.provinceNames.provinces,
    countryNames,
  );
  const report = built.report;
  // Provinces too small for the map data: enlarged to a clickable disc, or left out.
  const { provinces, report: tinyReport } = applyTinyProvinces(
    built.provinces,
    config.tinyProvinces,
    warn,
  );
  for (const code of report.unknownGroupCodes)
    warn(`province-groups.json lists ${code}, which matches no state/province`);
  for (const id of Object.keys(config.provinceNames.provinces)) {
    if (!provinces.some((p) => p.id === id))
      warn(`province-names.json renames "${id}", but no province has that id`);
  }
  if (provinces.length >= OUTSIDE - 1) throw new Error('Too many provinces for the import grid');

  // ── Province shapes and land borders ──────────────────────────────────────
  log('Building province borders…');
  const provinceFeatures: FeatureCollection = {
    type: 'FeatureCollection',
    features: provinces.map((p) => ({
      type: 'Feature',
      id: p.id,
      properties: {},
      geometry: toMultiPolygon(normalizeWinding(p.polygons)),
    })),
  };
  const provinceTopology = topology(
    { provinces: provinceFeatures },
    settings.geometry.quantization,
  ) as Topology<{ provinces: GeometryCollection }>;
  const provinceGeometries = provinceTopology.objects.provinces.geometries;
  // A province whose own pieces touch each other shows up as its own neighbor: drop that.
  const landNeighbors = neighbors(provinceGeometries as never).map((list, i) => [
    ...new Set(list.filter((j) => j !== i)),
  ]);
  const decoded: Polygons[] = provinceGeometries.map((g) =>
    toPolygons(
      (feature(provinceTopology, g as never) as unknown as Feature<MultiPolygon>).geometry,
    ),
  );
  // Label points: well inside the final shape (an enlarged tiny province keeps its configured place).
  const centers = provinces.map((p, i) =>
    tinyReport.enlarged.includes(p.id) ? p.center : innerLabelPoint(decoded[i]),
  );

  // ── The grid: land, sea zones, coasts ─────────────────────────────────────
  log('Drawing the world grid…');
  const grid = createGrid(settings.raster.degreesPerPixel);
  const land = grid.labels;
  const antarctica = sources.countries.features.find((f) => f.properties.ADM0_A3 === 'ATA');
  if (
    antarctica?.geometry &&
    (antarctica.geometry.type === 'Polygon' || antarctica.geometry.type === 'MultiPolygon')
  ) {
    fillPolygons(grid, toPolygons(antarctica.geometry), OUTSIDE);
  }
  decoded.forEach((polygons, index) => {
    if (areaKm2(polygons) < MIN_VISIBLE_AREA_KM2)
      warn(
        `province ${provinces[index].id} is too small for the map data (its shape has no area): add it to tiny-provinces.json`,
      );
    const filled = fillPolygons(grid, polygons, index + 1);
    if (filled === 0) {
      const [lon, lat] = centers[index];
      land[pixelAt(grid, lon, lat)] = index + 1;
    }
  });

  log('Growing sea zones…');
  const zones = config.seaZones.seaZones;
  const sea = new Uint16Array(land.length);
  const zoneIndex = new Map(zones.map((z, i) => [z.id, i + 1]));
  if (zoneIndex.size !== zones.length) throw new Error('sea-zones.json: two sea zones share an id');
  const seedProblems: string[] = [];
  zones.forEach((zone, i) => {
    for (const [lon, lat] of zone.seeds) {
      const pixel = pixelAt(grid, lon, lat);
      if (land[pixel] !== 0) seedProblems.push(`${zone.id} seed [${lon}, ${lat}] is on land`);
      else if (sea[pixel] !== 0 && sea[pixel] !== i + 1)
        seedProblems.push(
          `${zone.id} seed [${lon}, ${lat}] is the same pixel as another zone's seed`,
        );
      else sea[pixel] = i + 1;
    }
  });
  if (seedProblems.length > 0) {
    throw new Error(
      `sea-zones.json has seeds that need moving:\n  - ${seedProblems.join('\n  - ')}`,
    );
  }
  growLabels(grid, sea, (pixel) => land[pixel] === 0);

  const zoneNeighbors = zones.map(() => new Set<number>());
  const provinceSeaZones = provinces.map(() => new Set<number>());
  for (const [pair] of touchingPairs(grid, sea, sea)) {
    const [a, b] = pair.split('|').map(Number) as [number, number];
    zoneNeighbors[a - 1].add(b - 1);
    zoneNeighbors[b - 1].add(a - 1);
  }
  for (const [pair] of touchingPairs(grid, land, sea)) {
    const [p, z] = pair.split('|').map(Number) as [number, number];
    if (p !== OUTSIDE) provinceSeaZones[p - 1].add(z - 1);
  }
  for (const [a, b] of config.seaZones.connections) {
    const ia = zoneIndex.get(a);
    const ib = zoneIndex.get(b);
    if (!ia || !ib)
      throw new Error(`sea-zones.json: connection ${a}–${b} names an unknown sea zone`);
    zoneNeighbors[ia - 1].add(ib - 1);
    zoneNeighbors[ib - 1].add(ia - 1);
  }
  const zonePixels = new Uint32Array(zones.length);
  for (const z of sea) if (z !== 0) zonePixels[z - 1] += 1;
  zones.forEach((zone, i) => {
    if (zonePixels[i] === 0)
      warn(`sea zone ${zone.id} has no water (its seed is in a lake or enclosed)`);
    const coastal = provinceSeaZones.some((set) => set.has(i));
    if (zoneNeighbors[i].size === 0 && !coastal)
      warn(`sea zone ${zone.id} touches no other sea zone and no coast`);
  });

  // Sea zone shapes: grow the zones under the land too so they tile the whole world without
  // gaps (land is drawn on top of them), then trace and simplify.
  log('Tracing sea zone shapes…');
  const seaFull = sea.slice();
  growLabels(grid, seaFull, () => true);
  const traced = traceLabels(grid, seaFull);
  const seaFeatures: FeatureCollection = {
    type: 'FeatureCollection',
    features: zones.map((zone, i) => ({
      type: 'Feature',
      id: zone.id,
      properties: {},
      geometry: toMultiPolygon(traced.get(i + 1) ?? []),
    })),
  };
  const seaTopology = simplify(
    presimplify(topology({ seaZones: seaFeatures }, settings.geometry.quantization) as never),
    settings.geometry.seaZoneMinWeight,
  );

  // ── Regions ───────────────────────────────────────────────────────────────
  // Each source unit joins a region by its ISO code, else by its territory, else by the nearest
  // seed (reported, so the lists can be completed). A province joins the region holding most of it.
  log('Assigning regions…');
  const regionConfigs = config.regions.regions;
  const regionByCode = new Map<string, string>();
  const regionByTerritory = new Map<string, string>();
  for (const region of regionConfigs) {
    for (const code of region.units ?? []) {
      if (regionByCode.has(code)) throw new Error(`regions.json: ${code} is listed in two regions`);
      regionByCode.set(code, region.id);
    }
    for (const territory of region.countries ?? []) {
      if (regionByTerritory.has(territory))
        throw new Error(`regions.json: ${territory} is listed in two regions`);
      regionByTerritory.set(territory, region.id);
    }
  }
  const knownCodes = new Set(unitSet.units.map((u) => u.iso));
  const knownTerritories = new Set(unitSet.units.map((u) => u.sourceCode));
  for (const code of regionByCode.keys())
    if (!knownCodes.has(code)) warn(`regions.json lists ${code}, which matches no state/province`);
  for (const t of regionByTerritory.keys()) {
    if (!knownTerritories.has(t) && !config.countries.leftOut.includes(t))
      warn(`regions.json lists ${t}, which is not a territory in the game`);
  }
  const fallbackUnits: string[] = [];
  const regionOfUnit = (index: number): string => {
    const unit = unitSet.units[index];
    const byCode = unit.iso ? regionByCode.get(unit.iso) : undefined;
    if (byCode) return byCode;
    const byTerritory = regionByTerritory.get(unit.sourceCode);
    if (byTerritory) return byTerritory;
    let best = regionConfigs[0].id;
    let bestDistance = Infinity;
    for (const region of regionConfigs) {
      for (const seed of region.seeds) {
        const d = distanceKm(unit.center, seed);
        if (d < bestDistance) {
          bestDistance = d;
          best = region.id;
        }
      }
    }
    fallbackUnits.push(`${unit.name} (${unit.iso ?? unit.sourceCode}) → ${best}`);
    return best;
  };
  const provinceRegion = provinces.map((p) => {
    const area = new Map<string, number>();
    for (const i of p.units) {
      const r = regionOfUnit(i);
      area.set(r, (area.get(r) ?? 0) + unitSet.units[i].areaKm2);
    }
    return [...area].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  });
  if (fallbackUnits.length > 0) {
    warn(
      `${fallbackUnits.length} states/provinces are not listed in regions.json and joined the nearest seed: ${fallbackUnits.join('; ')}`,
    );
  }
  for (const region of regionConfigs) {
    if (!provinceRegion.includes(region.id)) warn(`region ${region.id} got no provinces`);
  }
  const regionCenter = (id: string): readonly [number, number] => {
    const own = provinces
      .map((p, i) => ({ areaKm2: p.areaKm2, center: centers[i], region: provinceRegion[i] }))
      .filter((p) => p.region === id)
      .sort((a, b) => b.areaKm2 - a.areaKm2);
    return own[0]?.center ?? regionConfigs.find((r) => r.id === id)!.seeds[0];
  };

  // ── Countries ─────────────────────────────────────────────────────────────
  const countryIds = [...new Set(provinces.map((p) => p.country))].sort();
  const configured = new Set(config.countries.countries.map((c) => c.id));
  for (const id of configured)
    if (!countryIds.includes(id)) warn(`country ${id} ended up with no provinces`);
  const countryNeighbors = new Map<string, Set<string>>();
  landNeighbors.forEach((list, i) => {
    for (const j of list) {
      const a = provinces[i].country;
      const b = provinces[j].country;
      if (a === b) continue;
      if (!countryNeighbors.has(a)) countryNeighbors.set(a, new Set());
      countryNeighbors.get(a)!.add(b);
    }
  });
  // Countries (and regions) that almost touch (across a strait or a narrow sea). The gap between
  // two provinces is estimated from their label points and areas, as if they were round.
  const nearCountries = new Map<string, Set<string>>();
  const nearRegions = new Map<string, Set<string>>();
  const addPair = (map: Map<string, Set<string>>, a: string, b: string) => {
    if (!map.has(a)) map.set(a, new Set());
    if (!map.has(b)) map.set(b, new Set());
    map.get(a)!.add(b);
    map.get(b)!.add(a);
  };
  const reach = provinces.map((p) => Math.sqrt(p.areaKm2 / Math.PI));
  const provinceCount = new Map<string, number>();
  for (const p of provinces) provinceCount.set(p.country, (provinceCount.get(p.country) ?? 0) + 1);
  // A big country's specks far from home (a base, an islet) don't make it "near" anyone.
  const countsAsNear = (p: ProvinceDraft) =>
    p.areaKm2 >= settings.colors.nearMinProvinceKm2 || (provinceCount.get(p.country) ?? 0) <= 3;
  const bigEnough = (p: ProvinceDraft) => p.areaKm2 >= settings.colors.nearMinProvinceKm2;
  for (let i = 0; i < provinces.length; i++) {
    for (let j = i + 1; j < provinces.length; j++) {
      const a = provinces[i].country;
      const b = provinces[j].country;
      const ra = provinceRegion[i];
      const rb = provinceRegion[j];
      const countries =
        a !== b &&
        !nearCountries.get(a)?.has(b) &&
        countsAsNear(provinces[i]) &&
        countsAsNear(provinces[j]);
      const regions =
        ra !== rb &&
        !nearRegions.get(ra)?.has(rb) &&
        bigEnough(provinces[i]) &&
        bigEnough(provinces[j]);
      if (!countries && !regions) continue;
      const gap = distanceKm(centers[i], centers[j]) - reach[i] - reach[j];
      if (gap > settings.colors.nearCountryKm) continue;
      if (countries) addPair(nearCountries, a, b);
      if (regions) addPair(nearRegions, ra, rb);
    }
  }
  // Every country's traditional color (country-colors.json), shifted a little only where a
  // neighbor's color would be too much alike; bigger countries (more provinces) keep theirs.
  const traditional = new Map(Object.entries(config.countryColors.colors));
  for (const id of traditional.keys())
    if (!countryIds.includes(id))
      warn(`country-colors.json has a color for ${id}, which is not a country in the game`);
  const withoutColor = countryIds.filter((id) => !traditional.has(id));
  if (withoutColor.length > 0)
    warn(
      `country-colors.json has no color for ${withoutColor.join(', ')}: they got a color from the spare palette`,
    );
  const { colors, adjusted: adjustedColors } = assignTraditionalColors(
    countryIds,
    countryNeighbors,
    nearCountries,
    traditional,
    provinceCount,
  );
  // How well it worked: the two bordering countries whose colors are most alike.
  let closestColors = { difference: Infinity, a: '', b: '' };
  for (const [a, list] of countryNeighbors) {
    for (const b of list) {
      const difference = mapColorContrast(colors.get(a)!, colors.get(b)!);
      if (a < b && difference < closestColors.difference) closestColors = { difference, a, b };
    }
  }
  if (closestColors.difference < MIN_BORDER_CONTRAST * 0.999)
    warn(
      `the map colors of ${closestColors.a} and ${closestColors.b}, which share a border, are hard to tell apart (difference ${closestColors.difference.toFixed(3)})`,
    );
  // Regions: clearly different colors from the spare palette, chosen the same way, so that
  // regions that border or nearly touch are easy to tell apart.
  const regionNeighbors = new Map<string, Set<string>>();
  landNeighbors.forEach((list, i) => {
    for (const j of list) {
      const a = provinceRegion[i];
      const b = provinceRegion[j];
      if (a !== b) addPair(regionNeighbors, a, b);
    }
  });
  const regionIds = regionConfigs.map((r) => r.id);
  const regionColors = assignDistinctColors(regionIds, regionNeighbors, nearRegions);
  let closestRegions = { difference: Infinity, a: '', b: '' };
  for (const [a, list] of regionNeighbors) {
    for (const b of list) {
      const difference = mapColorContrast(regionColors.get(a)!, regionColors.get(b)!);
      if (a < b && difference < closestRegions.difference) closestRegions = { difference, a, b };
    }
  }
  if (closestRegions.difference < MIN_BORDER_CONTRAST * 0.999)
    warn(
      `the map colors of regions ${closestRegions.a} and ${closestRegions.b}, which share a border, are hard to tell apart (difference ${closestRegions.difference.toFixed(3)})`,
    );
  const capitalOf = (country: string): string => {
    const own = provinces.filter((p) => p.country === country);
    const capital = own
      .flatMap((p) => p.cities.filter((c) => c.capital && c.homeTerritory).map((c) => ({ p, c })))
      .sort((a, b) => b.c.population - a.c.population)[0];
    if (capital) return capital.p.id;
    return [...own].sort((a, b) => b.population - a.population)[0].id;
  };

  // ── Write everything ──────────────────────────────────────────────────────
  log('Writing data files…');
  const provinceIds = provinces.map((p) => p.id);
  const center = (c: readonly [number, number]) => [
    roundCoordinate(c[0], 3),
    roundCoordinate(c[1], 3),
  ];
  writeRows(
    join(DATA_DIR, 'countries.json'),
    'countries',
    countryIds.map((id) => ({ id, capitalProvince: capitalOf(id), mapColor: colors.get(id) })),
  );
  writeRows(
    join(DATA_DIR, 'provinces.json'),
    'provinces',
    provinces.map((p, i) => ({
      id: p.id,
      country: p.country,
      region: provinceRegion[i],
      center: center(centers[i]),
      // Whole km², except for the enlarged tiny provinces (their real area is in the config).
      areaKm2: tinyReport.enlarged.includes(p.id) ? p.areaKm2 : Math.round(p.areaKm2),
      adjacentProvinces: [...landNeighbors[i]].map((j) => provinceIds[j]).sort(),
      adjacentSeaZones: [...provinceSeaZones[i]].map((z) => zones[z].id).sort(),
    })),
  );
  writeRows(
    join(DATA_DIR, 'regions.json'),
    'regions',
    regionConfigs.map((region) => ({
      id: region.id,
      climate: region.climate,
      center: center(regionCenter(region.id)),
      mapColor: regionColors.get(region.id),
    })),
  );
  writeRows(
    join(DATA_DIR, 'sea_zones.json'),
    'seaZones',
    zones.map((zone, i) => ({
      id: zone.id,
      depth: zone.depth,
      center: center(zone.seeds[0]),
      adjacentSeaZones: [...zoneNeighbors[i]].map((j) => zones[j].id).sort(),
    })),
  );

  const names: Record<string, string> = {};
  for (const id of countryIds) names[key('COUNTRY', id)] = countryNames.get(id) ?? id;
  for (const region of regionConfigs) names[key('REGION', region.id)] = region.name;
  for (const zone of zones) names[key('SEA_ZONE', zone.id)] = zone.name;
  for (const p of provinces) names[key('PROVINCE', p.id)] = p.name;
  writeJson(MAP_LOCALE_FILE, names);

  mkdirSync(GEOMETRY_DIR, { recursive: true });
  writeJson(join(GEOMETRY_DIR, 'provinces.topo.json'), provinceTopology, false);
  writeJson(join(GEOMETRY_DIR, 'sea_zones.topo.json'), seaTopology, false);

  // ── Report and preview pictures ───────────────────────────────────────────
  log('Writing the report and preview pictures…');
  mkdirSync(REPORT_DIR, { recursive: true });
  const regionIndex = new Map(regionConfigs.map((r, i) => [r.id, i]));
  writeFileSync(
    join(REPORT_DIR, 'provinces.png'),
    renderPreview({
      grid,
      land,
      sea,
      scale: 3,
      landColor: (label) =>
        varyColor(colors.get(provinces[label - 1].country)!, provinces[label - 1].id),
      group: (label) => countryIds.indexOf(provinces[label - 1].country),
    }),
  );
  writeFileSync(
    join(REPORT_DIR, 'regions.png'),
    renderPreview({
      grid,
      land,
      sea,
      scale: 3,
      landColor: (label) =>
        varyColor(regionColors.get(provinceRegion[label - 1])!, provinces[label - 1].id),
      group: (label) => regionIndex.get(provinceRegion[label - 1])!,
    }),
  );
  // Sea zones in clearly different colors on gray land, to check which coasts each one touches.
  const seaZoneColors = assignDistinctColors(
    zones.map((zone) => zone.id),
    new Map(
      zones.map((zone, i) => [zone.id, new Set([...zoneNeighbors[i]].map((j) => zones[j].id))]),
    ),
  );
  writeFileSync(
    join(REPORT_DIR, 'sea_zones.png'),
    renderPreview({
      grid,
      land,
      sea,
      scale: 3,
      landColor: (label) => varyColor('#8a8a80', provinces[label - 1].id, 0.08),
      seaColor: (label) => parseHex(seaZoneColors.get(zones[label - 1].id)!),
    }),
  );
  writeFileSync(
    join(REPORT_DIR, 'map-report.md'),
    buildReport(
      config,
      provinces,
      provinceRegion,
      unitSet.droppedClusters,
      report,
      tinyReport,
      zones.length,
      warnings,
      [
        `every country has its traditional color from \`country-colors.json\`; ${adjustedColors.length} were shifted a little to stay apart from a neighbor. The two bordering countries with the most similar colors are ${closestColors.a} and ${closestColors.b} (difference ${closestColors.difference.toFixed(2)}; below ${MIN_BORDER_CONTRAST} would be hard to tell apart).`,
        '',
        `**Region colors:** clearly different colors chosen so that regions that border or nearly touch are easy to tell apart; the two bordering regions with the most similar colors are ${closestRegions.a} and ${closestRegions.b} (difference ${closestRegions.difference.toFixed(2)}).`,
        '',
        '## Country colors that were shifted',
        '',
        'A country keeps its traditional color unless a country around it looks too much alike; then the one with fewer provinces is shifted to the nearest shade that can be told apart (most changed first). To give a country another color, change `country-colors.json`.',
        '',
        '| Country | Traditional | On the map | Change |',
        '|---|---|---|---|',
        ...adjustedColors.map(
          (c) =>
            `| ${countryNames.get(c.id) ?? c.id} | \`${c.wanted}\` | \`${c.got}\` | ${c.change.toFixed(2)} |`,
        ),
      ].join('\n'),
    ),
  );

  return {
    countries: countryIds.length,
    provinces: provinces.length,
    regions: regionConfigs.length,
    seaZones: zones.length,
    warnings,
  };
}

function buildReport(
  config: MapConfig,
  provinces: readonly ProvinceDraft[],
  provinceRegion: readonly string[],
  dropped: readonly { country: string; names: string[] }[],
  report: { merges: number },
  tiny: TinyProvinceReport,
  seaZoneCount: number,
  warnings: readonly string[],
  colorNote: string,
): string {
  const lines: string[] = [];
  const perCountry = new Map<string, number>();
  for (const p of provinces) perCountry.set(p.country, (perCountry.get(p.country) ?? 0) + 1);
  const perRegion = new Map<string, number>();
  for (const r of provinceRegion) perRegion.set(r, (perRegion.get(r) ?? 0) + 1);
  lines.push('# Map import report', '');
  lines.push(
    'Generated by `npm run import:map`. Do not edit by hand: change the files in `packages/tools/map-config/` and run the import again.',
    '',
  );
  lines.push(`- **Countries:** ${perCountry.size}`);
  lines.push(
    `- **Provinces:** ${provinces.length} (made by ${report.merges} merges of the ${config.settings.naturalEarth.version} Natural Earth states and provinces; provinces are never cut)`,
  );
  lines.push(`- **Regions:** ${config.regions.regions.length}`);
  lines.push(`- **Sea zones:** ${seaZoneCount}`);
  lines.push(`- **Country colors:** ${colorNote}`, '');
  lines.push('Pictures: [provinces by country](provinces.png) · [regions](regions.png)', '');
  if (warnings.length > 0) {
    lines.push('## Warnings', '', ...warnings.map((w) => `- ${w}`), '');
  }
  lines.push(
    '## Countries',
    '',
    '| Id | Country | Provinces | Also includes |',
    '|---|---|---|---|',
  );
  for (const c of [...config.countries.countries].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(
      `| ${c.id} | ${c.name} | ${perCountry.get(c.id) ?? 0} | ${(c.includes ?? []).join(', ')} |`,
    );
  }
  lines.push('', '## Left out of the game world', '');
  lines.push(`Territories: ${config.countries.leftOut.join(', ')}`, '');
  lines.push('Uninhabited islands (fewer people than `minClusterPopulation`):', '');
  for (const d of dropped) lines.push(`- ${d.country}: ${d.names.join(', ')}`);
  const nameOf = (id: string) => provinces.find((p) => p.id === id)?.name ?? id;
  lines.push(
    '',
    '## Tiny provinces',
    '',
    `Too small for the map data (\`tiny-provinces.json\`). Drawn as a disc of ${config.tinyProvinces.radiusKm} km radius so they can be seen and clicked (the data keeps their real area): ${tiny.enlarged.map(nameOf).join(', ') || 'none'}.`,
    '',
    `Left out of the game: ${tiny.leftOut.join(', ') || 'none'}.`,
  );
  lines.push('', '## Regions', '', '| Region | Climate | Provinces |', '|---|---|---|');
  for (const r of config.regions.regions)
    lines.push(`| ${r.name} | ${r.climate} | ${perRegion.get(r.id) ?? 0} |`);
  lines.push(
    '',
    '## Combined provinces',
    '',
    'Provinces made from several source states/provinces (name ← members). The name comes from `province-groups.json` (group), the source data (grouping, territory), the main member when a tiny piece was added (absorbed), the two members (pair), or a direction in the country (direction). Better names go in `province-groups.json` or `province-names.json`.',
    '',
  );
  for (const p of provinces) {
    if (p.sourceUnits.length > 1)
      lines.push(`- ${p.country} **${p.name}** _(${p.nameSource})_ ← ${p.sourceUnits.join(', ')}`);
  }
  lines.push('', '## Provinces by country', '');
  const byCountry = new Map<string, string[]>();
  for (const p of provinces)
    byCountry.set(p.country, [...(byCountry.get(p.country) ?? []), p.name]);
  for (const [country, names] of [...byCountry].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`- **${country}** (${names.length}): ${names.join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}
