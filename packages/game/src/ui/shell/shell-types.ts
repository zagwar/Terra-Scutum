import type { TextParams } from '../i18n';
import type { OutlinerSectionId } from './catalog';
import type { PanelTarget } from './panel-navigation';

/** An alert in the alerts row (section 12.1): a problem or an opportunity. */
export interface ShellAlert {
  readonly id: number;
  /** An alert type id from `data/notifications.json`. */
  readonly typeId: string;
  readonly titleKey: string;
  readonly textKey: string;
  readonly params: TextParams;
  /** What clicking the alert shows, if anything. */
  readonly target: PanelTarget | null;
}

/** One line in the outliner (an army, a construction project…). */
export interface OutlinerEntry {
  readonly id: number;
  readonly section: OutlinerSectionId;
  readonly labelKey: string;
  readonly params: TextParams;
  /** What clicking the entry selects (and moves the camera to). */
  readonly target: PanelTarget | null;
}
