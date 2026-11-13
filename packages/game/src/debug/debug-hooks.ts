import type { CommandResult, SimCommand, SimEvent, SimSnapshot } from '@terra-scutum/sim';
import type { AppState, AppStore } from '../app-store';
import type { GameRenderer } from '../render/game-renderer';
import type { MapStats } from '../render/map/map-view';
import type { SimClient } from '../worker/sim-client';

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
  step(days: number): Promise<SimSnapshot>;
  sendCommand(command: SimCommand): Promise<CommandResult>;
  /** Every sim event received since the game started. */
  readonly events: SimEvent[];
  /** The world map; these all return null until it has loaded. */
  readonly map: {
    stats(): MapStats | null;
    /** The id of the province at a longitude/latitude; null for the sea. */
    provinceAt(longitude: number, latitude: number): string | null;
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
    /** The id of the selected province, or null. */
    selectedProvince(): string | null;
  };
}

declare global {
  interface Window {
    __terraScutum?: DebugApi;
  }
}

export interface DebugHooks {
  setRenderer(renderer: GameRenderer): void;
  recordEvents(events: readonly SimEvent[]): void;
}

export function installDebugHooks(store: AppStore, sim: SimClient): DebugHooks {
  let renderer: GameRenderer | null = null;
  const events: SimEvent[] = [];
  const idOf = (province: number | null | undefined): string | null =>
    province === null || province === undefined || province < 0
      ? null
      : (store.getState().world?.provinceIds[province] ?? null);

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
    sendCommand: (command) => sim.sendCommand(command),
    events,
    map: {
      stats: () => renderer?.map?.getStats() ?? null,
      provinceAt: (longitude, latitude) => idOf(renderer?.map?.provinceAt(longitude, latitude)),
      screenPosition: (longitude, latitude) =>
        renderer?.map?.screenPosition(longitude, latitude) ?? null,
      placeAt: (x, y) => renderer?.map?.placeAt(x, y) ?? null,
      scrollBy: (degrees) => renderer?.map?.scrollBy(degrees),
      lookAt: (longitude, latitude, zoom) => renderer?.map?.lookAt(longitude, latitude, zoom),
      centerLongitude: () => renderer?.map?.centerLongitude() ?? null,
      zoom: () => renderer?.map?.zoom() ?? null,
      selectedProvince: () => idOf(store.getState().selectedProvince),
    },
  };

  return {
    setRenderer(created) {
      renderer = created;
    },
    recordEvents(received) {
      events.push(...received);
    },
  };
}
