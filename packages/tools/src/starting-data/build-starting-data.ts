import type { CountryStartFile, ProvinceStartFile } from '@terra-scutum/sim';
import { z } from 'zod';
import { type ProvincePopulationSnapshot, shareWholeNumbers } from './province-population';

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
 * - **Demographics** (F06): births and deaths per 1,000 people, the labor
 *   force as a share of the population, the unemployment rate and the armed
 *   forces as a share of the labor force, from the World Bank's latest
 *   figures; a hand-written `demographics` entry fills in what the World
 *   Bank doesn't have (Taiwan, Kosovo, the microstates). Merged territories
 *   take their country's rates.
 * - **Province populations** (F06): each country's population is shared
 *   among its provinces in proportion to the people the population grid
 *   counted in them (`sources/province-population.json`), as whole numbers
 *   that add up to the country's figure.
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
  /**
   * Hand-written populations for provinces the population grid gets wrong
   * (F06): provinces drawn bigger than they are (Gibraltar's disc also covers
   * Spanish towns) or whose shape misses their city. The rest of the country
   * shares what is left.
   */
  provinceEstimates: z
    .record(z.string(), z.strictObject({ population: z.int().nonnegative(), note: z.string() }))
    .default({}),
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
      /** Hand-written demographic figures (F06), each used when the World Bank has none. */
      demographics: z
        .strictObject({
          birthsPerThousand: z.number().min(0).optional(),
          deathsPerThousand: z.number().min(0).optional(),
          laborForceShare: z.number().min(0).max(1).optional(),
          unemploymentRate: z.number().min(0).max(1).optional(),
          armedForcesShare: z.number().min(0).max(1).optional(),
          note: z.string(),
        })
        .optional(),
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
  /**
   * The latest figure (year, value) per country code of: births and deaths
   * per 1,000 people (SP.DYN.CBRT.IN, SP.DYN.CDRT.IN), the labor force in
   * people (SL.TLF.TOTL.IN), unemployment in percent of the labor force
   * (SL.UEM.TOTL.ZS, modeled ILO estimate) and armed forces personnel
   * (MS.MIL.TOTL.P1).
   */
  demographics: z.strictObject({
    birthRate: z.record(z.string(), z.tuple([z.int(), z.number()])),
    deathRate: z.record(z.string(), z.tuple([z.int(), z.number()])),
    laborForce: z.record(z.string(), z.tuple([z.int(), z.number()])),
    unemployment: z.record(z.string(), z.tuple([z.int(), z.number()])),
    armedForces: z.record(z.string(), z.tuple([z.int(), z.number()])),
  }),
});
export type WorldBankSnapshot = z.infer<typeof worldBankSnapshotSchema>;

