import { useSyncExternalStore } from 'react';
import type { AppStore } from '../app-store';
import { FoundationPanel } from './foundation-panel';
import { t } from './i18n';

export interface AppProps {
  readonly store: AppStore;
  readonly onAdvanceDay: () => void;
}

/** The root of the React UI: an HTML layer drawn on top of the 3D view. */
export function App({ store, onAdvanceDay }: AppProps) {
  const state = useSyncExternalStore(store.subscribe, store.getState);

  return (
    <div className="ui-layer">
      <header className="title-block">
        <h1 className="game-title">{t('GAME_TITLE')}</h1>
        <p className="game-subtitle">{t('GAME_SUBTITLE')}</p>
      </header>

      <FoundationPanel state={state} onAdvanceDay={onAdvanceDay} />

      {state.error && (
        <div className="error-overlay" role="alert" data-testid="error-overlay">
          <section className="panel error-panel">
            <h2 className="panel-title">{t('ERROR_TITLE')}</h2>
            <p>{t(state.error.key)}</p>
            {state.error.detail && <pre className="error-detail">{state.error.detail}</pre>}
          </section>
        </div>
      )}
    </div>
  );
}
