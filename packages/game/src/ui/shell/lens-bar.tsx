import { t, tKey } from '../i18n';
import {
  LENS_IDS,
  LENS_SCREENS,
  type LensId,
  SCREENS,
  type ScreenId,
  lensNameKey,
  screenNameKey,
} from './catalog';
import { Icon } from './icons';
import { comesWithText } from './top-bar';

export interface LensBarProps {
  readonly openLens: LensId | null;
  readonly onToggleLens: (lens: LensId) => void;
  readonly onOpenScreen: (screen: ScreenId) => void;
}

/**
 * The lens bar (F122, section 12.1, like Victoria 3), bottom-center: the main
 * screens grouped into eight lenses. Clicking a lens lists its screens above
 * the bar; clicking a screen opens it. The screens are empty until their
 * features are built and say which feature fills them.
 */
export function LensBar({ openLens, onToggleLens, onOpenScreen }: LensBarProps) {
  return (
    <nav className="lens-bar" data-testid="lens-bar" aria-label={t('LENS_BAR_TITLE')}>
      {openLens && (
        <section className="panel lens-menu" data-testid="lens-menu">
          <h2 className="panel-title">{tKey(lensNameKey(openLens))}</h2>
          <ul className="lens-screens">
            {LENS_SCREENS[openLens].map((screen) => (
              <li key={screen}>
                <button
                  type="button"
                  className="lens-screen"
                  data-testid={`lens-screen-${screen}`}
                  onClick={() => onOpenScreen(screen)}
                >
                  <span>{tKey(screenNameKey(screen))}</span>
                  {SCREENS[screen].comesWith && (
                    <span className="lens-screen-note">
                      {comesWithText(SCREENS[screen].comesWith)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="lens-buttons">
        {LENS_IDS.map((lens) => (
          <button
            key={lens}
            type="button"
            className={lens === openLens ? 'lens-button is-active' : 'lens-button'}
            aria-pressed={lens === openLens}
            // The name stays known when a phone shows the icon only.
            aria-label={tKey(lensNameKey(lens))}
            data-testid={`lens-${lens}`}
            onClick={() => onToggleLens(lens)}
          >
            <Icon name={lens} />
            <span>{tKey(lensNameKey(lens))}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
