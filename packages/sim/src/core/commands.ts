import type { GameState } from './game-state';
import type { TextParams } from './sim-error';
import { fillStockpile, setBuildingLevel } from '../economy/buildings';
import { resplitTrade, setEmbargo, setTradeAgreement } from '../economy/trade';
import { setRationing } from '../economy/food';

/**
 * Sim commands: the ONLY way anything outside the sim changes sim state.
 * The player's UI and the country AI use the same commands. Commands are
 * applied between ticks, in the order they arrive.
 *
 * Later features add theirs here (build, pass law, move army…); commands a
 * country gives will carry that country's id.
 */
export type SimCommand =
  /** Diagnostic: the sim answers with a `debugPong` event carrying the same token. Changes nothing. */
  | { readonly type: 'debugPing'; readonly token: number }
  /**
   * Diagnostic: hands a province to a country (both by id), as a war or a collapse will later.
   * Used by tests to check that the map and the panels follow ownership.
   */
  | { readonly type: 'debugSetProvinceOwner'; readonly province: string; readonly country: string }
  /**
   * The player chooses the country they lead (F05, by id). Only before the
   * first day is simulated: afterwards the choice is locked.
   */
  | { readonly type: 'choosePlayerCountry'; readonly country: string }
  /**
   * Diagnostic (F06): multiplies the jobs open to one pop group (by id), or
   * to every group (`group` null), in a province by `factor`, as buildings
   * opening or closing will later. Used by tests to watch unemployment and
   * job changes.
   */
  | {
      readonly type: 'debugScaleJobs';
      readonly province: string;
      readonly group: string | null;
      readonly factor: number;
    }
  /**
   * Diagnostic (F07): sets the level of a province's building of one type
   * (both by id; level 0 removes it), as construction (F12), damage and the
   * Swarm will later. Used by tests and by the game's test buttons.
   */
  | {
      readonly type: 'debugSetBuildingLevel';
      readonly province: string;
      readonly building: string;
      readonly level: number;
    }
  /**
   * Diagnostic (F07): tops a country's national stockpile (by id) up to so
   * many days of what its buildings use at full output, as emergency imports
   * will later (trade, F19). Used by tests and by the game's test buttons.
   */
  | { readonly type: 'debugFillStockpile'; readonly country: string; readonly days: number }
  /**
   * Diagnostic (F19): sets the level of every building of one type (by id)
   * in the world, as a world-wide disaster might. Used by tests, so that no
   * country can export what those buildings make.
   */
  | {
      readonly type: 'debugSetBuildingLevelEverywhere';
      readonly building: string;
      readonly level: number;
    }
  /**
   * Diagnostic (F19): two countries (by id) stop trading with each other
   * (`on`) or start again, as embargoes and sanctions will with diplomacy
   * and the UN (M6). Importers turn to other suppliers at once. Used by
   * tests and the Trade screen's test buttons.
   */
  | {
      readonly type: 'debugSetEmbargo';
      readonly country: string;
      readonly target: string;
      readonly on: boolean;
    }
  /**
   * Diagnostic (F19): two countries (by id) sign (`on`) or end a trade
   * agreement: no tariffs between them, as diplomacy will (M6). Used by tests.
   */
  | {
      readonly type: 'debugSetTradeAgreement';
      readonly country: string;
      readonly target: string;
      readonly on: boolean;
    }
  /**
   * F08: a country (by id) sets its rationing: a level of `data/food.json`
   * → `rationing` (by id), or `null` for automatic (it rations as its food
   * reserves fall). Ahead of the Rationing law (F16), which will make it
   * cost time and political capital.
   */
  | { readonly type: 'setRationing'; readonly country: string; readonly level: string | null }
  /**
   * Diagnostic (F08): sets how much of a good (by id) a country's national
   * stockpile holds, as a disaster or a seizure might. Used by tests to
   * bring on food shortages quickly.
   */
  | {
      readonly type: 'debugSetStockpile';
      readonly country: string;
      readonly good: string;
      readonly amount: number;
    };

export type SimCommandType = SimCommand['type'];

