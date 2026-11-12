import type { CalendarDate } from './calendar';
import type { GameState } from './game-state';

/**
 * What the sim worker sends to the game after ticks and commands: a small,
 * plain-data view of the state for the UI and renderer. It must be cheap to
 * build and to send (structured clone); per-province numbers travel as typed
 * arrays, and only when they changed. Later features add their slices here.
 */
export interface SimSnapshot {
  /** Whole days since the campaign's start date. */
  readonly day: number;
  /** Today's calendar date. */
  readonly date: CalendarDate;
  /** Goes up every time a province changes owner. */
  readonly ownershipVersion: number;
  /**
   * The country (index) that owns each province. Left out when the receiver
   * already has these owners (see `SnapshotKnown`): keep the last one received.
   */
  readonly provinceOwner?: Uint16Array;
}

/** What the receiver of a snapshot already has, so unchanged parts aren't sent again. */
export interface SnapshotKnown {
  /** The `ownershipVersion` of the owners the receiver holds. */
  readonly ownershipVersion: number;
}

/**
 * Builds a snapshot. Pass what the receiver already has (usually: the last
 * snapshot sent) to leave out the parts that haven't changed since; without
 * it, the snapshot is complete.
 */
export function createSnapshot(state: GameState, known?: SnapshotKnown): SimSnapshot {
  const ownersChanged = !known || known.ownershipVersion !== state.ownershipVersion;
  return {
    day: state.day,
    date: state.date,
    ownershipVersion: state.ownershipVersion,
    // A copy: the sim keeps changing its own array.
    ...(ownersChanged ? { provinceOwner: state.provinceOwner.slice() } : {}),
  };
}
