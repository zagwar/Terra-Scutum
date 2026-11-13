import { z } from 'zod';
import type { DataCrossCheck } from './game-data';

/**
 * `data/notifications.json`: the message types and alert types of the UI
 * shell (F122, section 12.1). Used by the game, not by the sim's systems.
 * Every value is a [DEFAULT] the designer can change in the data file; the
 * player can change how each message type is shown, and turn each alert type
 * off, in the game's settings.
 */
const id = z
  .string()
  .regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, 'ids are lowercase letters, digits and single underscores');

/** How a message is shown: a pop-up window, a small toast, only in the message log, or not at all. */
export const MESSAGE_DELIVERIES = ['popup', 'toast', 'log', 'off'] as const;
export type MessageDelivery = (typeof MESSAGE_DELIVERIES)[number];

/** A problem (something is wrong) or an opportunity (something can be done). */
export const ALERT_KINDS = ['problem', 'opportunity'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** A feature id from the feature tracker, for example "F75". */
const featureId = z.string().regex(/^F\d+$/, 'a feature id from the feature tracker, like F75');

export const notificationsSchema = z.strictObject({
  messageTypes: z.array(
    z.strictObject({
      id,
      /** How the message is shown until the player changes it in the settings. */
      defaultDelivery: z.enum(MESSAGE_DELIVERIES),
      /** Whether a pop-up of this type pauses the game (until the player changes it). */
      pauses: z.boolean(),
    }),
  ),
  alertTypes: z.array(
    z.strictObject({
      id,
      kind: z.enum(ALERT_KINDS),
      /** The feature that raises this alert; the settings say "comes with …" until it is built. */
      feature: featureId,
    }),
  ),
});

export type NotificationsConfig = z.infer<typeof notificationsSchema>;
export type MessageTypeData = NotificationsConfig['messageTypes'][number];
export type AlertTypeData = NotificationsConfig['alertTypes'][number];

/** Translation key of a message type's name in the settings, for example `MESSAGE_TYPE_PROVINCE_OWNER_CHANGED`. */
export const messageTypeNameKey = (messageTypeId: string) =>
  `MESSAGE_TYPE_${messageTypeId.toUpperCase()}`;

/** Translation key of an alert type's name, for example `ALERT_TYPE_BLACKOUT`. */
export const alertTypeNameKey = (alertTypeId: string) => `ALERT_TYPE_${alertTypeId.toUpperCase()}`;

/** Every message type and every alert type id appears once. */
export const checkNotifications: DataCrossCheck = (data, report) => {
  const lists = [
    ['messageTypes', data.notifications.messageTypes],
    ['alertTypes', data.notifications.alertTypes],
  ] as const;
  for (const [listName, list] of lists) {
    const seen = new Map<string, number>();
    list.forEach((item, index) => {
      const first = seen.get(item.id);
      if (first === undefined) seen.set(item.id, index);
      else
        report({
          file: 'notifications.json',
          path: `${listName}.${index}.id`,
          message: `duplicate id "${item.id}" (also at ${listName}.${first})`,
        });
    });
  }
};

/** The player's country (until the country selection, F05) is a country in `countries.json`. */
export const checkPlayerCountry: DataCrossCheck = (data, report) => {
  const id = data.gameConfig.playerCountry;
  if (!data.countries.countries.some((country) => country.id === id))
    report({
      file: 'game_config.json',
      path: 'playerCountry',
      message: `"${id}" is not a country in countries.json`,
    });
};
