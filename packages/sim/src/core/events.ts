/**
 * Sim events: things that happened in the sim that the game (renderer, UI)
 * may want to react to. The sim collects them in `GameState.events`; the host
 * (sim worker, campaign runner) drains them after each tick or command.
 *
 * Events carry ids, numbers and translation keys only, never finished text.
 * Later features add theirs here (`provinceControlChanged`, `hiveTierUp`…).
 */
export type SimEvent =
  /** Answer to the `debugPing` command; proves the command → event path works. */
  { readonly type: 'debugPong'; readonly token: number };

export type SimEventType = SimEvent['type'];
