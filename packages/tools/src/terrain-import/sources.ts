import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fromUrl } from 'geotiff';
import { z } from 'zod';
import { REPO_ROOT } from '../load-data';

/**
 * The terrain import's settings and its source downloads. Everything is
 * downloaded once into `.cache/` (not committed); only the much smaller game
 * files made from it are.
 *
 * - Elevation: the "Terrain Tiles" open dataset on Amazon S3 (Mapzen's
 *   "terrarium" tiles). At the zoom used here the land is GMTED2010 (U.S.
 *   Geological Survey) and the sea floor ETOPO1 (NOAA): public domain.
 * - Land cover: ESA WorldCover 2021 v200 (CC BY 4.0), of which only each
 *   tile's coarsest overview (about 600 m per pixel) is read.
 * - Rivers: Natural Earth (public domain), from the same mirror as the map import.
 */
export const TERRAIN_CONFIG_DIR = join(REPO_ROOT, 'packages/tools/terrain-config');
export const TERRAIN_CACHE_DIR = join(REPO_ROOT, '.cache/terrain');
const NATURAL_EARTH_CACHE_DIR = join(REPO_ROOT, '.cache/natural-earth');
const NATURAL_EARTH_HOST = 'raw.githubusercontent.com';

const settingsSchema = z.strictObject({
  elevation: z.strictObject({
    /** `{z}`, `{x}` and `{y}` are replaced by the tile's zoom, column and row. */
    tileUrl: z.string().url(),
    /** The tiles' zoom level: 6 gives 16,384 pixels around the world. */
    zoom: z.number().int().min(3).max(8),
  }),
  landCover: z.strictObject({
    bucketUrl: z.string().url(),
    prefix: z.string(),
    /** Width and height of each tile's coarsest overview, in pixels. */
    overviewSize: z.number().int().positive(),
    /** Each tile covers this many degrees of longitude and latitude. */
    tileDegrees: z.number().positive(),
  }),
  rivers: z.strictObject({
    /** The Natural Earth file (without `.geojson`). */
    source: z.string(),
    /** Bends smaller than this are dropped. */
    simplifyDegrees: z.number().min(0).max(1),
    /** Points are stored as whole numbers of 1/unitsPerDegree degrees. */
    unitsPerDegree: z.number().int().min(10).max(100000),
  }),
  tiles: z.strictObject({
    baseCells: z.number().int().min(256),
    tileCells: z.number().int().min(16),
    levels: z.number().int().min(1).max(8),
    /**
     * Levels below this one store two land cover classes per cell and how they mix (smoother
     * colors from far away); the finer levels store only the main class, which keeps them small.
     */
    mixedCoverLevels: z.number().int().min(0).max(8),
  }),
  downloads: z.strictObject({ concurrency: z.number().int().min(1).max(64) }),
});
export type TerrainSettings = z.infer<typeof settingsSchema>;

export function loadTerrainSettings(): TerrainSettings {
  const raw = JSON.parse(
    readFileSync(join(TERRAIN_CONFIG_DIR, 'settings.json'), 'utf8'),
  ) as unknown;
  return settingsSchema.parse(raw);
}

/** What to tell the designer when a download is refused. */
function blockedMessage(url: string, reason: string): string {
  const host = new URL(url).host;
  return (
    `Could not download ${url} (${reason}).\n` +
    `If this machine's network allowlist blocks it, allow the host "${host}" in the ` +
    `environment's network settings (environment selector under the message box → edit ` +
    `environment → network access → add the host), then run the import again.`
  );
}

async function download(url: string): Promise<Uint8Array> {
  let lastError = 'no answer';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      lastError = `HTTP ${response.status}`;
      if (response.status === 403 || response.status === 404) break;
    } catch (error) {
      lastError = (error as Error).message;
    }
  }
  throw new Error(blockedMessage(url, lastError));
}

