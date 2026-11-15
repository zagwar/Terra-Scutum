import { describe, expect, it } from 'vitest';
import { parseLaunchOptions } from '../src/debug/scenarios';
import {
  formatDate,
  formatMoney,
  formatMoneyMillions,
  formatPopulation,
  t,
  tKey,
} from '../src/ui/i18n';

describe('i18n', () => {
  it('returns texts and fills in placeholders', () => {
    expect(t('GAME_TITLE')).toBe('Terra Scutum');
    expect(t('FOUNDATION_SAVE_FORMAT_VALUE', { version: 3 })).toBe('Version 3');
    expect(t('COMMAND_UNKNOWN', { type: 'x' })).toContain('"x"');
  });

  it('leaves a placeholder visible when its value is missing', () => {
    expect(t('FOUNDATION_SAVE_FORMAT_VALUE')).toBe('Version {version}');
  });

  it('shows unknown keys from the sim as the key itself', () => {
    expect(tKey('SAVE_ERROR_NOT_A_SAVE')).toBe('This file is not a Terra Scutum save.');
    expect(tKey('NOT_A_REAL_KEY')).toBe('NOT_A_REAL_KEY');
    expect(tKey('toString')).toBe('toString');
  });

  it('formats dates with month names', () => {
    expect(formatDate({ year: 2025, month: 1, day: 1 })).toBe('1 January 2025');
    expect(formatDate({ year: 2027, month: 12, day: 31 })).toBe('31 December 2027');
  });
});

describe('numbers', () => {
  it('formats populations: billions, millions, then exact numbers', () => {
    expect(formatPopulation(1_463_865_525)).toBe('1.46 billion');
    expect(formatPopulation(285_721_236)).toBe('286 million');
    expect(formatPopulation(83_491_249)).toBe('83.5 million');
    expect(formatPopulation(5_484_367)).toBe('5.48 million');
    expect(formatPopulation(41_024)).toBe('41,024');
  });

  it('formats money given in millions of dollars', () => {
    expect(formatMoneyMillions(30_861_300)).toBe('$30.9 trillion');
    expect(formatMoneyMillions(5_115_594)).toBe('$5.12 trillion');
    expect(formatMoneyMillions(920_585)).toBe('$921 billion');
    expect(formatMoneyMillions(2_253)).toBe('$2.25 billion');
    expect(formatMoneyMillions(300)).toBe('$300 million');
    expect(formatMoney(61_270.6)).toBe('$61,271');
  });
});

describe('launch options', () => {
  it('reads the debug scenario and renderer from the address', () => {
    expect(parseLaunchOptions('')).toEqual({
      scenarioName: null,
      scenario: null,
      renderer: 'auto',
    });
    expect(parseLaunchOptions('?debug=foundation&renderer=webgl2')).toEqual({
      scenarioName: 'foundation',
      scenario: { seed: 42, edgeScrolling: false, scenery: false },
      renderer: 'webgl2',
    });
    expect(parseLaunchOptions('?debug=nope&renderer=fast')).toEqual({
      scenarioName: 'nope',
      scenario: null,
      renderer: 'auto',
    });
    expect(parseLaunchOptions('?debug=constructor').scenario).toBeNull();
  });
});
