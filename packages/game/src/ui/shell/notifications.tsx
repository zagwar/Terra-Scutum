import { formatDate, t, tKey } from '../i18n';
import type { GameMessage } from './messages';
import type { ShellActions } from './shell-actions';

/**
 * Notifications (F122, section 12.1): small toasts for minor messages (they
 * fade after a few seconds; click one to see its place, ✕ to close it) and a
 * pop-up window for important ones (it may have paused the game). How each
 * message type is shown is set in the settings.
 */
export function Toasts({
  toasts,
  actions,
}: {
  readonly toasts: readonly GameMessage[];
  readonly actions: ShellActions;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" data-testid="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" data-testid="toast" role="status">
          <button
            type="button"
            className="toast-body"
            disabled={!toast.target}
            onClick={() => {
              if (toast.target) actions.show(toast.target);
              actions.dismissToast(toast.id);
            }}
          >
            <span className="toast-title">{tKey(toast.titleKey, toast.params)}</span>
            <span className="toast-text">{tKey(toast.textKey, toast.params)}</span>
          </button>
          <button
            type="button"
            className="toast-close"
            aria-label={t('PANEL_CLOSE')}
            onClick={() => actions.dismissToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function Popup({
  message,
  waiting,
  actions,
}: {
  readonly message: GameMessage;
  /** How many more pop-ups wait after this one. */
  readonly waiting: number;
  readonly actions: ShellActions;
}) {
  return (
    <div className="popup-layer">
      <section
        className="panel popup"
        data-testid="popup"
        role="alertdialog"
        aria-label={tKey(message.titleKey, message.params)}
      >
        <p className="popup-date">{formatDate(message.date)}</p>
        <h2 className="shell-window-title">{tKey(message.titleKey, message.params)}</h2>
        <p className="popup-text">{tKey(message.textKey, message.params)}</p>
        {waiting > 0 && <p className="hint">{t('POPUP_MORE_WAITING', { count: waiting })}</p>}
        <div className="button-row">
          {message.target && (
            <button
              type="button"
              className="button"
              data-testid="popup-show"
              onClick={() => {
                actions.show(message.target!);
                actions.closePopup();
              }}
            >
              {t('POPUP_SHOW')}
            </button>
          )}
          <button
            type="button"
            className="button is-active"
            data-testid="popup-ok"
            onClick={actions.closePopup}
          >
            {t('POPUP_OK')}
          </button>
        </div>
      </section>
    </div>
  );
}
