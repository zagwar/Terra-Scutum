/**
 * `npm run import:map`: rebuilds the game's map data from Natural Earth and
 * the files in `packages/tools/map-config/`. See map-import/run-import.ts.
 */
import { runMapImport } from './map-import/run-import';

const started = performance.now();
runMapImport()
  .then((summary) => {
    console.log(
      `\nDone in ${((performance.now() - started) / 1000).toFixed(1)} s: ${summary.countries} countries, ` +
        `${summary.provinces} provinces, ${summary.regions} regions, ${summary.seaZones} sea zones` +
        (summary.warnings.length > 0 ? `, ${summary.warnings.length} warning(s)` : ''),
    );
  })
  .catch((error: unknown) => {
    console.error(
      `\nMap import failed:\n${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