/** Runs `job` for every item, a few at a time. */
async function inParallel<T>(
  items: readonly T[],
  concurrency: number,
  job: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      await job(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

function writeAtomically(path: string, content: Uint8Array | string): void {
  writeFileSync(`${path}.part`, content);
  renameSync(`${path}.part`, path);
}

// ── Elevation ────────────────────────────────────────────────────────────────

export function elevationTilePath(zoom: number, x: number, y: number): string {
  return join(TERRAIN_CACHE_DIR, 'terrarium', `${zoom}_${x}_${y}.png`);
}

/** Downloads the elevation tiles of rows 0…`lastRow` (every column) that aren't in the cache yet. */
export async function ensureElevationTiles(
  settings: TerrainSettings,
  lastRow: number,
  log: (line: string) => void,
): Promise<void> {
  const { zoom, tileUrl } = settings.elevation;
  mkdirSync(join(TERRAIN_CACHE_DIR, 'terrarium'), { recursive: true });
  const missing: { x: number; y: number }[] = [];
  for (let x = 0; x < 2 ** zoom; x++)
    for (let y = 0; y <= lastRow; y++)
      if (!existsSync(elevationTilePath(zoom, x, y))) missing.push({ x, y });
  if (missing.length === 0) return;
  log(
    `Downloading ${missing.length} elevation tiles (about ${Math.round(missing.length * 0.09)} MB)…`,
  );
  let done = 0;
  await inParallel(missing, settings.downloads.concurrency, async ({ x, y }) => {
    const url = tileUrl
      .replace('{z}', String(zoom))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
    writeAtomically(elevationTilePath(zoom, x, y), await download(url));
    if (++done % 500 === 0) log(`  ${done} / ${missing.length}`);
  });
}

// ── Land cover ───────────────────────────────────────────────────────────────

export interface LandCoverTile {
  /** For example `N45E006`: the tile's south-west corner. */
  readonly name: string;
  readonly southLatitude: number;
  readonly westLongitude: number;
}

function landCoverTileOf(key: string): LandCoverTile | null {
  const match = /_([NS])(\d{2})([EW])(\d{3})_Map\.tif$/.exec(key);
  if (!match) return null;
  return {
    name: `${match[1]}${match[2]}${match[3]}${match[4]}`,
    southLatitude: Number(match[2]) * (match[1] === 'N' ? 1 : -1),
    westLongitude: Number(match[4]) * (match[3] === 'E' ? 1 : -1),
  };
}

const landCoverPath = (name: string) => join(TERRAIN_CACHE_DIR, 'worldcover', `${name}.u8.gz`);

/** Lists the land cover tiles (asking the bucket once) and downloads the overviews not in the cache yet. */
export async function ensureLandCover(
  settings: TerrainSettings,
  log: (line: string) => void,
): Promise<LandCoverTile[]> {
  const { bucketUrl, prefix, overviewSize } = settings.landCover;
  mkdirSync(join(TERRAIN_CACHE_DIR, 'worldcover'), { recursive: true });
  const listPath = join(TERRAIN_CACHE_DIR, 'worldcover-list.txt');
  if (!existsSync(listPath)) {
    log('Listing the land cover tiles…');
    const keys: string[] = [];
    let token: string | null = null;
    do {
      const url = new URL(bucketUrl);
      url.searchParams.set('list-type', '2');
      url.searchParams.set('prefix', prefix);
      if (token) url.searchParams.set('continuation-token', token);
      const xml = new TextDecoder().decode(await download(url.toString()));
      for (const match of xml.matchAll(/<Key>([^<]+_Map\.tif)<\/Key>/g)) keys.push(match[1]);
      token = /<NextContinuationToken>([^<]+)</.exec(xml)?.[1] ?? null;
    } while (token);
    if (keys.length === 0)
      throw new Error(`${bucketUrl} lists no land cover tiles under ${prefix}`);
    writeAtomically(listPath, `${keys.join('\n')}\n`);
  }
  const keys = readFileSync(listPath, 'utf8').trim().split('\n');
  const tiles: (LandCoverTile & { key: string })[] = [];
  for (const key of keys) {
    const tile = landCoverTileOf(key);
    if (tile) tiles.push({ ...tile, key });
  }
  const missing = tiles.filter((tile) => !existsSync(landCoverPath(tile.name)));
  if (missing.length > 0) {
    log(
      `Downloading ${missing.length} land cover overviews (about ${Math.round(missing.length * 0.025)} MB)…`,
    );
    let done = 0;
    await inParallel(missing, settings.downloads.concurrency, async (tile) => {
      const url = bucketUrl + tile.key;
      let lastError = '';
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          // The file is a cloud-optimized GeoTIFF: only its header and its smallest overview are read.
          const tiff = await fromUrl(url);
          const image = await tiff.getImage((await tiff.getImageCount()) - 1);
          if (image.getWidth() !== overviewSize || image.getHeight() !== overviewSize)
            throw new Error(`unexpected overview size ${image.getWidth()}`);
          const [data] = (await image.readRasters()) as unknown as [Uint8Array];
          writeAtomically(
            landCoverPath(tile.name),
            gzipSync(Buffer.from(data.buffer, data.byteOffset, data.byteLength)),
          );
          lastError = '';
          break;
        } catch (error) {
          lastError = (error as Error).message;
        }
      }
      if (lastError) throw new Error(blockedMessage(url, lastError));
      if (++done % 500 === 0) log(`  ${done} / ${missing.length}`);
    });
  }
  return tiles.sort((a, b) => a.name.localeCompare(b.name));
}

/** One land cover overview: `overviewSize`² class codes, the top row is the north. */
export function readLandCover(tile: LandCoverTile): Uint8Array {
  return new Uint8Array(gunzipSync(readFileSync(landCoverPath(tile.name))));
}

// ── Rivers ───────────────────────────────────────────────────────────────────

/** The Natural Earth rivers file as parsed GeoJSON, downloaded once. */
export async function ensureRivers(
  settings: TerrainSettings,
  naturalEarthVersion: string,
  log: (line: string) => void,
): Promise<unknown> {
  mkdirSync(NATURAL_EARTH_CACHE_DIR, { recursive: true });
  const name = settings.rivers.source;
  const path = join(NATURAL_EARTH_CACHE_DIR, `${naturalEarthVersion}-${name}.geojson`);
  if (!existsSync(path)) {
    log(`Downloading ${name} (Natural Earth ${naturalEarthVersion})…`);
    const url = `https://${NATURAL_EARTH_HOST}/nvkelso/natural-earth-vector/${naturalEarthVersion}/geojson/${name}.geojson`;
    writeAtomically(path, await download(url));
  }
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
