import { z } from 'zod';
import type { GameData } from '../data/game-data';
import { GameState } from './game-state';
import { SimError } from './sim-error';
import type { SystemRegistry } from './systems';

/**
 * Save format versioning.
 *
 * A save is a plain JSON object (`SaveFile`). The game compresses and stores
 * it (IndexedDB, export/import: feature F40); the sim only defines its shape.
 *
 * RULE: whenever the shape of `SaveFile` changes, increase
 * `SAVE_FORMAT_VERSION` by one and add a migration from the previous version
 * to `SAVE_MIGRATIONS`, so older saves keep loading. Saves from a newer
 * version of the game, or with no migration path, are rejected with a clear
 * message instead of loading wrongly.
 */
export const SAVE_FORMAT = 'terra-scutum-save';
export const SAVE_FORMAT_VERSION = 3;

const uint32 = z.number().int().min(0).max(0xffff_ffff);

const saveFileSchema = z.strictObject({
  format: z.literal(SAVE_FORMAT),
  saveVersion: z.literal(SAVE_FORMAT_VERSION),
  seed: uint32,
  day: z.number().int().min(0),
  rng: z.tuple([uint32, uint32, uint32, uint32]),
  /**
   * The map the save was made on: the ids of its provinces and countries, in
   * the order the arrays below use. A save only loads on the same map.
   */
  map: z.strictObject({
    provinces: z.array(z.string()),
    countries: z.array(z.string()),
  }),
  /** Owner of each province: an index into `map.countries`, in the order of `map.provinces`. */
  provinceOwners: z.array(z.number().int().min(0)),
  /** The country the player leads (its id, F05). */
  playerCountry: z.string(),
});

export type SaveFile = z.infer<typeof saveFileSchema>;

type UnknownRecord = Record<string, unknown>;

/**
 * Upgrades a save by exactly one version: the entry at key N turns a version-N
 * save into version N+1. It gets the game data too, for values an old save
 * never stored (their starting values).
 */
export type SaveMigration = (save: UnknownRecord, data: GameData) => UnknownRecord;
export type SaveMigrations = Readonly<Record<number, SaveMigration>>;

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The ids of the data's provinces and countries in index order (sorted by id, as in `WorldMap`). */
function mapIdsOf(data: GameData): { provinces: string[]; countries: string[] } {
  return {
    provinces: data.provinces.provinces.map((p) => p.id).sort(byId),
    countries: data.countries.countries.map((c) => c.id).sort(byId),
  };
}

/** Migrations for every older save version that can still be loaded. */
export const SAVE_MIGRATIONS: SaveMigrations = {
  // Version 2 (F02) added province ownership. Version 1 saves are from before
  // anything could change owner: every province has its starting owner.
  1: (save, data) => {
    const map = mapIdsOf(data);
    const countryIndex = new Map(map.countries.map((id, i) => [id, i]));
    const startingOwner = new Map(data.provinces.provinces.map((p) => [p.id, p.country]));
    return {
      ...save,
      map,
      provinceOwners: map.provinces.map((id) => countryIndex.get(startingOwner.get(id)!)),
    };
  },
  // Version 3 (F05) stores the player's country. Older saves were all played
  // as the one fixed in the data (`playerCountry` in `data/game_config.json`).
  2: (save, data) => ({ ...save, playerCountry: data.gameConfig.playerCountry }),
};

