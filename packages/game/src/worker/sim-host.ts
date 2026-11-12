import {
  DataValidationError,
  GameState,
  type RawGameData,
  SAVE_FORMAT_VERSION,
  createSnapshot,
  parseGameData,
} from '@terra-scutum/sim';
import { type FromSimWorker, MAX_STEP_DAYS, type ToSimWorker } from './protocol';

/**
 * The logic of the sim worker, kept free of worker APIs so it can be unit
 * tested in Node: it receives messages, drives the `GameState`, and posts answers.
 */
export interface SimHost {
  handle(message: ToSimWorker): void;
}

export function createSimHost(
  rawData: RawGameData,
  post: (message: FromSimWorker) => void,
): SimHost {
  let state: GameState | null = null;
  let failed = false;

  function requireState(): GameState {
    if (!state) throw new Error('the sim received a request before "init"');
    return state;
  }

  function handle(message: ToSimWorker): void {
    switch (message.type) {
      case 'init': {
        const data = parseGameData(rawData);
        state = new GameState({ data, seed: message.seed });
        post({
          type: 'ready',
          snapshot: createSnapshot(state),
          saveFormatVersion: SAVE_FORMAT_VERSION,
          world: state.world,
          mapView: data.mapView,
        });
        return;
      }
      case 'command': {
        const current = requireState();
        const commandResult = current.applyCommand(message.command);
        post({
          type: 'update',
          requestId: message.requestId,
          snapshot: createSnapshot(current),
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
          snapshot: createSnapshot(current),
          events: current.drainEvents(),
        });
        return;
      }
      default: {
        const unknown: never = message;
        throw new Error(`unknown message: ${JSON.stringify(unknown)}`);
      }
    }
  }

  return {
    handle(message) {
      // After a crash the state can't be trusted, so the sim stays stopped.
      if (failed) return;
      try {
        handle(message);
      } catch (error) {
        failed = true;
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
    },
  };
}
