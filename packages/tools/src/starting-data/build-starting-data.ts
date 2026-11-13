import type { CountryStartFile } from '@terra-scutum/sim';
import { z } from 'zod';

/**
 * Builds `data/country_start.json` (F71) from the source tables saved in
 * `packages/tools/starting-data/sources/` and the hand-written
 * `packages/tools/starting-data/countries.json`. Pure: no files, no network,
 * so it is unit tested with small inputs.
 *
 * Rules:
 * - **Population:** a hand-written estimate if the config gives one, else the
 *   World Bank's figure for the year, else the IMF's.
 * - **GDP** (nominal US$): a hand-written estimate if given, else the IMF's
 *   figure for the year (the World Bank's latest if the config says
 *   `"gdp": "worldBank"`), else the World Bank's latest figure (its year is
 *   kept as `gdpYear` when older).
 * - **Merged territories** (map-config `includes`, for example Hong Kong in
 *   China): their population and GDP are added, from the same sources (the
 *   GDP from any recent year), or from `territoryEstimates`. Territories with
 *   no figures are tiny or uninhabited and are left out (listed in the report).
 */

const countryCode = z.string().regex(/^[A-Z]{3}$/);

export const startingDataConfigSchema = z.strictObject({
  year: z.int(),
  /** Codes the sources use where they differ from the game's (Kosovo is UVK at the IMF and XKX at the World Bank). */
  sourceCodes: z.record(
    countryCode,
    z.strictObject({ imf: countryCode.optional(), worldBank: countryCode.optional() }),
  ),
  /** Figures for merged territories that the sources don't cover. */
  territoryEstimates: z.record(
    countryCode,
    z.strictObject({
      population: z.int().nonnegative(),
      gdpMillionUsd: z.number().nonnegative().optional(),
      note: z.string(),
    }),
  ),
  countries: z.record(
    countryCode,
    z.strictObject({
      /** An id from `data/government_types.json`. */
      government: z.string(),
      note: z.string().optional(),
      /** Hand-written population estimate, used when no source has one. */
      population: z.int().positive().optional(),
      populationNote: z.string().optional(),
      /** Hand-written GDP estimate (millions of US$), used when no source has one. */
      gdpMillionUsd: z.number().positive().optional(),
      /** Take the World Bank's latest GDP instead of the IMF's (when the IMF's is unusable). */
      gdp: z.literal('worldBank').optional(),
      gdpNote: z.string().optional(),
    }),
  ),
});
export type StartingDataConfig = z.infer<typeof startingDataConfigSchema>;

/** `sources/imf-weo.json`: IMF World Economic Outlook values by indicator, country code and year. */
export const imfSnapshotSchema = z.object({
  edition: z.string(),
  downloaded: z.string(),
  values: z.strictObject({
    NGDPD: z.record(z.string(), z.record(z.string(), z.number())),
    LP: z.record(z.string(), z.record(z.string(), z.number())),
  }),
});
export type ImfSnapshot = z.infer<typeof imfSnapshotSchema>;

/** `sources/world-bank-wdi.json`: World Bank population (the year) and latest GDP by country code. */
export const worldBankSnapshotSchema = z.object({
  lastUpdated: z.string(),
  downloaded: z.string(),
  population: z.record(z.string(), z.number()),
  populationYear: z.int(),
  gdpLatest: z.record(z.string(), z.tuple([z.int(), z.number()])),
});
export type WorldBankSnapshot = z.infer<typeof worldBankSnapshotSchema>;

/** A country of the curated list (map-config `countries.json`). */
export interface MapCountry {
  readonly id: string;
  readonly includes?: readonly string[];
}

/** The oldest GDP figure still used for a merged territory. */
const OLDEST_TERRITORY_GDP_YEAR = 2015;

export interface StartingDataResult {
  readonly file: CountryStartFile;
  /** Problems that stop the import (a country with no figures, a config entry for an unknown country). */
  readonly errors: readonly string[];
  /** Territories that had no figures and were left out. */
  readonly skippedTerritories: readonly string[];
}

