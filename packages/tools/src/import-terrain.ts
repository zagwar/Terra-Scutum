/**
 * `npm run import:terrain`: rebuilds the game's terrain tiles and rivers from
 * public elevation and land cover data. See terrain-import/run-import.ts.
 */
import { runTerrainImport } from './terrain-import/run-import';

const started = performance.now();
runTerrainImport()
  .then((summary) => {
    console.log(
      `\nDone in ${((performance.now() - started) / 1000).toFixed(0)} s: ${summary.tiles} tiles ` +
        `(${summary.megabytes.toFixed(1)} MB), ${summary.rivers} river lines`,
    );
  })
  .catch((error: unknown) => {
    console.error(
      `\nTerrain import failed:\n${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
