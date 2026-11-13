import type { NotificationsConfig } from '@terra-scutum/sim';
import { t, tKey } from '../i18n';
import { Icon } from './icons';
import type { ShellAlert } from './shell-types';
import { Tip } from './tip';

export interface AlertsRowProps {
  readonly alerts: readonly ShellAlert[];
  readonly notifications: NotificationsConfig | null;
  /** Alert types the player turned off in the settings. */
  readonly alertsOff: readonly string[];
  readonly onClick: (alert: ShellAlert) => void;
  readonly onDismiss: (alert: ShellAlert) => void;
}

/**
 * The alerts row (F122, section 12.1), under the top bar: one small icon per
 * problem or opportunity. Hover for details, click to jump, right-click to
 * dismiss. Alert types turned off in the settings are left out. Empty until
 * the features that raise alerts are built.
 */
export function AlertsRow({
  alerts,
  notifications,
  alertsOff,
  onClick,
  onDismiss,
}: AlertsRowProps) {
  const kindOf = (typeId: string) =>
    notifications?.alertTypes.find((type) => type.id === typeId)?.kind ?? 'problem';
  const shown = alerts.filter((alert) => !alertsOff.includes(alert.typeId));
  if (shown.length === 0) return null;
  return (
    <div className="alerts-row" data-testid="alerts-row" role="list">
      {shown.map((alert) => {
        const kind = kindOf(alert.typeId);
        return (
          <button
            key={alert.id}
            type="button"
            role="listitem"
            className={`alert-icon is-${kind} has-tip`}
            data-testid="alert"
            data-alert-type={alert.typeId}
            aria-label={tKey(alert.titleKey, alert.params)}
            onClick={() => onClick(alert)}
            onContextMenu={(event) => {
              event.preventDefault();
              onDismiss(alert);
            }}
          >
            <Icon name={kind} />
            <Tip
              title={tKey(alert.titleKey, alert.params)}
              lines={[tKey(alert.textKey, alert.params), t('ALERT_HINT')]}
            />
          </button>
        );
      })}
    </div>
  );
}
