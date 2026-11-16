import type { GameState } from './game-state';
import type { TextParams } from './sim-error';

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
    const row = province * population.groupCount;
    for (let g = 0; g < population.groupCount; g++)
      if (group < 0 || group === g) population.jobs[row + g] *= command.factor;
    population.reportOwnershipVersion = -1;
    return OK;
  },
};

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
