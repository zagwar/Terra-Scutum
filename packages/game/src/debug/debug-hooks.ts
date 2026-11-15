import type { CommandResult, SimCommand, SimEvent, SimSnapshot } from '@terra-scutum/sim';
import type { AppState, AppStore } from '../app-store';
import type { GameRenderer } from '../render/game-renderer';
import type { MapStats } from '../render/map/map-view';
import type { TimeChange, TimeState } from '../worker/protocol';
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
