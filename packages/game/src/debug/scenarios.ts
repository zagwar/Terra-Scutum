/**
 * Debug scenarios: fixed setups the Playwright tests (and anyone debugging)
 * load with `?debug=<name>` in the address. A scenario makes the game
 * repeatable: fixed seed.
 * Features add scenarios here as they need them (a test map, a battle…).
 */
export interface DebugScenario {
  /** Seed for the campaign, so every run is identical. */
  readonly seed: number;
  /**
   * Whether the map scrolls when the mouse is at the window's edge. Off in the
   * test scenarios: the tests park the mouse at the edge to keep it off the map.
   */
  readonly edgeScrolling: boolean;
  /** Fills the UI shell with sample content and shows the demo buttons (F122). */
  readonly uiDemo?: boolean;
}

export const DEBUG_SCENARIOS: Readonly<Record<string, DebugScenario>> = {
  /** The basics: the world map and a new campaign. */
  foundation: { seed: 42, edgeScrolling: false },
  /** The UI shell with sample alerts, outliner entries and messages, for trying it on the preview link. */
  'ui-demo': { seed: 42, edgeScrolling: true, uiDemo: true },
};

export interface LaunchOptions {
  /** Name of the debug scenario from the address, or null in a normal game. */
  readonly scenarioName: string | null;
  readonly scenario: DebugScenario | null;
  /** `?renderer=webgl2` or `?renderer=webgpu` forces a renderer; otherwise the best available is used. */
  readonly renderer: 'auto' | 'webgpu' | 'webgl2';
}

/** Reads the launch options from the page address (the part after `?`). */
export function parseLaunchOptions(search: string): LaunchOptions {
  const params = new URLSearchParams(search);
  const scenarioName = params.get('debug');
  const scenario =
    scenarioName !== null && Object.hasOwn(DEBUG_SCENARIOS, scenarioName)
      ? DEBUG_SCENARIOS[scenarioName]
      : null;
  const rendererParam = params.get('renderer');
  const renderer =
    rendererParam === 'webgpu' || rendererParam === 'webgl2' ? rendererParam : 'auto';
  return { scenarioName, scenario, renderer };
}