export function buildStartingData(
  config: StartingDataConfig,
  imf: ImfSnapshot,
  worldBank: WorldBankSnapshot,
  mapCountries: readonly MapCountry[],
): StartingDataResult {
  const { year } = config;
  const errors: string[] = [];
  const skippedTerritories: string[] = [];
  const yearKey = String(year);
  if (worldBank.populationYear !== year)
    errors.push(`the World Bank population is for ${worldBank.populationYear}, not ${year}`);

  const imfCode = (code: string) => config.sourceCodes[code]?.imf ?? code;
  const worldBankCode = (code: string) => config.sourceCodes[code]?.worldBank ?? code;
  const imfValue = (indicator: 'NGDPD' | 'LP', code: string): number | undefined =>
    imf.values[indicator][imfCode(code)]?.[yearKey];

  const known = new Set(mapCountries.map((c) => c.id));
  for (const code of Object.keys(config.countries)) {
    if (!known.has(code))
      errors.push(`countries.json lists "${code}", which is not a game country`);
  }

  const countries: CountryStartFile['countries'][number][] = [];
  for (const country of [...mapCountries].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const entry = config.countries[country.id];
    if (!entry) {
      errors.push(`${country.id}: no entry in starting-data/countries.json (government type)`);
      continue;
    }
    const notes: string[] = [];
    if (entry.note) notes.push(`Government: ${entry.note}`);

    // Population.
    let population: number | undefined;
    let populationSource = '';
    const wbPopulation = worldBank.population[worldBankCode(country.id)];
    const imfPopulation = imfValue('LP', country.id);
    if (entry.population !== undefined) {
      population = entry.population;
      populationSource = 'estimate';
    } else if (wbPopulation !== undefined) {
      population = wbPopulation;
      populationSource = 'worldBank';
    } else if (imfPopulation !== undefined) {
      population = imfPopulation * 1e6;
      populationSource = 'imfWeo';
    }
    if (entry.populationNote) notes.push(`Population: ${entry.populationNote}`);

    // GDP.
    let gdp: number | undefined;
    let gdpSource = '';
    let gdpYear: number | undefined;
    const imfGdp = imfValue('NGDPD', country.id);
    const wbGdp = worldBank.gdpLatest[worldBankCode(country.id)];
    if (entry.gdpMillionUsd !== undefined) {
      gdp = entry.gdpMillionUsd;
      gdpSource = 'estimate';
    } else if (imfGdp !== undefined && entry.gdp !== 'worldBank') {
      gdp = imfGdp * 1000;
      gdpSource = 'imfWeo';
    } else if (wbGdp !== undefined) {
      gdp = wbGdp[1] / 1e6;
      gdpSource = 'worldBank';
      if (wbGdp[0] !== year) gdpYear = wbGdp[0];
    }
    if (entry.gdpNote) notes.push(`GDP: ${entry.gdpNote}`);

    if (population === undefined || gdp === undefined) {
      errors.push(
        `${country.id}: no ${population === undefined ? 'population' : 'GDP'} in any source; add an estimate to starting-data/countries.json`,
      );
      continue;
    }

    // Merged territories, each counted once (Guernsey and Jersey are one "Channel Islands" entry).
    const added: string[] = [];
    const seenCodes = new Set<string>();
    for (const territory of country.includes ?? []) {
      const estimate = config.territoryEstimates[territory];
      const wbCode = worldBankCode(territory);
      const key = estimate ? territory : wbCode;
      if (seenCodes.has(key)) continue;
      seenCodes.add(key);
      let territoryPopulation: number | undefined;
      let territoryGdp: number | undefined;
      if (estimate) {
        territoryPopulation = estimate.population;
        territoryGdp = estimate.gdpMillionUsd ?? 0;
        notes.push(`Includes ${territory}: ${estimate.note}`);
      } else {
        const lp = imfValue('LP', territory);
        territoryPopulation =
          worldBank.population[wbCode] ?? (lp === undefined ? undefined : lp * 1e6);
        const imfTerritoryGdp = imfValue('NGDPD', territory);
        const wbTerritoryGdp = worldBank.gdpLatest[wbCode];
        if (imfTerritoryGdp !== undefined) territoryGdp = imfTerritoryGdp * 1000;
        else if (wbTerritoryGdp && wbTerritoryGdp[0] >= OLDEST_TERRITORY_GDP_YEAR)
          territoryGdp = wbTerritoryGdp[1] / 1e6;
      }
      if (territoryPopulation === undefined) {
        skippedTerritories.push(`${territory} (in ${country.id})`);
        continue;
      }
      population += territoryPopulation;
      gdp += territoryGdp ?? 0;
      if (!estimate) added.push(wbCode);
    }
    if (added.length > 0)
      notes.push(`Includes the figures of ${added.join(', ')} (merged territories)`);

    countries.push({
      id: country.id,
      population: Math.round(population),
      gdpMillionUsd: Math.round(gdp),
      governmentType: entry.government,
      populationSource,
      gdpSource,
      ...(gdpYear !== undefined ? { gdpYear } : {}),
      ...(notes.length > 0 ? { notes } : {}),
    });
  }

  return {
    file: {
      year,
      sources: {
        imfWeo: {
          title:
            'IMF World Economic Outlook database: GDP, current prices (NGDPD) and population (LP)',
          url: 'https://www.imf.org/en/Publications/WEO',
          edition: `${imf.edition}, downloaded ${imf.downloaded}`,
        },
        worldBank: {
          title:
            'World Bank, World Development Indicators: population (SP.POP.TOTL) and GDP in current US$ (NY.GDP.MKTP.CD)',
          url: 'https://data.worldbank.org',
          edition: `updated ${worldBank.lastUpdated}, downloaded ${worldBank.downloaded}`,
        },
        estimate: {
          title:
            "Estimates written by hand where no source has a figure; each is explained in the country's notes",
        },
      },
      countries,
    },
    errors,
    skippedTerritories,
  };
}
