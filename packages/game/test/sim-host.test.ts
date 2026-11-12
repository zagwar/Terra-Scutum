import { DATA_FILES, type RawGameData, SAVE_FORMAT_VERSION } from '@terra-scutum/sim';
import { describe, expect, it } from 'vitest';
import { RAW_GAME_DATA } from '../src/worker/game-data';
import type { FromSimWorker } from '../src/worker/protocol';
import { createSimHost } from '../src/worker/sim-host';

function hostWith(rawData: RawGameData = RAW_GAME_DATA) {
  const posted: FromSimWorker[] = [];
  const host = createSimHost(rawData, (message) => posted.push(message));
  return { host, posted };
}

describe('sim host (the logic inside the sim worker)', () => {
  it('bundles every data file the sim expects', () => {
    expect(Object.keys(RAW_GAME_DATA).sort()).toEqual(Object.keys(DATA_FILES).sort());
  });

  it('starts a campaign and reports the first snapshot', () => {
    const { host, posted } = hostWith();
    host.handle({ type: 'init', seed: 42 });
    expect(posted).toEqual([
      {
        type: 'ready',
        snapshot: { day: 0, date: { year: 2025, month: 1, day: 1 } },
        saveFormatVersion: SAVE_FORMAT_VERSION,
      },
    ]);
  });

  it('steps days and answers with the request id', () => {
    const { host, posted } = hostWith();
    host.handle({ type: 'init', seed: 42 });
    host.handle({ type: 'step', requestId: 5, days: 31 });
    expect(posted[1]).toEqual({
      type: 'update',
      requestId: 5,
      snapshot: { day: 31, date: { year: 2025, month: 2, day: 1 } },
      events: [],
    });
  });

  it('applies commands and returns their result and events', () => {
    const { host, posted } = hostWith();
    host.handle({ type: 'init', seed: 42 });
    host.handle({ type: 'command', requestId: 1, command: { type: 'debugPing', token: 9 } });
    expect(posted[1]).toMatchObject({
      type: 'update',
      requestId: 1,
      events: [{ type: 'debugPong', token: 9 }],
      commandResult: { ok: true },
    });
  });

  it('reports invalid data as a data error with the details', () => {
    const { host, posted } = hostWith({ ...RAW_GAME_DATA, gameConfig: { startDate: 'soon' } });
    host.handle({ type: 'init', seed: 42 });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: 'error', key: 'ERROR_SIM_DATA_INVALID' });
    expect((posted[0] as { detail: string }).detail).toContain('data/game_config.json → startDate');
  });

  it('reports a crash once and then stays stopped', () => {
    const { host, posted } = hostWith();
    host.handle({ type: 'step', requestId: 1, days: 1 }); // before init
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: 'error', key: 'ERROR_SIM_CRASHED' });
    host.handle({ type: 'init', seed: 42 });
    expect(posted).toHaveLength(1);
  });

  it('refuses impossible step sizes', () => {
    for (const days of [0, -1, 1.5, 1_000_000]) {
      const { host, posted } = hostWith();
      host.handle({ type: 'init', seed: 42 });
      host.handle({ type: 'step', requestId: 1, days });
      expect(posted[1]).toMatchObject({ type: 'error', key: 'ERROR_SIM_CRASHED' });
    }
  });
});
