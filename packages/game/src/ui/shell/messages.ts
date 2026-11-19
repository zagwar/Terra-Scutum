import {
  type CalendarDate,
  type MessageDelivery,
  type NotificationsConfig,
  type SimEvent,
  type WorldMap,
  countryNameKey,
  provinceNameKey,
} from '@terra-scutum/sim';
import { type TextParams, formatPopulation, tKey } from '../i18n';
import type { PanelTarget } from './panel-navigation';

/**
 * Messages (F122, section 12.1): what the game tells the player about sim
 * events, shown as a pop-up, a toast or only in the message log, as the
 * message settings say. The sim sends events with ids; this turns the ones
 * that have a message type into messages. Pure, so it can be unit tested.
 */
export interface GameMessage {
  /** Unique within a session, for React keys and dismissing. */
  readonly id: number;
  /** A message type id from `data/notifications.json` (or `demo` in the UI demo). */
  readonly typeId: string;
  readonly date: CalendarDate;
  readonly titleKey: string;
  readonly textKey: string;
  /** Names are filled in when the message is made, so it reads the same later. */
  readonly params: TextParams;
  /** What clicking the message shows, if anything. */
  readonly target: PanelTarget | null;
}

/** How the player wants a message type shown (see the settings). */
export interface MessageSetting {
  readonly delivery: MessageDelivery;
  /** Whether a pop-up of this type pauses the game. */
  readonly pauses: boolean;
}

let nextId = 1;
/** A fresh message id. */
export function newMessageId(): number {
  return nextId++;
}

/** The message for a sim event, or null if the event has no message type. */
export function messageFromEvent(
  event: SimEvent,
  world: WorldMap,
  date: CalendarDate,
  /** The country (index) the player leads: famines (F08) are only told for it. */
  playerCountry: number | null = null,
): GameMessage | null {
  switch (event.type) {
    case 'famineStarted':
    case 'famineEnded': {
      const country = world.countryIndex.get(event.country);
      if (country === undefined || country !== playerCountry) return null;
      const province = world.provinceIndex.get(event.province);
      const started = event.type === 'famineStarted';
      return {
        id: newMessageId(),
        typeId: started ? 'famine_started' : 'famine_ended',
        date,
        titleKey: started ? 'MESSAGE_FAMINE_STARTED_TITLE' : 'MESSAGE_FAMINE_ENDED_TITLE',
        textKey: started ? 'MESSAGE_FAMINE_STARTED' : 'MESSAGE_FAMINE_ENDED',
        params: {
          province: tKey(provinceNameKey(event.province)),
          deaths: event.type === 'famineEnded' ? formatPopulation(event.deaths) : '',
        },
        target: province === undefined ? null : { kind: 'province', index: province },
      };
    }
    case 'provinceOwnerChanged': {
      const province = world.provinceIndex.get(event.province);
      return {
        id: newMessageId(),
        typeId: 'province_owner_changed',
        date,
        titleKey: 'MESSAGE_PROVINCE_OWNER_CHANGED_TITLE',
        textKey: 'MESSAGE_PROVINCE_OWNER_CHANGED',
        params: {
          province: tKey(provinceNameKey(event.province)),
          from: tKey(countryNameKey(event.from)),
          to: tKey(countryNameKey(event.to)),
        },
        target: province === undefined ? null : { kind: 'province', index: province },
      };
    }
    default:
      return null;
  }
}

/** The default setting of every message type in the data. */
export function defaultMessageSettings(
  config: NotificationsConfig,
): Readonly<Record<string, MessageSetting>> {
  return Object.fromEntries(
    config.messageTypes.map((type) => [
      type.id,
      { delivery: type.defaultDelivery, pauses: type.pauses },
    ]),
  );
}

/** What happens to a message: where it is shown, and whether the game pauses. */
export interface Delivery {
  readonly log: boolean;
  readonly toast: boolean;
  readonly popup: boolean;
  readonly pause: boolean;
}

/** Decides how a message is shown from the player's setting for its type (unknown types: a toast). */
export function deliveryFor(setting: MessageSetting | undefined): Delivery {
  const delivery = setting?.delivery ?? 'toast';
  return {
    log: delivery !== 'off',
    toast: delivery === 'toast',
    popup: delivery === 'popup',
    pause: delivery === 'popup' && (setting?.pauses ?? false),
  };
}
