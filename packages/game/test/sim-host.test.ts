import { DATA_FILES, type RawGameData, SAVE_FORMAT_VERSION } from '@terra-scutum/sim';
import { describe, expect, it } from 'vitest';
import { RAW_GAME_DATA } from '../src/worker/game-data';
import type { FromSimWorker } from '../src/worker/protocol';
import { type SimClock, createSimHost } from '../src/worker/sim-host';

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
      snapshot: {
        day: 31,
        date: { year: 2025, month: 2, day: 1 },
        // The United States (game_config.json) until the player chooses (F05).
        playerCountry: 163,
        ownershipVersion: 0,
      },
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

/**
 * A clock the test moves forward by hand. Timers fire in order as time passes;
 * `dayCostMs` makes every simulated day "take" that long.
 */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clock: SimClock = {
    now: () => now,
    schedule(callback, delayMs) {
      const id = nextId++;
      timers.set(id, { at: now + Math.max(0, delayMs), callback });
      return id;
    },
    cancel: (handle) => void timers.delete(handle as number),
  };
  return {
    clock,
    /** Moves time forward, firing every timer that falls due on the way. */
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        let due: [number, { at: number; callback: () => void }] | undefined;
        for (const entry of timers) if (!due || entry[1].at < due[1].at) due = entry;
        if (!due || due[1].at > end) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].callback();
      }
      now = Math.max(now, end);
    },
    /** Lets time pass without firing timers (as if the thread was busy). */
    spend(ms: number) {
      now += ms;
    },
    pendingTimers: () => timers.size,
  };
}

/** A host on a fake clock, started; speeds 0.5, 1, 2, 5 and 10 days per second, start speed 2. */
function timedHost() {
  const time = fakeClock();
  const posted: FromSimWorker[] = [];
  const host = createSimHost(RAW_GAME_DATA, (message) => posted.push(message), time.clock);
  host.handle({
    type: 'init',
    seed: 42,
  });
  const day = () => {
    for (let i = posted.length - 1; i >= 0; i--) {
      const message = posted[i];
      if (message.type === 'update' || message.type === 'ready') return message.snapshot.day;
    }
    return -1;
  };
  const lastTime = () => {
    for (let i = posted.length - 1; i >= 0; i--) {
      const message = posted[i];
      if (message.type === 'time') return message.time;
      if (message.type === 'ready') return message.time;
    }
    return null;
  };
  return { host, posted, time, day, lastTime };
}

