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
  { readonly type: 'debugPing'; readonly token: number };

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
};

/** Applies one command to the state. Never throws for a bad command; it returns a refusal instead. */
export function applyCommand(state: GameState, command: SimCommand): CommandResult {
  const type: string = command?.type;
  if (!Object.hasOwn(HANDLERS, type)) {
    return { ok: false, reasonKey: 'COMMAND_UNKNOWN', params: { type: String(type) } };
  }
  const handler = HANDLERS[type as SimCommandType];
  return handler(state, command);
}
