import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { DetailLevel } from '@terra-scutum/sim';
import { type ModelGeometry, type ModelLibrary, createModelMeshes } from './model-library';

/**
 * Many copies of models drawn with thin instances (F133): one draw call per
 * model variant, detail level and material, however many copies there are.
 *
 * The user (the map's scenery, the gallery) keeps one batch per model
 * variant: a buffer of instance matrices (16 numbers each, Babylon's
 * layout), optionally one of colors (4 numbers each, they tint the
 * material), and a count. It writes them, bumps `version` when they changed,
 * and calls `show` with the detail level to draw them at.
 */
export interface InstanceBatch {
  readonly modelId: string;
  readonly variant: number;
  matrices: Float32Array;
  colors: Float32Array | null;
  count: number;
  /** Increase when the buffers' content changed, so it is sent to the graphics card again. */
  version: number;
}

export interface InstancedModelsStats {
  readonly instances: number;
  /** Meshes drawn (each is one draw call). */
  readonly drawCalls: number;
  readonly triangles: number;
}

export interface InstancedModels {
  /** Draws these batches (and nothing else), each at `detail`. Models still loading are drawn once ready. */
  show(batches: readonly InstanceBatch[], detail: (batch: InstanceBatch) => DetailLevel): void;
  stats(): InstancedModelsStats;
  dispose(): void;
}

interface Bucket {
  meshes: Mesh[] | null;
  geometry: ModelGeometry | null;
  matrices: Float32Array | null;
  colors: Float32Array | null;
  version: number;
  shown: number;
}

export function createInstancedModels(
  scene: Scene,
  library: ModelLibrary,
  name: string,
  renderingGroup: number,
): InstancedModels {
  const buckets = new Map<string, Bucket>();
  let disposed = false;
  let lastStats: InstancedModelsStats = { instances: 0, drawCalls: 0, triangles: 0 };

  const bucketFor = (modelId: string, variant: number, detail: DetailLevel): Bucket => {
    const key = `${modelId}/${variant}/${detail}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      const made: Bucket = {
        meshes: null,
        geometry: null,
        matrices: null,
        colors: null,
        version: -1,
        shown: 0,
      };
      bucket = made;
      buckets.set(key, made);
      library.geometry(modelId, variant, detail).then(
        (geometry) => {
          if (disposed) return;
          made.geometry = geometry;
          made.meshes = createModelMeshes(scene, `${name}-${key}`, geometry);
          for (const mesh of made.meshes) {
            mesh.renderingGroupId = renderingGroup;
            mesh.setEnabled(false);
          }
        },
        (error: unknown) => console.error(`model ${modelId}:`, error),
      );
    }
    return bucket;
  };

  const hide = (bucket: Bucket) => {
    if (bucket.shown === 0 || !bucket.meshes) return;
    for (const mesh of bucket.meshes) {
      mesh.thinInstanceCount = 0;
      mesh.setEnabled(false);
    }
    bucket.shown = 0;
    // Shown again later, its instances must be sent again.
    bucket.version = -1;
  };

  return {
    show(batches, detailOf) {
      const used = new Set<Bucket>();
      let instances = 0;
      let drawCalls = 0;
      let triangles = 0;
      for (const batch of batches) {
        if (batch.count === 0) continue;
        const bucket = bucketFor(batch.modelId, batch.variant, detailOf(batch));
        used.add(bucket);
        if (!bucket.meshes || !bucket.geometry) continue;
        const newBuffers = bucket.matrices !== batch.matrices || bucket.colors !== batch.colors;
        for (const mesh of bucket.meshes) {
          if (newBuffers) {
            mesh.thinInstanceSetBuffer('matrix', batch.matrices, 16, false);
            if (batch.colors) mesh.thinInstanceSetBuffer('color', batch.colors, 4, false);
            mesh.thinInstanceCount = batch.count;
          } else if (bucket.version !== batch.version) {
            // The count first: Babylon sends only as many instances as the mesh has right now.
            mesh.thinInstanceCount = batch.count;
            mesh.thinInstanceBufferUpdated('matrix');
            if (batch.colors) mesh.thinInstanceBufferUpdated('color');
          } else {
            mesh.thinInstanceCount = batch.count;
          }
          mesh.setEnabled(true);
        }
        bucket.matrices = batch.matrices;
        bucket.colors = batch.colors;
        bucket.version = batch.version;
        bucket.shown = batch.count;
        instances += batch.count;
        drawCalls += bucket.meshes.length;
        triangles += batch.count * bucket.geometry.triangles;
      }
      for (const bucket of buckets.values()) if (!used.has(bucket)) hide(bucket);
      lastStats = { instances, drawCalls, triangles };
    },
    stats: () => lastStats,
    dispose() {
      disposed = true;
      for (const bucket of buckets.values()) for (const mesh of bucket.meshes ?? []) mesh.dispose();
      buckets.clear();
    },
  };
}

/**
 * The light for models (the land has its own shading): a soft light from the
 * sky and a sun from the same direction as the land's light.
 */
export function createModelLights(
  scene: Scene,
  towardLight: readonly [number, number, number],
  ambient: number,
  sun: number,
): { dispose(): void } {
  const sky = new HemisphericLight('model-sky-light', new Vector3(0, 1, 0), scene);
  sky.intensity = ambient;
  sky.groundColor = new Color3(0.55, 0.55, 0.6);
  sky.specular = Color3.Black();
  const sunLight = new DirectionalLight(
    'model-sun-light',
    new Vector3(-towardLight[0], -towardLight[1], -towardLight[2]),
    scene,
  );
  sunLight.intensity = sun;
  return {
    dispose() {
      sky.dispose();
      sunLight.dispose();
    },
  };
}
