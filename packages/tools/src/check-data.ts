/**
 * `npm run check:data`: validates every JSON file in `data/` against its
 * schema, runs the cross-file checks, and checks `locales/en.json`.
 * Exits with an error (and a list of every problem) if anything is wrong.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_FILES, DataValidationError, formatDataIssue } from '@terra-scutum/sim';
import { checkLocale } from './check-locale';
import { LOCALES_DIR, loadGameDataFromDisk } from './load-data';

let problemCount = 0;
const fail = (message: string) => {
  problemCount += 1;
  console.error(`  ✗ ${message}`);
};

console.log('Checking game data…');
try {
  loadGameDataFromDisk();
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
  if (problems.length === 0) {
    console.log(`  ✓ locales/${file}: ${Object.keys(content as object).length} text(s) valid`);
  }
}

if (problemCount > 0) {
  console.error(`\nData check failed: ${problemCount} problem(s).`);
  process.exit(1);
}
console.log('\nData check passed.');
