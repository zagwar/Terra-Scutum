import type { SimSnapshot } from '@terra-scutum/sim';
import type { RendererType } from './render/create-engine';
import type { TranslationKey } from './ui/i18n';

/** What the UI shows. Changed only through `AppStore.update`; React re-renders when it changes. */
export interface AppState {
  readonly renderer: 'starting' | RendererType | 'failed';
  readonly sim: 'starting' | 'running' | 'failed';
  /** The latest snapshot from the sim worker; null until the sim is ready. */
  readonly snapshot: SimSnapshot | null;
  readonly saveFormatVersion: number | null;
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
    snapshot: null,
    saveFormatVersion: null,
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
