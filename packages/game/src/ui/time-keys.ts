import type { TimeChange } from '../worker/protocol';

/** The parts of a key press that decide what it does to the game speed. */
export interface TimeKeyPress {
  /** Where the key is on the keyboard (`KeyboardEvent.code`), the same on every layout. */
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  /** True when the key is held down and the press repeats. */
  readonly repeat: boolean;
}

/**
 * The time keys (F04):
 * - **Space**: pause / unpause
 * - **1–5** (top row or number pad): choose the speed
 * - **+ / −** on the number pad: one speed faster / slower
 *
 * The `+`, `=` and `-` keys of the main keyboard stay with the camera (zoom);
 * the camera leaves the number pad's `+` and `−` to the game speed.
 * Returns null for keys that aren't time keys.
 */
export function timeKeyAction(press: TimeKeyPress): TimeChange | null {
  // A browser shortcut, not ours.
  if (press.ctrlKey || press.metaKey || press.altKey) return null;
  if (press.code === 'Space') return press.repeat ? null : { kind: 'togglePause' };
  if (press.code === 'NumpadAdd') return { kind: 'faster' };
  if (press.code === 'NumpadSubtract') return { kind: 'slower' };
  const digit = /^(?:Digit|Numpad)([1-5])$/.exec(press.code);
  if (digit) return press.repeat ? null : { kind: 'setSpeed', speed: Number(digit[1]) };
  return null;
}
