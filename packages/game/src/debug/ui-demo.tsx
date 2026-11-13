import { type WorldMap, neighborsOf } from '@terra-scutum/sim';
import type { AppStore } from '../app-store';
import { t } from '../ui/i18n';
import { type GameMessage, newMessageId } from '../ui/shell/messages';
import type { ShellActions } from '../ui/shell/shell-actions';
import type { OutlinerEntry, ShellAlert } from '../ui/shell/shell-types';
import type { SimClient } from '../worker/sim-client';

/**
 * The UI demo (`?debug=ui-demo`, F122): almost everything in the UI shell is
 * empty until its feature is built, so this fills it with clearly marked
 * sample content (alerts, outliner entries, a toast and a pop-up) and adds a
 * few buttons, so the designer can try how each part behaves on the preview
 * link. Never part of a normal game.
 */
export function startUiDemo(store: AppStore, actions: ShellActions): void {
  const { world, snapshot } = store.getState();
  if (!world || !snapshot) return;
  const capital = (countryId: string) => {
    const country = world.countryIndex.get(countryId);
    return country === undefined
      ? null
      : ({ kind: 'province', index: world.countryCapital[country] } as const);
  };
  const ALERTS: readonly [string, string][] = [
    ['units_out_of_supply', 'UKR'],
    ['blackout', 'DEU'],
    ['shortage', 'IND'],
    ['bankrupt_corporation', 'USA'],
    ['angry_interest_group', 'BRA'],
    ['idle_factory', 'CHN'],
    ['law_can_be_passed', 'USA'],
    ['un_emergency_session', 'CHE'],
  ];
  const alerts: ShellAlert[] = ALERTS.map(([typeId, country]) => ({
    id: newMessageId(),
    typeId,
    titleKey: `ALERT_TYPE_${typeId.toUpperCase()}`,
    textKey: 'DEMO_ALERT_TEXT',
    params: {},
    target: capital(country),
  }));
  const entry = (
    section: OutlinerEntry['section'],
    labelKey: string,
    country: string,
  ): OutlinerEntry => ({
    id: newMessageId(),
    section,
    labelKey,
    params: {},
    target: capital(country),
  });
  const outliner: OutlinerEntry[] = [
    entry('armies', 'DEMO_OUTLINER_ARMY', 'USA'),
    entry('armies', 'DEMO_OUTLINER_ARMY_2', 'USA'),
    entry('construction', 'DEMO_OUTLINER_CONSTRUCTION', 'USA'),
    entry('research', 'DEMO_OUTLINER_RESEARCH', 'USA'),
  ];
  store.update({ alerts, outliner });
  actions.deliverMessage(sampleMessage(store, 'toast'));
}

/** A sample message, sent straight to the toasts or the pop-ups (it has no message type). */
function sampleMessage(store: AppStore, kind: 'toast' | 'popup'): GameMessage {
  const { world, snapshot, playerCountry } = store.getState();
  return {
    id: newMessageId(),
    typeId: kind === 'toast' ? 'demo_toast' : 'demo_popup',
    date: snapshot!.date,
    titleKey: kind === 'toast' ? 'DEMO_TOAST_TITLE' : 'DEMO_POPUP_TITLE',
    textKey: kind === 'toast' ? 'DEMO_TOAST_TEXT' : 'DEMO_POPUP_TEXT',
    params: {},
    target:
      world && playerCountry !== null
        ? { kind: 'province', index: world.countryCapital[playerCountry] }
        : null,
  };
}

/** A province that borders a province of another country, chosen at random, and that country. */
function randomBorderChange(world: WorldMap, owners: Uint16Array) {
  for (let tries = 0; tries < 1000; tries++) {
    const province = Math.floor(Math.random() * world.provinceIds.length);
    const neighbors = neighborsOf(world.provinceNeighbors, province);
    for (const neighbor of neighbors) {
      if (owners[neighbor] !== owners[province])
        return {
          province: world.provinceIds[province],
          country: world.countryIds[owners[neighbor]],
        };
    }
  }
  return null;
}

/** The demo's buttons, bottom-center. */
export function DemoControls({
  store,
  actions,
  sim,
}: {
  readonly store: AppStore;
  readonly actions: ShellActions;
  readonly sim: SimClient;
}) {
  return (
    <section className="panel demo-controls" data-testid="demo-controls">
      <h2 className="panel-title">{t('DEMO_TITLE')}</h2>
      <div className="button-row">
        <button
          type="button"
          className="button"
          data-testid="demo-owner-change"
          title={t('DEMO_OWNER_CHANGE_HINT')}
          onClick={() => {
            const { world, provinceOwner } = store.getState();
            const change = world && provinceOwner && randomBorderChange(world, provinceOwner);
            if (change) void sim.sendCommand({ type: 'debugSetProvinceOwner', ...change });
          }}
        >
          {t('DEMO_OWNER_CHANGE')}
        </button>
        <button
          type="button"
          className="button"
          data-testid="demo-toast"
          onClick={() => actions.deliverMessage(sampleMessage(store, 'toast'))}
        >
          {t('DEMO_SHOW_TOAST')}
        </button>
        <button
          type="button"
          className="button"
          data-testid="demo-popup"
          onClick={() => {
            const message = sampleMessage(store, 'popup');
            store.update({
              popups: [...store.getState().popups, message],
              messageLog: [...store.getState().messageLog, message],
            });
          }}
        >
          {t('DEMO_SHOW_POPUP')}
        </button>
      </div>
    </section>
  );
}
