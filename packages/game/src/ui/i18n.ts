import type { CalendarDate } from '@terra-scutum/sim';
import en from '../../../../locales/en.json';

/**
 * The small translation layer. All player-facing text lives in
 * `locales/en.json`; code refers to it by key. Other languages can be added
 * later by loading a different file here.
 */
export type TranslationKey = keyof typeof en;
export type TextParams = Readonly<Record<string, string | number>>;

const texts: Readonly<Record<string, string>> = en;

function fill(text: string, params: TextParams | undefined): string {
  if (!params) return text;
  return text.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}

/** The text for a key, with `{placeholders}` filled in from `params`. */
export function t(key: TranslationKey, params?: TextParams): string {
  return fill(texts[key], params);
}

/**
 * Like `t`, for keys that arrive as plain strings from the sim (events,
 * command refusals, errors). An unknown key is shown as the key itself, so a
 * missing text is easy to spot.
 */
export function tKey(key: string, params?: TextParams): string {
  return Object.hasOwn(texts, key) ? fill(texts[key], params) : key;
}

/** A date as the player sees it, for example "1 January 2025". */
export function formatDate(date: CalendarDate): string {
  return t('DATE_FORMAT', {
    day: date.day,
    month: tKey(`MONTH_${date.month}`),
    year: date.year,
  });
}
