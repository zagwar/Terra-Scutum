import type {
  CountryStartTable,
  GameConfig,
  RenderStressConfig,
  SceneryConfig,
  WorldMap,
} from '@terra-scutum/sim';
import type { RendererType } from '../render/create-engine';
import type { MapView } from '../render/map/map-view';
import type { ModelLibrary } from '../render/models/model-library';
import type { Scene } from '@babylonjs/core/scene';
import { type PerfMeter, type PerfNumbers, createPerfMeter } from '../render/stress/perf-meter';
import { placeStressLoad } from '../render/stress/stress-placement';
import {
  type StressPart,
  type StressScene,
  type StressSceneStats,
  createStressScene,
} from '../render/stress/stress-scene';

/**
 * The render stress test (F139, `?debug=stress`): puts the late-game load on
 * the map, measures every frame, jumps between fixed views, and runs the
 * benchmark (every view in turn, measured for a few seconds each). The
 * on-screen counter (`ui/stress-overlay.tsx`) and the browser test
 * (`e2e/stress.spec.ts`) both use it.
 */
export type PerformanceBudget = GameConfig['performanceBudget'];

export interface StressView {
  /** Translation key of the view's name. */
  readonly name: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly zoom: number;
}

export interface BenchmarkResult extends PerfNumbers {
  readonly view: string;
  readonly zoom: number;
  /** Whether the view's terrain and trees were all there when measuring started. */
  readonly settled: boolean;
  /** The frame rate this view should reach: strategic (the whole world) or close. */
  readonly targetFps: number;
  readonly modelsDrawn: number;
}

export interface SimTicks {
  /** Days run in the last few seconds. */
  readonly days: number;
  readonly daysPerSecond: number;
  readonly averageMs: number;
  readonly worstMs: number;
}

export interface StressTest {
  readonly renderer: RendererType;
  readonly views: readonly StressView[];
  readonly budget: PerformanceBudget;
  live(): PerfNumbers;
  scene(): StressSceneStats;
  sim(): SimTicks;
  /** Moves the camera to a view. */
  goTo(view: number): void;
  /**
   * Runs the benchmark: every view in turn; `onProgress` gets the view being
   * measured. `timing` replaces `measureSeconds` and `settleSeconds` (the
   * browser tests measure shorter).
   */
  runBenchmark(
    onProgress?: (view: number) => void,
    timing?: { readonly measureSeconds: number; readonly settleSeconds: number },
  ): Promise<BenchmarkResult[]>;
  /** The results of the last benchmark, or null. */
  results(): readonly BenchmarkResult[] | null;
  /** Turns parts of the stress load on or off (to see what each costs, or to compare with the map alone). */
  setParts(parts: Partial<Record<StressPart, boolean>>): void;
  parts(): Readonly<Record<StressPart, boolean>>;
  /** Called by the game with the time of every day the sim worker ran. */
  recordTick(ms: number): void;
  dispose(): void;
}

