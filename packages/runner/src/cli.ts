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
  const { buildings } = summary;
  console.log(
    `Buildings       ${buildings.count} with ${buildings.levels} levels, ${(buildings.workers / 1e6).toFixed(2)} million people at work, ` +
      `average output ${(buildings.averageOutput * 100).toFixed(1)} %, ${buildings.heldBack} held back`,
  );
  const { markets } = summary;
  const price = (p: { country: string; good: string; price: number }) =>
    `${p.good} in ${p.country} ×${p.price.toFixed(2)}`;
  console.log(
    `Markets         prices on average ×${markets.averagePrice.toFixed(3)} of base; highest ${price(markets.highest)}, ` +
      `lowest ${price(markets.lowest)}; worst shortage ${markets.worstShortage.country || 'none'} ` +
      `${(markets.worstShortage.share * 100).toFixed(1)} %; wages ×${markets.averageWage.toFixed(2)} on average, ` +
      `${markets.layingOff} buildings laying off; standard of living ${markets.standardOfLiving.toFixed(1)}`,
  );
  console.log(
    `Trade          US$${(summary.trade.value / 1e9).toFixed(1)} bn a day imported, ` +
      `${(summary.trade.restOfWorldShare * 100).toFixed(1)} % from the rest of the world; ` +
      `top exporter ${summary.trade.topExporter.country} US$${(summary.trade.topExporter.value / 1e9).toFixed(2)} bn, ` +
      `top importer ${summary.trade.topImporter.country} US$${(summary.trade.topImporter.value / 1e9).toFixed(2)} bn a day; ` +
      `world prices ×${summary.trade.lowestWorld.price.toFixed(2)} (${summary.trade.lowestWorld.good}) ` +
      `to ×${summary.trade.highestWorld.price.toFixed(2)} (${summary.trade.highestWorld.good}); ` +
      `least delivered ${(summary.trade.leastDelivered * 100).toFixed(0)} %`,
  );
  const { food } = summary;
  console.log(
    `Food           reserves ${food.reserveDays.toFixed(1)} days; ` +
      `${(food.starving * 100).toFixed(2)} % of people starving, ${(food.severe * 100).toFixed(2)} % severely ` +
      `(most: ${food.worst.country || 'none'} ${(food.worst.starving * 100).toFixed(0)} %); ` +
      `${food.famines} provinces in famine; starvation deaths ${Math.round(food.deaths).toLocaleString('en-US')}, ` +
      `lost births ${Math.round(food.lostBirths).toLocaleString('en-US')}; rationing (none/light/strict/emergency) ${food.rationing.join('/')}`,
  );
  const { budget } = summary;
  console.log(
    `Budget         world debt ${(budget.debtShare * 100).toFixed(0)} % of GDP, treasuries ${(budget.treasuryShare * 100).toFixed(1)} %, ` +
      `balance ${(budget.balanceShare * 100).toFixed(1)} % of GDP a year; tax levels (very low … very high) ${budget.taxLevels.join('/')}; ` +
      `${budget.defaulted} countries defaulted${budget.defaulted > 0 ? ` (${budget.defaultedCountries.join(', ')}${budget.defaulted > budget.defaultedCountries.length ? ', …' : ''})` : ''}; ` +
      `highest inflation ${budget.highestInflation.country} ${(budget.highestInflation.inflation * 100).toFixed(1)} %; ` +
      `closest to its credit limit ${budget.closestToLimit.country} ${(budget.closestToLimit.used * 100).toFixed(0)} %`,
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
  console.log(
    'Terra Scutum sim stress test (placeholder load, with the real pops since F06, the real buildings since F07, the real markets since F65, the real trade since F19, the real food since F08 and the real budget since F09)',
  );
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(
    `Map             ${provinces} provinces, ${countries} countries, all simulated every day`,
  );
  console.log(
    `Load (×${usedScale})       ` +
      `${provinces * data.pops.groups.length} pops (the real ones, F06), ` +
      `${provinces * Math.max(Math.round(load.buildingsPerProvince * usedScale), data.buildings.buildings.length)} buildings ` +
      `(${provinces * data.buildings.buildings.length} of them the real ones, F07), ` +
      `${countries} markets × ${load.goods} goods, ` +
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
