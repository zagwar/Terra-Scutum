import { describe, expect, it } from 'vitest';
import { createAppStore } from '../src/app-store';
import {
  LENS_IDS,
  LENS_SCREENS,
  OUTLINER_SECTIONS,
  SCREENS,
  TOP_BAR_ITEMS,
  TOP_BAR_ITEM_IDS,
  lensNameKey,
  outlinerSectionKey,
  screenNameKey,
  topBarHintKey,
  topBarNameKey,
} from '../src/ui/shell/catalog';
import { tKey } from '../src/ui/i18n';
import { defaultMessageSettings, deliveryFor } from '../src/ui/shell/messages';
import {
  type PanelState,
  backPanel,
  closePanel,
  openPanel,
} from '../src/ui/shell/panel-navigation';
import { createShellActions } from '../src/ui/shell/shell-actions';
import { EMPTY_UI_SETTINGS, parseUiSettings } from '../src/ui/shell/ui-settings';

const empty: PanelState = closePanel();

describe('the information panel (one at a time, with Back)', () => {
  it('a link remembers the panel it came from; Back returns to it', () => {
    const province = openPanel(empty, { kind: 'province', index: 3 }, false);
    expect(province).toMatchObject({
      selectedProvince: 3,
      selectedSeaZone: null,
      panelHistory: [],
    });
    const country = openPanel(province, { kind: 'country', index: 1 }, true);
    expect(country.panel).toEqual({ kind: 'country', index: 1 });
    expect(country.panelHistory).toEqual([{ kind: 'province', index: 3 }]);
    // A country panel keeps the province it came from highlighted.
    expect(country.selectedProvince).toBe(3);
    const back = backPanel(country);
    expect(back.panel).toEqual({ kind: 'province', index: 3 });
    expect(back.panelHistory).toEqual([]);
    expect(backPanel(back)).toBe(back);
  });

  it('a click on the map starts afresh; a sea zone clears the province highlight', () => {
    const chain = openPanel(
      openPanel(empty, { kind: 'province', index: 3 }, false),
      { kind: 'region', index: 0 },
      true,
    );
    const fresh = openPanel(chain, { kind: 'seaZone', index: 7 }, false);
    expect(fresh).toEqual({
      panel: { kind: 'seaZone', index: 7 },
      panelHistory: [],
      selectedProvince: null,
      selectedSeaZone: 7,
    });
    // Opening the panel that is already shown changes nothing.
    expect(openPanel(fresh, { kind: 'seaZone', index: 7 }, true)).toBe(fresh);
  });
});

describe('messages', () => {
  it('turns a message setting into where the message goes', () => {
    expect(deliveryFor({ delivery: 'popup', pauses: true })).toEqual({
      log: true,
      toast: false,
      popup: true,
      pause: true,
    });
    expect(deliveryFor({ delivery: 'toast', pauses: true })).toMatchObject({
      toast: true,
      pause: false,
    });
    expect(deliveryFor({ delivery: 'log', pauses: false })).toEqual({
      log: true,
      toast: false,
      popup: false,
      pause: false,
    });
    expect(deliveryFor({ delivery: 'off', pauses: false }).log).toBe(false);
    expect(deliveryFor(undefined).toast).toBe(true);
  });

  it('delivers by the player setting, and a pop-up that pauses pauses the game', () => {
    const store = createAppStore({
      notifications: {
        messageTypes: [{ id: 'province_owner_changed', defaultDelivery: 'toast', pauses: false }],
        alertTypes: [],
      },
    });
    const changes: unknown[] = [];
    const actions = createShellActions({
      store,
      focusProvince: () => {},
      focusSeaZone: () => {},
      changeTime: (change) => changes.push(change),
    });
    const message = (id: number) => ({
      id,
      typeId: 'province_owner_changed',
      date: { year: 2025, month: 1, day: 1 },
      titleKey: 'T',
      textKey: 'X',
      params: {},
      target: null,
    });
    actions.deliverMessage(message(1));
    expect(store.getState().toasts.map((m) => m.id)).toEqual([1]);
    actions.setMessageDelivery('province_owner_changed', 'popup');
    actions.setMessagePauses('province_owner_changed', true);
    actions.deliverMessage(message(2));
    expect(store.getState().popups.map((m) => m.id)).toEqual([2]);
    expect(changes).toEqual([{ kind: 'setPaused', paused: true }]);
    actions.setMessageDelivery('province_owner_changed', 'off');
    actions.deliverMessage(message(3));
    expect(store.getState().messageLog.map((m) => m.id)).toEqual([1, 2]);
  });

  it('reads the default settings from the data', () => {
    expect(
      defaultMessageSettings({
        messageTypes: [{ id: 'a', defaultDelivery: 'log', pauses: true }],
        alertTypes: [],
      }),
    ).toEqual({ a: { delivery: 'log', pauses: true } });
  });
});

describe('the saved interface settings', () => {
  it('reads what was saved and ignores what looks wrong', () => {
    expect(parseUiSettings(null)).toBe(EMPTY_UI_SETTINGS);
    expect(parseUiSettings('not json')).toBe(EMPTY_UI_SETTINGS);
    expect(
      parseUiSettings(
        JSON.stringify({
          messages: { a: { delivery: 'popup', pauses: true }, b: { delivery: 'shout' } },
          alertsOff: ['blackout', 3],
        }),
      ),
    ).toEqual({ messages: { a: { delivery: 'popup', pauses: true } }, alertsOff: ['blackout'] });
  });
});

describe('the shell catalog', () => {
  it('has a text for every lens, screen, top bar item and outliner section', () => {
    const missing = (key: string) => tKey(key) === key;
    for (const lens of LENS_IDS) expect(missing(lensNameKey(lens)), lens).toBe(false);
    for (const screen of Object.keys(SCREENS) as (keyof typeof SCREENS)[])
      expect(missing(screenNameKey(screen)), screen).toBe(false);
    for (const item of TOP_BAR_ITEM_IDS) {
      expect(missing(topBarNameKey(item)), item).toBe(false);
      expect(missing(topBarHintKey(item)), item).toBe(false);
    }
    for (const section of OUTLINER_SECTIONS)
      expect(missing(outlinerSectionKey(section)), section).toBe(false);
  });

  it('lists every lens screen once, and every top bar item opens a known screen', () => {
    const listed = LENS_IDS.flatMap((lens) => LENS_SCREENS[lens]);
    expect(new Set(listed).size).toBe(listed.length);
    for (const lens of LENS_IDS)
      for (const screen of LENS_SCREENS[lens]) expect(SCREENS[screen].lens).toBe(lens);
    for (const item of TOP_BAR_ITEM_IDS) expect(SCREENS[TOP_BAR_ITEMS[item].screen]).toBeDefined();
  });
});
