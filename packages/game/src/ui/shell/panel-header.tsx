import type { ReactNode } from 'react';
import { t } from '../i18n';

/** What every information panel can do: go back to the previous panel, or close. */
export interface PanelNav {
  readonly canGoBack: boolean;
  readonly onBack: () => void;
  readonly onClose: () => void;
}

/** The header of an information panel on the left: ◀ Back (when there is a previous panel), the title, ✕. */
export function PanelHeader({
  nav,
  title,
  titleTestId,
  closeTestId,
}: {
  readonly nav: PanelNav;
  readonly title: ReactNode;
  readonly titleTestId: string;
  readonly closeTestId: string;
}) {
  return (
    <>
      {nav.canGoBack && (
        <button
          type="button"
          className="panel-back"
          data-testid="panel-back"
          title={t('PANEL_BACK_HINT')}
          onClick={nav.onBack}
        >
          ◀ {t('PANEL_BACK')}
        </button>
      )}
      <div className="province-panel-header">
        <h2 className="province-panel-name" data-testid={titleTestId}>
          {title}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('PANEL_CLOSE')}
          title={t('PANEL_CLOSE_HINT')}
          data-testid={closeTestId}
          onClick={nav.onClose}
        >
          ×
        </button>
      </div>
    </>
  );
}
