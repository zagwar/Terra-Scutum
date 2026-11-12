import { describe, expect, it } from 'vitest';
import {
  MONDAY,
  dateToEpochDay,
  dayOfWeekOfEpochDay,
  daysInMonth,
  epochDayToDate,
  formatIsoDate,
  isLeapYear,
  parseIsoDate,
} from '../src';

describe('calendar', () => {
  it('converts known dates to and from epoch days', () => {
    expect(dateToEpochDay({ year: 1970, month: 1, day: 1 })).toBe(0);
    expect(dateToEpochDay({ year: 2025, month: 1, day: 1 })).toBe(20089);
    expect(dateToEpochDay({ year: 2000, month: 3, day: 1 })).toBe(11017);
    expect(epochDayToDate(20089)).toEqual({ year: 2025, month: 1, day: 1 });
    expect(epochDayToDate(-1)).toEqual({ year: 1969, month: 12, day: 31 });
  });

  it('agrees with the JavaScript Date object for every day from 1990 to 2110', () => {
    const first = dateToEpochDay({ year: 1990, month: 1, day: 1 });
    const last = dateToEpochDay({ year: 2110, month: 12, day: 31 });
    for (let epochDay = first; epochDay <= last; epochDay++) {
      const reference = new Date(epochDay * 86_400_000);
      const date = epochDayToDate(epochDay);
      expect(date).toEqual({
        year: reference.getUTCFullYear(),
        month: reference.getUTCMonth() + 1,
        day: reference.getUTCDate(),
      });
      expect(dateToEpochDay(date)).toBe(epochDay);
      // JS: 0 = Sunday; ours: 0 = Monday.
      expect(dayOfWeekOfEpochDay(epochDay)).toBe((reference.getUTCDay() + 6) % 7);
    }
  });

  it('knows leap years and month lengths', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2025, 4)).toBe(30);
    expect(daysInMonth(2025, 12)).toBe(31);
  });

  it('knows the campaign start is a Wednesday and 6 January 2025 a Monday', () => {
    expect(dayOfWeekOfEpochDay(dateToEpochDay({ year: 2025, month: 1, day: 1 }))).toBe(2);
    expect(dayOfWeekOfEpochDay(dateToEpochDay({ year: 2025, month: 1, day: 6 }))).toBe(MONDAY);
  });

  it('parses and formats ISO dates, rejecting impossible ones', () => {
    expect(parseIsoDate('2025-01-01')).toEqual({ year: 2025, month: 1, day: 1 });
    expect(parseIsoDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
    expect(parseIsoDate('2025-02-29')).toBeNull();
    expect(parseIsoDate('2025-13-01')).toBeNull();
    expect(parseIsoDate('2025-1-1')).toBeNull();
    expect(parseIsoDate('January 2025')).toBeNull();
    expect(formatIsoDate({ year: 2027, month: 1, day: 9 })).toBe('2027-01-09');
  });
});