/** Writes the state as a plain JSON-compatible object. */
export function serializeGameState(state: GameState): SaveFile {
  const [s0, s1, s2, s3] = state.rng.getState();
  return {
    format: SAVE_FORMAT,
    saveVersion: SAVE_FORMAT_VERSION,
    seed: state.seed,
    day: state.day,
    rng: [s0, s1, s2, s3],
    map: { provinces: [...state.world.provinceIds], countries: [...state.world.countryIds] },
    provinceOwners: Array.from(state.provinceOwner),
    playerCountry: state.world.countryIds[state.playerCountry],
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Brings a parsed save up to the current save format version, one migration
 * at a time. Throws a `SimError` (with a translation key) if it can't.
 */
export function migrateSave(
  raw: unknown,
  data: GameData,
  migrations: SaveMigrations = SAVE_MIGRATIONS,
  targetVersion: number = SAVE_FORMAT_VERSION,
): UnknownRecord {
  if (!isRecord(raw) || raw.format !== SAVE_FORMAT) {
    throw new SimError('SAVE_ERROR_NOT_A_SAVE');
  }
  const foundVersion = raw.saveVersion;
  if (typeof foundVersion !== 'number' || !Number.isInteger(foundVersion) || foundVersion < 1) {
    throw new SimError('SAVE_ERROR_CORRUPT', {}, 'missing or invalid saveVersion');
  }
  if (foundVersion > targetVersion) {
    throw new SimError('SAVE_ERROR_NEWER_VERSION', {
      saveVersion: foundVersion,
      gameVersion: targetVersion,
    });
  }

  let save = raw;
  for (let version = foundVersion; version < targetVersion; version++) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new SimError('SAVE_ERROR_TOO_OLD', {
        saveVersion: foundVersion,
        gameVersion: targetVersion,
      });
    }
    save = { ...migrate(save, data), saveVersion: version + 1 };
  }
  return save;
}

export interface LoadOptions {
  readonly data: GameData;
  readonly systems?: SystemRegistry;
}

/**
 * Rebuilds a `GameState` from a save (already parsed from JSON). Old saves are
 * migrated first. Throws a `SimError` with a translation key if the save
 * can't be loaded.
 */
export function deserializeGameState(raw: unknown, options: LoadOptions): GameState {
  const parsed = saveFileSchema.safeParse(migrateSave(raw, options.data));
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(save)'}: ${issue.message}`)
      .join('; ');
    throw new SimError('SAVE_ERROR_CORRUPT', {}, detail);
  }
  const save = parsed.data;
  if ((save.rng[0] | save.rng[1] | save.rng[2] | save.rng[3]) === 0) {
    throw new SimError('SAVE_ERROR_CORRUPT', {}, 'rng state is all zeros');
  }
  // The arrays in a save are in the order of its own map: it must be this game's map.
  const map = mapIdsOf(options.data);
  const sameIds = (saved: readonly string[], current: readonly string[]) =>
    saved.length === current.length && saved.every((id, i) => id === current[i]);
  if (!sameIds(save.map.provinces, map.provinces) || !sameIds(save.map.countries, map.countries)) {
    throw new SimError('SAVE_ERROR_DIFFERENT_MAP');
  }
  if (
    save.provinceOwners.length !== map.provinces.length ||
    save.provinceOwners.some((owner) => owner >= map.countries.length)
  ) {
    throw new SimError('SAVE_ERROR_CORRUPT', {}, 'provinceOwners does not match the map');
  }
  const playerCountry = map.countries.indexOf(save.playerCountry);
  if (playerCountry < 0) {
    throw new SimError('SAVE_ERROR_CORRUPT', {}, `unknown player country "${save.playerCountry}"`);
  }
  return new GameState({
    data: options.data,
    seed: save.seed,
    systems: options.systems,
    restore: {
      day: save.day,
      rngState: save.rng,
      provinceOwner: Uint16Array.from(save.provinceOwners),
      playerCountry,
    },
  });
}

function fnv1a(text: string, offsetBasis: number): number {
  let hash = offsetBasis >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}

/**
 * A short fingerprint of the whole state (16 hex characters). Two runs with
 * the same seed, data and commands must give the same fingerprint; the
 * determinism tests and the campaign runner rely on it.
 */
export function hashGameState(state: GameState): string {
  const text = JSON.stringify(serializeGameState(state));
  const high = fnv1a(text, 0x811c_9dc5);
  const low = fnv1a(text, 0x01c9_dc5b);
  return high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0');
}
