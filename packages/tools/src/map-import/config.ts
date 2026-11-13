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
    /** Each country aims for one province per this much area… */
    areaPerProvinceKm2: z.number().positive(),
    /** …plus √(population ÷ this many people) provinces. Provinces are only ever merged, never cut. */
    populationUnit: z.number().positive(),
    /** Only provinces lighter than this (in "average province" units) are merged into a neighbor. */
    mergeBelowLoad: z.number().positive(),
    /** A province with no land neighbor of its country (an island) only merges across the sea if lighter than this. */
    seaMergeBelowLoad: z.number().min(0),
    /**
     * Source groupings (for example Greater London, Bretagne) lighter than this are combined into
     * one province before anything else, so they keep their natural shape and name.
     */
    wholeGroupingBelowLoad: z.number().min(0),
    /** Penalty for merging provinces from different source groupings (keeps merges inside historical regions). */
    groupingMergePenalty: z.number().min(1),
    /** A merged province keeps the name of a member holding at least this share of it (a tiny piece was absorbed). */
    dominantShare: z.number().min(0.5).max(1),
    /** Pieces of the same country closer than this form one cluster (merges happen inside clusters only). */
    clusterDistanceKm: z.number().positive(),
    /** Clusters with fewer people than this (uninhabited islands) are left out of the game. */
    minClusterPopulation: z.number().min(0),
    /** Islets smaller than this are dropped from a province (its largest piece is always kept). */
    minIsletAreaKm2: z.number().min(0),
  }),
  colors: z.strictObject({
    /**
     * Countries without a shared border still get clearly different map colors when their
     * land is closer together than this (across a strait or a narrow sea).
     */
    nearCountryKm: z.number().min(0),
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
      /**
       * Natural Earth territories (ADM0_A3 codes) in this region. "GBR" is Great Britain itself;
       * overseas territories have their own codes (BMU, FLK…).
       */
      countries: z.array(z.string().regex(countryIdPattern)).optional(),
      /** States/provinces in this region, by ISO 3166-2 code (e.g. "US-TX"); these win over `countries`. */
      units: z.array(z.string().min(2)).optional(),
      /** Fallback: anything not listed anywhere joins the region with the nearest seed (the import warns). */
      seeds: z.array(lonLat).min(1),
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

export const provinceGroupsSchema = z.strictObject({
  /** Countries whose states/provinces are never combined automatically (only by the groups below). */
  keepSeparate: z.array(z.string().regex(countryIdPattern)),
  /** States/provinces always combined into one province with the given name. */
  groups: z.array(
    z.strictObject({
      country: z.string().regex(countryIdPattern),
      name: z.string().min(1),
      /** ISO 3166-2 codes of the source states/provinces (e.g. "US-CT"). */
      units: z.array(z.string().min(2)).optional(),
      /** Source groupings (Natural Earth "region" names, e.g. "East Wales") whose states/provinces all join. */
      groupings: z.array(z.string().min(1)).optional(),
      /** Source states/provinces by name (as in the report), for those without an ISO code. */
      names: z.array(z.string().min(1)).optional(),
      /** Whole Natural Earth territories (e.g. "HKG" for Hong Kong). */
      territories: z.array(z.string().regex(countryIdPattern)).optional(),
    }),
  ),
});
export type ProvinceGroupsConfig = z.infer<typeof provinceGroupsSchema>;

export const provinceNamesSchema = z.strictObject({
  /** Display names that replace the generated ones, by province id. Ids never change. */
  provinces: z.record(z.string().regex(idPattern), z.string().min(1)),
});
export type ProvinceNamesConfig = z.infer<typeof provinceNamesSchema>;

export const tinyProvincesSchema = z.strictObject({
  /** Radius of the disc an enlarged province is drawn as [DEFAULT]. */
  radiusKm: z.number().positive(),
  /** Corners of that disc. */
  discPoints: z.number().int().min(8).max(128),
  /** Provinces too small for the map data, drawn as a disc so they can be seen and clicked. */
  enlarge: z.array(
    z.strictObject({
      id: z.string().regex(idPattern),
      /** Where the disc is drawn: [longitude, latitude]. */
      center: lonLat,
      /** The real area, written to the data (the disc is only how it is drawn). */
      areaKm2: z.number().positive(),
    }),
  ),
  /** Provinces too small for the map data that are not part of the game. */
  leaveOut: z.array(z.string().regex(idPattern)),
});
export type TinyProvincesConfig = z.infer<typeof tinyProvincesSchema>;

export interface MapConfig {
  readonly settings: MapSettings;
  readonly countries: CountriesConfig;
  readonly regions: RegionsConfig;
  readonly seaZones: SeaZonesConfig;
  readonly provinceGroups: ProvinceGroupsConfig;
  readonly provinceNames: ProvinceNamesConfig;
  readonly tinyProvinces: TinyProvincesConfig;
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
    provinceGroups: readConfigFile(dir, 'province-groups.json', provinceGroupsSchema),
    provinceNames: readConfigFile(dir, 'province-names.json', provinceNamesSchema),
    tinyProvinces: readConfigFile(dir, 'tiny-provinces.json', tinyProvincesSchema),
  };
}
