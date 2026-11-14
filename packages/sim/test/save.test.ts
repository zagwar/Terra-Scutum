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
      { ...good, provinceOwners: [0, 0] },
      { ...good, provinceOwners: [0, 0, 7] },
      { ...good, provinceOwners: [0, 0, -1] },
      { ...good, map: undefined },
    ]) {
      expect(errorKey(() => deserializeGameState(damaged, options))).toBe('SAVE_ERROR_CORRUPT');
    }
  });

  it('keeps who owns each province', () => {
    const data = testData();
    const original = new GameState({ data, seed: 3 });
    const { world } = original;
    original.setProvinceOwner(
      world.provinceIndex.get('alpha_east')!,
      world.countryIndex.get('BBB')!,
    );
    const save = JSON.parse(JSON.stringify(serializeGameState(original))) as Record<
      string,
      unknown
    >;
    expect(save.map).toEqual({
      provinces: ['alpha_east', 'alpha_west', 'beta_main'],
      countries: ['AAA', 'BBB'],
    });
    expect(save.provinceOwners).toEqual([1, 0, 1]);

    const loaded = deserializeGameState(save, { data });
    expect([...loaded.provinceOwner]).toEqual([1, 0, 1]);
    expect(hashGameState(loaded)).toBe(hashGameState(original));
    // Ownership is part of the state's fingerprint.
    expect(hashGameState(original)).not.toBe(hashGameState(new GameState({ data, seed: 3 })));
  });

  it("keeps the player's country (F05)", () => {
    const data = testData();
    const original = new GameState({ data, seed: 8 });
    original.applyCommand({ type: 'choosePlayerCountry', country: 'BBB' });
    const save = serializeGameState(original);
    expect(save.playerCountry).toBe('BBB');
    const loaded = deserializeGameState(JSON.parse(JSON.stringify(save)), { data });
    expect(loaded.world.countryIds[loaded.playerCountry]).toBe('BBB');
    expect(hashGameState(loaded)).toBe(hashGameState(original));
    // The player's country is part of the fingerprint.
    expect(hashGameState(original)).not.toBe(hashGameState(new GameState({ data, seed: 8 })));
    expect(errorKey(() => deserializeGameState({ ...save, playerCountry: 'ZZZ' }, { data }))).toBe(
      'SAVE_ERROR_CORRUPT',
    );
  });

  it("loads a version 2 save (from before the country selection) as the data's player country", () => {
    const data = testData();
    const current = serializeGameState(new GameState({ data, seed: 6 }));
    const { playerCountry: _unused, ...versionTwo } = { ...current, saveVersion: 2 };
    const loaded = deserializeGameState(versionTwo, { data });
    expect(loaded.world.countryIds[loaded.playerCountry]).toBe('AAA');
  });

  it('rejects a save made on a different map', () => {
    const data = testData();
    const good = serializeGameState(new GameState({ data, seed: 5 }));
    const otherProvinces = { ...good, map: { ...good.map, provinces: ['a', 'b', 'c'] } };
    const fewerCountries = { ...good, map: { ...good.map, countries: ['AAA'] } };
    for (const save of [otherProvinces, fewerCountries]) {
      expect(errorKey(() => deserializeGameState(save, { data }))).toBe('SAVE_ERROR_DIFFERENT_MAP');
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
    expect(migrateSave(old, testData(), migrations, 3)).toEqual({
      format: SAVE_FORMAT,
      saveVersion: 3,
      day: 10,
      treasury: 0,
    });
    expect(old).toEqual({ format: SAVE_FORMAT, saveVersion: 1, dayNumber: 10 });
  });

  it('rejects a save too old to migrate', () => {
    const old = { format: SAVE_FORMAT, saveVersion: 1 };
    expect(errorKey(() => migrateSave(old, testData(), { 2: (save) => save }, 3))).toBe(
      'SAVE_ERROR_TOO_OLD',
    );
  });

  it('loads a version 1 save (from before ownership): every province has its starting owner', () => {
    const data = testData();
    const reference = new GameState({ data, seed: 77, systems });
    for (let i = 0; i < 40; i++) reference.advanceDay();
    const [s0, s1, s2, s3] = reference.rng.getState();
    const versionOne = {
      format: SAVE_FORMAT,
      saveVersion: 1,
      seed: 77,
      day: 40,
      rng: [s0, s1, s2, s3],
    };
    const loaded = deserializeGameState(versionOne, { data, systems });
    expect(loaded.day).toBe(40);
    expect([...loaded.provinceOwner]).toEqual([0, 0, 1]);
    expect(hashGameState(loaded)).toBe(hashGameState(reference));
  });
});
