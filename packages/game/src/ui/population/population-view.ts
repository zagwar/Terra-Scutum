import type { PopulationSnapshot } from '@terra-scutum/sim';

/**
 * Reads the population snapshot (F06) for the screens: pure helpers, unit
 * tested. Per-pop arrays hold group g of province p at `p * groupCount + g`,
 * per-country ones the same way by country; need tiers come three at a time
 * (basic, everyday, luxury).
 */

/** One pop group of a province or a country, as the tables show it. */
export interface PopRow {
  /** Index of the pop group (`data/pops.json`). */
  readonly group: number;
  readonly people: number;
  readonly employed: number;
  /** The share without a job, 0–1. */
  readonly unemployment: number;
  /** US$ per worker per year. */
  readonly wagePerYear: number;
  /** 0–100. */
  readonly standardOfLiving: number;
}

/** The people of a province or a country in a few numbers. */
export interface PopulationSummary {
  readonly people: number;
  readonly dependents: number;
  readonly workforce: number;
  readonly employed: number;
  /** The share of the workforce without a job, 0–1. */
  readonly unemployment: number;
  /** The workforce's average standard of living, 0–100. */
  readonly standardOfLiving: number;
  /** How much of the basic, everyday and luxury needs people can afford, 0–1 each. */
  readonly needs: readonly [number, number, number];
}

const DAYS_PER_YEAR = 365;
const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

/** The pops of a province, in the pop groups' order. */
export function provincePops(population: PopulationSnapshot, province: number): PopRow[] {
  const groups = population.groupCount;
  return Array.from({ length: groups }, (_, group) => {
    const at = province * groups + group;
    const people = population.popSize[at];
    const employed = population.popEmployed[at];
    return {
      group,
      people,
      employed,
      unemployment: 1 - share(employed, people || 1),
      wagePerYear: population.popWage[at] * DAYS_PER_YEAR,
      standardOfLiving: population.popStandardOfLiving[at],
    };
  }).map((row) => (row.people > 0 ? row : { ...row, unemployment: 0 }));
}

export function provinceSummary(
  population: PopulationSnapshot,
  province: number,
): PopulationSummary {
  const people = population.provincePopulation[province];
  const dependents = population.provinceDependents[province];
  const workforce = people - dependents;
  const employed = population.provinceEmployed[province];
  return {
    people,
    dependents,
    workforce,
    employed,
    unemployment: workforce > 0 ? 1 - employed / workforce : 0,
    standardOfLiving: population.provinceStandardOfLiving[province],
    needs: [
      population.provinceNeeds[province * 3],
      population.provinceNeeds[province * 3 + 1],
      population.provinceNeeds[province * 3 + 2],
    ],
  };
}

/** The pop groups of a country (the provinces it owns now), with the needs each can afford. */
export function countryPops(
  population: PopulationSnapshot,
  country: number,
): (PopRow & { readonly needs: readonly [number, number, number] })[] {
  const groups = population.groupCount;
  return Array.from({ length: groups }, (_, group) => {
    const at = country * groups + group;
    const people = population.countryGroupSize[at];
    const employed = population.countryGroupEmployed[at];
    return {
      group,
      people,
      employed,
      unemployment: people > 0 ? 1 - employed / people : 0,
      wagePerYear: population.countryGroupWage[at] * DAYS_PER_YEAR,
      standardOfLiving: population.countryGroupStandardOfLiving[at],
      needs: [
        population.countryGroupNeeds[at * 3],
        population.countryGroupNeeds[at * 3 + 1],
        population.countryGroupNeeds[at * 3 + 2],
      ] as const,
    };
  });
}

export function countrySummary(population: PopulationSnapshot, country: number): PopulationSummary {
  const rows = countryPops(population, country);
  const workforce = rows.reduce((sum, row) => sum + row.people, 0);
  const employed = rows.reduce((sum, row) => sum + row.employed, 0);
  const weighted = (value: (row: (typeof rows)[number]) => number) =>
    share(
      rows.reduce((sum, row) => sum + value(row) * row.people, 0),
      workforce,
    );
  return {
    people: population.countryPopulation[country],
    dependents: population.countryDependents[country],
    workforce,
    employed,
    unemployment: workforce > 0 ? 1 - employed / workforce : 0,
    standardOfLiving: weighted((row) => row.standardOfLiving),
    needs: [
      weighted((row) => row.needs[0]),
      weighted((row) => row.needs[1]),
      weighted((row) => row.needs[2]),
    ],
  };
}
