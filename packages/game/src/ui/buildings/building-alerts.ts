import { buildingNameKey, provinceNameKey } from '@terra-scutum/sim';
import type { AppStore } from '../../app-store';
import { formatPercent, tKey } from '../i18n';
import type { ShellAlert } from '../shell/shell-types';
import { limitText } from './building-parts';
import { stoppedBuildings } from './buildings-view';

/** The id of the one "idle factory" alert in the alerts row (alerts made elsewhere count up from 1). */
export const IDLE_BUILDINGS_ALERT_ID = 1_000_007;

/**
 * Keeps the "idle factory" alert (F07, section 12.1) in step with the
 * buildings: one alert while buildings of the player's country are held back
 * at half output or less, naming the worst one; a click shows its province.
 * Dismissed (right-click), it stays away until the problem is over and
 * comes back with the next one.
 * Call `sync` whenever the app store changes: it only looks again when the
 * buildings, the owners, the player's country or the alerts changed.
 */
export function createBuildingAlerts(store: AppStore): { readonly sync: () => void } {
  let shown = false;
  let dismissed = false;
  let last = '';
  // What the last check looked at: nothing is redone while these are the same.
  let seen: readonly unknown[] = [];
  return {
    sync() {
      const state = store.getState();
      const { buildings, buildingTypes, goods, pops, provinceOwner, world, playerCountry } = state;
      if (!buildings || !buildingTypes || !goods || !pops || !provinceOwner || !world) return;
      if (playerCountry === null) return;
      const looking = [
        buildings,
        provinceOwner,
        playerCountry,
        state.choosingCountry,
        state.alerts,
      ];
      if (looking.every((value, i) => value === seen[i])) return;
      seen = looking;
      // Changing the alerts calls `sync` again (the store tells its listeners):
      // remember the new list first, so that call finds nothing to do.
      const setAlerts = (alerts: readonly ShellAlert[]) => {
        seen = [...looking.slice(0, 4), alerts];
        store.update({ alerts });
      };

      const others = state.alerts.filter((alert) => alert.id !== IDLE_BUILDINGS_ALERT_ID);
      const inRow = others.length !== state.alerts.length;
      // Shown before but gone from the row now: the player dismissed it.
      if (shown && !inRow) dismissed = true;
      const { count, worst } = state.choosingCountry
        ? { count: 0, worst: null }
        : stoppedBuildings(buildings, buildingTypes, provinceOwner, playerCountry);
      if (!worst || dismissed) {
        // The problem is over (the next one shows again), or the player doesn't want to see it.
        if (!worst) dismissed = false;
        shown = false;
        last = '';
        if (inRow) setAlerts(others);
        return;
      }
      const alert: ShellAlert = {
        id: IDLE_BUILDINGS_ALERT_ID,
        typeId: 'idle_factory',
        titleKey: 'ALERT_IDLE_BUILDINGS_TITLE',
        textKey: 'ALERT_IDLE_BUILDINGS_TEXT',
        params: {
          count,
          building: tKey(buildingNameKey(worst.definition.id)),
          province: tKey(provinceNameKey(world.provinceIds[worst.province])),
          output: formatPercent(worst.output, 0),
          reason: limitText(worst, pops, goods) ?? '',
        },
        target: { kind: 'province', index: worst.province },
      };
      // Only touch the store when the alert's text or place changed.
      const key = JSON.stringify([alert.params, worst.province]);
      if (inRow && key === last) return;
      shown = true;
      last = key;
      setAlerts([...others, alert]);
    },
  };
}
