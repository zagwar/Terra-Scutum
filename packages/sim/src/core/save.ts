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
export const SAVE_FORMAT_VERSION = 1;

const uint32 = z.number().int().min(0).max(0xffff_ffff);

const saveFileSchema = z.strictObject({
  format: z.literal(SAVE_FORMAT),
  saveVersion: z.literal(SAVE_FORMAT_VERSION),
  seed: uint32,
  day: z.number().int().min(0),
  rng: z.tuple([uint32, uint32, uint32, uint32]),
});

export type SaveFile = z.infer<typeof saveFileSchema>;

type UnknownRecord = Record<string, unknown>;

/** Upgrades a save by exactly one version: the entry at key N turns a version-N save into version N+1. */
export type SaveMigration = (save: UnknownRecord) => UnknownRecord;
export type SaveMigrations = Readonly<Record<number, SaveMigration>>;

/** Migrations for every older save version that can still be loaded. (None yet: version 1 is the first.) */
export const SAVE_MIGRATIONS: SaveMigrations = {};

/** Writes the state as a plain JSON-compatible object. */
export function serializeGameState(state: GameState): SaveFile {
  const [s0, s1, s2, s3] = state.rng.getState();
  return {
    format: SAVE_FORMAT,
    saveVersion: SAVE_FORMAT_VERSION,
    seed: state.seed,
    day: state.day,
    rng: [s0, s1, s2, s3],
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
    save = { ...migrate(save), saveVersion: version + 1 };
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
  const parsed = saveFileSchema.safeParse(migrateSave(raw));
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
  return new GameState({
    data: options.data,
    seed: save.seed,
    systems: options.systems,
    restore: { day: save.day, rngState: save.rng },
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
