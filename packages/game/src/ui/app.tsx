import { useSyncExternalStore } from 'react';
import type { AppStore } from '../app-store';
import type { MapMode } from '../render/map/map-colors';
import { CountryPanel } from './country-panel';
import { FoundationPanel } from './foundation-panel';
import { t } from './i18n';
import { MapModeBar } from './map-mode-bar';
import { MapTooltip } from './map-tooltip';
import { ProvincePanel } from './province-panel';
import { SeaZonePanel } from './sea-zone-panel';

export interface AppProps {
  readonly store: AppStore;
  readonly onAdvanceDay: () => void;
  /** Select a province by its index, or null to clear the selection. */
  readonly onSelectProvince: (province: number | null) => void;
  /** Select a sea zone by its index, or null to clear the selection. */
  readonly onSelectSeaZone: (seaZone: number | null) => void;
  /** Open a country's panel by its index, or null to close it. */
  readonly onSelectCountry: (country: number | null) => void;
  readonly onSetMapMode: (mode: MapMode) => void;
  /** Brings the whole world back into view, north up. */
  readonly onResetView: () => void;
}

/** The root of the React UI: an HTML layer drawn on top of the 3D view. */
export function App({
  store,
  onAdvanceDay,
  onSelectProvince,
  onSelectSeaZone,
  onSelectCountry,
  onSetMapMode,
  onResetView,
}: AppProps) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const { world, provinceOwner } = state;

  return (
    <div className="ui-layer">
      <header className="title-block">
        <h1 className="game-title">{t('GAME_TITLE')}</h1>
        <p className="game-subtitle">{t('GAME_SUBTITLE')}</p>
      </header>

      <FoundationPanel state={state} onAdvanceDay={onAdvanceDay} />

      {world && provinceOwner && state.selectedCountry !== null && (
        <CountryPanel
          world={world}
          provinceOwner={provinceOwner}
          country={state.selectedCountry}
          onSelectCountry={onSelectCountry}
          onSelectProvince={onSelectProvince}
        />
      )}
      {world && provinceOwner && state.selectedProvince !== null && (
        <ProvincePanel
          world={world}
          provinceOwner={provinceOwner}
          province={state.selectedProvince}
          onSelectProvince={onSelectProvince}
          onSelectSeaZone={onSelectSeaZone}
          onSelectCountry={onSelectCountry}
        />
      )}
      {world && state.selectedSeaZone !== null && (
        <SeaZonePanel
          world={world}
          seaZone={state.selectedSeaZone}
          onSelectSeaZone={onSelectSeaZone}
          onSelectProvince={onSelectProvince}
        />
      )}
      {state.map === 'ready' && (
        <MapModeBar mode={state.mapMode} onSetMapMode={onSetMapMode} onResetView={onResetView} />
      )}
      {world && provinceOwner && state.hoveredProvince !== null && (
        <MapTooltip
          world={world}
          provinceOwner={provinceOwner}
          target={{ kind: 'province', index: state.hoveredProvince }}
        />
      )}
      {world && provinceOwner && state.hoveredSeaZone !== null && (
        <MapTooltip
          world={world}
          provinceOwner={provinceOwner}
          target={{ kind: 'seaZone', index: state.hoveredSeaZone }}
        />
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
