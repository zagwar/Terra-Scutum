import type {
  BudgetSettingId,
  CommandResult,
  MessageDelivery,
  SimCommand,
} from '@terra-scutum/sim';
import { type AppStore, MESSAGE_LOG_LIMIT } from '../../app-store';
import type { MapTarget } from '../../render/map/shape-lookup';
import type { TimeChange } from '../../worker/protocol';
import { LENS_MAP_MODE, type LensId, type ShellWindow } from './catalog';
import { type GameMessage, defaultMessageSettings, deliveryFor } from './messages';
import { type PanelTarget, backPanel, closePanel, openPanel } from './panel-navigation';
import { type UiSettings, saveUiSettings } from './ui-settings';

/** How long a toast stays on screen, in seconds [DEFAULT]. */
export const TOAST_SECONDS = 8;
/** At most this many toasts at once; older ones make room [DEFAULT]. */
export const TOAST_LIMIT = 4;

export interface ShellDeps {
  readonly store: AppStore;
  /** Brings a province or sea zone into view (does nothing before the map has loaded). */
  readonly focusProvince: (province: number) => void;
  readonly focusSeaZone: (seaZone: number) => void;
  /** Brings a country into view (F05). */
  readonly focusCountry: (country: number) => void;
  readonly changeTime: (change: TimeChange) => void;
  /** Sends a command to the sim; resolves with whether it was accepted. */
  readonly sendCommand: (command: SimCommand) => Promise<CommandResult>;
}

/**
 * Everything the UI shell does (F122), in one place: the information panel
 * on the left, the windows over the map, the lens bar, alerts, messages and
 * the player's settings. React components call these; they only change the
 * app store (and tell the map to move).
 */
export interface ShellActions {
  /** A click on the map: a province or sea zone (in the Regions map mode: its region), or nothing. */
  readonly mapClick: (target: MapTarget | null) => void;
  /** Opens a panel from a link in the panel shown now (◀ Back returns); brings a province or sea zone into view. */
  readonly followLink: (target: PanelTarget) => void;
  /** Opens a panel afresh and brings it into view (from the top bar, an alert, the outliner, a message). */
  readonly show: (target: PanelTarget) => void;
  readonly back: () => void;
  readonly closePanel: () => void;
  readonly openWindow: (window: ShellWindow) => void;
  readonly closeWindow: () => void;
  /** Opens a lens's screen list, or closes it if it is open. */
  readonly toggleLens: (lens: LensId) => void;
  readonly closeLens: () => void;
  readonly deliverMessage: (message: GameMessage) => void;
  readonly dismissToast: (id: number) => void;
  /** Closes the pop-up on screen (the next one waiting, if any, appears). */
  readonly closePopup: () => void;
  readonly dismissAlert: (id: number) => void;
  readonly setMessageDelivery: (typeId: string, delivery: MessageDelivery) => void;
  readonly setMessagePauses: (typeId: string, pauses: boolean) => void;
  readonly setAlertOn: (typeId: string, on: boolean) => void;
  /**
   * Country selection (F05): shows a country in the selection panel and
   * tints it on the map; picked from a list (not the map), it is brought into view.
   */
  readonly pickCandidate: (country: number) => void;
  /** Country selection (F05): plays as this country; the game starts, paused. Resolves with the sim's answer. */
  readonly playAs: (country: number) => Promise<CommandResult>;
  /**
   * Test tools (F07, until construction exists, F12): sets the level of a
   * province's building of one type (by id), and tops a country's national
   * stockpile up to so many days of what its buildings use.
   */
  readonly testSetBuildingLevel: (
    province: number,
    buildingId: string,
    level: number,
  ) => Promise<CommandResult>;
  readonly testFillStockpile: (country: number, days: number) => Promise<CommandResult>;
  /** Test tool (F19, until diplomacy, M6): starts or lifts an embargo between two countries. */
  readonly testSetEmbargo: (country: number, target: number, on: boolean) => Promise<CommandResult>;
  /** F08: the player's rationing: a level (by id) or `null` for automatic. */
  readonly setRationing: (level: string | null) => Promise<CommandResult>;
  /**
   * Test tool (F08): a food crisis in the player's country, to see hunger
   * and famine come: every building that makes food closes, the food
   * reserves are emptied and every other country stops trading with it.
   */
  readonly testFoodCrisis: () => Promise<CommandResult>;
  /** F09: the player sets one of their budget levels (the tax level or a spending line's funding). */
  readonly setBudgetLevel: (setting: string, level: string) => Promise<CommandResult>;
  /** F09: the player prints money (a level of `data/budget.json` → `inflation.printing`). */
  readonly setMoneyPrinting: (level: string) => Promise<CommandResult>;
  /** F09: the player lets their budget run itself, or sets it themselves. */
  readonly setAutomaticBudget: (on: boolean) => Promise<CommandResult>;
  /** Test tool (F09): the player's country at the edge of a default (debt at the credit limit, an empty treasury). */
  readonly testBudgetCrisis: () => Promise<CommandResult>;
}

