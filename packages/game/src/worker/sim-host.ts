import {
  DataValidationError,
  GameState,
  type RawGameData,
  SAVE_FORMAT_VERSION,
  type SimSnapshot,
  createPlaceholderLoad,
  createSnapshot,
  flagCodesByIndex,
  parseGameData,
} from '@terra-scutum/sim';
import {
  type FromSimWorker,
  MAX_STEP_DAYS,
  type TimeChange,
  type TimeState,
  type ToSimWorker,
} from './protocol';

/**
 * The logic of the sim worker, kept free of worker APIs so it can be unit
 * tested in Node: it receives messages, drives the `GameState`, and posts answers.
 */
export interface SimHost {
  handle(message: ToSimWorker): void;
}

/**
 * Real time, as the sim host sees it. The worker passes the browser's clock
 * and timers; tests pass a fake clock they move forward by hand.
 */
export interface SimClock {
  /** Milliseconds, from any fixed starting point. */
  now(): number;
  /** Calls `callback` once after `delayMs`; returns a handle for `cancel`. */
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

/** The browser's (or Node's) clock and timers. */
export const realClock: SimClock = {
  now: () => performance.now(),
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createSimHost(
  rawData: RawGameData,
  post: (message: FromSimWorker) => void,
  clock: SimClock = realClock,
): SimHost {
  let state: GameState | null = null;
  let failed = false;
  /** The last snapshot posted: the next one leaves out the parts that haven't changed since. */
  let sent: SimSnapshot | undefined;
  const snapshotOf = (current: GameState): SimSnapshot => (sent = createSnapshot(current, sent));

  // ── Game speed (F04): real time with pause ────────────────────────────────
  // Not part of the campaign: how fast this worker calls `advanceDay`.
  let daysPerSecond: readonly number[] = [];
  let time: TimeState = { paused: true, speed: 1 };
  /** When the next day is due (clock milliseconds), while running. */
  let nextDayAt = 0;
  let timer: unknown = null;
  const msPerDay = (speed: number) => 1000 / daysPerSecond[speed - 1];

  function stopTimer(): void {
    if (timer !== null) clock.cancel(timer);
    timer = null;
  }

  function startTimer(): void {
    stopTimer();
    if (failed || time.paused || !state) return;
    timer = clock.schedule(runDay, Math.max(0, nextDayAt - clock.now()));
  }

  /** Runs one day at game speed, then waits for the next one. */
  function runDay(): void {
    timer = null;
    if (failed || time.paused || !state) return;
    const interval = msPerDay(time.speed);
    const startedAt = clock.now();
    // A timer that fires a little late is made up for, so the speed stays
    // true; a day that starts much later than due (the thread was busy) counts
    // from when it really started: missed time is never made up.
    const dayAt = startedAt - nextDayAt > interval / 2 ? startedAt : nextDayAt;
    guarded(() => {
      const current = requireState();
      const tickStartedAt = clock.now();
      current.advanceDay();
      const tickMs = clock.now() - tickStartedAt;
      post({
        type: 'update',
        snapshot: snapshotOf(current),
        events: current.drainEvents(),
        tickMs,
      });
    });
    if (failed) return;
    // The next day is due one day's time after this one. If that moment has
    // already passed (a slow day), it starts at once, but only that one day:
    // days never pile up.
    nextDayAt = Math.max(dayAt + interval, clock.now());
    startTimer();
  }

  function changeTime(change: TimeChange): void {
    const { paused, speed } = time;
    let next: TimeState;
    switch (change.kind) {
      case 'togglePause':
        next = { paused: !paused, speed };
        break;
      case 'setPaused':
        next = { paused: change.paused, speed };
        break;
      case 'setSpeed': {
        if (!Number.isInteger(change.speed) || change.speed < 1 || change.speed > 5) {
          throw new Error(`there is no game speed ${change.speed}; speeds are 1 to 5`);
        }
        next = { paused, speed: change.speed };
        break;
      }
      case 'faster':
        next = { paused, speed: Math.min(5, speed + 1) };
        break;
      case 'slower':
        next = { paused, speed: Math.max(1, speed - 1) };
        break;
      default: {
        const unknown: never = change;
        throw new Error(`unknown time change: ${JSON.stringify(unknown)}`);
      }
    }
    const now = clock.now();
    if (!next.paused) {
      if (paused) {
        // Unpaused: the first day passes one day's time from now.
        nextDayAt = now + msPerDay(next.speed);
      } else if (next.speed !== speed) {
        // A new speed while running: the next day is due one day (at the new
        // speed) after the last one, or at once if that has already passed.
        nextDayAt = Math.max(nextDayAt - msPerDay(speed) + msPerDay(next.speed), now);
      }
    }
    time = next;
    if (next.paused) stopTimer();
    else if (paused || next.speed !== speed) startTimer();
    post({ type: 'time', time });
  }

  function requireState(): GameState {
    if (!state) throw new Error('the sim received a request before "init"');
    return state;
  }

  function handle(message: ToSimWorker): void {
    switch (message.type) {
      case 'init': {
        const data = parseGameData(rawData);
        stopTimer();
        const load = message.stressLoad ? createPlaceholderLoad(data.stressTest.sim) : null;
        state = new GameState({ data, seed: message.seed, systems: load?.systems });
        load?.prepare(state);
        sent = undefined; // the first snapshot of a campaign is complete
        daysPerSecond = data.gameConfig.gameSpeed.daysPerSecond;
        // A new game starts paused.
        time = { paused: true, speed: data.gameConfig.gameSpeed.startSpeed };
        post({
          type: 'ready',
          snapshot: snapshotOf(state),
          saveFormatVersion: SAVE_FORMAT_VERSION,
          world: state.world,
          mapView: data.mapView,
          terrainTiles: data.terrainTiles,
          models: data.models,
          countryStart: state.countryStart,
          time,
          daysPerSecond,
          playerCountry: state.playerCountry,
          notifications: data.notifications,
          countryScreen: {
            config: data.countryScreen,
            flagCodes: flagCodesByIndex(state.world.countryIds, data.countryFlags),
            governmentKinds: Object.fromEntries(
              data.governmentTypes.governmentTypes.map((g) => [g.id, g.kind]),
            ),
          },
          renderStress: data.stressTest.render,
          performanceBudget: data.gameConfig.performanceBudget,
        });
        return;
      }
      case 'command': {
        const current = requireState();
        const commandResult = current.applyCommand(message.command);
        post({
          type: 'update',
          requestId: message.requestId,
          snapshot: snapshotOf(current),
          events: current.drainEvents(),
          commandResult,
        });
        return;
      }
      case 'step': {
        const current = requireState();
        const days = message.days;
        if (!Number.isInteger(days) || days < 1 || days > MAX_STEP_DAYS) {
          throw new Error(`"step" needs a whole number of days from 1 to ${MAX_STEP_DAYS}`);
        }
        for (let i = 0; i < days; i++) current.advanceDay();
        post({
          type: 'update',
          requestId: message.requestId,
          snapshot: snapshotOf(current),
          events: current.drainEvents(),
        });
        return;
      }
      case 'time': {
        requireState();
        changeTime(message.change);
        return;
      }
      default: {
        const unknown: never = message;
        throw new Error(`unknown message: ${JSON.stringify(unknown)}`);
      }
    }
  }

  /** Runs `work`; a crash is reported once, and after it the sim stays stopped. */
  function guarded(work: () => void): void {
    // After a crash the state can't be trusted, so the sim stays stopped.
    if (failed) return;
    try {
      work();
    } catch (error) {
      failed = true;
      stopTimer();
      const dataProblem = error instanceof DataValidationError;
      post({
        type: 'error',
        key: dataProblem ? 'ERROR_SIM_DATA_INVALID' : 'ERROR_SIM_CRASHED',
        detail:
          error instanceof Error
            ? dataProblem
              ? error.message
              : (error.stack ?? error.message)
            : String(error),
      });
    }
  }

  return {
    handle(message) {
      guarded(() => handle(message));
    },
  };
}
