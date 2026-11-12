import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FeatureCollection, Geometry, Point } from 'geojson';
import { REPO_ROOT } from '../load-data';

/**
 * Natural Earth (public domain, naturalearthdata.com) source files. They are
 * downloaded once from the project's GitHub mirror into `.cache/natural-earth/`
 * (not committed); only the much smaller game data generated from them is.
 */
export const CACHE_DIR = join(REPO_ROOT, '.cache/natural-earth');

export const SOURCE_FILES = {
  countries: 'ne_10m_admin_0_countries',
  provinces: 'ne_10m_admin_1_states_provinces',
  places: 'ne_10m_populated_places_simple',
} as const;
export type SourceKey = keyof typeof SOURCE_FILES;

const DOWNLOAD_HOST = 'raw.githubusercontent.com';

function sourceUrl(version: string, name: string): string {
  return `https://${DOWNLOAD_HOST}/nvkelso/natural-earth-vector/${version}/geojson/${name}.geojson`;
}

/** Downloads any missing source files. Explains clearly what to do if the network blocks it. */
export async function ensureSources(version: string, log: (line: string) => void): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  for (const name of Object.values(SOURCE_FILES)) {
    const path = join(CACHE_DIR, `${version}-${name}.geojson`);
    if (existsSync(path)) continue;
    const url = sourceUrl(version, name);
    log(`Downloading ${name} (Natural Earth ${version})…`);
    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new Error(
        `Could not download ${url} (${(error as Error).message}).\n` +
          `If this machine's network allowlist blocks it, allow the host "${DOWNLOAD_HOST}" in the ` +
          `environment's network settings, or upload the file to ${path}.`,
        { cause: error },
      );
    }
    if (!response.ok) {
      throw new Error(
        `Downloading ${url} failed with HTTP ${response.status}. ` +
          (response.status === 403
            ? `The network allowlist probably blocks "${DOWNLOAD_HOST}": allow it in the environment's network settings.`
            : 'Check that the Natural Earth version in map-config/settings.json exists.'),
      );
    }
    const text = await response.text();
    writeFileSync(`${path}.part`, text);
    renameSync(`${path}.part`, path);
  }
}

export interface SourceData {
  countries: FeatureCollection<Geometry | null, Record<string, unknown>>;
  provinces: FeatureCollection<Geometry | null, Record<string, unknown>>;
  places: FeatureCollection<Point, Record<string, unknown>>;
}

export function readSources(version: string): SourceData {
  const read = (key: SourceKey) =>
    JSON.parse(
      readFileSync(join(CACHE_DIR, `${version}-${SOURCE_FILES[key]}.geojson`), 'utf8'),
    ) as unknown;
  return {
    countries: read('countries') as SourceData['countries'],
    provinces: read('provinces') as SourceData['provinces'],
    places: read('places') as SourceData['places'],
  };
}
