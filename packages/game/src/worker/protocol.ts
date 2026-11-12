import type {
  CommandResult,
  MapViewConfig,
  SimCommand,
  SimEvent,
  SimSnapshot,
  WorldMap,
} from '@terra-scutum/sim';

/**
 * Messages between the game (main thread) and the sim worker.
 *
 * The sim worker owns `GameState`. The game never touches it directly: it
 * sends requests and gets back snapshots and sim events.
 */
export type ToSimWorker =
  /** Start a new campaign with this seed. Answered with `ready`. */
  | { readonly type: 'init'; readonly seed: number }
  /** Apply a sim command. Answered with an `update` carrying the command's result. */
  | { readonly type: 'command'; readonly requestId: number; readonly command: SimCommand }
  /** Simulate this many days right now. Answered with an `update`. */
  | { readonly type: 'step'; readonly requestId: number; readonly days: number };

export type FromSimWorker =
  | {
      readonly type: 'ready';
      readonly snapshot: SimSnapshot;
      readonly saveFormatVersion: number;
      /** The map's fixed facts (ids, who borders whom); sent once, it never changes during a campaign. */
      readonly world: WorldMap;
      /** How the map is drawn (validated `data/map_view.json`). */
      readonly mapView: MapViewConfig;
    }
  | {
      readonly type: 'update';
      /** The request this update answers, if any (ticks driven by game speed have none). */
      readonly requestId?: number;
      readonly snapshot: SimSnapshot;
      readonly events: readonly SimEvent[];
      readonly commandResult?: CommandResult;
    }
  /** The sim could not start or crashed. `key` is a translation key; `detail` is technical text for bug reports. */
  | { readonly type: 'error'; readonly key: SimWorkerErrorKey; readonly detail: string };

export type SimWorkerErrorKey = 'ERROR_SIM_DATA_INVALID' | 'ERROR_SIM_CRASHED';

/** The most days a single `step` request may simulate. */
export const MAX_STEP_DAYS = 3660;
