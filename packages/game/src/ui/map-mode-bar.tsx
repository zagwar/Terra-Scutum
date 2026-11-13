import { MAP_MODES, type MapMode } from '../render/map/map-colors';
import { type TranslationKey, t } from './i18n';

const MODE_TEXT: Record<MapMode, TranslationKey> = {
  political: 'MAP_MODE_POLITICAL',
  provinces: 'MAP_MODE_PROVINCES',
  regions: 'MAP_MODE_REGIONS',
  seaZones: 'MAP_MODE_SEA_ZONES',
};

export interface MapModeBarProps {
  readonly mode: MapMode;
  readonly onSetMapMode: (mode: MapMode) => void;
}

/**
 * The map mode buttons (section 12.2), bottom-right. Each feature adds its
 * map mode here; the minimap joins them with the UI shell (F122).
 */
export function MapModeBar({ mode, onSetMapMode }: MapModeBarProps) {
  return (
    <section className="panel map-mode-bar" data-testid="map-mode-bar">
      <h2 className="panel-title">{t('MAP_MODE_TITLE')}</h2>
      <div className="button-row">
        {MAP_MODES.map((option) => (
          <button
            key={option}
            type="button"
            className={option === mode ? 'button is-active' : 'button'}
            aria-pressed={option === mode}
            data-testid={`map-mode-${option}`}
            onClick={() => onSetMapMode(option)}
          >
            {t(MODE_TEXT[option])}
          </button>
        ))}
      </div>
      <p className="hint">{t('MAP_HINT')}</p>
    </section>
  );
}
