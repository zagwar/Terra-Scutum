import { describe, expect, it } from 'vitest';
import {
  GameState,
  SAVE_FORMAT,
  SAVE_FORMAT_VERSION,
  SAVE_MIGRATIONS,
  SimError,
  type SystemRegistry,
  deserializeGameState,
  hashGameState,
  migrateSave,
  serializeGameState,
} from '../src';
import { testData } from './helpers';

const systems: SystemRegistry = {
  population: { daily: (state) => void state.rng.nextUint32() },
  trade: { weekly: (state) => void state.rng.nextFloat() },
};

function errorKey(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof SimError) return error.key;
    throw error;
  }
  throw new Error('expected a SimError');
}

describe('save and load', () => {
  it('writes the current save format version', () => {
    const save = serializeGameState(new GameState({ data: testData(), seed: 5 }));
    expect(save.format).toBe(SAVE_FORMAT);
    expect(save.saveVersion).toBe(SAVE_FORMAT_VERSION);
  });

  it('a loaded game continues exactly like the original (through real JSON text)', () => {
    const data = testData();
    const original = new GameState({ data, seed: 99, systems });
    for (let i = 0; i < 123; i++) original.advanceDay();

    const text = JSON.stringify(serializeGameState(original));
    const loaded = deserializeGameState(JSON.parse(text), { data, systems });
    expect(loaded.day).toBe(123);
    expect(loaded.seed).toBe(99);
    expect(hashGameState(loaded)).toBe(hashGameState(original));

    for (let i = 0; i < 400; i++) {
      original.advanceDay();
      loaded.advanceDay();
    }
    expect(hashGameState(loaded)).toBe(hashGameState(original));

    const straight = new GameState({ data, seed: 99, systems });
    for (let i = 0; i < 523; i++) straight.advanceDay();
    expect(hashGameState(loaded)).toBe(hashGameState(straight));
  });

  it('rejects things that are not saves', () => {
    const options = { data: testData() };
    expect(errorKey(() => deserializeGameState(null, options))).toBe('SAVE_ERROR_NOT_A_SAVE');
    expect(errorKey(() => deserializeGameState('hello', options))).toBe('SAVE_ERROR_NOT_A_SAVE');
    expect(errorKey(() => deserializeGameState({ format: 'other' }, options))).toBe(
      'SAVE_ERROR_NOT_A_SAVE',
    );
  });

  it('rejects damaged saves', () => {
    const options = { data: testData() };
    const good = serializeGameState(new GameState({ data: testData(), seed: 5 }));
    for (const damaged of [
      { ...good, saveVersion: 'one' },
      { ...good, day: -3 },
      { ...good, day: 1.5 },
      { ...good, rng: [1, 2, 3] },
      { ...good, rng: [0, 0, 0, 0] },
      { ...good, seed: undefined },
      { ...good, unexpected: true },
    ]) {
      expect(errorKey(() => deserializeGameState(damaged, options))).toBe('SAVE_ERROR_CORRUPT');
    }
  });

  it('rejects saves from a newer version of the game with a clear message', () => {
    const good = serializeGameState(new GameState({ data: testData(), seed: 5 }));
    const newer = { ...good, saveVersion: SAVE_FORMAT_VERSION + 1 };
    try {
      deserializeGameState(newer, { data: testData() });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SimError);
      expect((error as SimError).key).toBe('SAVE_ERROR_NEWER_VERSION');
      expect((error as SimError).params).toEqual({
        saveVersion: SAVE_FORMAT_VERSION + 1,
        gameVersion: SAVE_FORMAT_VERSION,
      });
    }
  });
});

describe('save migrations', () => {
  it('has a migration for every older version', () => {
    // Every version below the current one needs a way up, or old saves stop loading.
    for (let version = 1; version < SAVE_FORMAT_VERSION; version++) {
      expect(SAVE_MIGRATIONS[version], `migration from save version ${version}`).toBeTypeOf(
        'function',
      );
    }
  });

  it('upgrades an old save one version at a time', () => {
    const old = { format: SAVE_FORMAT, saveVersion: 1, dayNumber: 10 };
    const migrations = {
      1: (save: Record<string, unknown>) => {
        const { dayNumber, ...rest } = save;
        return { ...rest, day: dayNumber };
      },
      2: (save: Record<string, unknown>) => ({ ...save, treasury: 0 }),
    };
    expect(migrateSave(old, migrations, 3)).toEqual({
      format: SAVE_FORMAT,
      saveVersion: 3,
      day: 10,
      treasury: 0,
    });
    expect(old).toEqual({ format: SAVE_FORMAT, saveVersion: 1, dayNumber: 10 });
  });

  it('rejects a save too old to migrate', () => {
    const old = { format: SAVE_FORMAT, saveVersion: 1 };
    expect(errorKey(() => migrateSave(old, { 2: (save) => save }, 3))).toBe('SAVE_ERROR_TOO_OLD');
  });
});
