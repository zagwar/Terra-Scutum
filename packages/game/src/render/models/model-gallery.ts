import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraMouseWheelInput';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { Scene } from '@babylonjs/core/scene';
import { DETAIL_LEVELS, type DetailLevel } from '@terra-scutum/sim';
import { writeInstanceMatrix } from '../scenery/scenery-placement';
import { type InstanceBatch, createInstancedModels, createModelLights } from './instanced-models';
import type { ModelLibrary } from './model-library';

/**
 * The model gallery (F133, `?debug=models`): every model of the library in
 * its three detail levels (icon, simple, detailed) and each of its seeded
 * variants side by side, so the designer can judge the generators up close.
 * Rows are models; each row is scaled so its tallest variant has the same
 * height on screen (the labels give the real sizes). Drawn with thin
 * instances, like the map's scenery. Drag to turn, wheel to zoom.
 */
export interface GalleryLabel {
  readonly kind: 'model' | 'detail';
  /** The model id (kind `model`), or the model id and detail level as `id:level` (kind `detail`). */
  readonly id: string;
  /** Where the label goes, in CSS pixels from the canvas's top-left corner; null when behind the camera. */
  readonly x: number;
  readonly y: number;
}

export interface GalleryModelStats {
  readonly modelId: string;
  readonly source: 'generator' | 'file';
  readonly variants: number;
  /** Triangles of variant 0 at each detail level (null while loading). */
  readonly triangles: Record<DetailLevel, number | null>;
  /** The tallest variant's height, in model units (metres). */
  readonly heightM: number | null;
}

export interface ModelGallery {
  labels(): GalleryLabel[];
  stats(): GalleryModelStats[];
  /** True once every model is drawn. */
  isComplete(): boolean;
  /** Builds the rows again (after `ModelLibrary.replace`). */
  rebuild(): void;
  dispose(): void;
}

/** The height every row is scaled to, in gallery units. */
const ROW_HEIGHT = 10;
/** From one detail level's row to the next, and the extra gap between two models, in gallery units. */
const MIN_DETAIL_SPACING = 13;
const MODEL_GAP = 9;

