import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { AppState, AppStore } from '../app-store';
import type { MapMode } from '../render/map/map-colors';
import type { TimeChange } from '../worker/protocol';
import { CountryPanel } from './country-panel';
import { t } from './i18n';
import { MapModeBar } from './map-mode-bar';
import { MapTooltip } from './map-tooltip';
import { ProvincePanel } from './province-panel';
import { RegionPanel } from './region-panel';
import { SeaZonePanel } from './sea-zone-panel';
import { AlertsRow } from './shell/alerts-row';
import { LensBar } from './shell/lens-bar';
import { Popup, Toasts } from './shell/notifications';
import { Outliner } from './shell/outliner';
import type { PanelNav } from './shell/panel-header';
import type { ShellActions } from './shell/shell-actions';
import { ShellWindowView } from './shell/shell-window';
import { TopBar } from './shell/top-bar';
import { TimeControl } from './time-control';

export interface AppProps {
  readonly store: AppStore;
  readonly actions: ShellActions;
  /** Pause, unpause or change the game speed. */
  readonly onChangeTime: (change: TimeChange) => void;
  readonly onSetMapMode: (mode: MapMode) => void;
  /** Brings the whole world back into view, north up. */
  readonly onResetView: () => void;
  /** Extra controls of the UI demo (`?debug=ui-demo`); absent in a normal game. */
  readonly demoControls?: ReactNode;
}

/**
 * The root of the React UI: an HTML layer drawn on top of the 3D view. The
 * UI shell (F122, section 12.1): the top bar, the alerts row under it, the
 * information panel on the left, the outliner on the right, the lens bar
 * bottom-left, the map mode box bottom-right, toasts, pop-ups and windows.
 */
export function App({
  store,
  actions,
  onChangeTime,
  onSetMapMode,
  onResetView,
  demoControls,
}: AppProps) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const { world, provinceOwner } = state;

  // Esc closes the topmost thing: a window, the lens list, then the panel.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const current = store.getState();
      if (current.popups.length > 0) actions.closePopup();
      else if (current.openWindow) actions.closeWindow();
      else if (current.openLens) actions.closeLens();
      else if (current.panel) actions.closePanel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store, actions]);

  return (
    <div className="ui-layer">
      <TopBar
        world={world}
        playerCountry={state.playerCountry}
        onOpenCountry={(country) => actions.show({ kind: 'country', index: country })}
        onOpenWindow={actions.openWindow}
        timeControl={
          state.snapshot &&
          state.time && (
            <TimeControl
              date={state.snapshot.date}
              time={state.time}
              daysPerSecond={state.daysPerSecond}
              onChangeTime={onChangeTime}
            />
          )
        }
      />

      <AlertsRow
        alerts={state.alerts}
        notifications={state.notifications}
        alertsOff={state.uiSettings.alertsOff}
        onClick={(alert) => alert.target && actions.show(alert.target)}
        onDismiss={(alert) => actions.dismissAlert(alert.id)}
      />

      <InfoPanel state={state} actions={actions} />

      {state.sim === 'running' && (
        <Outliner
          entries={state.outliner}
          onSelect={(entry) => entry.target && actions.show(entry.target)}
        />
      )}

      <Toasts toasts={state.toasts} actions={actions} />

      {state.sim === 'running' && (
        <LensBar
          openLens={state.openLens}
          onToggleLens={actions.toggleLens}
          onOpenScreen={actions.openWindow}
        />
      )}
      {state.map === 'ready' && (
        <MapModeBar mode={state.mapMode} onSetMapMode={onSetMapMode} onResetView={onResetView} />
      )}
      {state.map === 'loading' && !state.error && (
        <div className="loading-note" data-testid="loading-note">
          <span className="loading-title">{t('GAME_TITLE')}</span>
          <span>{t('LOADING_MAP')}</span>
        </div>
      )}
      {demoControls}

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

      {state.openWindow && (
        <ShellWindowView window={state.openWindow} state={state} actions={actions} />
      )}
      {state.popups.length > 0 && (
        <Popup message={state.popups[0]} waiting={state.popups.length - 1} actions={actions} />
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

/** The information panel on the left: one of province, sea zone, country or region (F122). */
function InfoPanel({ state, actions }: { state: AppState; actions: ShellActions }) {
  const { world, provinceOwner, countryStart, panel } = state;
  if (!world || !provinceOwner || !panel) return null;
  const nav: PanelNav = {
    canGoBack: state.panelHistory.length > 0,
    onBack: actions.back,
    onClose: actions.closePanel,
  };
  const link = {
    province: (index: number) => actions.followLink({ kind: 'province', index }),
    seaZone: (index: number) => actions.followLink({ kind: 'seaZone', index }),
    country: (index: number) => actions.followLink({ kind: 'country', index }),
    region: (index: number) => actions.followLink({ kind: 'region', index }),
  };
  switch (panel.kind) {
    case 'province':
      return (
        <ProvincePanel
          world={world}
          provinceOwner={provinceOwner}
          province={panel.index}
          nav={nav}
          onSelectProvince={link.province}
          onSelectSeaZone={link.seaZone}
          onSelectCountry={link.country}
          onSelectRegion={link.region}
        />
      );
    case 'seaZone':
      return (
        <SeaZonePanel
          world={world}
          seaZone={panel.index}
          nav={nav}
          onSelectSeaZone={link.seaZone}
          onSelectProvince={link.province}
        />
      );
    case 'country':
      return countryStart ? (
        <CountryPanel
          world={world}
          countryStart={countryStart}
          provinceOwner={provinceOwner}
          country={panel.index}
          nav={nav}
          onSelectCountry={link.country}
          onSelectProvince={link.province}
        />
      ) : null;
    case 'region':
      return (
        <RegionPanel
          world={world}
          provinceOwner={provinceOwner}
          region={panel.index}
          nav={nav}
          onSelectRegion={link.region}
          onSelectCountry={link.country}
          onSelectProvince={link.province}
        />
      );
  }
}
