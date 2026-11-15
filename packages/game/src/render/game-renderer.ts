import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Scene } from '@babylonjs/core/scene';
import type { MapViewConfig, TerrainTilesFile, WorldMap } from '@terra-scutum/sim';
import { type RendererPreference, type RendererType, createEngine } from './create-engine';
import { type MapView, type MapViewEvents, createMapView } from './map/map-view';

export interface GameRendererOptions {
  readonly preference: RendererPreference;
}

/** The 3D view: owns the Babylon engine, its canvas and the scene being shown. */
export interface GameRenderer {
  readonly type: RendererType;
  /** The world map, once `showMap` has finished. */
  readonly map: MapView | null;
  /** Loads the map's shapes and puts the world map in the scene. */
  showMap(
    world: WorldMap,
    config: MapViewConfig,
    terrainTiles: TerrainTilesFile,
    events: MapViewEvents,
  ): Promise<MapView>;
  /** How many frames have been drawn (used by tests to know the scene is really rendering). */
  getFrameCount(): number;
  /** Frames per second, averaged over the last second or so. */
  getFps(): number;
  dispose(): void;
}

export async function createGameRenderer(
  container: HTMLElement,
  options: GameRendererOptions,
): Promise<GameRenderer> {
  const { engine, type } = await createEngine(container, options.preference);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.03, 0.05, 1);
  let map: MapView | null = null;

  let frameCount = 0;
  engine.runRenderLoop(() => {
    // Nothing to draw until the map (and its camera) exists.
    if (!scene.activeCamera) return;
    scene.render();
    frameCount += 1;
  });

  const resizeObserver = new ResizeObserver(() => engine.resize());
  resizeObserver.observe(container);

  return {
    type,
    get map() {
      return map;
    },
    async showMap(world, config, terrainTiles, events) {
      map?.dispose();
      map = null;
      map = await createMapView(scene, world, config, terrainTiles, events);
      return map;
    },
    getFrameCount: () => frameCount,
    getFps: () => engine.getFps(),
    dispose() {
      resizeObserver.disconnect();
      engine.stopRenderLoop();
      map?.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
