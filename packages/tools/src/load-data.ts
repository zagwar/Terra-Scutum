import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATA_FILES,
  type DataFileKey,
  type DataIssue,
  DataValidationError,
  type GameData,
  type RawGameData,
  parseGameData,
} from '@terra-scutum/sim';

/** The repository root (three folders up from `packages/tools/src`). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const DATA_DIR = join(REPO_ROOT, 'data');
export const LOCALES_DIR = join(REPO_ROOT, 'locales');

/**
 * Reads every data file listed in the sim's `DATA_FILES` from disk, without
 * validating the content. Throws a `DataValidationError` for files that are
 * missing, aren't valid JSON, or aren't in the list (usually a typo in the name).
 */
export function readRawGameData(dataDir: string = DATA_DIR): RawGameData {
  const issues: DataIssue[] = [];
  const raw: Partial<Record<DataFileKey, unknown>> = {};
  const knownFiles = new Set<string>();

  for (const key of Object.keys(DATA_FILES) as DataFileKey[]) {
    const { file } = DATA_FILES[key];
    knownFiles.add(file);
    const path = join(dataDir, file);
    if (!existsSync(path)) {
      issues.push({ file, path: '', message: 'file is missing' });
      continue;
    }
    try {
      raw[key] = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    } catch (error) {
      issues.push({ file, path: '', message: `not valid JSON (${(error as Error).message})` });
    }
  }

  if (existsSync(dataDir)) {
    for (const file of readdirSync(dataDir).sort()) {
      if (file.endsWith('.json') && !knownFiles.has(file)) {
        issues.push({
          file,
          path: '',
          message:
            'this file is not in the DATA_FILES list in packages/sim/src/data/game-data.ts, so the game would ignore it',
        });
      }
    }
  }

  if (issues.length > 0) throw new DataValidationError(issues);
  return raw as RawGameData;
}

/** Reads and validates all game data from disk. Used by the campaign runner, the tools and tests. */
export function loadGameDataFromDisk(dataDir: string = DATA_DIR): GameData {
  return parseGameData(readRawGameData(dataDir));
}
