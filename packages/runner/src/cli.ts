/**
 * Headless campaign runner: `npm run runner -- --days 3650 --seed 42`
 * Simulates the given number of days without the game's graphics and prints a
 * summary, including tick times against the performance budget.
 */
import { parseArgs } from 'node:util';
import { DataValidationError, formatIsoDate } from '@terra-scutum/sim';
import { loadGameDataFromDisk } from '@terra-scutum/tools';
import { type TickStats, runCampaign } from './run-campaign';

const HELP = `Terra Scutum campaign runner

Usage: npm run runner -- [options]

  --days <n>   Days to simulate (default 365)
  --seed <n>   Seed for the run (default 42); the same seed gives the same campaign
  --strict     Exit with an error if tick times are over the performance budget
  --help       Show this help
`;

function parseWholeNumber(name: string, text: string): number {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) {
    console.error(`--${name} must be a whole number of 0 or more (got "${text}")`);
    process.exit(2);
  }
  return value;
}

function describeTicks(label: string, stats: TickStats): string {
  if (stats.count === 0) return `${label}  none`;
  const verdict = stats.withinBudget ? 'OK' : 'OVER BUDGET';
  return (
    `${label}  ${String(stats.count).padStart(6)} ticks   ` +
    `average ${stats.averageMs.toFixed(3)} ms   worst ${stats.worstMs.toFixed(3)} ms   ` +
    `budget ${stats.budgetMs} ms average → ${verdict}`
  );
}

function main(): void {
  const { values } = parseArgs({
    options: {
      days: { type: 'string', default: '365' },
      seed: { type: 'string', default: '42' },
      strict: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const days = parseWholeNumber('days', values.days);
  const seed = parseWholeNumber('seed', values.seed);

  let data;
  try {
    data = loadGameDataFromDisk();
  } catch (error) {
    if (error instanceof DataValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

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
  if (summary.systemTimings.length === 0) {
    console.log(
      'Systems         none yet (the daily tick is empty until the first systems are built)',
    );
  } else {
    console.log('Slowest systems');
    for (const { id, totalMs } of summary.systemTimings.slice(0, 8)) {
      console.log(`  ${id.padEnd(20)} ${totalMs.toFixed(1)} ms total`);
    }
  }
  console.log(`State hash      ${summary.stateHash}`);

  const overBudget = !summary.dailyTicks.withinBudget || !summary.weeklyTicks.withinBudget;
  if (overBudget) {
    console.log('\nWARNING: tick times are over the performance budget.');
    if (values.strict) process.exit(1);
  }
}

main();
