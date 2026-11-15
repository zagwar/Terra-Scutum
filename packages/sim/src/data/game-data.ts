import type { z } from 'zod';
import {
  type CountriesFile,
  type ProvincesFile,
  type RegionsFile,
  type SeaZonesFile,
  countriesFileSchema,
  provincesFileSchema,
  regionsFileSchema,
  seaZonesFileSchema,
} from '../world/world-data';
import { checkWorldData } from '../world/world-checks';
import {
  type CountryStartFile,
  checkCountryStart,
  countryStartFileSchema,
} from '../world/country-start';
import {
  type GovernmentTypesFile,
  governmentTypesFileSchema,
  checkGovernmentTypes,
} from '../politics/government-types';
import { type GameConfig, gameConfigSchema } from './game-config';
import { type MapViewConfig, mapViewSchema } from './map-view-config';
import { type TerrainTilesFile, terrainTilesFileSchema } from './terrain-format';
import {
  type NotificationsConfig,
  checkNotifications,
  checkPlayerCountry,
  notificationsSchema,
} from './notifications-config';
import {
  type CountryFlagsConfig,
  type CountryScreenConfig,
  checkCountryFlags,
  checkCountryScreen,
  checkQuickPicks,
  countryFlagsSchema,
  countryScreenSchema,
} from './country-screen-config';

/**
 * The list of JSON data files in `data/`, each with the zod schema that
 * checks it. To add a data file: write its schema, add it here, add its type
 * to `GameData`, and (if it refers to ids in other files) add a cross-check.
 *
 * The sim never reads files itself. Its hosts do (the sim worker bundles the
 * JSON; the campaign runner and tools read it from disk) and pass the raw
 * content to `parseGameData`.
 */
export const DATA_FILES = {
  gameConfig: { file: 'game_config.json', schema: gameConfigSchema },
  countries: { file: 'countries.json', schema: countriesFileSchema },
  provinces: { file: 'provinces.json', schema: provincesFileSchema },
  regions: { file: 'regions.json', schema: regionsFileSchema },
  seaZones: { file: 'sea_zones.json', schema: seaZonesFileSchema },
  governmentTypes: { file: 'government_types.json', schema: governmentTypesFileSchema },
  countryStart: { file: 'country_start.json', schema: countryStartFileSchema },
  mapView: { file: 'map_view.json', schema: mapViewSchema },
  terrainTiles: { file: 'terrain_tiles.json', schema: terrainTilesFileSchema },
  notifications: { file: 'notifications.json', schema: notificationsSchema },
  countryScreen: { file: 'country_screen.json', schema: countryScreenSchema },
  countryFlags: { file: 'country_flags.json', schema: countryFlagsSchema },
} as const satisfies Record<string, { file: string; schema: z.ZodType }>;

export type DataFileKey = keyof typeof DATA_FILES;

/** The unvalidated content of every data file, as parsed from JSON. */
export type RawGameData = Readonly<Record<DataFileKey, unknown>>;

/** All game data, validated. Read-only: the sim never changes it. */
export interface GameData {
  readonly gameConfig: GameConfig;
  readonly countries: CountriesFile;
  readonly provinces: ProvincesFile;
  readonly regions: RegionsFile;
  readonly seaZones: SeaZonesFile;
  readonly governmentTypes: GovernmentTypesFile;
  /** Each country's real-world starting data (F71). */
  readonly countryStart: CountryStartFile;
  /** How the map is drawn; used by the game, not by the sim's systems. */
  readonly mapView: MapViewConfig;
  /** Which terrain tiles exist (F125, written by the terrain import); used by the game, not by the sim's systems. */
  readonly terrainTiles: TerrainTilesFile;
  /** Message types and alert types of the UI shell (F122); used by the game, not by the sim's systems. */
  readonly notifications: NotificationsConfig;
  /** The lists the country screen shows (F138); used by the game, not by the sim's systems. */
  readonly countryScreen: CountryScreenConfig;
  /** Which flag each country shows (F138); used by the game, not by the sim's systems. */
  readonly countryFlags: CountryFlagsConfig;
}

