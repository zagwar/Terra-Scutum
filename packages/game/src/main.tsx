import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppStore } from './app-store';
import { type DebugHooks, installDebugHooks } from './debug/debug-hooks';
import { parseLaunchOptions } from './debug/scenarios';
import { type GameRenderer, createGameRenderer } from './render/game-renderer';
import { App } from './ui/app';
import { t } from './ui/i18n';
import './ui/styles.css';
import { type ReadyMessage, createSimClient } from './worker/sim-client';

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

// The map needs two things that start at the same time: the 3D renderer, and
// the world's facts from the sim. Whichever arrives second starts the map.
let renderer: GameRenderer | null = null;
let ready: ReadyMessage | null = null;

function showMapWhenPossible(): void {
  if (!renderer || !ready) return;
  const view = renderer;
  view
    .showMap(ready.world, ready.mapView, {
      onHover: (province) => store.update({ hoveredProvince: province }),
      onClick: (province) => store.update({ selectedProvince: province }),
    })
    .then(
      (map) => {
        // The store decides what is selected and which map mode is shown; the map follows it.
        const sync = () => {
          const state = store.getState();
          map.setMode(state.mapMode);
          map.setSelectedProvince(state.selectedProvince);
        };
        store.subscribe(sync);
        sync();
        store.update({ map: 'ready' });
      },
      (error: unknown) => {
        console.error(error);
        store.update({
          map: 'failed',
          error: store.getState().error ?? { key: 'ERROR_MAP_FAILED', detail: String(error) },
        });
      },
    );
}

const sim = createSimClient({
  onReady(message) {
    ready = message;
    store.update({
      sim: 'running',
      snapshot: message.snapshot,
      world: message.world,
      saveFormatVersion: message.saveFormatVersion,
    });
    showMapWhenPossible();
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
    <App
      store={store}
      onAdvanceDay={() => void sim.step(1)}
      onSelectProvince={(province) => store.update({ selectedProvince: province })}
      onSetMapMode={(mapMode) => store.update({ mapMode })}
    />
  </StrictMode>,
);

if (launch.scenarioName !== null && launch.scenario === null) {
  store.update({
    sim: 'failed',
    renderer: 'failed',
    map: 'failed',
    error: { key: 'ERROR_DEBUG_SCENARIO_UNKNOWN', detail: `?debug=${launch.scenarioName}` },
  });
} else {
  sim.init(launch.scenario?.seed ?? randomSeed());

  createGameRenderer(requireElement('scene'), { preference: launch.renderer }).then(
    (created) => {
      renderer = created;
      debugHooks?.setRenderer(created);
      store.update({ renderer: created.type });
      showMapWhenPossible();
    },
    (error: unknown) => {
      console.error(error);
      store.update({
        renderer: 'failed',
        map: 'failed',
        // Keep an earlier error (for example from the sim) on screen.
        error: store.getState().error ?? { key: 'ERROR_RENDERER_FAILED', detail: String(error) },
      });
    },
  );
}
