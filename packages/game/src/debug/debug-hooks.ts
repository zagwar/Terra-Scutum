import type { CommandResult, SimCommand, SimEvent, SimSnapshot } from '@terra-scutum/sim';
import type { AppState, AppStore } from '../app-store';
import type { GameRenderer } from '../render/game-renderer';
import type { MapStats } from '../render/map/map-view';
import type { GalleryModelStats } from '../render/models/model-gallery';
import type { SceneryProbe } from '../render/scenery/map-scenery';
import type { TimeChange, TimeState } from '../worker/protocol';
import type { SimClient } from '../worker/sim-client';
import type { PerfNumbers } from '../render/stress/perf-meter';
import type { StressPart, StressSceneStats } from '../render/stress/stress-scene';
import type { BenchmarkResult, SimTicks, StressTest } from './stress-test';

/**
 * Test hooks, installed as `window.__terraScutum` only when the game is
 * opened with `?debug=<scenario>`. Playwright uses them to wait for the game,
 * drive the sim and read its state.
 */
export interface DebugApi {
  /** True once the 3D renderer, the sim and the world map are all running. */
  isReady(): boolean;
  getState(): AppState;
  /** Frames drawn so far; null until the renderer has started. */
  getFrameCount(): number | null;
  /** Frames per second, averaged over about the last second; null until the renderer has started. */
  getFps(): number | null;
  /** Simulates exactly this many days now (best with the game paused, as it starts). */
  step(days: number): Promise<SimSnapshot>;
  /** The game speed as the UI last heard it from the sim worker; null until the sim is ready. */
  time(): TimeState | null;
  /** Pauses, unpauses or changes the game speed, like the time controls do. */
  changeTime(change: TimeChange): void;
  sendCommand(command: SimCommand): Promise<CommandResult>;
  /** Every sim event received since the game started. */
  readonly events: SimEvent[];
  /** The world map; these all return null until it has loaded. */
  readonly map: {
    stats(): MapStats | null;
    /** The id of the province at a longitude/latitude; null for the sea. */
    provinceAt(longitude: number, latitude: number): string | null;
    /** The height of the land as drawn right now at a longitude/latitude, in metres (0 at sea). */
    heightAt(longitude: number, latitude: number): number | null;
    /** Where a longitude/latitude is on the page, in CSS pixels. */
    screenPosition(longitude: number, latitude: number): { x: number; y: number } | null;
    /** The longitude/latitude under a point of the page, in CSS pixels. */
    placeAt(x: number, y: number): { longitude: number; latitude: number } | null;
    /** Scrolls the map east (positive) or west (negative), in degrees of longitude. */
    scrollBy(degrees: number): void;
    /** Points the camera at a place; zoom 1 shows the whole world, 4 is four times closer. */
    lookAt(longitude: number, latitude: number, zoom: number): void;
    centerLongitude(): number | null;
    /** How far the view is zoomed in (1 = the whole world). */
    zoom(): number | null;
    /** Which way the top of the screen points, in degrees (0 = north, 90 = east). */
    heading(): number | null;
    /** How far the camera leans back from straight down, in degrees. */
    tilt(): number | null;
    /** True while the camera glides to where it was sent. */
    isMoving(): boolean | null;
    /** Finishes the camera's glide at once. */
    settle(): void;
    /** Turns scrolling at the window's edge on or off. */
    setEdgeScrolling(enabled: boolean): void;
    /** The id of the selected province, or null. */
    selectedProvince(): string | null;
    /** The id of the sea zone at a longitude/latitude; null on land or outside the map. */
    seaZoneAt(longitude: number, latitude: number): string | null;
    /** The id of the selected sea zone, or null. */
    selectedSeaZone(): string | null;
    /** Up to `count` of the scenery's models as drawn right now (F133): where they stand and how tall on screen. */
    sceneryProbe(count: number): SceneryProbe[] | null;
  };
  /** The model gallery (`?debug=models`, F133); these return null elsewhere. */
  readonly gallery: {
    /** True once every model is drawn. */
    isComplete(): boolean | null;
    stats(): GalleryModelStats[] | null;
    /**
     * Shows a glTF model file (any address, for example a blob: URL) in place of a model,
     * as a data entry `{ "source": "file" }` would.
     */
    replaceWithFile(modelId: string, url: string): void;
  };
  /** The render stress test (`?debug=stress`, F139); these return null elsewhere or before its load is on the map. */
  readonly stress: {
    /** What is on the map, and what was drawn in the last frame. */
    scene(): StressSceneStats | null;
    /** The counter's numbers over the last second. */
    live(): PerfNumbers | null;
    /** The sim worker's days over the last few seconds. */
    sim(): SimTicks | null;
    /** Moves the camera to one of the views of `data/stress_test.json`. */
    goTo(view: number): void;
    /** Turns parts of the load on or off. */
    setParts(parts: Partial<Record<StressPart, boolean>>): void;
    /** Visits every view and measures it (`measureSeconds` each, or what the test asks for). */
    runBenchmark(timing?: {
      measureSeconds: number;
      settleSeconds: number;
    }): Promise<BenchmarkResult[]> | null;
  };
}

