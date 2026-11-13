/**
 * The information panel on the left (F122): one panel at a time (province,
 * sea zone, country or region), like Victoria 3. Following a link in a panel
 * opens the next one and remembers the last, so ◀ Back returns to it;
 * clicking the map starts afresh. Pure functions, so they can be unit tested.
 */
export type PanelKind = 'province' | 'seaZone' | 'country' | 'region';

export interface PanelTarget {
  readonly kind: PanelKind;
  readonly index: number;
}

export interface PanelState {
  readonly panel: PanelTarget | null;
  /** The panels Back returns to, oldest first. */
  readonly panelHistory: readonly PanelTarget[];
  /** The province highlighted on the map (the last province panel opened), or null. */
  readonly selectedProvince: number | null;
  /** The sea zone highlighted on the map, or null. At most one of the two is set. */
  readonly selectedSeaZone: number | null;
}

/** How many panels Back can return through [DEFAULT]. */
export const PANEL_HISTORY_LIMIT = 20;

const same = (a: PanelTarget | null, b: PanelTarget) =>
  a !== null && a.kind === b.kind && a.index === b.index;

/** Which province or sea zone the map highlights while `target` is shown. */
function selectionFor(current: PanelState, target: PanelTarget) {
  if (target.kind === 'province') return { selectedProvince: target.index, selectedSeaZone: null };
  if (target.kind === 'seaZone') return { selectedProvince: null, selectedSeaZone: target.index };
  // A country or region panel keeps the highlight of the province it was opened from.
  return { selectedProvince: current.selectedProvince, selectedSeaZone: current.selectedSeaZone };
}

/**
 * Opens a panel. `fromLink`: opened from a link in the panel shown now, so
 * Back returns to that one; otherwise (a click on the map, the top bar's
 * flag…) the history starts afresh.
 */
export function openPanel(current: PanelState, target: PanelTarget, fromLink: boolean): PanelState {
  if (same(current.panel, target)) return current;
  const keep = fromLink && current.panel !== null;
  const panelHistory = keep
    ? [...current.panelHistory, current.panel].slice(-PANEL_HISTORY_LIMIT)
    : [];
  return { panel: target, panelHistory, ...selectionFor(current, target) };
}

/** Goes back to the panel shown before this one (does nothing without one). */
export function backPanel(current: PanelState): PanelState {
  const previous = current.panelHistory.at(-1);
  if (!previous) return current;
  return {
    panel: previous,
    panelHistory: current.panelHistory.slice(0, -1),
    ...selectionFor(current, previous),
  };
}

/** Closes the panel; the map highlight goes too. */
export function closePanel(): PanelState {
  return { panel: null, panelHistory: [], selectedProvince: null, selectedSeaZone: null };
}
