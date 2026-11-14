import { z } from 'zod';
import type { DataCrossCheck } from './game-data';

/**
 * The country screen (F138, section 12.4.1): `data/country_screen.json` (the
 * lists the screen shows) and `data/country_flags.json` (which flag each
 * country shows). Used by the game, not by the sim's systems. Every list is a
 * [DEFAULT] the designer can change in data; until a list's feature is built,
 * the screen shows its entries greyed out with "Comes with F… (M…)".
 */
const id = z
  .string()
  .regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, 'ids are lowercase letters, digits and single underscores');

/** A feature id from the feature tracker (for example "F24") and its milestone (for example "M6"). */
const comesWith = {
  feature: z.string().regex(/^F\d+$/, 'a feature id from the feature tracker, like F24'),
  milestone: z.string().regex(/^M\d+[a-c]?$/, 'a milestone, like M6 or M8a'),
};

const entry = z.strictObject({ id, ...comesWith });

export const countryScreenSchema = z.strictObject({
  /** The law categories the Government view lists (section 8.8), in order. */
  laws: z.array(entry).min(1),
  /** The cabinet seats (ministers, section 4.7), in order. */
  cabinetSeats: z.array(entry).min(1),
  /** The public opinion stances (section 7), in order, and the feature that brings them. */
  publicOpinion: z.strictObject({ stances: z.array(id).min(1), ...comesWith }),
  /** The diplomatic actions the Diplomacy view lists (section 6), in order. */
  diplomaticActions: z.array(entry).min(1),
  /** The country selection (F05): the countries offered as quick picks, by id, in order. */
  countrySelection: z.strictObject({ quickPicks: z.array(z.string()) }),
});

export type CountryScreenConfig = z.infer<typeof countryScreenSchema>;
export type CountryScreenEntry = CountryScreenConfig['laws'][number];

/**
 * `data/country_flags.json`: the flag each country shows, as a code of the
 * flag set the game bundles (`flagSet`; today the `flag-icons` package, whose
 * codes are ISO 3166-1 alpha-2 in lower case, plus "xk" for Kosovo).
 */
export const countryFlagsSchema = z.strictObject({
  flagSet: z.literal('flag-icons'),
  flags: z.record(z.string(), z.string().regex(/^[a-z]{2}(-[a-z0-9]+)?$/, 'a flag code like "de"')),
});

export type CountryFlagsConfig = z.infer<typeof countryFlagsSchema>;

/** Translation keys: `LAW_ECONOMY_MODE`, `CABINET_SEAT_DEFENSE`, `OPINION_STANCE_DENIAL`, `DIPLOMATIC_ACTION_DECLARE_WAR`. */
export const lawCategoryNameKey = (lawId: string) => `LAW_${lawId.toUpperCase()}`;
export const cabinetSeatNameKey = (seatId: string) => `CABINET_SEAT_${seatId.toUpperCase()}`;
export const opinionStanceNameKey = (stanceId: string) =>
  `OPINION_STANCE_${stanceId.toUpperCase()}`;
export const diplomaticActionNameKey = (actionId: string) =>
  `DIPLOMATIC_ACTION_${actionId.toUpperCase()}`;

/** Every id in each list appears once. */
export const checkCountryScreen: DataCrossCheck = (data, report) => {
  const lists = [
    ['laws', data.countryScreen.laws.map((e) => e.id)],
    ['cabinetSeats', data.countryScreen.cabinetSeats.map((e) => e.id)],
    ['publicOpinion.stances', data.countryScreen.publicOpinion.stances],
    ['diplomaticActions', data.countryScreen.diplomaticActions.map((e) => e.id)],
  ] as const;
  for (const [listName, ids] of lists) {
    const seen = new Map<string, number>();
    ids.forEach((itemId, index) => {
      const first = seen.get(itemId);
      if (first === undefined) seen.set(itemId, index);
      else
        report({
          file: 'country_screen.json',
          path: `${listName}.${index}${listName.endsWith('stances') ? '' : '.id'}`,
          message: `duplicate id "${itemId}" (also at ${listName}.${first})`,
        });
    });
  }
};

/** The country selection's quick picks are countries, each listed once. */
export const checkQuickPicks: DataCrossCheck = (data, report) => {
  const known = new Set(data.countries.countries.map((c) => c.id));
  const seen = new Set<string>();
  data.countryScreen.countrySelection.quickPicks.forEach((countryId, index) => {
    const path = `countrySelection.quickPicks.${index}`;
    if (!known.has(countryId))
      report({ file: 'country_screen.json', path, message: `unknown country "${countryId}"` });
    else if (seen.has(countryId))
      report({ file: 'country_screen.json', path, message: `"${countryId}" is listed twice` });
    seen.add(countryId);
  });
};

/** Every country in `countries.json` has a flag, and every flag belongs to a known country. */
export const checkCountryFlags: DataCrossCheck = (data, report) => {
  const known = new Set(data.countries.countries.map((c) => c.id));
  for (const countryId of known) {
    if (!Object.hasOwn(data.countryFlags.flags, countryId))
      report({
        file: 'country_flags.json',
        path: 'flags',
        message: `no flag for country "${countryId}"`,
      });
  }
  for (const countryId of Object.keys(data.countryFlags.flags)) {
    if (!known.has(countryId))
      report({
        file: 'country_flags.json',
        path: `flags.${countryId}`,
        message: `unknown country "${countryId}"`,
      });
  }
};

/** Each country's flag code by country index (the order of `countries.json` sorted by id, as in `WorldMap`). */
export function flagCodesByIndex(
  countryIds: readonly string[],
  flags: CountryFlagsConfig,
): readonly string[] {
  return countryIds.map((countryId) => flags.flags[countryId] ?? '');
}
