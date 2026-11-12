import { describe, expect, it } from 'vitest';
import { parseLaunchOptions } from '../src/debug/scenarios';
import { formatDate, t, tKey } from '../src/ui/i18n';

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

describe('launch options', () => {
  it('reads the debug scenario and renderer from the address', () => {
    expect(parseLaunchOptions('')).toEqual({
      scenarioName: null,
      scenario: null,
      renderer: 'auto',
    });
    expect(parseLaunchOptions('?debug=foundation&renderer=webgl2')).toEqual({
      scenarioName: 'foundation',
      scenario: { seed: 42 },
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
