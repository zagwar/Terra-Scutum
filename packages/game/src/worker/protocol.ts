import type {
  GameConfig,
  ModelsConfig,
  RenderStressConfig,
  TerrainTilesFile,
  CommandResult,
  CountryScreenConfig,
  CountryStartTable,
  GovernmentKind,
  MapViewConfig,
  NotificationsConfig,
  SimCommand,
  SimEvent,
  SimSnapshot,
  WorldMap,
} from '@terra-scutum/sim';

/** What the country screen (F138) needs from the data files, sent once in the `ready` message. */
export interface CountryScreenData {
  /** The lists the screen shows (validated `data/country_screen.json`). */
  readonly config: CountryScreenConfig;
  /** Each country's flag code (`data/country_flags.json`), by country index. */
  readonly flagCodes: readonly string[];
  /** The kind of each government type (democracy, autocracy, corporate), by government type id. */
  readonly governmentKinds: Readonly<Record<string, GovernmentKind>>;
}

/**
 * Messages between the game (main thread) and the sim worker.
 *
 * The sim worker owns `GameState`. The game never touches it directly: it
 * sends requests and gets back snapshots and sim events.
 */
export type ToSimWorker =
  /**
   * Start a new campaign with this seed. Answered with `ready`. `stressLoad`
   * (the render stress test, F139): run the sim stress test's placeholder
   * load (`data/stress_test.json` → `sim`) instead of the game's systems.
   */
  | { readonly type: 'init'; readonly seed: number; readonly stressLoad?: boolean }
  /** Apply a sim command. Answered with an `update` carrying the command's result. */
  | { readonly type: 'command'; readonly requestId: number; readonly command: SimCommand }
  /**
   * Simulate this many days right now, whatever the game speed. Answered with
   * an `update`. Tests use it to step days exactly (with the game paused).
   */
  | { readonly type: 'step'; readonly requestId: number; readonly days: number }
  /** Pause, unpause or change the game speed. Answered with `time`. */
  | { readonly type: 'time'; readonly change: TimeChange };

/**
 * The game speed (F04). It belongs to the sim worker, not to the campaign:
 * it is how fast the worker runs the daily tick, so it is not in `GameState`
 * and not saved (decision log, F132).
 */
export interface TimeState {
  readonly paused: boolean;
  /** 1 (slowest) to 5 (fastest); kept while paused. */
  readonly speed: number;
}

export type TimeChange =
  | { readonly kind: 'togglePause' }
  | { readonly kind: 'setPaused'; readonly paused: boolean }
  /** Choose a speed (1–5); a paused game stays paused. */
  | { readonly kind: 'setSpeed'; readonly speed: number }
  /** One speed faster or slower, stopping at 1 and 5. */
  | { readonly kind: 'faster' }
  | { readonly kind: 'slower' };

export type FromSimWorker =
  | {
      readonly type: 'ready';
      readonly snapshot: SimSnapshot;
      readonly saveFormatVersion: number;
      /** The map's fixed facts (ids, who borders whom); sent once, it never changes during a campaign. */
      readonly world: WorldMap;
      /** How the map is drawn (validated `data/map_view.json`). */
      readonly mapView: MapViewConfig;
      /** Which terrain tiles exist (validated `data/terrain_tiles.json`). */
      readonly terrainTiles: TerrainTilesFile;
      /** The 3D model library and procedural materials (validated `data/models.json`). */
      readonly models: ModelsConfig;
      /** Each country's real-world starting data (population, GDP, government type), by country index. */
      readonly countryStart: CountryStartTable;
      /** The game speed at the start: paused. */
      readonly time: TimeState;
      /** Days per second at speeds 1–5 (`data/game_config.json`). */
      readonly daysPerSecond: readonly number[];
      /**
       * The country (index) the player leads at the start: `playerCountry` in
       * `data/game_config.json` until the player chooses another (F05); after
       * that, every snapshot carries it.
       */
      readonly playerCountry: number;
      /** Message types and alert types (validated `data/notifications.json`). */
      readonly notifications: NotificationsConfig;
      /** What the country screen (F138) needs from the data files. */
      readonly countryScreen: CountryScreenData;
      /** What the render stress test (`?debug=stress`, F139) puts on the map (`data/stress_test.json` → `render`). */
      readonly renderStress: RenderStressConfig;
      /** The performance budgets (`data/game_config.json`), for the stress test's counter. */
      readonly performanceBudget: GameConfig['performanceBudget'];
    }
  | {
      readonly type: 'update';
      /** The request this update answers, if any (ticks driven by game speed have none). */
      readonly requestId?: number;
      readonly snapshot: SimSnapshot;
      readonly events: readonly SimEvent[];
      readonly commandResult?: CommandResult;
      /** For a day run at game speed: how long the daily tick took, in milliseconds. */
      readonly tickMs?: number;
    }
  /** The game speed changed (or a change was asked for and it stayed the same). */
  | { readonly type: 'time'; readonly time: TimeState }
  /** The sim could not start or crashed. `key` is a translation key; `detail` is technical text for bug reports. */
  | { readonly type: 'error'; readonly key: SimWorkerErrorKey; readonly detail: string };

export type SimWorkerErrorKey = 'ERROR_SIM_DATA_INVALID' | 'ERROR_SIM_CRASHED';

/** The most days a single `step` request may simulate. */
export const MAX_STEP_DAYS = 3660;