export function createShellActions({
  store,
  focusProvince,
  focusSeaZone,
  focusCountry,
  changeTime,
  sendCommand,
}: ShellDeps): ShellActions {
  const state = () => store.getState();

  const focus = (target: PanelTarget) => {
    if (target.kind === 'province') focusProvince(target.index);
    else if (target.kind === 'seaZone') focusSeaZone(target.index);
  };

  const updateSettings = (change: (settings: UiSettings) => UiSettings) => {
    const uiSettings = change(state().uiSettings);
    store.update({ uiSettings });
    saveUiSettings(uiSettings);
  };

  /** The player's setting for a message type (the data's default unless changed). */
  const messageSetting = (typeId: string) => {
    const { uiSettings, notifications } = state();
    return (
      uiSettings.messages[typeId] ??
      (notifications ? defaultMessageSettings(notifications)[typeId] : undefined)
    );
  };

  const actions: ShellActions = {
    mapClick(target) {
      const current = state();
      // Choosing a country (F05): a click on land picks the country that owns it.
      if (current.choosingCountry) {
        if (target?.kind === 'province' && current.provinceOwner)
          store.update({ candidateCountry: current.provinceOwner[target.index] });
        return;
      }
      if (!target) {
        store.update(closePanel());
        return;
      }
      const { world, mapMode } = state();
      // In the Regions map mode a click on land shows the region (designer decision, F122).
      if (target.kind === 'province' && mapMode === 'regions' && world) {
        store.update(
          openPanel(state(), { kind: 'region', index: world.provinceRegion[target.index] }, false),
        );
        return;
      }
      store.update(openPanel(state(), target, false));
    },
    followLink(target) {
      store.update(openPanel(state(), target, true));
      focus(target);
    },
    show(target) {
      store.update(openPanel(state(), target, false));
      focus(target);
    },
    back() {
      // Back doesn't move the camera: the player was just looking at that place.
      store.update(backPanel(state()));
    },
    closePanel() {
      store.update(closePanel());
    },
    openWindow(window) {
      store.update({ openWindow: window, openLens: null });
    },
    closeWindow() {
      store.update({ openWindow: null });
    },
    toggleLens(lens) {
      const open = state().openLens === lens ? null : lens;
      const mapMode = open ? LENS_MAP_MODE[open] : null;
      store.update(mapMode ? { openLens: open, mapMode } : { openLens: open });
    },
    closeLens() {
      store.update({ openLens: null });
    },
    deliverMessage(message) {
      const delivery = deliveryFor(messageSetting(message.typeId));
      if (!delivery.log) return;
      const current = state();
      store.update({
        messageLog: [...current.messageLog, message].slice(-MESSAGE_LOG_LIMIT),
        ...(delivery.toast ? { toasts: [...current.toasts, message].slice(-TOAST_LIMIT) } : {}),
        ...(delivery.popup ? { popups: [...current.popups, message] } : {}),
      });
      if (delivery.toast) setTimeout(() => actions.dismissToast(message.id), TOAST_SECONDS * 1000);
      if (delivery.pause) changeTime({ kind: 'setPaused', paused: true });
    },
    dismissToast(id) {
      const { toasts } = state();
      if (toasts.some((toast) => toast.id === id))
        store.update({ toasts: toasts.filter((toast) => toast.id !== id) });
    },
    closePopup() {
      store.update({ popups: state().popups.slice(1) });
    },
    dismissAlert(id) {
      store.update({ alerts: state().alerts.filter((alert) => alert.id !== id) });
    },
    setMessageDelivery(typeId, delivery) {
      const pauses = messageSetting(typeId)?.pauses ?? false;
      updateSettings((s) => ({
        ...s,
        messages: { ...s.messages, [typeId]: { delivery, pauses } },
      }));
    },
    setMessagePauses(typeId, pauses) {
      const delivery = messageSetting(typeId)?.delivery ?? 'toast';
      updateSettings((s) => ({
        ...s,
        messages: { ...s.messages, [typeId]: { delivery, pauses } },
      }));
    },
    setAlertOn(typeId, on) {
      updateSettings((s) => ({
        ...s,
        alertsOff: on
          ? s.alertsOff.filter((id) => id !== typeId)
          : [...s.alertsOff.filter((id) => id !== typeId), typeId],
      }));
    },
    pickCandidate(country) {
      store.update({ candidateCountry: country });
      focusCountry(country);
    },
    async testSetBuildingLevel(province, buildingId, level) {
      const world = state().world;
      if (!world) return { ok: false, reasonKey: 'COMMAND_INVALID' };
      return sendCommand({
        type: 'debugSetBuildingLevel',
        province: world.provinceIds[province],
        building: buildingId,
        level,
      });
    },
    async testFillStockpile(country, days) {
      const world = state().world;
      if (!world) return { ok: false, reasonKey: 'COMMAND_INVALID' };
      return sendCommand({ type: 'debugFillStockpile', country: world.countryIds[country], days });
    },
    async setBudgetLevel(setting, level) {
      const { world, playerCountry } = state();
      if (!world || playerCountry === null) return { ok: false, reasonKey: 'COMMAND_INVALID' };
      return sendCommand({
        type: 'setBudgetLevel',
        country: world.countryIds[playerCountry],
        setting: setting as BudgetSettingId,
        level,
      });
    },
    async setMoneyPrinting(level) {
      const { world, playerCountry } = state();
      if (!world || playerCountry === null) return { ok: false, reasonKey: 'COMMAND_INVALID' };
      return sendCommand({
        type: 'setMoneyPrinting',
        country: world.countryIds[playerCountry],
        level,
      });
    },
    async setAutomaticBudget(on) {
      const { world, playerCountry } = state();
      if (!world || playerCountry === null) return { ok: false, reasonKey: 'COMMAND_INVALID' };
      return sendCommand({
        type: 'setAutomaticBudget',
        country: world.countryIds[playerCountry],
        on,
      });
    },
    async testBudgetCrisis() {
      const { world, playerCountry } = state();
      if (!world || playerCountry === null) return { ok: false, reasonKey: 'COMMAND_INVALID' };
      return sendCommand({ type: 'debugBudgetCrisis', country: world.countryIds[playerCountry] });
    },
    async setRationing(level) {
      const { world, playerCountry } = state();
      if (!world || playerCountry === null) return { ok: false, reasonKey: 'COMMAND_INVALID' };
      return sendCommand({ type: 'setRationing', country: world.countryIds[playerCountry], level });
    },
    async testFoodCrisis() {
      const { world, playerCountry, food, goods, buildings, buildingTypes, provinceOwner } =
        state();
      if (
        !world ||
        playerCountry === null ||
        !food ||
        !goods ||
        !buildings ||
        !buildingTypes ||
        !provinceOwner
      )
        return { ok: false, reasonKey: 'COMMAND_INVALID' };
      const country = world.countryIds[playerCountry];
      const foodIds = new Set(Array.from(food.foodGoods, (g) => goods.goods[g].id));
      const makesFood = buildingTypes.buildings.map((type) =>
        type.methods.some((method) => Object.keys(method.outputs).some((id) => foodIds.has(id))),
      );
      const commands: SimCommand[] = [];
      buildings.cells.forEach((cell, i) => {
        const province = Math.floor(cell / buildings.typeCount);
        const type = cell - province * buildings.typeCount;
        if (provinceOwner[province] !== playerCountry || !makesFood[type]) return;
        if (buildings.level[i] === 0) return;
        commands.push({
          type: 'debugSetBuildingLevel',
          province: world.provinceIds[province],
          building: buildingTypes.buildings[type].id,
          level: 0,
        });
      });
      for (const id of foodIds)
        commands.push({ type: 'debugSetStockpile', country, good: id, amount: 0 });
      for (const target of world.countryIds)
        if (target !== country)
          commands.push({ type: 'debugSetEmbargo', country, target, on: true });
      // Sent all at once, in order: the sim worker applies them before anything sent later.
      const answers = await Promise.all(commands.map((command) => sendCommand(command)));
      return answers.find((answer) => !answer.ok) ?? { ok: true };
    },
    async testSetEmbargo(country, target, on) {
      const world = state().world;
      if (!world) return { ok: false, reasonKey: 'COMMAND_INVALID' };
      return sendCommand({
        type: 'debugSetEmbargo',
        country: world.countryIds[country],
        target: world.countryIds[target],
        on,
      });
    },
    async playAs(country) {
      const { world } = state();
      if (!world) return { ok: false, reasonKey: 'COMMAND_INVALID' };
      const result = await sendCommand({
        type: 'choosePlayerCountry',
        country: world.countryIds[country],
      });
      if (result.ok) {
        store.update({
          choosingCountry: false,
          candidateCountry: null,
          playerCountry: country,
          ...closePanel(),
        });
        // The game starts looking at the player's country.
        focusCountry(country);
      }
      return result;
    },
  };
  return actions;
}
