import type { CountryStartTable, SimSnapshot, WorldMap } from '@terra-scutum/sim';
import type { RendererType } from './render/create-engine';
import type { MapMode } from './render/map/map-colors';
import type { TranslationKey } from './ui/i18n';
import type { TimeState } from './worker/protocol';

/** What the UI shows. Changed only through `AppStore.update`; React re-renders when it changes. */
export interface AppState {
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
  /**
   * Province indices (see `WorldMap`), or null for none. At most one province
   * or one sea zone is selected: selecting one clears the other.
   */
  readonly selectedProvince: number | null;
  readonly hoveredProvince: number | null;
  /** Sea zone indices (see `WorldMap`), or null for none. */
  readonly selectedSeaZone: number | null;
  readonly hoveredSeaZone: number | null;
  /** The country (index) whose panel is open, or null. */
  readonly selectedCountry: number | null;
  /** A problem to show the player: a translation key plus technical detail for bug reports. */
  readonly error: { readonly key: TranslationKey; readonly detail: string } | null;
}

export interface AppStore {
  readonly getState: () => AppState;
  readonly update: (changes: Partial<AppState>) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createAppStore(): AppStore {
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
    selectedProvince: null,
    hoveredProvince: null,
    selectedSeaZone: null,
    hoveredSeaZone: null,
    selectedCountry: null,
    error: null,
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
