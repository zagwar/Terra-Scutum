import type {
  CountryStartTable,
  NotificationsConfig,
  SimSnapshot,
  WorldMap,
} from '@terra-scutum/sim';
import type { RendererType } from './render/create-engine';
import type { MapMode } from './render/map/map-colors';
import type { TranslationKey } from './ui/i18n';
import type { LensId, ShellWindow } from './ui/shell/catalog';
import type { GameMessage } from './ui/shell/messages';
import type { PanelState } from './ui/shell/panel-navigation';
import type { OutlinerEntry, ShellAlert } from './ui/shell/shell-types';
import { EMPTY_UI_SETTINGS, type UiSettings } from './ui/shell/ui-settings';
import type { CountryScreenData, TimeState } from './worker/protocol';

/** What the UI shows. Changed only through `AppStore.update`; React re-renders when it changes. */
export interface AppState extends PanelState {
  readonly renderer: 'starting' | RendererType | 'failed';
  readonly sim: 'starting' | 'running' | 'failed';
  /** The world map in the 3D view: its shapes are downloaded after the page has loaded. */
  readonly map: 'loading' | 'ready' | 'failed';
  /** The latest snapshot from the sim worker; null until the sim is ready. */
  readonly snapshot: SimSnapshot | null;
  /**
   * The country (index) that owns each province right now; null until the sim
   * is ready. Kept apart from the snapshot because the sim only sends the
   * owners again when they change.
   */
  readonly provinceOwner: Uint16Array | null;
  /** The map's fixed facts from the sim (ids, who borders whom); null until the sim is ready. */
  readonly world: WorldMap | null;
  /** Each country's real-world starting data (F71); null until the sim is ready. */
  readonly countryStart: CountryStartTable | null;
  readonly saveFormatVersion: number | null;
  /** The game speed, as the sim worker last reported it; null until the sim is ready. */
  readonly time: TimeState | null;
  /** Days per second at speeds 1–5 (`data/game_config.json`); empty until the sim is ready. */
  readonly daysPerSecond: readonly number[];
  readonly mapMode: MapMode;
  /** Province and sea zone under the mouse (indices, see `WorldMap`), or null. */
  readonly hoveredProvince: number | null;
  readonly hoveredSeaZone: number | null;
  /** The country (index) the player leads; null until the sim is ready. */
  readonly playerCountry: number | null;
  /**
   * True while the player chooses their country at the start of a game (F05):
   * the map shows the selection panel instead of the shell, and time can't run.
   */
  readonly choosingCountry: boolean;
  /** The country (index) shown in the selection panel and tinted on the map, or null. */
  readonly candidateCountry: number | null;
  /** Message types and alert types (`data/notifications.json`); null until the sim is ready. */
  readonly notifications: NotificationsConfig | null;
  /** What the country screen needs from the data files (F138); null until the sim is ready. */
  readonly countryScreen: CountryScreenData | null;
  /** The window open over the map (a screen, the settings, the message log), or null. */
  readonly openWindow: ShellWindow | null;
  /** The lens whose screen list is open in the lens bar, or null. */
  readonly openLens: LensId | null;
  readonly alerts: readonly ShellAlert[];
  readonly outliner: readonly OutlinerEntry[];
  /** Toasts on screen now, oldest first. */
  readonly toasts: readonly GameMessage[];
  /** Pop-ups waiting to be closed; the first one is shown. */
  readonly popups: readonly GameMessage[];
  /** Every message shown or logged, newest last (at most `MESSAGE_LOG_LIMIT`). */
  readonly messageLog: readonly GameMessage[];
  readonly uiSettings: UiSettings;
  /** A problem to show the player: a translation key plus technical detail for bug reports. */
  readonly error: { readonly key: TranslationKey; readonly detail: string } | null;
}

export interface AppStore {
  readonly getState: () => AppState;
  readonly update: (changes: Partial<AppState>) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

/** How many messages the message log keeps [DEFAULT]. */
export const MESSAGE_LOG_LIMIT = 100;

export function createAppStore(initial: Partial<AppState> = {}): AppStore {
  let state: AppState = {
    renderer: 'starting',
    sim: 'starting',
    map: 'loading',
    snapshot: null,
    provinceOwner: null,
    world: null,
    countryStart: null,
    saveFormatVersion: null,
    time: null,
    daysPerSecond: [],
    mapMode: 'political',
    panel: null,
    panelHistory: [],
    selectedProvince: null,
    hoveredProvince: null,
    selectedSeaZone: null,
    hoveredSeaZone: null,
    playerCountry: null,
    choosingCountry: false,
    candidateCountry: null,
    notifications: null,
    countryScreen: null,
    openWindow: null,
    openLens: null,
    alerts: [],
    outliner: [],
    toasts: [],
    popups: [],
    messageLog: [],
    uiSettings: EMPTY_UI_SETTINGS,
    error: null,
    ...initial,
  };
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    update(changes) {
      state = { ...state, ...changes };
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