/** One problem found in the data: which file, where in it, and what's wrong. */
export interface DataIssue {
  readonly file: string;
  /** Path inside the file, for example `performanceBudget.dailyTickAverageMs`. Empty for the whole file. */
  readonly path: string;
  readonly message: string;
}

export function formatDataIssue(issue: DataIssue): string {
  return `data/${issue.file}${issue.path ? ` → ${issue.path}` : ''}: ${issue.message}`;
}

/** Thrown when the data is invalid. Lists every problem found, not just the first. */
export class DataValidationError extends Error {
  readonly issues: readonly DataIssue[];

  constructor(issues: readonly DataIssue[]) {
    super(
      `Game data is invalid (${issues.length} problem${issues.length === 1 ? '' : 's'}):\n` +
        issues.map((issue) => `  - ${formatDataIssue(issue)}`).join('\n'),
    );
    this.name = 'DataValidationError';
    this.issues = issues;
  }
}

/**
 * A check that looks across files (unknown ids, bad references, duplicates).
 * It runs only when every file passed its own schema.
 */
export type DataCrossCheck = (data: GameData, report: (issue: DataIssue) => void) => void;

/** Cross-file checks. Features add theirs as their data files arrive. */
/** The terrain tiles must have been made for the map's projection, and reach the level the game asks for. */
const checkTerrainTiles: DataCrossCheck = (data, report) => {
  const made = data.terrainTiles.projection;
  const used = data.mapView.projection;
  if (
    made.type !== used.type ||
    made.southLatitude !== used.southLatitude ||
    made.northLatitude !== used.northLatitude
  )
    report({
      file: 'terrain_tiles.json',
      path: 'projection',
      message:
        'the terrain was made for another map projection than map_view.json: run `npm run import:terrain` again',
    });
  const { tileCells } = data.terrainTiles;
  data.mapView.terrain.meshSteps.forEach((step, level) => {
    if (tileCells % step !== 0)
      report({
        file: 'map_view.json',
        path: `terrain.meshSteps.${level}`,
        message: `a terrain tile has ${tileCells} cells along a side: ${step} doesn't divide it evenly`,
      });
  });
  if (data.mapView.terrain.maxLevel >= data.terrainTiles.levels.length)
    report({
      file: 'map_view.json',
      path: 'terrain.maxLevel',
      message: `the terrain only has levels 0 to ${data.terrainTiles.levels.length - 1}`,
    });
};

const CROSS_CHECKS: readonly DataCrossCheck[] = [
  checkTerrainTiles,
  checkWorldData,
  checkGovernmentTypes,
  checkCountryStart,
  checkNotifications,
  checkPlayerCountry,
  checkCountryScreen,
  checkCountryFlags,
  checkQuickPicks,
];

/**
 * Validates the raw content of all data files and returns typed game data.
 * Throws a `DataValidationError` listing every problem.
 */
export function parseGameData(raw: RawGameData): GameData {
  const issues: DataIssue[] = [];
  const parsed: Partial<Record<DataFileKey, unknown>> = {};

  for (const key of Object.keys(DATA_FILES) as DataFileKey[]) {
    const { file, schema } = DATA_FILES[key];
    if (raw[key] === undefined) {
      issues.push({ file, path: '', message: 'file is missing' });
      continue;
    }
    const result = schema.safeParse(raw[key]);
    if (result.success) {
      parsed[key] = result.data;
    } else {
      for (const issue of result.error.issues) {
        issues.push({ file, path: issue.path.join('.'), message: issue.message });
      }
    }
  }
  if (issues.length > 0) throw new DataValidationError(issues);

  const data = parsed as GameData;
  for (const check of CROSS_CHECKS) check(data, (issue) => issues.push(issue));
  if (issues.length > 0) throw new DataValidationError(issues);

  return data;
}
