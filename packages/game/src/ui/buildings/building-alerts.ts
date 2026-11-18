import { buildingNameKey, goodNameKey, provinceNameKey } from '@terra-scutum/sim';
import type { AppState, AppStore } from '../../app-store';
import { formatPeopleShort, formatPercent, tKey } from '../i18n';
import { countryMarket } from '../markets/markets-view';
import type { ShellAlert } from '../shell/shell-types';
import { limitText } from './building-parts';
import { layingOffBuildings, stoppedBuildings } from './buildings-view';

/** The ids of the economy's alerts in the alerts row (alerts made elsewhere count up from 1). */
export const IDLE_BUILDINGS_ALERT_ID = 1_000_007;
export const LAYOFFS_ALERT_ID = 1_000_008;
export const SHORTAGE_ALERT_ID = 1_000_009;

/** The shortage alert shows once the pops went without at least this share of their goods last week [DEFAULT]. */
export const SHORTAGE_ALERT_AT_LEAST = 0.02;

/** One alert the economy keeps in step with the sim: what it says now, or null when there is nothing to say. */
interface EconomyAlert {
  readonly id: number;
  readonly compute: (state: ReadyState) => Omit<ShellAlert, 'id'> | null;
}

type ReadyState = AppState & {
  readonly buildings: NonNullable<AppState['buildings']>;
  readonly buildingTypes: NonNullable<AppState['buildingTypes']>;
  readonly goods: NonNullable<AppState['goods']>;
  readonly pops: NonNullable<AppState['pops']>;
  readonly provinceOwner: NonNullable<AppState['provinceOwner']>;
  readonly world: NonNullable<AppState['world']>;
  readonly playerCountry: number;
};

const ALERTS: readonly EconomyAlert[] = [
  {
    // F07: buildings of the player's country held back at half output or less.
    id: IDLE_BUILDINGS_ALERT_ID,
    compute(state) {
      const { count, worst } = stoppedBuildings(
        state.buildings,
        state.buildingTypes,
        state.provinceOwner,
        state.playerCountry,
      );
      if (!worst) return null;
      return {
        typeId: 'idle_factory',
        titleKey: 'ALERT_IDLE_BUILDINGS_TITLE',
        textKey: 'ALERT_IDLE_BUILDINGS_TEXT',
        params: {
          count,
          building: tKey(buildingNameKey(worst.definition.id)),
          province: tKey(provinceNameKey(state.world.provinceIds[worst.province])),
          output: formatPercent(worst.output, 0),
          reason: limitText(worst, state.pops, state.goods) ?? '',
        },
        target: { kind: 'province', index: worst.province },
      };
    },
  },
  {
    // F65: buildings laying workers off because they lose money at their lowest wage.
    id: LAYOFFS_ALERT_ID,
    compute(state) {
      const { count, jobsClosed, worst } = layingOffBuildings(
        state.buildings,
        state.buildingTypes,
        state.provinceOwner,
        state.playerCountry,
      );
      if (!worst) return null;
      return {
        typeId: 'layoffs',
        titleKey: 'ALERT_LAYOFFS_TITLE',
        textKey: 'ALERT_LAYOFFS_TEXT',
        params: {
          count,
          jobs: formatPeopleShort(jobsClosed),
          building: tKey(buildingNameKey(worst.definition.id)),
          province: tKey(provinceNameKey(state.world.provinceIds[worst.province])),
          open: formatPercent(worst.open, 0),
        },
        target: { kind: 'province', index: worst.province },
      };
    },
  },
  {
    // F65: the player's pops went without part of the goods they wanted last week.
    id: SHORTAGE_ALERT_ID,
    compute(state) {
      const market = state.market;
      if (!market) return null;
      const shortage = market.shortage[state.playerCountry] ?? 0;
      if (shortage < SHORTAGE_ALERT_AT_LEAST) return null;
      // The good the pops got least of today.
      const rows = countryMarket(market, state.buildings, state.goods, state.playerCountry, false)
        .filter((row) => row.popsBuy > 0)
        .sort((a, b) => a.popsGot - b.popsGot);
      const worst = rows[0];
      return {
        typeId: 'shortage',
        titleKey: 'ALERT_SHORTAGE_TITLE',
        textKey: 'ALERT_SHORTAGE_TEXT',
        params: {
          share: formatPercent(shortage),
          good: worst ? tKey(goodNameKey(worst.good)) : '',
          got: worst ? formatPercent(worst.popsGot, 0) : '',
        },
        target: { kind: 'country', index: state.playerCountry },
      };
    },
  },
];

/**
 * Keeps the economy's alerts (section 12.1) in step with the sim: the "idle
 * factory" alert (F07: buildings of the player's country held back at half
 * output or less), the layoffs alert and the shortage alert (F65). Each
 * names the worst case; a click shows its province or the country.
 * Dismissed (right-click), an alert stays away until its problem is over
 * and comes back with the next one.
 * Call `sync` whenever the app store changes: it only looks again when the
 * buildings, the markets, the owners, the player's country or the alerts
 * changed.
 */
export function createBuildingAlerts(store: AppStore): { readonly sync: () => void } {
  const memory = new Map(
    ALERTS.map((alert) => [alert.id, { shown: false, dismissed: false, last: '' }]),
  );
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
        state.market,
        provinceOwner,
        playerCountry,
        state.choosingCountry,
        state.alerts,
      ];
      if (looking.every((value, i) => value === seen[i])) return;
      seen = looking;
      const ready = state as ReadyState;

      let alerts = state.alerts;
      let changed = false;
      for (const spec of ALERTS) {
        const remembered = memory.get(spec.id)!;
        const others = alerts.filter((alert) => alert.id !== spec.id);
        const inRow = others.length !== alerts.length;
        // Shown before but gone from the row now: the player dismissed it.
        if (remembered.shown && !inRow) remembered.dismissed = true;
        const now = state.choosingCountry ? null : spec.compute(ready);
        if (!now || remembered.dismissed) {
          // The problem is over (the next one shows again), or the player doesn't want to see it.
          if (!now) remembered.dismissed = false;
          remembered.shown = false;
          remembered.last = '';
          if (inRow) {
            alerts = others;
            changed = true;
          }
          continue;
        }
        // Only touch the store when the alert's text or place changed.
        const key = JSON.stringify([now.params, now.target]);
        if (inRow && key === remembered.last) continue;
        remembered.shown = true;
        remembered.last = key;
        alerts = [...others, { id: spec.id, ...now }];
        changed = true;
      }
      if (!changed) return;
      // Changing the alerts calls `sync` again (the store tells its listeners):
      // remember the new list first, so that call finds nothing to do.
      seen = [...looking.slice(0, 5), alerts];
      store.update({ alerts });
    },
  };
}
