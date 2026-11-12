import type { AppState } from '../app-store';
import { type TranslationKey, formatDate, t } from './i18n';

const RENDERER_TEXT: Record<AppState['renderer'], TranslationKey> = {
  starting: 'FOUNDATION_RENDERER_STARTING',
  webgpu: 'FOUNDATION_RENDERER_WEBGPU',
  webgl2: 'FOUNDATION_RENDERER_WEBGL2',
  failed: 'FOUNDATION_FAILED',
};

const SIM_TEXT: Record<AppState['sim'], TranslationKey> = {
  starting: 'FOUNDATION_SIM_STARTING',
  running: 'FOUNDATION_SIM_RUNNING',
  failed: 'FOUNDATION_FAILED',
};

export interface FoundationPanelProps {
  readonly state: AppState;
  readonly onAdvanceDay: () => void;
}

/**
 * A temporary panel that shows the game's foundations are alive: the 3D
 * renderer, the sim worker, and the round trip between them. The real UI
 * shell (top bar, outliner, lenses) replaces it in F122.
 */
export function FoundationPanel({ state, onAdvanceDay }: FoundationPanelProps) {
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
        <dt>{t('FOUNDATION_DATE')}</dt>
        <dd data-testid="sim-date">{snapshot ? formatDate(snapshot.date) : '—'}</dd>
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
      <button
        type="button"
        className="button"
        data-testid="advance-day"
        disabled={state.sim !== 'running'}
        onClick={onAdvanceDay}
      >
        {t('FOUNDATION_ADVANCE_DAY')}
      </button>
      <a className="foundation-link" href="map-preview.html" data-testid="map-preview-link">
        {t('FOUNDATION_MAP_PREVIEW')}
      </a>
    </section>
  );
}
