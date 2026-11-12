import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppStore } from './app-store';
import { type DebugHooks, installDebugHooks } from './debug/debug-hooks';
import { parseLaunchOptions } from './debug/scenarios';
import { createGameRenderer } from './render/game-renderer';
import { App } from './ui/app';
import { t } from './ui/i18n';
import './ui/styles.css';
import { createSimClient } from './worker/sim-client';

/**
 * Starts the game: the sim worker (simulation), the Babylon renderer (3D
 * view) and the React UI. The three only meet here and in the app store.
 */
function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`index.html is missing the #${id} element`);
  return element;
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

document.title = t('GAME_TITLE');

const launch = parseLaunchOptions(window.location.search);
const store = createAppStore();
let debugHooks: DebugHooks | null = null;

const sim = createSimClient({
  onReady(snapshot, saveFormatVersion) {
    store.update({ sim: 'running', snapshot, saveFormatVersion });
  },
  onUpdate(snapshot, events) {
    store.update({ snapshot });
    debugHooks?.recordEvents(events);
  },
  onError(key, detail) {
    console.error(detail);
    store.update({ sim: 'failed', error: { key, detail } });
  },
});

if (launch.scenarioName !== null) debugHooks = installDebugHooks(store, sim);

createRoot(requireElement('ui')).render(
  <StrictMode>
    <App store={store} onAdvanceDay={() => void sim.step(1)} />
  </StrictMode>,
);

if (launch.scenarioName !== null && launch.scenario === null) {
  store.update({
    sim: 'failed',
    renderer: 'failed',
    error: { key: 'ERROR_DEBUG_SCENARIO_UNKNOWN', detail: `?debug=${launch.scenarioName}` },
  });
} else {
  sim.init(launch.scenario?.seed ?? randomSeed());

  createGameRenderer(requireElement('scene'), {
    preference: launch.renderer,
    animate: launch.scenario === null,
  }).then(
    (renderer) => {
      debugHooks?.setRenderer(renderer);
      store.update({ renderer: renderer.type });
    },
    (error: unknown) => {
      console.error(error);
      store.update({
        renderer: 'failed',
        // Keep an earlier error (for example from the sim) on screen.
        error: store.getState().error ?? { key: 'ERROR_RENDERER_FAILED', detail: String(error) },
      });
    },
  );
}
