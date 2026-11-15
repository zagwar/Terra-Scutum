/**
 * `npm run check:data`: validates every JSON file in `data/` against its
 * schema, runs the cross-file checks, and checks `locales/en.json`.
 * Exits with an error (and a list of every problem) if anything is wrong.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_FILES, DataValidationError, type GameData, formatDataIssue } from '@terra-scutum/sim';
import { checkGeometry, checkMapNames, checkRivers, checkTerrainTiles } from './check-map-assets';
import { checkLocale } from './check-locale';
import { DATA_DIR, LOCALES_DIR, REPO_ROOT, loadGameDataFromDisk } from './load-data';

let problemCount = 0;
const fail = (message: string) => {
  problemCount += 1;
  console.error(`  ✗ ${message}`);
};

console.log('Checking game data…');
let data: GameData | null = null;
try {
  data = loadGameDataFromDisk();
  console.log(`  ✓ ${Object.keys(DATA_FILES).length} data file(s) valid`);
} catch (error) {
  if (!(error instanceof DataValidationError)) throw error;
  for (const issue of error.issues) fail(formatDataIssue(issue));
}

console.log('Checking translations…');
const localeFiles = existsSync(LOCALES_DIR)
  ? readdirSync(LOCALES_DIR)
      .filter((file) => file.endsWith('.json'))
      .sort()
  : [];
if (!localeFiles.includes('en.json')) fail('locales/en.json is missing');
// English texts: en.json (written by hand) plus en.*.json (generated, e.g. map names).
const englishTexts = new Map<string, string>();
for (const file of localeFiles) {
  let content: unknown;
  try {
    content = JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8'));
  } catch (error) {
    fail(`locales/${file}: not valid JSON (${(error as Error).message})`);
    continue;
  }
  const problems = checkLocale(content);
  for (const problem of problems) fail(`locales/${file} → ${problem}`);
  if (
    (file === 'en.json' || file.startsWith('en.')) &&
    typeof content === 'object' &&
    content !== null
  ) {
    for (const [key, text] of Object.entries(content as Record<string, unknown>)) {
      if (englishTexts.has(key))
        fail(`locales/${file} → ${key} is also defined in another English file`);
      if (typeof text === 'string') englishTexts.set(key, text);
    }
  }
  if (problems.length === 0) {
    console.log(`  ✓ locales/${file}: ${Object.keys(content as object).length} text(s) valid`);
  }
}

if (data) {
  console.log('Checking names and map shapes…');
  const before = problemCount;
  for (const problem of checkMapNames(data, englishTexts)) fail(problem);
  const shapes: [string, string, string[]][] = [
    ['geometry/provinces.topo.json', 'provinces', data.provinces.provinces.map((p) => p.id)],
    ['geometry/sea_zones.topo.json', 'seaZones', data.seaZones.seaZones.map((s) => s.id)],
  ];
  for (const [file, objectName, ids] of shapes) {
    let content: unknown;
    try {
      content = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'));
    } catch (error) {
      fail(`data/${file}: missing or not valid JSON (${(error as Error).message})`);
      continue;
    }
    for (const problem of checkGeometry(`data/${file}`, content, objectName, ids)) fail(problem);
  }
  if (problemCount === before)
    console.log(
      '  ✓ every map item, government type, message type, alert type and country screen entry has a name, every map item a shape',
    );
}

if (data) {
  console.log('Checking the terrain…');
  const before = problemCount;
  for (const problem of checkTerrainTiles(data, join(REPO_ROOT, 'packages/game/public/terrain')))
    fail(problem);
  try {
    const rivers: unknown = JSON.parse(
      readFileSync(join(DATA_DIR, 'geometry/rivers.json'), 'utf8'),
    );
    for (const problem of checkRivers('data/geometry/rivers.json', rivers)) fail(problem);
  } catch (error) {
    fail(`data/geometry/rivers.json: missing or not valid JSON (${(error as Error).message})`);
  }
  if (problemCount === before)
    console.log(
      `  ✓ ${data.terrainTiles.levels.reduce((sum, level) => sum + level.tiles.length, 0)} terrain tiles in ${data.terrainTiles.levels.length} levels, and the rivers`,
    );
}

if (problemCount > 0) {
  console.error(`\nData check failed: ${problemCount} problem(s).`);
  process.exit(1);
}
console.log('\nData check passed.');