declare global {
  interface Window {
    __terraScutum?: DebugApi;
  }
}

export interface DebugHooks {
  setRenderer(renderer: GameRenderer): void;
  setStressTest(test: StressTest): void;
  recordEvents(events: readonly SimEvent[]): void;
}

export function installDebugHooks(store: AppStore, sim: SimClient): DebugHooks {
  let renderer: GameRenderer | null = null;
  let stressTest: StressTest | null = null;
  const events: SimEvent[] = [];
  const idOf = (province: number | null | undefined): string | null =>
    province === null || province === undefined || province < 0
      ? null
      : (store.getState().world?.provinceIds[province] ?? null);
  const seaZoneIdOf = (seaZone: number | null | undefined): string | null =>
    seaZone === null || seaZone === undefined || seaZone < 0
      ? null
      : (store.getState().world?.seaZoneIds[seaZone] ?? null);

  window.__terraScutum = {
    isReady() {
      const state = store.getState();
      return (
        state.sim === 'running' &&
        (state.renderer === 'webgpu' || state.renderer === 'webgl2') &&
        state.map === 'ready'
      );
    },
    getState: () => store.getState(),
    getFrameCount: () => renderer?.getFrameCount() ?? null,
    getFps: () => renderer?.getFps() ?? null,
    step: (days) => sim.step(days),
    time: () => store.getState().time,
    changeTime: (change) => sim.changeTime(change),
    sendCommand: (command) => sim.sendCommand(command),
    events,
    map: {
      stats: () => renderer?.map?.getStats() ?? null,
      provinceAt: (longitude, latitude) => idOf(renderer?.map?.provinceAt(longitude, latitude)),
      heightAt: (longitude, latitude) => renderer?.map?.heightAt(longitude, latitude) ?? null,
      screenPosition: (longitude, latitude) =>
        renderer?.map?.screenPosition(longitude, latitude) ?? null,
      placeAt: (x, y) => renderer?.map?.placeAt(x, y) ?? null,
      scrollBy: (degrees) => renderer?.map?.scrollBy(degrees),
      lookAt: (longitude, latitude, zoom) => renderer?.map?.lookAt(longitude, latitude, zoom),
      centerLongitude: () => renderer?.map?.centerLongitude() ?? null,
      zoom: () => renderer?.map?.zoom() ?? null,
      heading: () => {
        const heading = renderer?.map?.heading();
        return heading === undefined ? null : (heading * 180) / Math.PI;
      },
      tilt: () => {
        const tilt = renderer?.map?.tilt();
        return tilt === undefined ? null : (tilt * 180) / Math.PI;
      },
      isMoving: () => renderer?.map?.isMoving() ?? null,
      settle: () => renderer?.map?.settle(),
      setEdgeScrolling: (enabled) => renderer?.map?.setEdgeScrolling(enabled),
      selectedProvince: () => idOf(store.getState().selectedProvince),
      seaZoneAt: (longitude, latitude) =>
        seaZoneIdOf(renderer?.map?.seaZoneAt(longitude, latitude)),
      selectedSeaZone: () => seaZoneIdOf(store.getState().selectedSeaZone),
      sceneryProbe: (count) => renderer?.map?.sceneryProbe(count) ?? null,
    },
    gallery: {
      isComplete: () => renderer?.gallery?.isComplete() ?? null,
      stats: () => renderer?.gallery?.stats() ?? null,
      replaceWithFile(modelId, url) {
        renderer?.models?.replace(
          modelId,
          { source: 'file', file: 'models/debug.glb', scale: 1 },
          url,
        );
        renderer?.gallery?.rebuild();
      },
    },
    stress: {
      scene: () => stressTest?.scene() ?? null,
      live: () => stressTest?.live() ?? null,
      sim: () => stressTest?.sim() ?? null,
      goTo: (view) => stressTest?.goTo(view),
      setParts: (parts) => stressTest?.setParts(parts),
      runBenchmark: (timing) => stressTest?.runBenchmark(undefined, timing) ?? null,
    },
  };

  return {
    setRenderer(created) {
      renderer = created;
    },
    setStressTest(test) {
      stressTest = test;
    },
    recordEvents(received) {
      events.push(...received);
    },
  };
}
