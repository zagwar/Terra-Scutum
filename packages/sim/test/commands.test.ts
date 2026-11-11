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