describe('game speed (F04): the sim worker runs the days by itself', () => {
  it('starts paused at the start speed and reports the speeds from the data', () => {
    const { posted, time, day } = timedHost();
    const ready = posted[0];
    if (ready.type !== 'ready') throw new Error('expected "ready"');
    expect(ready.time).toEqual({ paused: true, speed: 2 });
    expect(ready.daysPerSecond).toEqual([0.5, 1, 2, 5, 10]);
    time.advance(60_000);
    expect(day()).toBe(0);
    expect(time.pendingTimers()).toBe(0);
  });

  it('runs days at the chosen speed once unpaused', () => {
    const { host, time, day, lastTime } = timedHost();
    host.handle({ type: 'time', change: { kind: 'togglePause' } });
    expect(lastTime()).toEqual({ paused: false, speed: 2 });
    // Speed 2: one day per second; the first day passes one second after unpausing.
    time.advance(999);
    expect(day()).toBe(0);
    time.advance(1);
    expect(day()).toBe(1);
    time.advance(9_000);
    expect(day()).toBe(10);

    host.handle({ type: 'time', change: { kind: 'setSpeed', speed: 5 } });
    time.advance(1_000);
    expect(day()).toBe(20);
    host.handle({ type: 'time', change: { kind: 'setSpeed', speed: 1 } });
    time.advance(4_000);
    expect(day()).toBe(22);
  });

  it('a new speed takes effect at once, not after the old wait', () => {
    const { host, time, day } = timedHost();
    host.handle({ type: 'time', change: { kind: 'setSpeed', speed: 1 } });
    host.handle({ type: 'time', change: { kind: 'setPaused', paused: false } });
    time.advance(1_000); // half way through a 2-second day at speed 1
    expect(day()).toBe(0);
    host.handle({ type: 'time', change: { kind: 'setSpeed', speed: 5 } });
    // At speed 5 the day was due 0.1 s after the last one: that has passed, so it runs now.
    time.advance(0);
    expect(day()).toBe(1);
    time.advance(100);
    expect(day()).toBe(2);
  });

  it('pausing stops time; unpausing goes on from the same day', () => {
    const { host, time, day, lastTime } = timedHost();
    host.handle({ type: 'time', change: { kind: 'togglePause' } });
    time.advance(3_000);
    expect(day()).toBe(3);
    host.handle({ type: 'time', change: { kind: 'togglePause' } });
    expect(lastTime()).toEqual({ paused: true, speed: 2 });
    time.advance(10_000);
    expect(day()).toBe(3);
    expect(time.pendingTimers()).toBe(0);
    host.handle({ type: 'time', change: { kind: 'togglePause' } });
    time.advance(2_000);
    expect(day()).toBe(5);
  });

  it('changes speed while paused without unpausing, and stops at speeds 1 and 5', () => {
    const { host, time, day, lastTime } = timedHost();
    host.handle({ type: 'time', change: { kind: 'faster' } });
    expect(lastTime()).toEqual({ paused: true, speed: 3 });
    for (let i = 0; i < 5; i++) host.handle({ type: 'time', change: { kind: 'faster' } });
    expect(lastTime()).toEqual({ paused: true, speed: 5 });
    for (let i = 0; i < 7; i++) host.handle({ type: 'time', change: { kind: 'slower' } });
    expect(lastTime()).toEqual({ paused: true, speed: 1 });
    host.handle({ type: 'time', change: { kind: 'setSpeed', speed: 4 } });
    expect(lastTime()).toEqual({ paused: true, speed: 4 });
    time.advance(10_000);
    expect(day()).toBe(0);
  });

  it('never runs behind: a slow day starts the next one at once, without piling up', () => {
    const { host, time, day, posted } = timedHost();
    host.handle({ type: 'time', change: { kind: 'setSpeed', speed: 5 } }); // 100 ms per day
    host.handle({ type: 'time', change: { kind: 'togglePause' } });
    time.advance(100);
    expect(day()).toBe(1);

    // The thread is busy for 2 seconds (20 days' worth at this speed)…
    time.spend(2_000);
    time.advance(0);
    // …but only the one day that was due runs: the missed time isn't made up.
    expect(day()).toBe(2);
    time.advance(99);
    expect(day()).toBe(2);
    time.advance(1);
    expect(day()).toBe(3);

    // Days that take longer than their share (150 ms of 100 ms): the next one
    // starts as soon as the last has finished, one at a time.
    const before = posted.length;
    const slowHost = createSimHost(
      RAW_GAME_DATA,
      (message) => {
        posted.push(message);
        if (message.type === 'update') time.spend(150);
      },
      time.clock,
    );
    slowHost.handle({ type: 'init', seed: 1 });
    slowHost.handle({ type: 'time', change: { kind: 'setSpeed', speed: 5 } });
    slowHost.handle({ type: 'time', change: { kind: 'togglePause' } });
    host.handle({ type: 'time', change: { kind: 'togglePause' } }); // the first host rests
    const slowDays = () =>
      posted.slice(before).filter((message) => message.type === 'update').length;
    time.advance(100); // the first slow day runs, and takes until 250 ms
    expect(slowDays()).toBe(1);
    time.advance(0); // overdue: the next one runs at once
    expect(slowDays()).toBe(2);
    time.advance(0);
    expect(slowDays()).toBe(3);
  });

  it('stepping days stays exact while paused, for tests', () => {
    const { host, posted, time } = timedHost();
    host.handle({ type: 'step', requestId: 7, days: 31 });
    expect(posted.at(-1)).toMatchObject({
      type: 'update',
      requestId: 7,
      snapshot: { day: 31, date: { year: 2025, month: 2, day: 1 } },
    });
    time.advance(10_000);
    expect(posted).toHaveLength(2);
  });

  it('days run by game speed reach the same date as stepped days', () => {
    const lastSnapshot = (posted: FromSimWorker[]) => {
      const updates = posted.filter((message) => message.type === 'update');
      const update = updates[updates.length - 1];
      if (update?.type !== 'update') throw new Error('expected an update');
      return update.snapshot;
    };
    const running = timedHost();
    running.host.handle({ type: 'time', change: { kind: 'setSpeed', speed: 5 } });
    running.host.handle({ type: 'time', change: { kind: 'togglePause' } });
    running.time.advance(1_000);
    const stepped = timedHost();
    stepped.host.handle({ type: 'step', requestId: 1, days: 10 });
    expect(lastSnapshot(running.posted)).toEqual(lastSnapshot(stepped.posted));
    expect(lastSnapshot(running.posted)).toMatchObject({ day: 10, date: { month: 1, day: 11 } });
  });

  it('refuses a speed that does not exist, and stops after a crash', () => {
    const { host, posted, time } = timedHost();
    host.handle({ type: 'time', change: { kind: 'togglePause' } });
    host.handle({ type: 'time', change: { kind: 'setSpeed', speed: 6 } });
    expect(posted.at(-1)).toMatchObject({ type: 'error', key: 'ERROR_SIM_CRASHED' });
    const count = posted.length;
    time.advance(10_000);
    expect(posted).toHaveLength(count);
    expect(time.pendingTimers()).toBe(0);
  });
});
