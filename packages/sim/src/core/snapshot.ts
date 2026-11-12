import type { CalendarDate } from './calendar';
import type { GameState } from './game-state';

/**
 * What the sim worker sends to the game after ticks and commands: a small,
 * plain-data view of the state for the UI and renderer. It must be cheap to
 * build and to send (structured clone); per-province numbers will travel as
 * typed arrays. Later features add their slices here.
 */
export interface SimSnapshot {
  /** Whole days since the campaign's start date. */
  readonly day: number;
  /** Today's calendar date. */
  readonly date: CalendarDate;
}

export function createSnapshot(state: GameState): SimSnapshot {
  return { day: state.day, date: state.date };
}
