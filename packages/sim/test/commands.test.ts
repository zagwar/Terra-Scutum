import { describe, expect, it } from 'vitest';
import { GameState, type SimCommand, hashGameState } from '../src';
import { testData } from './helpers';

describe('commands and sim events', () => {
  it('debugPing is answered with a debugPong event and changes nothing', () => {
    const state = new GameState({ data: testData(), seed: 1 });
    const before = hashGameState(state);
    expect(state.applyCommand({ type: 'debugPing', token: 7 })).toEqual({ ok: true });
    expect(state.drainEvents()).toEqual([{ type: 'debugPong', token: 7 }]);
    expect(state.drainEvents()).toEqual([]);
    expect(hashGameState(state)).toBe(before);
  });

  it('debugSetProvinceOwner hands a province to another country', () => {
    const state = new GameState({ data: testData(), seed: 1 });
    const province = state.world.provinceIndex.get('alpha_east')!;
    expect(
      state.applyCommand({ type: 'debugSetProvinceOwner', province: 'alpha_east', country: 'BBB' }),
    ).toEqual({ ok: true });
    expect(state.world.countryIds[state.provinceOwner[province]]).toBe('BBB');
    expect(state.drainEvents()).toEqual([
      { type: 'provinceOwnerChanged', province: 'alpha_east', from: 'AAA', to: 'BBB' },
    ]);

    expect(
      state.applyCommand({ type: 'debugSetProvinceOwner', province: 'atlantis', country: 'BBB' }),
    ).toEqual({
      ok: false,
      reasonKey: 'COMMAND_UNKNOWN_PROVINCE',
      params: { province: 'atlantis' },
    });
    expect(
      state.applyCommand({ type: 'debugSetProvinceOwner', province: 'alpha_east', country: 'ZZZ' }),
    ).toEqual({ ok: false, reasonKey: 'COMMAND_UNKNOWN_COUNTRY', params: { country: 'ZZZ' } });
    expect(state.drainEvents()).toEqual([]);
  });

  it("choosePlayerCountry sets the player's country, only before the first day (F05)", () => {
    const state = new GameState({ data: testData(), seed: 1 });
    // A new campaign starts with the country from game_config.json.
    expect(state.world.countryIds[state.playerCountry]).toBe('AAA');
    expect(state.applyCommand({ type: 'choosePlayerCountry', country: 'BBB' })).toEqual({
      ok: true,
    });
    expect(state.world.countryIds[state.playerCountry]).toBe('BBB');
    expect(state.drainEvents()).toEqual([{ type: 'playerCountryChosen', country: 'BBB' }]);
    // Choosing the same country again changes nothing.
    expect(state.applyCommand({ type: 'choosePlayerCountry', country: 'BBB' })).toEqual({
      ok: true,
    });
    expect(state.drainEvents()).toEqual([]);
    expect(state.applyCommand({ type: 'choosePlayerCountry', country: 'ZZZ' })).toEqual({
      ok: false,
      reasonKey: 'COMMAND_UNKNOWN_COUNTRY',
      params: { country: 'ZZZ' },
    });
    // Once a day has been simulated, the choice is locked.
    state.advanceDay();
    expect(state.applyCommand({ type: 'choosePlayerCountry', country: 'AAA' })).toEqual({
      ok: false,
      reasonKey: 'COMMAND_PLAYER_COUNTRY_LOCKED',
    });
    expect(state.world.countryIds[state.playerCountry]).toBe('BBB');
  });

  it('refuses unknown or malformed commands without throwing', () => {
    const state = new GameState({ data: testData(), seed: 1 });
    const unknown = { type: 'launchEverything' } as unknown as SimCommand;
    expect(state.applyCommand(unknown)).toEqual({
      ok: false,
      reasonKey: 'COMMAND_UNKNOWN',
      params: { type: 'launchEverything' },
    });
    // Names that exist on every JavaScript object must not be mistaken for commands.
    const sneaky = { type: 'toString' } as unknown as SimCommand;
    expect(state.applyCommand(sneaky).ok).toBe(false);
    expect(state.applyCommand(null as unknown as SimCommand).ok).toBe(false);
    const badToken = { type: 'debugPing', token: Number.NaN } as SimCommand;
    expect(state.applyCommand(badToken)).toEqual({ ok: false, reasonKey: 'COMMAND_INVALID' });
    expect(state.drainEvents()).toEqual([]);
  });
});
