/**
 * Calendar math for the sim. The sim counts whole days since the campaign's
 * start date (`GameState.day`); these helpers turn that into a calendar date.
 *
 * Pure integer math (proleptic Gregorian calendar). The JavaScript `Date`
 * object is deliberately not used: it depends on the machine's time zone.
 */

export interface CalendarDate {
  readonly year: number;
  /** 1–12 */
  readonly month: number;
  /** 1–31 */
  readonly day: number;
}

/** 0 = Monday … 6 = Sunday. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAYS_PER_WEEK = 7;
export const MONDAY: DayOfWeek = 0;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

export function isValidDate(date: CalendarDate): boolean {
  return (
    Number.isInteger(date.year) &&
    Number.isInteger(date.month) &&
    Number.isInteger(date.day) &&
    date.month >= 1 &&
    date.month <= 12 &&
    date.day >= 1 &&
    date.day <= daysInMonth(date.year, date.month)
  );
}

/** Days from 1970-01-01 to the given date (negative before 1970). */
export function dateToEpochDay(date: CalendarDate): number {
  const y = date.month <= 2 ? date.year - 1 : date.year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear =
    Math.floor((153 * (date.month + (date.month > 2 ? -3 : 9)) + 2) / 5) + date.day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** The calendar date that is `epochDay` days after 1970-01-01. */
export function epochDayToDate(epochDay: number): CalendarDate {
  const z = epochDay + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

/** Day of the week for an epoch day (1970-01-01 was a Thursday). */
export function dayOfWeekOfEpochDay(epochDay: number): DayOfWeek {
  return ((((epochDay + 3) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK) as DayOfWeek;
}

/** Parses "YYYY-MM-DD". Returns null if the text isn't a real calendar date. */
export function parseIsoDate(text: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return isValidDate(date) ? date : null;
}

/** Formats a date as "YYYY-MM-DD" (for logs and saves; player-facing dates go through the UI's i18n). */
export function formatIsoDate(date: CalendarDate): string {
  const pad = (value: number, length: number) => String(value).padStart(length, '0');
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}
