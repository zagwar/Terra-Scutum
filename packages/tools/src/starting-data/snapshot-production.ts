import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { MapCountry, StartingDataConfig } from './build-starting-data';

/**
 * F85: the source table of each country's real production,
 * `sources/production.json`, made from the raw downloads in
 * `.cache/starting-data/` (see the README): World Bank indicators of the
 * farm and industry economy, and the Our World in Data energy dataset
 * (coal, oil and gas production, oil use and electricity by source). Only
 * the game's countries; merged territories (map-config `includes`) are
 * added to their country where the figure is an amount.
 */

/** The World Bank indicators the starting buildings use, by the name the snapshot gives them. */
export const PRODUCTION_INDICATORS = {
  /** Employment in agriculture and in industry, % of total employment (modeled ILO estimate). */
  agricultureJobsPercent: 'SL.AGR.EMPL.ZS',
  industryJobsPercent: 'SL.IND.EMPL.ZS',
  /** Value added by agriculture (with forestry and fishing), by industry (with construction) and by manufacturing, % of GDP. */
  agricultureValuePercent: 'NV.AGR.TOTL.ZS',
  industryValuePercent: 'NV.IND.TOTL.ZS',
  manufacturingValuePercent: 'NV.IND.MANF.ZS',
  /** Cereal production and total fisheries production (capture and aquaculture), tonnes. */
  cerealTonnes: 'AG.PRD.CREL.MT',
  fishTonnes: 'ER.FSH.PROD.MT',
} as const;
export type ProductionIndicator = keyof typeof PRODUCTION_INDICATORS;
/** The ones that are amounts, so a merged territory's figure is added to its country's. */
const AMOUNTS: readonly ProductionIndicator[] = ['cerealTonnes', 'fishTonnes'];

/** The Our World in Data energy columns used (terawatt-hours a year). */
export const ENERGY_COLUMNS = [
  'coal_production',
  'oil_production',
  'gas_production',
  'oil_consumption',
  'coal_electricity',
  'gas_electricity',
  'oil_electricity',
  'nuclear_electricity',
  'hydro_electricity',
  'other_renewable_electricity',
  'wind_electricity',
  'solar_electricity',
] as const;
export type EnergyColumn = (typeof ENERGY_COLUMNS)[number];

export const OWID_ENERGY_FILE = 'owid-energy-data.csv';
export const OWID_ENERGY_URL =
  'https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv';

const latest = z.tuple([z.int(), z.number()]);
export const productionSnapshotSchema = z.strictObject({
  downloaded: z.string(),
  worldBank: z.strictObject({
    lastUpdated: z.string(),
    /** Per indicator and game country id: the latest figure and its year. */
    values: z.record(z.string(), z.record(z.string(), latest)),
  }),
  energy: z.strictObject({
    title: z.string(),
    url: z.string(),
    licence: z.string(),
    /** Per game country id: the latest year with any figure, then each column (TWh a year; missing = 0). */
    values: z.record(z.string(), z.record(z.string(), z.number())),
  }),
});
export type ProductionSnapshot = z.infer<typeof productionSnapshotSchema>;

/** Splits one CSV line (quoted fields may hold commas). */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      fields.push(field);
      field = '';
    } else field += ch;
  }
  fields.push(field);
  return fields;
}

function readRaw(dir: string, file: string): string {
  const path = join(dir, file);
  if (!existsSync(path))
    throw new Error(
      `${path} is missing: download it first (packages/tools/starting-data/README.md)`,
    );
  return readFileSync(path, 'utf8');
}

/**
 * The energy figures per game country: the most recent year (up to
 * `maxYear`) that has each figure.
 */
