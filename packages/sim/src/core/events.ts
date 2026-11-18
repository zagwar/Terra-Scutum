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
  | { readonly type: 'debugPong'; readonly token: number }
  /** A province has a new owner (ids of the province, the old owner and the new owner). */
  | {
      readonly type: 'provinceOwnerChanged';
      readonly province: string;
      readonly from: string;
      readonly to: string;
    }
  /** The player chose the country they lead (its id), before the campaign's first day (F05). */
  | { readonly type: 'playerCountryChosen'; readonly country: string }
  /** F08: a province (id) of a country (id, its owner) is in famine: enough of its people starve. */
  | { readonly type: 'famineStarted'; readonly province: string; readonly country: string }
  /** F08: a province's famine is over; `deaths` is how many people it killed. */
  | {
      readonly type: 'famineEnded';
      readonly province: string;
      readonly country: string;
      readonly deaths: number;
    };

export type SimEventType = SimEvent['type'];
