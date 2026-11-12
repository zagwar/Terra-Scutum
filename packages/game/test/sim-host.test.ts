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
    expect(posted).toHaveLength(1);
    const ready = posted[0];
    if (ready.type !== 'ready') throw new Error(`expected "ready", got "${ready.type}"`);
    expect(ready.snapshot).toMatchObject({
      day: 0,
      date: { year: 2025, month: 1, day: 1 },
      ownershipVersion: 0,
    });
    // The first snapshot carries who owns every province: at the start, the starting owners.
    expect(ready.snapshot.provinceOwner).toEqual(ready.world.provinceCountry);
    expect(ready.saveFormatVersion).toBe(SAVE_FORMAT_VERSION);
    // The map's fixed facts and drawing settings travel with the first message.
    expect(ready.world.provinceIds.length).toBeGreaterThan(1000);
    expect(ready.world.provinceNeighbors.offsets.length).toBe(ready.world.provinceIds.length + 1);
    expect(ready.mapView.projection.type).toBe('miller');
  });

  it('sends a world map that survives the trip to the main thread', () => {
    const { host, posted } = hostWith();
    host.handle({ type: 'init', seed: 42 });
    const ready = posted[0];
    if (ready.type !== 'ready') throw new Error(`expected "ready", got "${ready.type}"`);
    // Messages from a worker are copied with the structured clone algorithm.
    const copy = structuredClone(ready.world);
    expect(copy.provinceIndex.get('fra_ile_de_france')).toBe(
      ready.world.provinceIndex.get('fra_ile_de_france'),
    );
    expect(copy.provinceCountry).toEqual(ready.world.provinceCountry);
  });

  it('steps days and answers with the request id', () => {
    const { host, posted } = hostWith();
    host.handle({ type: 'init', seed: 42 });
    host.handle({ type: 'step', requestId: 5, days: 31 });
    expect(posted[1]).toEqual({
      type: 'update',
      requestId: 5,
      snapshot: { day: 31, date: { year: 2025, month: 2, day: 1 }, ownershipVersion: 0 },
      events: [],
    });
  });

  it('sends the province owners again only when they changed', () => {
    const { host, posted } = hostWith();
    host.handle({ type: 'init', seed: 42 });
    const snapshotOf = (message: FromSimWorker) => {
      if (message.type !== 'update') throw new Error(`expected "update", got "${message.type}"`);
      return message.snapshot;
    };
    host.handle({ type: 'step', requestId: 1, days: 1 });
    expect(snapshotOf(posted[1]).provinceOwner).toBeUndefined();

    host.handle({
      type: 'command',
      requestId: 2,
      command: { type: 'debugSetProvinceOwner', province: 'fra_bretagne', country: 'DEU' },
    });
    expect(posted[2]).toMatchObject({
      commandResult: { ok: true },
      events: [{ type: 'provinceOwnerChanged', province: 'fra_bretagne', from: 'FRA', to: 'DEU' }],
    });
    const changed = snapshotOf(posted[2]);
    const ready = posted[0];
    if (ready.type !== 'ready') throw new Error('expected "ready"');
    const { world } = ready;
    expect(changed.ownershipVersion).toBe(1);
    expect(changed.provinceOwner![world.provinceIndex.get('fra_bretagne')!]).toBe(
      world.countryIndex.get('DEU'),
    );

    host.handle({ type: 'step', requestId: 3, days: 1 });
    expect(snapshotOf(posted[3]).ownershipVersion).toBe(1);
    expect(snapshotOf(posted[3]).provinceOwner).toBeUndefined();
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
