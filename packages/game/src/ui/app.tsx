import { useSyncExternalStore } from 'react';
import type { AppStore } from '../app-store';
import type { MapMode } from '../render/map/map-colors';
import { FoundationPanel } from './foundation-panel';
import { t } from './i18n';
import { MapModeBar } from './map-mode-bar';
import { MapTooltip } from './map-tooltip';
import { ProvincePanel } from './province-panel';

export interface AppProps {
  readonly store: AppStore;
  readonly onAdvanceDay: () => void;
  /** Select a province by its index, or null to clear the selection. */
  readonly onSelectProvince: (province: number | null) => void;
  readonly onSetMapMode: (mode: MapMode) => void;
}

/** The root of the React UI: an HTML layer drawn on top of the 3D view. */
export function App({ store, onAdvanceDay, onSelectProvince, onSetMapMode }: AppProps) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const { world } = state;

  return (
    <div className="ui-layer">
      <header className="title-block">
        <h1 className="game-title">{t('GAME_TITLE')}</h1>
        <p className="game-subtitle">{t('GAME_SUBTITLE')}</p>
      </header>

      <FoundationPanel state={state} onAdvanceDay={onAdvanceDay} />

      {world && state.selectedProvince !== null && (
        <ProvincePanel
          world={world}
          province={state.selectedProvince}
          onSelectProvince={onSelectProvince}
        />
      )}
      {state.map === 'ready' && <MapModeBar mode={state.mapMode} onSetMapMode={onSetMapMode} />}
      {world && state.hoveredProvince !== null && (
        <MapTooltip world={world} province={state.hoveredProvince} />
      )}

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
