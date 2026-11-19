import { MESSAGE_DELIVERIES, alertTypeNameKey, messageTypeNameKey } from '@terra-scutum/sim';
import { useState, type ReactNode } from 'react';
import type { AppState } from '../../app-store';
import { formatDate, t, tKey } from '../i18n';
import { SCREENS, type ShellWindow, lensNameKey, screenNameKey } from './catalog';
import { defaultMessageSettings } from './messages';
import type { ShellActions } from './shell-actions';
import { AboutBuild } from './about-build';
import { BuildingsScreen } from '../buildings/buildings-screen';
import { MarketsScreen } from '../markets/markets-screen';
import { PopulationScreen } from '../population/population-screen';
import { TradeScreen } from '../trade/trade-screen';
import { FoodScreen } from '../food/food-screen';
import { BudgetScreen } from '../budget/budget-screen';
import { comesWithText } from './top-bar';

export interface ShellWindowViewProps {
  readonly window: ShellWindow;
  readonly state: AppState;
  readonly actions: ShellActions;
}

/**
 * A window over the map (F122): one of the screens (empty until its feature
 * is built), the settings, or the message log. Esc or ✕ closes it.
 */
export function ShellWindowView({ window, state, actions }: ShellWindowViewProps) {
  let title: string;
  let body: ReactNode;
  if (window === 'settings') {
    title = t('SETTINGS_TITLE');
    body = <SettingsBody state={state} actions={actions} />;
  } else if (window === 'messageLog') {
    title = t('MESSAGE_LOG_TITLE');
    body = <MessageLogBody state={state} actions={actions} />;
  } else if (window === 'population') {
    title = tKey(screenNameKey(window));
    body = <PopulationScreen state={state} actions={actions} />;
  } else if (window === 'buildings') {
    title = tKey(screenNameKey(window));
    body = <BuildingsScreen state={state} actions={actions} />;
  } else if (window === 'markets') {
    title = tKey(screenNameKey(window));
    body = <MarketsScreen state={state} actions={actions} />;
  } else if (window === 'trade') {
    title = tKey(screenNameKey(window));
    body = <TradeScreen state={state} actions={actions} />;
  } else if (window === 'food') {
    title = tKey(screenNameKey(window));
    body = <FoodScreen state={state} actions={actions} />;
  } else if (window === 'budget') {
    title = tKey(screenNameKey(window));
    body = <BudgetScreen state={state} actions={actions} />;
  } else {
    const screen = SCREENS[window];
    title = tKey(screenNameKey(window));
    body = (
      <div className="screen-empty" data-testid="screen-empty">
        <p className="screen-empty-lens">{tKey(lensNameKey(screen.lens))}</p>
        <p>{t('SCREEN_EMPTY')}</p>
        {screen.comesWith && <p className="screen-empty-note">{comesWithText(screen.comesWith)}</p>}
      </div>
    );
  }
  return (
    <div className="shell-window-layer">
      <section
        className={
          window === 'markets' || window === 'trade' || window === 'food' || window === 'budget'
            ? 'panel shell-window is-wide is-wider'
            : window === 'population' || window === 'buildings'
              ? 'panel shell-window is-wide'
              : 'panel shell-window'
        }
        data-testid="shell-window"
        data-window={window}
        role="dialog"
        aria-label={title}
      >
        <div className="shell-window-header">
          <h2 className="shell-window-title">{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={t('PANEL_CLOSE')}
            title={t('WINDOW_CLOSE_HINT')}
            data-testid="shell-window-close"
            onClick={actions.closeWindow}
          >
            ×
          </button>
        </div>
        <div className="shell-window-body">{body}</div>
      </section>
    </div>
  );
}

type SettingsTab = 'messages' | 'alerts' | 'about';
const DELIVERY_TEXT = {
  popup: 'SETTINGS_DELIVERY_POPUP',
  toast: 'SETTINGS_DELIVERY_TOAST',
  log: 'SETTINGS_DELIVERY_LOG',
  off: 'SETTINGS_DELIVERY_OFF',
} as const;

/** The settings (section 12.1): message settings, alert types, and the build's technical facts. */
function SettingsBody({ state, actions }: { state: AppState; actions: ShellActions }) {
  const [tab, setTab] = useState<SettingsTab>('messages');
  const { notifications, uiSettings } = state;
  const defaults = notifications ? defaultMessageSettings(notifications) : {};
  return (
    <>
      <div className="tab-row" role="tablist">
        {(['messages', 'alerts', 'about'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={tab === option}
            className={tab === option ? 'button is-active' : 'button'}
            data-testid={`settings-tab-${option}`}
            onClick={() => setTab(option)}
          >
            {t(
              option === 'messages'
                ? 'SETTINGS_TAB_MESSAGES'
                : option === 'alerts'
                  ? 'SETTINGS_TAB_ALERTS'
                  : 'SETTINGS_TAB_ABOUT',
            )}
          </button>
        ))}
      </div>

      {tab === 'messages' && (
        <>
          <p className="hint">{t('SETTINGS_MESSAGES_HINT')}</p>
          <table className="settings-table" data-testid="message-settings">
            <thead>
              <tr>
                <th>{t('SETTINGS_MESSAGE_TYPE')}</th>
                <th>{t('SETTINGS_SHOW_AS')}</th>
                <th>{t('SETTINGS_PAUSES')}</th>
              </tr>
            </thead>
            <tbody>
              {notifications?.messageTypes.map((type) => {
                const setting = uiSettings.messages[type.id] ?? defaults[type.id];
                return (
                  <tr key={type.id} data-testid={`message-setting-${type.id}`}>
                    <td>{tKey(messageTypeNameKey(type.id))}</td>
                    <td>
                      <select
                        value={setting.delivery}
                        aria-label={t('SETTINGS_SHOW_AS')}
                        data-testid={`message-delivery-${type.id}`}
                        onChange={(event) =>
                          actions.setMessageDelivery(
                            type.id,
                            event.target.value as (typeof MESSAGE_DELIVERIES)[number],
                          )
                        }
                      >
                        {MESSAGE_DELIVERIES.map((delivery) => (
                          <option key={delivery} value={delivery}>
                            {t(DELIVERY_TEXT[delivery])}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={setting.pauses}
                        disabled={setting.delivery !== 'popup'}
                        aria-label={t('SETTINGS_PAUSES')}
                        data-testid={`message-pauses-${type.id}`}
                        onChange={(event) =>
                          actions.setMessagePauses(type.id, event.target.checked)
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="hint">{t('SETTINGS_MESSAGES_MORE')}</p>
        </>
      )}

      {tab === 'alerts' && (
        <>
          <p className="hint">{t('SETTINGS_ALERTS_HINT')}</p>
          <ul className="settings-list" data-testid="alert-settings">
            {notifications?.alertTypes.map((type) => (
              <li key={type.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!uiSettings.alertsOff.includes(type.id)}
                    data-testid={`alert-setting-${type.id}`}
                    onChange={(event) => actions.setAlertOn(type.id, event.target.checked)}
                  />
                  <span>{tKey(alertTypeNameKey(type.id))}</span>
                  <span className="settings-note">
                    {t(type.kind === 'problem' ? 'ALERT_KIND_PROBLEM' : 'ALERT_KIND_OPPORTUNITY')} ·{' '}
                    {t('SHELL_COMES_WITH_FEATURE', { feature: type.feature })}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === 'about' && <AboutBuild state={state} />}
    </>
  );
}

/** The message log: every message shown or logged, newest first; a click shows its place. */
function MessageLogBody({ state, actions }: { state: AppState; actions: ShellActions }) {
  const messages = [...state.messageLog].reverse();
  if (messages.length === 0)
    return (
      <p className="list-empty" data-testid="message-log-empty">
        {t('MESSAGE_LOG_EMPTY')}
      </p>
    );
  return (
    <ul className="message-log" data-testid="message-log">
      {messages.map((message) => (
        <li key={message.id}>
          <button
            type="button"
            className="message-log-entry"
            disabled={!message.target}
            onClick={() => {
              if (message.target) {
                actions.closeWindow();
                actions.show(message.target);
              }
            }}
          >
            <span className="message-log-date">{formatDate(message.date)}</span>
            <span className="message-log-title">{tKey(message.titleKey, message.params)}</span>
            <span className="message-log-text">{tKey(message.textKey, message.params)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
