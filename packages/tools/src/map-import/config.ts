import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { REPO_ROOT } from '../load-data';

/**
 * The map import's input files in `packages/tools/map-config/`. They are the
 * designer-editable source of the map: which countries exist, the regions and
 * sea zones, and the [DEFAULT] numbers that shape the provinces.
 */
export const MAP_CONFIG_DIR = join(REPO_ROOT, 'packages/tools/map-config');

const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const idPattern = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const countryIdPattern = /^[A-Z]{3}$/;

export const settingsSchema = z.strictObject({
  naturalEarth: z.strictObject({
    /** Release tag of github.com/nvkelso/natural-earth-vector to download. */
    version: z.string().min(1),
  }),
  provinces: z.strictObject({
    /** Each country gets one province per this much area… */
    areaPerProvinceKm2: z.number().positive(),
    /** …plus √(population ÷ this many people) provinces. */
    populationUnit: z.number().positive(),
    /** Provinces heavier than this (in average-province units) are split. */
    maxLoad: z.number().min(1),
    /** Only provinces lighter than this (in average-province units) are ever merged into a neighbor. */
    mergeBelowLoad: z.number().positive(),
    /** Provinces lighter than this are merged into a neighbor even if it means splitting a heavy one elsewhere. */
    minMergeLoad: z.number().positive(),
    /** A province with no land neighbor of its country (an island) only merges across the sea if lighter than this. */
    seaMergeBelowLoad: z.number().min(0),
    /**
     * Source groupings (for example Greater London, Bretagne) lighter than this are combined into
     * one province before anything else, so they keep their natural shape and name.
     */
    wholeGroupingBelowLoad: z.number().min(0),
    /** Penalty for merging provinces from different source groupings (keeps merges inside historical regions). */
    groupingMergePenalty: z.number().min(1),
    /** Pieces of the same country closer than this form one cluster (merges happen inside clusters only). */
    clusterDistanceKm: z.number().positive(),
    /** Clusters with fewer people than this (uninhabited islands) are left out of the game. */
    minClusterPopulation: z.number().min(0),
    /** Islets smaller than this are dropped from a province (its largest piece is always kept). */
    minIsletAreaKm2: z.number().min(0),
    /** A province made by splitting is named after its biggest city if the city has at least this many people. */
    cityNameMinPopulation: z.number().min(0),
  }),
  raster: z.strictObject({
    /** Size of one pixel of the grid used to find sea zones and coastlines. */
    degreesPerPixel: z.number().positive(),
  }),
  geometry: z.strictObject({
    /** TopoJSON quantization (grid steps across the world). */
    quantization: z.number().int().min(1000),
    /** Simplification threshold for province borders (Visvalingam area, square degrees). */
    provinceMinWeight: z.number().min(0),
    /** Simplification threshold for sea zone borders (square degrees). */
    seaZoneMinWeight: z.number().min(0),
  }),
});
export type MapSettings = z.infer<typeof settingsSchema>;

export const countriesConfigSchema = z.strictObject({
  countries: z.array(
    z.strictObject({
      /** Game id: ISO 3166-1 alpha-3 code where one exists. */
      id: z.string().regex(countryIdPattern),
      name: z.string().min(1),
      /** The Natural Earth code (ADM0_A3) of the country's main territory. */
      source: z.string().regex(countryIdPattern),
      /** Other Natural Earth territories merged into this country. */
      includes: z.array(z.string().regex(countryIdPattern)).optional(),
    }),
  ),
  /** Natural Earth territories that are not part of the game world. */
  leftOut: z.array(z.string().regex(countryIdPattern)),
});
export type CountriesConfig = z.infer<typeof countriesConfigSchema>;

export const CLIMATES = [
  'tropical',
  'arid',
  'temperate',
  'continental',
  'polar',
  'highland',
] as const;

export const regionsConfigSchema = z.strictObject({
  regions: z.array(
    z.strictObject({
      id: z.string().regex(idPattern),
      name: z.string().min(1),
      climate: z.enum(CLIMATES),
      /** Points the region grows from: each province joins the region with the nearest seed. */
      seeds: z.array(lonLat).min(1),
      /** Countries whose provinces all belong to this region, whatever the distances. */
      countries: z.array(z.string().regex(countryIdPattern)).optional(),
    }),
  ),
});
export type RegionsConfig = z.infer<typeof regionsConfigSchema>;

export const seaZonesConfigSchema = z.strictObject({
  seaZones: z.array(
    z.strictObject({
      id: z.string().regex(idPattern),
      name: z.string().min(1),
      depth: z.enum(['shallow', 'deep']),
      /** Points in open water the zone grows from (it fills the water closest to them by sea). */
      seeds: z.array(lonLat).min(1),
    }),
  ),
  /** Sea zones connected by straits too narrow for the import's grid to see (e.g. the Bosporus). */
  connections: z.array(z.tuple([z.string().regex(idPattern), z.string().regex(idPattern)])),
});
export type SeaZonesConfig = z.infer<typeof seaZonesConfigSchema>;

export const provinceNamesSchema = z.strictObject({
  /** Display names that replace the generated ones, by province id. Ids never change. */
  provinces: z.record(z.string().regex(idPattern), z.string().min(1)),
});
export type ProvinceNamesConfig = z.infer<typeof provinceNamesSchema>;

export interface MapConfig {
  readonly settings: MapSettings;
  readonly countries: CountriesConfig;
  readonly regions: RegionsConfig;
  readonly seaZones: SeaZonesConfig;
  readonly provinceNames: ProvinceNamesConfig;
}

function readConfigFile<T>(dir: string, file: string, schema: z.ZodType<T>): T {
  const path = join(dir, file);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${path}: ${(error as Error).message}`, { cause: error });
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(file)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`${file} is invalid:\n${problems}`);
  }
  return result.data;
}

export function loadMapConfig(dir: string = MAP_CONFIG_DIR): MapConfig {
  return {
    settings: readConfigFile(dir, 'settings.json', settingsSchema),
    countries: readConfigFile(dir, 'countries.json', countriesConfigSchema),
    regions: readConfigFile(dir, 'regions.json', regionsConfigSchema),
    seaZones: readConfigFile(dir, 'sea-zones.json', seaZonesConfigSchema),
    provinceNames: readConfigFile(dir, 'province-names.json', provinceNamesSchema),
  };
}