/** Whether a command was accepted. A refusal carries a translation key the UI can show. */
export type CommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasonKey: string; readonly params?: TextParams };

const OK: CommandResult = { ok: true };

type CommandHandlers = {
  readonly [K in SimCommandType]: (
    state: GameState,
    command: Extract<SimCommand, { type: K }>,
  ) => CommandResult;
};

const HANDLERS: CommandHandlers = {
  debugPing(state, command) {
    if (!Number.isFinite(command.token)) {
      return { ok: false, reasonKey: 'COMMAND_INVALID' };
    }
    state.emit({ type: 'debugPong', token: command.token });
    return OK;
  },
  debugSetProvinceOwner(state, command): CommandResult {
    const province = state.world.provinceIndex.get(command.province);
    if (province === undefined) {
      return {
        ok: false,
        reasonKey: 'COMMAND_UNKNOWN_PROVINCE',
        params: { province: String(command.province) },
      };
    }
    const country = state.world.countryIndex.get(command.country);
    if (country === undefined) {
      return {
        ok: false,
        reasonKey: 'COMMAND_UNKNOWN_COUNTRY',
        params: { country: String(command.country) },
      };
    }
    state.setProvinceOwner(province, country);
    return OK;
  },
  choosePlayerCountry(state, command): CommandResult {
    const country = state.world.countryIndex.get(command.country);
    if (country === undefined) {
      return {
        ok: false,
        reasonKey: 'COMMAND_UNKNOWN_COUNTRY',
        params: { country: String(command.country) },
      };
    }
    if (state.day > 0) return { ok: false, reasonKey: 'COMMAND_PLAYER_COUNTRY_LOCKED' };
    if (state.playerCountry !== country) {
      state.playerCountry = country;
      // The markets' and trade's snapshots show the player's country.
      state.buildings.changes += 1;
      state.emit({ type: 'playerCountryChosen', country: command.country });
    }
    return OK;
  },
  debugScaleJobs(state, command): CommandResult {
    const province = state.world.provinceIndex.get(command.province);
    if (province === undefined) {
      return {
        ok: false,
        reasonKey: 'COMMAND_UNKNOWN_PROVINCE',
        params: { province: String(command.province) },
      };
    }
    const population = state.population;
    const group = command.group === null ? -1 : population.groupIds.indexOf(command.group);
    if (
      (command.group !== null && group < 0) ||
      !Number.isFinite(command.factor) ||
      command.factor < 0
    ) {
      return { ok: false, reasonKey: 'COMMAND_INVALID' };
    }
    // The stand-in economy's jobs; the ones buildings offer follow their levels.
    const row = province * population.groupCount;
    for (let g = 0; g < population.groupCount; g++) {
      if (group < 0 || group === g) population.standInJobs[row + g] *= command.factor;
      population.jobs[row + g] = population.standInJobs[row + g] + population.buildingJobs[row + g];
    }
    population.reportOwnershipVersion = -1;
    return OK;
  },
  debugSetBuildingLevel(state, command): CommandResult {
    const province = state.world.provinceIndex.get(command.province);
    if (province === undefined) {
      return {
        ok: false,
        reasonKey: 'COMMAND_UNKNOWN_PROVINCE',
        params: { province: String(command.province) },
      };
    }
    const type = state.buildings.typeIds.indexOf(command.building);
    if (type < 0) {
      return {
        ok: false,
        reasonKey: 'COMMAND_UNKNOWN_BUILDING',
        params: { building: String(command.building) },
      };
    }
    if (!Number.isInteger(command.level) || command.level < 0 || command.level > 65535) {
      return { ok: false, reasonKey: 'COMMAND_INVALID' };
    }
    setBuildingLevel(state, province, type, command.level);
    return OK;
  },
  debugFillStockpile(state, command): CommandResult {
    const country = state.world.countryIndex.get(command.country);
    if (country === undefined) {
      return {
        ok: false,
        reasonKey: 'COMMAND_UNKNOWN_COUNTRY',
        params: { country: String(command.country) },
      };
    }
    if (!Number.isFinite(command.days) || command.days < 0 || command.days > 3650) {
      return { ok: false, reasonKey: 'COMMAND_INVALID' };
    }
    fillStockpile(state, country, command.days);
    return OK;
  },
  debugSetBuildingLevelEverywhere(state, command): CommandResult {
    const type = state.buildings.typeIds.indexOf(command.building);
    if (type < 0) {
      return {
        ok: false,
        reasonKey: 'COMMAND_UNKNOWN_BUILDING',
        params: { building: String(command.building) },
      };
    }
    if (!Number.isInteger(command.level) || command.level < 0 || command.level > 65535) {
      return { ok: false, reasonKey: 'COMMAND_INVALID' };
    }
    const { level, typeCount } = state.buildings;
    for (let p = 0; p < state.world.provinceIds.length; p++)
      if (level[p * typeCount + type] > 0) setBuildingLevel(state, p, type, command.level);
    return OK;
  },
  debugSetEmbargo(state, command): CommandResult {
    return pairCommand(state, command, setEmbargo);
  },
  debugSetTradeAgreement(state, command): CommandResult {
    return pairCommand(state, command, setTradeAgreement);
  },
  setRationing(state, command): CommandResult {
    const country = state.world.countryIndex.get(command.country);
    if (country === undefined) {
      return {
        ok: false,
        reasonKey: 'COMMAND_UNKNOWN_COUNTRY',
        params: { country: String(command.country) },
      };
    }
    const level = command.level === null ? -1 : state.food.levelIds.indexOf(command.level);
    if (command.level !== null && level < 0) return { ok: false, reasonKey: 'COMMAND_INVALID' };
    setRationing(state, country, level);
    return OK;
  },
  debugSetStockpile(state, command): CommandResult {
    const country = state.world.countryIndex.get(command.country);
    if (country === undefined) {
      return {
        ok: false,
        reasonKey: 'COMMAND_UNKNOWN_COUNTRY',
        params: { country: String(command.country) },
      };
    }
    const good = state.buildings.goodIds.indexOf(command.good);
    if (good < 0 || good === state.buildings.electricityGood)
      return { ok: false, reasonKey: 'COMMAND_INVALID' };
    if (!Number.isFinite(command.amount) || command.amount < 0)
      return { ok: false, reasonKey: 'COMMAND_INVALID' };
    state.buildings.stock[country * state.buildings.goodCount + good] = command.amount;
    state.buildings.changes += 1;
    return OK;
  },
};