export interface StressTestOptions {
  readonly scene: Scene;
  readonly renderer: RendererType;
  readonly map: MapView;
  readonly library: ModelLibrary;
  readonly world: WorldMap;
  readonly countryStart: CountryStartTable;
  readonly config: RenderStressConfig;
  readonly scenery: Pick<SceneryConfig, 'simplePx' | 'detailedPx'>;
  readonly budget: PerformanceBudget;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Zoom up to which a view counts as strategic (the 60 FPS budget); closer views have the 30 FPS budget. */
const STRATEGIC_MAX_ZOOM = 2;
/** The benchmark measures at least this many frames per view (the cloud's test browser is very slow). */
const MIN_FRAMES = 3;
const TICK_WINDOW_MS = 5000;

export function startStressTest(options: StressTestOptions): StressTest {
  const { map, config } = options;
  const placement = placeStressLoad(
    options.world,
    options.countryStart.population,
    config,
    (id) => options.library.variants(id),
    map.ground,
  );
  const stressScene: StressScene = createStressScene(
    options.scene,
    options.library,
    config,
    options.scenery,
    placement,
    map.ground,
  );
  const removeLayer = map.addLayer(stressScene);
  const meter: PerfMeter = createPerfMeter(options.scene);
  const ticks: { at: number; ms: number }[] = [];
  let lastResults: BenchmarkResult[] | null = null;

  const goTo = (index: number) => {
    const view = config.views[index];
    map.lookAt(view.longitude, view.latitude, view.zoom);
    map.settle();
  };

  return {
    renderer: options.renderer,
    views: config.views,
    budget: options.budget,
    live: () => meter.live(),
    scene: () => stressScene.stats(),
    sim() {
      const now = performance.now();
      while (ticks.length > 0 && now - ticks[0].at > TICK_WINDOW_MS) ticks.shift();
      let total = 0;
      let worst = 0;
      for (const tick of ticks) {
        total += tick.ms;
        worst = Math.max(worst, tick.ms);
      }
      return {
        days: ticks.length,
        daysPerSecond: ticks.length / (TICK_WINDOW_MS / 1000),
        averageMs: ticks.length > 0 ? total / ticks.length : 0,
        worstMs: worst,
      };
    },
    goTo,
    async runBenchmark(onProgress, timing) {
      const { measureSeconds, settleSeconds } = timing ?? config;
      const results: BenchmarkResult[] = [];
      for (let index = 0; index < config.views.length; index++) {
        const view = config.views[index];
        onProgress?.(index);
        goTo(index);
        // Wait for the view's terrain and trees, at most `settleSeconds`.
        const settleUntil = performance.now() + settleSeconds * 1000;
        let settled = false;
        await wait(200);
        while (performance.now() < settleUntil) {
          const stats = map.getStats();
          if (stats.terrainPending === 0 && !stats.scenery.searching) {
            settled = true;
            break;
          }
          await wait(100);
        }
        // Let the newest trees finish growing in, then measure.
        await wait(settled ? 800 : 0);
        meter.beginWindow();
        const measureUntil = performance.now() + measureSeconds * 1000;
        while (performance.now() < measureUntil || meter.window().frames < MIN_FRAMES)
          await wait(100);
        const numbers = meter.window();
        results.push({
          ...numbers,
          view: view.name,
          zoom: view.zoom,
          settled,
          targetFps:
            view.zoom <= STRATEGIC_MAX_ZOOM ? options.budget.strategicFps : options.budget.closeFps,
          modelsDrawn: stressScene.stats().modelsDrawn,
        });
      }
      lastResults = results;
      return results;
    },
    results: () => lastResults,
    setParts: (parts) => stressScene.setParts(parts),
    parts: () => stressScene.parts(),
    recordTick(ms) {
      ticks.push({ at: performance.now(), ms });
    },
    dispose() {
      removeLayer();
      meter.dispose();
      stressScene.dispose();
    },
  };
}

/** The benchmark's results as plain text, for the designer to copy into the chat. */
export function formatBenchmark(
  results: readonly BenchmarkResult[],
  renderer: RendererType,
  viewName: (key: string) => string,
  sim: SimTicks,
): string {
  const lines = [
    `Terra Scutum stress test (F139) — ${renderer === 'webgpu' ? 'WebGPU' : 'WebGL 2'}, ` +
      `${window.innerWidth}×${window.innerHeight} at ${window.devicePixelRatio}× pixels`,
    `Browser: ${navigator.userAgent}`,
  ];
  for (const r of results)
    lines.push(
      `${viewName(r.view)} (zoom ${r.zoom}): ${r.fps.toFixed(1)} FPS (target ${r.targetFps}), ` +
        `frame ${r.frameMs.toFixed(1)} ms, 1% slowest ${r.p99FrameMs.toFixed(1)} ms, ` +
        `CPU ${r.cpuMs.toFixed(1)} ms, ${r.drawCalls} draw calls, ` +
        `${(r.triangles / 1e6).toFixed(2)} M triangles, ${r.modelsDrawn} models drawn` +
        (r.heapMb === null ? '' : `, JS memory ${Math.round(r.heapMb)} MB`) +
        (r.settled ? '' : ' (view not fully loaded)'),
    );
  lines.push(
    `Sim worker: ${sim.daysPerSecond.toFixed(1)} days/s, a day takes ${sim.averageMs.toFixed(1)} ms ` +
      `on average (worst ${sim.worstMs.toFixed(1)} ms)`,
  );
  return lines.join('\n');
}
