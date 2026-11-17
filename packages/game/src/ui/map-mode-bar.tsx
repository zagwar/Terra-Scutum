import type { MapViewConfig } from '@terra-scutum/sim';
import { MAP_MODES, type MapMode } from '../render/map/map-colors';
import { useState } from 'react';
import { type TranslationKey, formatPeopleShort, t } from './i18n';
import { COMPACT_QUERY, TOUCH_QUERY, isCompactNow, useMedia } from './use-media';

const MODE_TEXT: Record<MapMode, TranslationKey> = {
  political: 'MAP_MODE_POLITICAL',
  provinces: 'MAP_MODE_PROVINCES',
  regions: 'MAP_MODE_REGIONS',
  seaZones: 'MAP_MODE_SEA_ZONES',
  population: 'MAP_MODE_POPULATION',
  industry: 'MAP_MODE_INDUSTRY',
};

export interface MapModeBarProps {
  readonly mode: MapMode;
  /** The population map mode's colors by density (`data/map_view.json`), for its legend. */
  readonly populationDensityColors: MapViewConfig['colors']['populationDensity'];
  /** The industry map mode's colors by people at work in buildings, for its legend. */
  readonly industryColors: MapViewConfig['colors']['industry'];
  readonly onSetMapMode: (mode: MapMode) => void;
  readonly onResetView: () => void;
}

/**
 * The map mode buttons (section 12.2), bottom-right. Each feature adds its
 * map mode here; the minimap joins them with the UI shell (F122).
 */
export function MapModeBar({
  mode,
  populationDensityColors,
  industryColors,
  onSetMapMode,
  onResetView,
}: MapModeBarProps) {
  const compact = useMedia(COMPACT_QUERY);
  const touch = useMedia(TOUCH_QUERY);
  // On a small screen (a phone) the box starts folded to its title, to keep the map free.
  const [folded, setFolded] = useState(isCompactNow);
  const isFolded = compact && folded;
  return (
    <section
      className={isFolded ? 'panel map-mode-bar is-folded' : 'panel map-mode-bar'}
      data-testid="map-mode-bar"
    >
      {compact ? (
        <button
          type="button"
          className="map-mode-toggle"
          aria-expanded={!isFolded}
          data-testid="map-mode-toggle"
          onClick={() => setFolded(!folded)}
        >
          <span className="panel-title">{t('MAP_MODE_TITLE')}</span>
          <span aria-hidden="true">{isFolded ? '▴' : '▾'}</span>
        </button>
      ) : (
        <h2 className="panel-title">{t('MAP_MODE_TITLE')}</h2>
      )}
      {!isFolded && (
        <>
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
          {mode === 'population' && populationDensityColors.length > 0 && (
            <div className="map-legend" data-testid="map-legend">
              <span className="map-legend-title">{t('MAP_LEGEND_POPULATION')}</span>
              <ol>
                {populationDensityColors.map((step) => (
                  <li key={step.perKm2}>
                    <span className="map-legend-color" style={{ background: step.color }} />
                    {step.perKm2.toLocaleString('en')}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {mode === 'industry' && industryColors.length > 0 && (
            <div className="map-legend" data-testid="map-legend">
              <span className="map-legend-title">{t('MAP_LEGEND_INDUSTRY')}</span>
              <ol>
                {industryColors.map((step) => (
                  <li key={step.workers}>
                    <span className="map-legend-color" style={{ background: step.color }} />
                    {formatPeopleShort(step.workers)}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="map-hint-row">
            <p className="hint">{t(touch ? 'MAP_HINT_TOUCH' : 'MAP_HINT')}</p>
            <button
              type="button"
              className="link-button"
              title={t('MAP_RESET_VIEW_HINT')}
              data-testid="map-reset-view"
              onClick={onResetView}
            >
              {t('MAP_RESET_VIEW')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