const round = (value: number, decimals: number) => Number(value.toFixed(decimals));

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

    // Demographics (F06): the World Bank's latest figures, else the hand-written ones.
    const wb = worldBankCode(country.id);
    const hand = entry.demographics;
    const figures = worldBank.demographics;
    const laborForce = figures.laborForce[wb]?.[1];
    const demographics = {
      birthsPerThousand: figures.birthRate[wb]?.[1] ?? hand?.birthsPerThousand,
      deathsPerThousand: figures.deathRate[wb]?.[1] ?? hand?.deathsPerThousand,
      laborForceShare:
        laborForce !== undefined && wbPopulation !== undefined
          ? laborForce / wbPopulation
          : hand?.laborForceShare,
      unemploymentRate:
        figures.unemployment[wb] !== undefined
          ? figures.unemployment[wb][1] / 100
          : hand?.unemploymentRate,
      armedForcesShare:
        figures.armedForces[wb] !== undefined && laborForce !== undefined
          ? figures.armedForces[wb][1] / laborForce
          : hand?.armedForcesShare,
    };
    const missing = Object.entries(demographics)
      .filter(([, value]) => value === undefined)
      .map(([key]) => key);
    if (missing.length > 0) {
      errors.push(
        `${country.id}: no ${missing.join(', ')} in the World Bank's figures; add them under "demographics" in starting-data/countries.json`,
      );
      continue;
    }
    const usedHand =
      hand !== undefined &&
      (figures.birthRate[wb] === undefined ||
        figures.deathRate[wb] === undefined ||
        laborForce === undefined ||
        figures.unemployment[wb] === undefined ||
        figures.armedForces[wb] === undefined);
    if (usedHand) notes.push(`Demographics: ${hand.note}`);

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
      birthsPerThousand: round(demographics.birthsPerThousand, 3),
      deathsPerThousand: round(demographics.deathsPerThousand, 3),
      laborForceShare: round(demographics.laborForceShare!, 4),
      unemploymentRate: round(demographics.unemploymentRate!, 4),
      armedForcesShare: round(demographics.armedForcesShare!, 4),
      demographicsSource: usedHand ? 'estimate' : 'worldBank',
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
            'World Bank, World Development Indicators: population (SP.POP.TOTL), GDP in current US$ (NY.GDP.MKTP.CD), births and deaths per 1,000 people (SP.DYN.CBRT.IN, SP.DYN.CDRT.IN), labor force (SL.TLF.TOTL.IN), unemployment (SL.UEM.TOTL.ZS) and armed forces personnel (MS.MIL.TOTL.P1)',
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

/** A province of the map (`data/provinces.json`). */
export interface MapProvince {
  readonly id: string;
  readonly country: string;
  readonly areaKm2: number;
}

/**
 * Builds `data/province_start.json` (F06): every country's population shared
 * among its provinces in proportion to the people counted in them; a country
 * the population grid has nobody for is shared by area.
 */
export function buildProvinceStart(
  countryStart: CountryStartFile,
  counted: ProvincePopulationSnapshot,
  provinces: readonly MapProvince[],
  estimates: StartingDataConfig['provinceEstimates'] = {},
): { file: ProvinceStartFile; errors: string[] } {
  const errors: string[] = [];
  const known = new Set(provinces.map((p) => p.id));
  for (const id of Object.keys(estimates))
    if (!known.has(id)) errors.push(`provinceEstimates lists "${id}", which is not a province`);
  for (const id of Object.keys(counted.provinces))
    if (!known.has(id))
      errors.push(
        `sources/province-population.json lists "${id}", which is not a province: run \`npm run import:province-population\` again`,
      );
  const result = new Map<string, number>();
  for (const country of countryStart.countries) {
    const own = provinces.filter((p) => p.country === country.id);
    for (const province of own)
      if (counted.provinces[province.id] === undefined)
        errors.push(
          `sources/province-population.json has no count for "${province.id}": run \`npm run import:province-population\` again`,
        );
    // Provinces with a hand-written population keep it; the others share the rest.
    const fixed = own.filter((p) => estimates[p.id] !== undefined);
    const shared = own.filter((p) => estimates[p.id] === undefined);
    const fixedPeople = fixed.reduce((sum, p) => sum + estimates[p.id].population, 0);
    if (
      fixedPeople > country.population ||
      (shared.length === 0 && fixedPeople !== country.population)
    ) {
      errors.push(
        `${country.id}: its provinceEstimates hold ${fixedPeople} people, but the country has ${country.population}`,
      );
      continue;
    }
    for (const province of fixed) result.set(province.id, estimates[province.id].population);
    const shares = shareWholeNumbers(
      country.population - fixedPeople,
      shared.map((p) => counted.provinces[p.id] ?? 0),
      shared.map((p) => p.areaKm2),
    );
    shared.forEach((province, index) => result.set(province.id, shares[index]));
  }
  return {
    file: {
      year: countryStart.year,
      source: {
        title: counted.title,
        url: counted.url,
        licence: counted.licence,
        edition: `${counted.edition}, downloaded ${counted.downloaded}`,
      },
      provinces: [...provinces]
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((p) => ({ id: p.id, population: result.get(p.id) ?? 0 })),
    },
    errors,
  };
}