export function energyByCountry(
  csv: string,
  codesOf: ReadonlyMap<string, readonly string[]>,
  maxYear: number,
): Record<string, Record<string, number>> {
  const lines = csv.split(/\r?\n/).filter((line) => line.length > 0);
  const header = splitCsvLine(lines[0]);
  const col = (name: string) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`${OWID_ENERGY_FILE}: no column "${name}"`);
    return index;
  };
  const isoCol = col('iso_code');
  const yearCol = col('year');
  const cols = ENERGY_COLUMNS.map((name) => [name, col(name)] as const);
  // Per source code: year → the columns.
  const bySource = new Map<string, Map<number, Record<string, number>>>();
  for (const line of lines.slice(1)) {
    const fields = splitCsvLine(line);
    const iso = fields[isoCol];
    const year = Number(fields[yearCol]);
    if (!iso || !Number.isInteger(year) || year > maxYear) continue;
    const row: Record<string, number> = {};
    let any = false;
    for (const [name, index] of cols) {
      const value = Number(fields[index]);
      if (fields[index] !== '' && Number.isFinite(value)) {
        row[name] = value;
        any = true;
      }
    }
    if (!any) continue;
    if (!bySource.has(iso)) bySource.set(iso, new Map());
    bySource.get(iso)!.set(year, row);
  }
  const result: Record<string, Record<string, number>> = {};
  for (const [country, codes] of [...codesOf].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const total: Record<string, number> = {};
    let year = 0;
    let any = false;
    for (const code of codes) {
      const years = bySource.get(code);
      if (!years) continue;
      // Each column from the latest year that has it (production figures
      // can be a year behind the electricity figures).
      const sorted = [...years.keys()].sort((a, b) => b - a);
      if (code === codes[0]) year = sorted[0];
      for (const name of ENERGY_COLUMNS) {
        const at = sorted.find((y) => name in years.get(y)!);
        if (at === undefined) continue;
        total[name] = (total[name] ?? 0) + years.get(at)![name];
        any = true;
      }
    }
    if (any) result[country] = { year, ...total };
  }
  return result;
}

export function snapshotProduction(
  rawDir: string,
  config: StartingDataConfig,
  mapCountries: readonly MapCountry[],
  downloaded: string,
): ProductionSnapshot {
  // The source codes of each game country: its own first, then its merged territories.
  const worldBankCodes = new Map<string, string[]>();
  const energyCodes = new Map<string, string[]>();
  for (const country of mapCountries) {
    const codes = [country.id, ...(country.includes ?? [])];
    worldBankCodes.set(
      country.id,
      codes.map((c) => config.sourceCodes[c]?.worldBank ?? c),
    );
    energyCodes.set(
      country.id,
      codes.map((c) => (c === 'KOS' ? 'OWID_KOS' : c)),
    );
  }

  let lastUpdated = '';
  const values: Record<string, Record<string, [number, number]>> = {};
  for (const [name, code] of Object.entries(PRODUCTION_INDICATORS) as [
    ProductionIndicator,
    string,
  ][]) {
    const [meta, rows] = JSON.parse(readRaw(rawDir, `wb-${code}.json`)) as [
      { lastupdated: string },
      { countryiso3code: string; date: string; value: number | null }[],
    ];
    lastUpdated = meta.lastupdated > lastUpdated ? meta.lastupdated : lastUpdated;
    const bySource = new Map(
      rows
        .filter((r) => r.value !== null)
        .map((r) => [r.countryiso3code, [Number(r.date), r.value!] as [number, number]]),
    );
    const out: Record<string, [number, number]> = {};
    for (const [country, codes] of [...worldBankCodes].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const own = bySource.get(codes[0]);
      if (!AMOUNTS.includes(name)) {
        if (own) out[country] = own;
        continue;
      }
      let sum = 0;
      let year = own?.[0] ?? 0;
      let any = false;
      for (const c of codes) {
        const figure = bySource.get(c);
        if (!figure) continue;
        sum += figure[1];
        any = true;
        if (!year) year = figure[0];
      }
      if (any) out[country] = [year, sum];
    }
    values[name] = out;
  }

  return {
    downloaded,
    worldBank: { lastUpdated, values },
    energy: {
      title:
        'Our World in Data, Energy dataset (Energy Institute Statistical Review of World Energy; Ember)',
      url: OWID_ENERGY_URL,
      licence: 'CC BY 4.0',
      values: energyByCountry(readRaw(rawDir, OWID_ENERGY_FILE), energyCodes, config.year),
    },
  };
}
