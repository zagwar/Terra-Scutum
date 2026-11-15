import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Scene } from '@babylonjs/core/scene';
import type { MapViewConfig, ModelsConfig, TerrainTilesFile, WorldMap } from '@terra-scutum/sim';
import { type RendererPreference, type RendererType, createEngine } from './create-engine';
import { type MapView, type MapViewEvents, createMapView } from './map/map-view';
import { type ModelGallery, createModelGallery } from './models/model-gallery';
import { type ModelLibrary, createModelLibrary } from './models/model-library';

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
    models: ModelsConfig,
    events: MapViewEvents,
  ): Promise<MapView>;
  /** The model library (F133), once `showMap` or `showGallery` made it. */
  readonly models: ModelLibrary | null;
  /** Shows the model gallery (`?debug=models`) instead of the map. */
  showGallery(models: ModelsConfig, config: MapViewConfig): ModelGallery;
  /** The model gallery, once `showGallery` has made it. */
  readonly gallery: ModelGallery | null;
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
  let models: ModelLibrary | null = null;
  let gallery: ModelGallery | null = null;
  const libraryFor = (config: ModelsConfig) => {
    models ??= createModelLibrary(scene, config);
    return models;
  };

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
    get models() {
      return models;
    },
    get gallery() {
      return gallery;
    },
    showGallery(modelsConfig, config) {
      gallery?.dispose();
      const { lightAzimuthDegrees, lightElevationDegrees } = config.terrain;
      const azimuth = (lightAzimuthDegrees * Math.PI) / 180;
      const elevation = (lightElevationDegrees * Math.PI) / 180;
      gallery = createModelGallery(scene, libraryFor(modelsConfig), {
        towardLight: [
          Math.sin(azimuth) * Math.cos(elevation),
          Math.sin(elevation),
          Math.cos(azimuth) * Math.cos(elevation),
        ],
        ambient: config.scenery.ambientLight,
        sun: config.scenery.sunLight,
      });
      return gallery;
    },
    async showMap(world, config, terrainTiles, modelsConfig, events) {
      map?.dispose();
      map = null;
      map = await createMapView(
        scene,
        world,
        config,
        terrainTiles,
        libraryFor(modelsConfig),
        events,
      );
      return map;
    },
    getFrameCount: () => frameCount,
    getFps: () => engine.getFps(),
    dispose() {
      resizeObserver.disconnect();
      engine.stopRenderLoop();
      map?.dispose();
      gallery?.dispose();
      models?.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