/** An embargo or a trade agreement between two countries; trade is split among partners again at once. */
function pairCommand(
  state: GameState,
  command: { readonly country: string; readonly target: string; readonly on: boolean },
  change: (trade: GameState['trade'], a: number, b: number, on: boolean) => boolean,
): CommandResult {
  for (const id of [command.country, command.target]) {
    if (!state.world.countryIndex.has(id))
      return { ok: false, reasonKey: 'COMMAND_UNKNOWN_COUNTRY', params: { country: String(id) } };
  }
  const a = state.world.countryIndex.get(command.country) ?? 0;
  const b = state.world.countryIndex.get(command.target) ?? 0;
  if (a === b || typeof command.on !== 'boolean')
    return { ok: false, reasonKey: 'COMMAND_INVALID' };
  if (change(state.trade, a, b, command.on)) {
    resplitTrade(state.trade, state.market);
    state.buildings.changes += 1;
  }
  return OK;
}

/** Applies one command to the state. Never throws for a bad command; it returns a refusal instead. */
export function applyCommand(state: GameState, command: SimCommand): CommandResult {
  const type: string = command?.type;
  if (!Object.hasOwn(HANDLERS, type)) {
    return { ok: false, reasonKey: 'COMMAND_UNKNOWN', params: { type: String(type) } };
  }
  // The lookup above made sure this is the handler for exactly this command's type.
  const handler = HANDLERS[type as SimCommandType] as (
    state: GameState,
    command: SimCommand,
  ) => CommandResult;
  return handler(state, command);
}
