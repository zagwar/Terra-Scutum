import { type WorldMap, countryNameKey } from '@terra-scutum/sim';
import type { ReactNode } from 'react';
import { Flag } from '../flag';
import { t, tKey } from '../i18n';
import {
  TOP_BAR_ITEMS,
  TOP_BAR_ITEM_IDS,
  type ComesWith,
  type ShellWindow,
  topBarHintKey,
  topBarNameKey,
} from './catalog';
import { Icon } from './icons';
import { Tip } from './tip';

export interface TopBarProps {
  readonly world: WorldMap | null;
  /** The country (index) the player leads; null until the sim is ready. */
  readonly playerCountry: number | null;
  /** Each country's flag code (F138), by country index; null until the sim is ready. */
  readonly flagCodes: readonly string[] | null;
  /** The date and speed control (F04), at the bar's right end. */
  readonly timeControl: ReactNode;
  readonly onOpenCountry: (country: number) => void;
  readonly onOpenWindow: (window: ShellWindow) => void;
}

/** "Comes with F09 (M2)": the note for a number or screen that isn't built yet. */
export function comesWithText(comesWith: ComesWith): string {
  return t('SHELL_COMES_WITH', { feature: comesWith.feature, milestone: comesWith.milestone });
}

/**
 * The top bar (F122, section 12.1): the player's country (its flag since
 * F138; opens the country screen's Government view), the key numbers, the date and speed,
 * the message log and the settings. None of the key numbers exists in the sim
 * yet: each shows a dim "—" and its tooltip says which feature brings it
 * (designer decision). Clicking a number opens its screen.
 */
export function TopBar({
  world,
  playerCountry,
  flagCodes,
  timeControl,
  onOpenCountry,
  onOpenWindow,
}: TopBarProps) {
  const countryName =
    world && playerCountry !== null ? tKey(countryNameKey(world.countryIds[playerCountry])) : '';

  return (
    <header className="top-bar" data-testid="top-bar">
      {world && playerCountry !== null && (
        <button
          type="button"
          className="top-bar-flag has-tip"
          data-testid="top-bar-flag"
          onClick={() => onOpenCountry(playerCountry)}
        >
          <Flag
            code={flagCodes?.[playerCountry]}
            color={world.countryMapColor[playerCountry]}
            className="top-bar-flag-image"
            testId="top-bar-flag-image"
          />
          <span className="top-bar-flag-name">{countryName}</span>
          <Tip
            title={countryName}
            lines={[t('TOP_BAR_FLAG_HINT'), t('TOP_BAR_FLAG_NOTE')]}
            testId="top-bar-flag-tip"
          />
        </button>
      )}

      <div className="top-bar-items" role="group" aria-label={t('TOP_BAR_GROUP')}>
        {TOP_BAR_ITEM_IDS.map((id) => {
          const item = TOP_BAR_ITEMS[id];
          const name = tKey(topBarNameKey(id));
          return (
            <button
              key={id}
              type="button"
              className="top-bar-item is-missing has-tip"
              data-testid={`top-bar-${id}`}
              aria-label={name}
              onClick={() => onOpenWindow(item.screen)}
            >
              <Icon name={id} />
              <span className="top-bar-value">
                {t('SHELL_NO_VALUE')}
                {id === 'treasury' && (
                  <span className="top-bar-subvalue"> ({t('SHELL_NO_VALUE')})</span>
                )}
              </span>
              <Tip
                title={name}
                lines={[tKey(topBarHintKey(id)), comesWithText(item.comesWith)]}
                testId={`top-bar-${id}-tip`}
              />
            </button>
          );
        })}
      </div>

      <div className="top-bar-end">
        {timeControl}
        <button
          type="button"
          className="top-bar-button has-tip"
          data-testid="open-message-log"
          aria-label={t('MESSAGE_LOG_TITLE')}
          onClick={() => onOpenWindow('messageLog')}
        >
          <Icon name="messageLog" />
          <Tip title={t('MESSAGE_LOG_TITLE')} lines={[t('MESSAGE_LOG_HINT')]} align="end" />
        </button>
        <button
          type="button"
          className="top-bar-button has-tip"
          data-testid="open-settings"
          aria-label={t('SETTINGS_TITLE')}
          onClick={() => onOpenWindow('settings')}
        >
          <Icon name="settings" />
          <Tip title={t('SETTINGS_TITLE')} lines={[t('SETTINGS_HINT')]} align="end" />
        </button>
      </div>
    </header>
  );
}
