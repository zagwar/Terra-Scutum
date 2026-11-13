import type { MessageDelivery } from '@terra-scutum/sim';
import { MESSAGE_DELIVERIES } from '@terra-scutum/sim';
import type { MessageSetting } from './messages';

/**
 * The player's interface settings (F122): how each message type is shown and
 * which alert types are on. They belong to the player, not to the campaign,
 * so they are kept in the browser (localStorage), not in the save. When the
 * browser refuses storage (a private window, blocked site data) the game
 * still works, it just doesn't remember the settings.
 */
export interface UiSettings {
  /** Changes from the data's defaults, by message type id. */
  readonly messages: Readonly<Record<string, MessageSetting>>;
  /** Alert types the player turned off (by id). */
  readonly alertsOff: readonly string[];
}

export const EMPTY_UI_SETTINGS: UiSettings = { messages: {}, alertsOff: [] };

const STORAGE_KEY = 'terra-scutum.ui-settings.v1';

const isDelivery = (value: unknown): value is MessageDelivery =>
  typeof value === 'string' && (MESSAGE_DELIVERIES as readonly string[]).includes(value);

/** Reads settings saved earlier, ignoring anything that doesn't look right. */
export function parseUiSettings(text: string | null): UiSettings {
  if (!text) return EMPTY_UI_SETTINGS;
  try {
    const raw = JSON.parse(text) as { messages?: unknown; alertsOff?: unknown };
    const messages: Record<string, MessageSetting> = {};
    if (raw.messages && typeof raw.messages === 'object') {
      for (const [id, value] of Object.entries(raw.messages as Record<string, unknown>)) {
        const setting = value as { delivery?: unknown; pauses?: unknown } | null;
        if (setting && isDelivery(setting.delivery))
          messages[id] = { delivery: setting.delivery, pauses: setting.pauses === true };
      }
    }
    const alertsOff = Array.isArray(raw.alertsOff)
      ? raw.alertsOff.filter((id): id is string => typeof id === 'string')
      : [];
    return { messages, alertsOff };
  } catch {
    return EMPTY_UI_SETTINGS;
  }
}

export function loadUiSettings(): UiSettings {
  try {
    return parseUiSettings(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY_UI_SETTINGS;
  }
}

export function saveUiSettings(settings: UiSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage refused: the settings last until the page is closed.
  }
}
