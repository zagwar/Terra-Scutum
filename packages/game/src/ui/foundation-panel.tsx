import type { AppState } from '../app-store';
import { type TranslationKey, t } from './i18n';

const RENDERER_TEXT: Record<AppState['renderer'], TranslationKey> = {
  starting: 'FOUNDATION_RENDERER_STARTING',
  webgpu: 'FOUNDATION_RENDERER_WEBGPU',
  webgl2: 'FOUNDATION_RENDERER_WEBGL2',
  failed: 'FOUNDATION_FAILED',
};

const MAP_STATUS: Record<AppState['map'], 'good' | 'pending' | 'bad'> = {
  loading: 'pending',
  ready: 'good',
  failed: 'bad',
};

const SIM_TEXT: Record<AppState['sim'], TranslationKey> = {
  starting: 'FOUNDATION_SIM_STARTING',
  running: 'FOUNDATION_SIM_RUNNING',
  failed: 'FOUNDATION_FAILED',
};

export interface FoundationPanelProps {
  readonly state: AppState;
}

/**
 * A temporary panel that shows the game's foundations are alive: the 3D
 * renderer, the sim worker, the round trip between them, and the world map.
 * (The date and the game speed have their own control since F04.)
 * The real UI shell (top bar, outliner, lenses) replaces it in F122.
 */
export function FoundationPanel({ state }: FoundationPanelProps) {
  const { snapshot } = state;
  const status = (value: AppState['renderer'] | AppState['sim']) =>
    value === 'failed' ? 'bad' : value === 'starting' ? 'pending' : 'good';

  return (
    <section className="panel foundation-panel" data-testid="foundation-panel">
      <h2 className="panel-title">{t('FOUNDATION_PANEL_TITLE')}</h2>
      <dl className="facts">
        <dt>{t('FOUNDATION_RENDERER')}</dt>
        <dd data-testid="renderer-status" data-status={status(state.renderer)}>
          {t(RENDERER_TEXT[state.renderer])}
        </dd>
        <dt>{t('FOUNDATION_SIM')}</dt>
        <dd data-testid="sim-status" data-status={status(state.sim)}>
          {t(SIM_TEXT[state.sim])}
        </dd>
        <dt>{t('FOUNDATION_MAP')}</dt>
        <dd data-testid="map-status" data-status={MAP_STATUS[state.map]}>
          {state.map === 'ready' && state.world
            ? t('FOUNDATION_MAP_READY', {
                provinces: state.world.provinceIds.length.toLocaleString('en'),
              })
            : t(state.map === 'failed' ? 'FOUNDATION_FAILED' : 'FOUNDATION_MAP_LOADING')}
        </dd>
        <dt>{t('FOUNDATION_DAYS_SIMULATED')}</dt>
        <dd data-testid="sim-day">{snapshot ? snapshot.day : '—'}</dd>
        <dt>{t('FOUNDATION_SAVE_FORMAT')}</dt>
        <dd data-testid="save-format">
          {state.saveFormatVersion === null
            ? '—'
            : t('FOUNDATION_SAVE_FORMAT_VALUE', { version: state.saveFormatVersion })}
        </dd>
        <dt>{t('FOUNDATION_BUILD')}</dt>
        <dd data-testid="build-commit">{__BUILD_COMMIT__}</dd>
      </dl>
    </section>
  );
}
