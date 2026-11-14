import { useSyncExternalStore } from 'react';

/**
 * The compact layout (phones, small tablets): a narrow or a short window.
 * Keep it the same as the `@media` rule of the compact layout in `styles.css`.
 */
export const COMPACT_QUERY = '(max-width: 760px), (max-height: 520px)';
/** A touch screen as the main pointer (no mouse to hover with). */
export const TOUCH_QUERY = '(pointer: coarse)';

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;
}

/** Whether a CSS media query matches now; the component re-renders when that changes. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => matches(query),
  );
}

/** Whether the window is small (a phone): see `COMPACT_QUERY`. Read once, for starting states. */
export function isCompactNow(): boolean {
  return matches(COMPACT_QUERY);
}
