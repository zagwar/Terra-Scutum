import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppStore } from './app-store';
import { type DebugHooks, installDebugHooks } from './debug/debug-hooks';
import { parseLaunchOptions } from './debug/scenarios';
import { DemoControls, startUiDemo } from './debug/ui-demo';
import { type StressTest, startStressTest } from './debug/stress-test';
import { type GameRenderer, createGameRenderer } from './render/game-renderer';
import { App } from './ui/app';
import { ModelGalleryPage } from './ui/model-gallery-page';
import { StressOverlay } from './ui/stress-overlay';
import { t } from './ui/i18n';
import { messageFromEvent } from './ui/shell/messages';
import { createShellActions } from './ui/shell/shell-actions';
import { loadUiSettings } from './ui/shell/ui-settings';
import './ui/styles.css';
import type { TimeChange } from './worker/protocol';
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
const store = createAppStore({
  uiSettings: loadUiSettings(),
  // A normal game starts with the country selection (F05); most debug scenarios skip it.
  choosingCountry: launch.scenario ? launch.scenario.chooseCountry === true : true,
});
let debugHooks: DebugHooks | null = null;

// The map needs two things that start at the same time: the 3D renderer, and
// the world's facts from the sim. Whichever arrives second starts the map.
let renderer: GameRenderer | null = null;
let ready: ReadyMessage | null = null;
/** The render stress test (F139), once its load is on the map. */
let stressTest: StressTest | null = null;

function showMapWhenPossible(): void {
  if (!renderer || !ready) return;
  const view = renderer;
  if (launch.scenario?.modelGallery) {
    // The model gallery (F133) takes the map's place; "map ready" means the 3D view is ready.
    const gallery = view.showGallery(ready.models, ready.mapView);
    renderGallery(gallery);
    store.update({ map: 'ready' });
    return;
  }
  view
    .showMap(ready.world, ready.mapView, ready.terrainTiles, ready.models, {
      onHover: (target) =>
        store.update({
          hoveredProvince: target?.kind === 'province' ? target.index : null,
          hoveredSeaZone: target?.kind === 'seaZone' ? target.index : null,
        }),
      onClick: (target) => actions.mapClick(target),
    })
    .then(
      (map) => {
        // The store decides what is selected and which map mode is shown; the map follows it.
        const sync = () => {
          const state = store.getState();
          map.setMode(state.mapMode);
          if (state.provinceOwner) map.setProvinceOwners(state.provinceOwner);
          map.setSelectedProvince(state.selectedProvince);
          map.setSelectedSeaZone(state.selectedSeaZone);
          map.setHighlightedCountry(state.choosingCountry ? state.candidateCountry : null);
        };
        store.subscribe(sync);
        sync();
        if (launch.scenario) {
          map.setEdgeScrolling(launch.scenario.edgeScrolling);
          map.setSceneryEnabled(launch.scenario.scenery !== false);
        }
        if (launch.scenario?.stress && ready && view.models) {
          stressTest = startStressTest({
            scene: view.scene,
            renderer: view.type,
            map,
            library: view.models,
            world: ready.world,
            countryStart: ready.countryStart,
            config: ready.renderStress,
            scenery: ready.mapView.scenery,
            budget: ready.performanceBudget,
          });
          debugHooks?.setStressTest(stressTest);
          renderUi();
          // The sim worker runs its placeholder load at top speed, as a late game at full speed would.
          sim.changeTime({ kind: 'setSpeed', speed: 5 });
          sim.changeTime({ kind: 'setPaused', paused: false });
        }
        store.update({ map: 'ready' });
        if (launch.scenario?.uiDemo) startUiDemo(store, actions);
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
      provinceOwner: message.snapshot.provinceOwner ?? null,
      world: message.world,
      countryStart: message.countryStart,
      saveFormatVersion: message.saveFormatVersion,
      time: message.time,
      daysPerSecond: message.daysPerSecond,
      playerCountry: message.playerCountry,
      notifications: message.notifications,
      countryScreen: message.countryScreen,
    });
    showMapWhenPossible();
  },
  onUpdate(snapshot, events, tickMs) {
    if (tickMs !== undefined) stressTest?.recordTick(tickMs);
    // The owners only come along when they changed; otherwise the ones we have still hold.
    store.update({
      snapshot,
      playerCountry: snapshot.playerCountry,
      ...(snapshot.provinceOwner ? { provinceOwner: snapshot.provinceOwner } : {}),
    });
    debugHooks?.recordEvents(events);
    // Sim events that have a message type become messages (toasts, pop-ups, the log).
    const { world } = store.getState();
    if (world) {
      for (const event of events) {
        const message = messageFromEvent(event, world, snapshot.date);
        if (message) actions.deliverMessage(message);
      }
    }
  },
  onTime(time) {
    store.update({ time });
  },
  onError(key, detail) {
    console.error(detail);
    store.update({ sim: 'failed', error: { key, detail } });
  },
});

/** Pause, unpause and game speed go to the sim worker, which runs the days. */
const changeTime = (change: TimeChange) => sim.changeTime(change);

const actions = createShellActions({
  store,
  // A province or sea zone picked from a list (not on the map) is brought into view.
  focusProvince: (province) => renderer?.map?.focusProvince(province),
  focusSeaZone: (seaZone) => renderer?.map?.focusSeaZone(seaZone),
  focusCountry: (country) => renderer?.map?.focusCountry(country),
  changeTime,
  sendCommand: (command) => sim.sendCommand(command),
});

if (launch.scenarioName !== null) debugHooks = installDebugHooks(store, sim);

const uiRoot = createRoot(requireElement('ui'));
function renderGallery(gallery: Parameters<typeof ModelGalleryPage>[0]['gallery']): void {
  uiRoot.render(
    <StrictMode>
      <ModelGalleryPage gallery={gallery} />
    </StrictMode>,
  );
}

function renderUi(): void {
  uiRoot.render(
    <StrictMode>
      <App
        store={store}
        actions={actions}
        onChangeTime={changeTime}
        onSetMapMode={(mapMode) => store.update({ mapMode })}
        onResetView={() => renderer?.map?.resetView()}
        debugControls={
          launch.scenario?.uiDemo ? (
            <DemoControls store={store} actions={actions} sim={sim} />
          ) : launch.scenario?.stress ? (
            <StressOverlay test={stressTest} />
          ) : undefined
        }
      />
    </StrictMode>,
  );
}

if (launch.scenario?.modelGallery) renderGallery(null);
else renderUi();

if (launch.scenarioName !== null && launch.scenario === null) {
  store.update({
    sim: 'failed',
    renderer: 'failed',
    map: 'failed',
    error: { key: 'ERROR_DEBUG_SCENARIO_UNKNOWN', detail: `?debug=${launch.scenarioName}` },
  });
} else {
  sim.init(launch.scenario?.seed ?? randomSeed(), { stressLoad: launch.scenario?.stress });

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
