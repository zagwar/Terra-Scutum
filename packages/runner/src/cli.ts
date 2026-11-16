/**
 * Headless campaign runner: `npm run runner -- --days 3650 --seed 42`
 * Simulates the given number of days without the game's graphics and prints a
 * summary, including tick times against the performance budget.
 *
 * The sim stress test (F139): `npm run runner -- --stress --days 3650 --seeds 8`
 * runs the placeholder load of `data/stress_test.json` on the full map, every
 * country, one campaign per seed, and reports average, 99th-percentile and
 * worst tick times and memory.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { DataValidationError, type GameData, formatIsoDate } from '@terra-scutum/sim';
import { loadGameDataFromDisk } from '@terra-scutum/tools';
import {
  type CampaignSummary,
  type StressTestSummary,
  type TickStats,
  runCampaign,
  runStressTest,
} from './run-campaign';

const HELP = `Terra Scutum campaign runner

Usage: npm run runner -- [options]

  --days <n>    Days to simulate (default 365)
  --seed <n>    Seed for the run (default 42); the same seed gives the same campaign
  --strict      Exit with an error if tick times are over the performance budget
  --stress      The sim stress test (F139): run the placeholder load of
                data/stress_test.json instead of the game's systems
  --seeds <n>   With --stress: how many campaigns, with seeds --seed, --seed + 1, ... (default 1)
  --scale <x>   With --stress: multiply the placeholder load's sizes (default: sim.scale)
  --json <file> With --stress: also write the results to this file
  --help        Show this help
`;

function parseNumber(name: string, text: string, whole: boolean): number {
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || (whole && !Number.isInteger(value))) {
    console.error(
      `--${name} must be a ${whole ? 'whole ' : ''}number of 0 or more (got "${text}")`,
    );
    process.exit(2);
  }
  return value;
}

function describeTicks(label: string, stats: TickStats): string {
  if (stats.count === 0) return `${label}  none`;
  const verdict = stats.withinBudget ? 'OK' : 'OVER BUDGET';
  const worstBudget = stats.worstBudgetMs === null ? '' : `, worst ≤ ${stats.worstBudgetMs} ms`;
  return (
    `${label}  ${String(stats.count).padStart(6)} ticks   ` +
    `average ${stats.averageMs.toFixed(3)} ms   99% ≤ ${stats.p99Ms.toFixed(3)} ms   ` +
    `worst ${stats.worstMs.toFixed(3)} ms   budget ${stats.budgetMs} ms average${worstBudget} → ${verdict}`
  );
}

const megabytes = (bytes: number | null) =>
  bytes === null ? 'n/a' : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function loadData(): GameData {
  try {
    return loadGameDataFromDisk();
  } catch (error) {
    if (error instanceof DataValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

function printSystems(timings: CampaignSummary['systemTimings']): void {
  if (timings.length === 0) {
    console.log(
      'Systems         none yet (the daily tick is empty until the first systems are built)',
    );
    return;
  }
  console.log('Slowest systems');
  for (const { id, totalMs } of timings.slice(0, 10))
    console.log(`  ${id.padEnd(20)} ${totalMs.toFixed(1)} ms total`);
}

function runOne(data: GameData, days: number, seed: number): boolean {
  const summary = runCampaign({ data, seed, days, clock: () => performance.now() });
  console.log('Terra Scutum campaign runner');
  console.log('────────────────────────────');
  console.log(`Seed            ${summary.seed}`);
  console.log(
    `Simulated       ${summary.days} days  (${formatIsoDate(summary.startDate)} → ${formatIsoDate(summary.endDate)})`,
  );
  console.log(`Total time      ${(summary.totalMs / 1000).toFixed(2)} s`);
  console.log(describeTicks('Daily ticks   ', summary.dailyTicks));
  console.log(describeTicks('Weekly ticks  ', summary.weeklyTicks));
  printSystems(summary.systemTimings);
  console.log(
    `World population ${(summary.startPopulation / 1e9).toFixed(3)} → ${(summary.endPopulation / 1e9).toFixed(3)} billion`,
  );
  console.log(`State hash      ${summary.stateHash}`);
  return summary.dailyTicks.withinBudget && summary.weeklyTicks.withinBudget;
}

function runStress(
  data: GameData,
  days: number,
  firstSeed: number,
  seedCount: number,
  scale: number | undefined,
  jsonFile: string | undefined,
): boolean {
  const seeds = Array.from({ length: Math.max(1, seedCount) }, (_, i) => firstSeed + i);
  const memory = () => process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const result: StressTestSummary = runStressTest({
    data,
    seeds,
    days,
    scale,
    clock: () => performance.now(),
    memory,
  });
  const load = data.stressTest.sim;
  const usedScale = scale ?? load.scale;
  const provinces = data.provinces.provinces.length;
  const countries = data.countries.countries.length;
  console.log('Terra Scutum sim stress test (placeholder load, with the real pops since F06)');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(
    `Map             ${provinces} provinces, ${countries} countries, all simulated every day`,
  );
  console.log(
    `Load (×${usedScale})       ` +
      `${provinces * data.pops.groups.length} pops (the real ones, F06), ` +
      `${Math.round(provinces * load.buildingsPerProvince * usedScale)} buildings, ` +
      `${countries} markets × ${load.goods} goods, ` +
      `${Math.round(load.tradeRoutes * usedScale)} trade routes, ` +
      `${Math.round(load.units * usedScale)} units, ` +
      `${Math.round(load.battles * usedScale)} battles`,
  );
  console.log(
    `Runs            ${seeds.length} seed(s) (${seeds.join(', ')}) × ${days} days, ` +
      `${((performance.now() - startedAt) / 1000).toFixed(1)} s in total`,
  );
  for (const run of result.runs)
    console.log(
      `  seed ${String(run.seed).padEnd(6)} daily average ${run.dailyTicks.averageMs.toFixed(2)} ms, ` +
        `worst ${run.dailyTicks.worstMs.toFixed(2)} ms; weekly average ${run.weeklyTicks.averageMs.toFixed(2)} ms, ` +
        `worst ${run.weeklyTicks.worstMs.toFixed(2)} ms; hash ${run.stateHash}`,
    );
  console.log(describeTicks('Daily ticks   ', result.dailyTicks));
  console.log(describeTicks('Weekly ticks  ', result.weeklyTicks));
  console.log(
    `Memory          JavaScript heap at most ${megabytes(result.peakMemoryBytes)} ` +
      `(the placeholder load's own arrays: ${megabytes(result.loadBytes)}); ` +
      `budget for the whole browser tab: ${data.gameConfig.performanceBudget.tabMemoryMb} MB`,
  );
  printSystems(result.systemTimings);
  if (jsonFile) {
    writeFileSync(
      jsonFile,
      JSON.stringify(
        {
          days,
          seeds,
          scale: usedScale,
          dailyTicks: result.dailyTicks,
          weeklyTicks: result.weeklyTicks,
          peakMemoryBytes: result.peakMemoryBytes,
          loadBytes: result.loadBytes,
          systemTimings: result.systemTimings,
          runs: result.runs.map((run) => ({
            seed: run.seed,
            stateHash: run.stateHash,
            dailyTicks: run.dailyTicks,
            weeklyTicks: run.weeklyTicks,
          })),
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`Results written to ${jsonFile}`);
  }
  return result.dailyTicks.withinBudget && result.weeklyTicks.withinBudget;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      days: { type: 'string', default: '365' },
      seed: { type: 'string', default: '42' },
      seeds: { type: 'string', default: '1' },
      scale: { type: 'string' },
      json: { type: 'string' },
      stress: { type: 'boolean', default: false },
      strict: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const days = parseNumber('days', values.days, true);
  const seed = parseNumber('seed', values.seed, true);
  const data = loadData();

  const withinBudget = values.stress
    ? runStress(
        data,
        days,
        seed,
        parseNumber('seeds', values.seeds, true),
        values.scale === undefined ? undefined : parseNumber('scale', values.scale, false),
        values.json,
      )
    : runOne(data, days, seed);

  if (!withinBudget) {
    console.log('\nWARNING: tick times are over the performance budget.');
    if (values.strict) process.exit(1);
  }
}

main();