export function createModelGallery(
  scene: Scene,
  library: ModelLibrary,
  light: { towardLight: readonly [number, number, number]; ambient: number; sun: number },
): ModelGallery {
  scene.clearColor = new Color4(0.09, 0.11, 0.14, 1);
  const camera = new ArcRotateCamera(
    'gallery-camera',
    -Math.PI / 2,
    0.75,
    120,
    Vector3.Zero(),
    scene,
  );
  camera.lowerRadiusLimit = 10;
  camera.upperRadiusLimit = 400;
  camera.upperBetaLimit = Math.PI / 2 - 0.05;
  camera.wheelDeltaPercentage = 0.02;
  camera.minZ = 0.5;
  camera.maxZ = 5000;
  const canvas = scene.getEngine().getRenderingCanvas();
  if (canvas) camera.attachControl(canvas, true);
  scene.activeCamera = camera;
  const lights = createModelLights(scene, light.towardLight, light.ambient, light.sun);

  const ground = CreateGround('gallery-ground', { width: 4000, height: 4000 }, scene);
  const groundMaterial = new StandardMaterial('gallery-ground-material', scene);
  groundMaterial.diffuseColor = new Color3(0.32, 0.36, 0.3);
  groundMaterial.specularColor = Color3.Black();
  ground.material = groundMaterial;
  ground.isPickable = false;

  let drawn = createInstancedModels(scene, library, 'gallery', 0);
  let batches: (InstanceBatch & { detail: DetailLevel })[] = [];
  let labelSpots: { kind: GalleryLabel['kind']; id: string; at: Vector3 }[] = [];
  let modelStats: GalleryModelStats[] = [];
  let pending = 0;
  let widest = 0;
  let deepest = 0;
  let framed = false;
  /**
   * Points the camera so every row fits, the models a little to the right
   * (the information panel covers the left of the screen). Only once: after
   * that the designer moves the view.
   */
  const frame = () => {
    framed = true;
    const engine = scene.getEngine();
    const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
    const across = widest * 1.1;
    const halfFov = camera.fov / 2;
    const narrow = aspect < 1;
    // On a wide screen the panel covers about the left 30 %: fit the models into the rest.
    const free = narrow ? 1 : 0.7;
    camera.radius = Math.max(
      across / (2 * Math.tan(halfFov) * aspect * free),
      (deepest * 0.95) / (2 * Math.tan(halfFov) * (narrow ? 0.6 : 1)),
    );
    const visibleWidth = 2 * camera.radius * Math.tan(halfFov) * aspect;
    // Narrow screens have the panel above the models, wide ones to their left.
    // Keep the camera's turn and tilt (setting `target` directly would aim it anew).
    camera.setTarget(
      new Vector3(
        narrow ? 0 : -visibleWidth * 0.15,
        0,
        -deepest * 0.6 + (narrow ? deepest * 0.25 : 0),
      ),
      false,
      false,
      true,
    );
  };
  let generation = 0;

  const build = () => {
    // A model may have been replaced: start the drawn copies afresh (they hold the old geometry).
    if (generation > 0) {
      drawn.dispose();
      drawn = createInstancedModels(scene, library, 'gallery', 0);
    }
    generation += 1;
    const mine = generation;
    batches = [];
    labelSpots = [];
    const ids = library.modelIds();
    modelStats = ids.map((modelId) => ({
      modelId,
      source: library.source(modelId),
      variants: library.variants(modelId),
      triangles: { icon: null, simple: null, detailed: null },
      heightM: null,
    }));
    pending = ids.length;
    // Every geometry first: the sizes decide each row's scale and the shared spacing.
    const rows = ids.map((modelId) => {
      const variants = library.variants(modelId);
      return Promise.all(
        DETAIL_LEVELS.flatMap((detail) =>
          Array.from({ length: variants }, (_, variant) =>
            library
              .geometry(modelId, variant, detail)
              .then((geometry) => ({ detail, variant, geometry })),
          ),
        ),
      ).then(
        (made) => {
          pending -= 1;
          return { modelId, variants, made };
        },
        (error: unknown) => {
          console.error(`gallery: model ${modelId}:`, error);
          pending -= 1;
          return null;
        },
      );
    });
    void Promise.all(rows).then((loaded) => {
      if (mine !== generation) return;
      const ready = loaded.filter((row) => row !== null);
      const sized = ready.map((row) => {
        const height = Math.max(...row.made.map((m) => m.geometry.height), 0.001);
        const radius = Math.max(...row.made.map((m) => m.geometry.radius), 0.001);
        return { ...row, height, scale: ROW_HEIGHT / height, radius };
      });
      // One grid for all models: a block of three rows (the detail levels) per model,
      // each row the model's variants side by side.
      const step = Math.max(4, ...sized.map((row) => row.radius * row.scale * 2.4));
      const columns = Math.max(1, ...sized.map((row) => row.variants));
      const totalWidth = step * columns;
      // Rows far enough apart for the widest model (tree clumps are wide).
      const DETAIL_SPACING = Math.max(MIN_DETAIL_SPACING, step);
      const blockDepth = DETAIL_LEVELS.length * DETAIL_SPACING + MODEL_GAP;
      widest = totalWidth;
      deepest = sized.length * blockDepth - MODEL_GAP;
      sized.forEach((row, rowIndex) => {
        const blockZ = -rowIndex * blockDepth;
        DETAIL_LEVELS.forEach((detail, d) =>
          labelSpots.push({
            kind: 'detail',
            id: `${row.modelId}:${detail}`,
            at: new Vector3(totalWidth / 2 + 1, ROW_HEIGHT * 0.3, blockZ - d * DETAIL_SPACING),
          }),
        );
        for (const { detail, variant, geometry } of row.made) {
          const x = -totalWidth / 2 + (variant + 0.5) * step;
          const z = blockZ - DETAIL_LEVELS.indexOf(detail) * DETAIL_SPACING;
          const batch = {
            modelId: row.modelId,
            variant,
            detail,
            matrices: new Float32Array(16),
            colors: null,
            count: 1,
            version: 0,
          };
          writeInstanceMatrix(batch.matrices, 0, x, 0, z, row.scale, 0.6);
          batches.push(batch);
          if (variant === 0) {
            const index = ids.indexOf(row.modelId);
            const stats = modelStats[index];
            modelStats[index] = {
              ...stats,
              triangles: { ...stats.triangles, [detail]: geometry.triangles },
              heightM: row.height,
            };
          }
        }
        labelSpots.push({
          kind: 'model',
          id: row.modelId,
          at: new Vector3(-totalWidth / 2 - 1, ROW_HEIGHT * 0.3, blockZ - DETAIL_SPACING),
        });
      });
      if (!framed) frame();
    });
  };
  build();

  const beforeRender = scene.onBeforeRenderObservable.add(() => {
    drawn.show(batches, (batch) => (batch as InstanceBatch & { detail: DetailLevel }).detail);
  });

  return {
    labels() {
      const engine = scene.getEngine();
      const width = engine.getRenderWidth();
      const height = engine.getRenderHeight();
      const scaling = engine.getHardwareScalingLevel();
      const transform = scene.getTransformMatrix();
      const viewport = camera.viewport.toGlobal(width, height);
      return labelSpots.flatMap((spot) => {
        const projected = Vector3.Project(spot.at, Matrix.IdentityReadOnly, transform, viewport);
        if (projected.z < 0 || projected.z > 1) return [];
        return [
          { kind: spot.kind, id: spot.id, x: projected.x * scaling, y: projected.y * scaling },
        ];
      });
    },
    stats: () => modelStats,
    isComplete: () =>
      pending === 0 && batches.length > 0 && drawn.stats().instances === batches.length,
    rebuild: build,
    dispose() {
      scene.onBeforeRenderObservable.remove(beforeRender);
      drawn.dispose();
      lights.dispose();
      ground.dispose();
      groundMaterial.dispose();
      camera.dispose();
    },
  };
}
