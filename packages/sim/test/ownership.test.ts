import { describe, expect, it } from 'vitest';
import {
  GameState,
  countProvincesByOwner,
  createSnapshot,
  startingOwners,
  summarizeCountry,
} from '../src';
import { testData } from './helpers';

describe('province ownership', () => {
  const setup = () => {
    const state = new GameState({ data: testData(), seed: 1 });
    const { world } = state;
    const p = (id: string) => world.provinceIndex.get(id)!;
    const c = (id: string) => world.countryIndex.get(id)!;
    return { state, world, p, c };
  };

  it('starts with every province owned by its starting country', () => {
    const { state, world, p, c } = setup();
    expect(state.provinceOwner).toBeInstanceOf(Uint16Array);
    expect([...state.provinceOwner]).toEqual([...world.provinceCountry]);
    expect(state.provinceOwner[p('beta_main')]).toBe(c('BBB'));
    expect(state.ownershipVersion).toBe(0);
    // Its own array: changing owners never changes the world's fixed facts.
    expect(state.provinceOwner).not.toBe(world.provinceCountry);
    expect([...startingOwners(world)]).toEqual([...world.provinceCountry]);
  });

  it('moves a province to a new owner and reports it', () => {
    const { state, world, p, c } = setup();
    state.setProvinceOwner(p('alpha_east'), c('BBB'));
    expect(state.provinceOwner[p('alpha_east')]).toBe(c('BBB'));
    expect(world.provinceCountry[p('alpha_east')]).toBe(c('AAA'));
    expect(state.ownershipVersion).toBe(1);
    expect(state.drainEvents()).toEqual([
      { type: 'provinceOwnerChanged', province: 'alpha_east', from: 'AAA', to: 'BBB' },
    ]);

    // Giving it to the country that already has it changes nothing.
    state.setProvinceOwner(p('alpha_east'), c('BBB'));
    expect(state.ownershipVersion).toBe(1);
    expect(state.drainEvents()).toEqual([]);

    expect(() => state.setProvinceOwner(99, c('BBB'))).toThrow();
    expect(() => state.setProvinceOwner(p('alpha_east'), 99)).toThrow();
    expect(() => state.setProvinceOwner(0.5, c('BBB'))).toThrow();
  });

  it('sums up what a country holds, following the current owners', () => {
    const { state, world, p, c } = setup();
    const names = (list: readonly number[]) => list.map((i) => world.provinceIds[i]);

    let aaa = summarizeCountry(world, state.provinceOwner, c('AAA'));
    expect(names(aaa.provinces)).toEqual(['alpha_east', 'alpha_west']);
    expect(aaa.areaKm2).toBe(3000);
    expect(aaa.neighbors).toEqual([c('BBB')]);
    expect([...countProvincesByOwner(world, state.provinceOwner)]).toEqual([2, 1]);

    state.setProvinceOwner(p('alpha_east'), c('BBB'));
    aaa = summarizeCountry(world, state.provinceOwner, c('AAA'));
    expect(names(aaa.provinces)).toEqual(['alpha_west']);
    expect(aaa.areaKm2).toBe(1000);
    expect(aaa.neighbors).toEqual([c('BBB')]);
    const bbb = summarizeCountry(world, state.provinceOwner, c('BBB'));
    expect(names(bbb.provinces)).toEqual(['alpha_east', 'beta_main']);
    expect(bbb.areaKm2).toBe(5000);

    // A country can lose everything.
    state.setProvinceOwner(p('alpha_west'), c('BBB'));
    expect(summarizeCountry(world, state.provinceOwner, c('AAA'))).toEqual({
      provinces: [],
      areaKm2: 0,
      neighbors: [],
    });
    expect(summarizeCountry(world, state.provinceOwner, c('BBB')).neighbors).toEqual([]);
    expect([...countProvincesByOwner(world, state.provinceOwner)]).toEqual([0, 3]);
  });

  it('sends the owners in the snapshot, but only when the receiver does not have them yet', () => {
    const { state, p, c } = setup();
    const first = createSnapshot(state);
    expect(first.ownershipVersion).toBe(0);
    expect([...first.provinceOwner!]).toEqual([0, 0, 1]);
    // A copy: later changes in the sim never reach into a snapshot that was already made.
    state.setProvinceOwner(p('alpha_east'), c('BBB'));
    expect([...first.provinceOwner!]).toEqual([0, 0, 1]);

    const second = createSnapshot(state, first);
    expect(second.ownershipVersion).toBe(1);
    expect([...second.provinceOwner!]).toEqual([1, 0, 1]);

    state.advanceDay();
    const third = createSnapshot(state, second);
    expect(third.day).toBe(1);
    expect(third.ownershipVersion).toBe(1);
    expect(third.provinceOwner).toBeUndefined();
    // Without "what the receiver has", the snapshot is complete.
    expect(createSnapshot(state).provinceOwner).toBeDefined();
  });
});
