import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImfSnapshot, StartingDataConfig, WorldBankSnapshot } from './build-starting-data';

/**
 * Turns the raw downloads in `.cache/starting-data/` (see the README in
 * `packages/tools/starting-data/`) into the small source tables that are
 * committed (`sources/imf-weo.json`, `sources/world-bank-wdi.json`): only the
 * codes the game needs, only the years it uses.
 */

/** The raw files, as the README's download commands save them. */
export const RAW_FILES = {
  imfGdp: 'imf-NGDPD.json',
  imfPopulation: 'imf-LP.json',
  imfIndicators: 'imf-indicators.json',
  worldBankPopulation: 'wb-population.json',
  worldBankGdp: 'wb-gdp.json',
  worldBankBirthRate: 'wb-SP.DYN.CBRT.IN.json',
  worldBankDeathRate: 'wb-SP.DYN.CDRT.IN.json',
  worldBankLaborForce: 'wb-SL.TLF.TOTL.IN.json',
  worldBankUnemployment: 'wb-SL.UEM.TOTL.ZS.json',
  worldBankArmedForces: 'wb-MS.MIL.TOTL.P1.json',
} as const;

/** The sources' codes for the whole world. */
export const WORLD_CODES = { imf: 'WEOWORLD', worldBank: 'WLD' } as const;

interface WorldBankRow {
  countryiso3code: string;
  date: string;
  value: number | null;
}

function readJson(dir: string, file: string): unknown {
  const path = join(dir, file);
  if (!existsSync(path))
    throw new Error(
      `${path} is missing: download it first (packages/tools/starting-data/README.md)`,
    );
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export function snapshotSources(
  rawDir: string,
  config: StartingDataConfig,
  codes: readonly string[],
  downloaded: string,
): { imf: ImfSnapshot; worldBank: WorldBankSnapshot } {
  // Plus the world totals, to compare the game's world with the real one.
  const imfCodes = new Set([WORLD_CODES.imf, ...codes.map((c) => config.sourceCodes[c]?.imf ?? c)]);
  const wbCodes = new Set([
    WORLD_CODES.worldBank,
    ...codes.map((c) => config.sourceCodes[c]?.worldBank ?? c),
  ]);
  const years = [String(config.year - 1), String(config.year)];

  const imfValues = (file: string, indicator: string) => {
    const all = (
      readJson(rawDir, file) as { values: Record<string, Record<string, Record<string, number>>> }
    ).values[indicator];
    const kept: Record<string, Record<string, number>> = {};
    for (const code of [...imfCodes].sort()) {
      const series = all[code];
      if (!series) continue;
      const picked = Object.fromEntries(
        years.filter((y) => y in series).map((y) => [y, series[y]]),
      );
      if (Object.keys(picked).length > 0) kept[code] = picked;
    }
    return kept;
  };
  const indicators = (
    readJson(rawDir, RAW_FILES.imfIndicators) as {
      indicators: Record<string, { source: string }>;
    }
  ).indicators;

  const worldBankRows = (file: string) => {
    const [meta, rows] = readJson(rawDir, file) as [{ lastupdated: string }, WorldBankRow[]];
    return { meta, rows: rows.filter((r) => wbCodes.has(r.countryiso3code) && r.value !== null) };
  };
  const population = worldBankRows(RAW_FILES.worldBankPopulation);
  const gdp = worldBankRows(RAW_FILES.worldBankGdp);
  const populationYears = new Set(population.rows.map((r) => Number(r.date)));
  if (populationYears.size !== 1 || !populationYears.has(config.year))
    throw new Error(
      `${RAW_FILES.worldBankPopulation} must hold the population for ${config.year} only`,
    );

  const sortedEntries = <T>(entries: [string, T][]) =>
    Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : 1)));
  /** The latest figure of an indicator per country, with its year. */
  const latest = (file: string) =>
    sortedEntries(
      worldBankRows(file).rows.map((r) => [
        r.countryiso3code,
        [Number(r.date), r.value!] as [number, number],
      ]),
    );

  return {
    imf: {
      edition: indicators.NGDPD.source,
      downloaded,
      values: {
        NGDPD: imfValues(RAW_FILES.imfGdp, 'NGDPD'),
        LP: imfValues(RAW_FILES.imfPopulation, 'LP'),
      },
    },
    worldBank: {
      lastUpdated: population.meta.lastupdated,
      downloaded,
      populationYear: config.year,
      population: sortedEntries(population.rows.map((r) => [r.countryiso3code, r.value!])),
      gdpLatest: sortedEntries(
        gdp.rows.map((r) => [r.countryiso3code, [Number(r.date), r.value!] as [number, number]]),
      ),
      demographics: {
        birthRate: latest(RAW_FILES.worldBankBirthRate),
        deathRate: latest(RAW_FILES.worldBankDeathRate),
        laborForce: latest(RAW_FILES.worldBankLaborForce),
        unemployment: latest(RAW_FILES.worldBankUnemployment),
        armedForces: latest(RAW_FILES.worldBankArmedForces),
      },
    },
  };
}
