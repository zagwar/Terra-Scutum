import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Material } from '@babylonjs/core/Materials/material';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { DetailLevel, ModelEntry, ModelMaterial, ModelsConfig } from '@terra-scutum/sim';
import { generateModel, triangleCount, variantSeed } from '../../generators/generators';
import { PATTERN_PIXELS, materialPixels, parseHexColor } from '../../generators/material-patterns';
import { loadModelFile } from './model-file';

/**
 * The model library (F133, section 12.6): every model the game shows is
 * looked up here by its id in `data/models.json`. A generated model is made
 * by its generator from the spec and a seed per variant; a model from a file
 * is loaded (glTF). Either way the result looks the same to the rest of the
 * game (`ModelGeometry`), so a generated model can be replaced by a real one
 * by changing its data entry, and nothing else.
 *
 * Geometry and materials are made once, the first time they're asked for,
 * and shared: each user (the map's scenery, the gallery) makes its own
 * meshes from them with `createModelMeshes`, to draw them with thin instances.
 */
export interface ModelGeometryPart {
  readonly vertexData: VertexData;
  readonly material: Material;
}

/** One detail level of one variant of a model, ready to be drawn. */
export interface ModelGeometry {
  readonly parts: readonly ModelGeometryPart[];
  /** Height and sideways reach, in model units (metres). */
  readonly height: number;
  readonly radius: number;
  readonly triangles: number;
}

export interface ModelLibrary {
  /** The model ids in the data. */
  modelIds(): string[];
  /** How many variants a model has (a model from a file has one). */
  variants(modelId: string): number;
  /** Where the model comes from (for the gallery's labels). */
  source(modelId: string): ModelEntry['source'];
  /** The geometry of one detail level of one variant. Generated models are ready at once; files load. */
  geometry(modelId: string, variant: number, detail: DetailLevel): Promise<ModelGeometry>;
  /**
   * Replaces a model's entry (debug and tests: try a model file in place of a
   * generated model). `fileUrl` may be any address the browser can fetch.
   */
  replace(modelId: string, entry: ModelEntry, fileUrl?: string): void;
  dispose(): void;
}

export function createModelLibrary(scene: Scene, config: ModelsConfig): ModelLibrary {
  const entries = new Map<string, { entry: ModelEntry; fileUrl?: string }>(
    Object.entries(config.models).map(([id, entry]) => [id, { entry }]),
  );
  const materials = new Map<string, StandardMaterial>();
  const textures: RawTexture[] = [];
  const cache = new Map<string, Promise<ModelGeometry>>();
  const fileMaterials: Material[] = [];

  const material = (id: string): StandardMaterial => {
    let made = materials.get(id);
    if (!made) {
      const spec = config.materials[id];
      if (!spec) throw new Error(`models.json: unknown material "${id}"`);
      made = createProceduralMaterial(scene, id, spec, textures);
      materials.set(id, made);
    }
    return made;
  };

  const lookup = (modelId: string) => {
    const found = entries.get(modelId);
    if (!found) throw new Error(`models.json: unknown model "${modelId}"`);
    return found;
  };

  const build = async (
    modelId: string,
    variant: number,
    detail: DetailLevel,
  ): Promise<ModelGeometry> => {
    const { entry, fileUrl } = lookup(modelId);
    if (entry.source === 'file') {
      const url = fileUrl ?? new URL(entry.file, document.baseURI).toString();
      const loaded = await loadModelFile(scene, url, entry.scale);
      fileMaterials.push(...loaded.parts.map((part) => part.material));
      return loaded;
    }
    const model = generateModel(entry, variantSeed(modelId, variant), detail);
    return {
      parts: model.parts.map((part) => {
        const vertexData = new VertexData();
        vertexData.positions = part.mesh.positions;
        vertexData.normals = part.mesh.normals;
        vertexData.uvs = part.mesh.uvs;
        // The generators wind triangles counter-clockwise (seen from outside, right-handed);
        // Babylon's left-handed scene treats clockwise as the front: swap each triangle's last two corners.
        const indices = new Uint32Array(part.mesh.indices.length);
        for (let i = 0; i < indices.length; i += 3) {
          indices[i] = part.mesh.indices[i];
          indices[i + 1] = part.mesh.indices[i + 2];
          indices[i + 2] = part.mesh.indices[i + 1];
        }
        vertexData.indices = indices;
        return { vertexData, material: material(part.material) };
      }),
      height: model.height,
      radius: model.radius,
      triangles: triangleCount(model),
    };
  };

  return {
    modelIds: () => [...entries.keys()],
    variants: (modelId) => {
      const { entry } = lookup(modelId);
      return entry.source === 'file' ? 1 : entry.variants;
    },
    source: (modelId) => lookup(modelId).entry.source,
    geometry(modelId, variant, detail) {
      const { entry } = lookup(modelId);
      // A file has one variant and one detail level for all.
      const key = entry.source === 'file' ? `${modelId}` : `${modelId}/${variant}/${detail}`;
      let geometry = cache.get(key);
      if (!geometry) {
        geometry = build(modelId, variant, detail);
        cache.set(key, geometry);
      }
      return geometry;
    },
    replace(modelId, entry, fileUrl) {
      entries.set(modelId, { entry, fileUrl });
      for (const key of [...cache.keys()])
        if (key === modelId || key.startsWith(`${modelId}/`)) cache.delete(key);
    },
    dispose() {
      for (const made of materials.values()) made.dispose();
      for (const texture of textures) texture.dispose();
      for (const made of fileMaterials) made.dispose();
      materials.clear();
      cache.clear();
    },
  };
}

/**
 * A procedural material (section 12.6): its pattern is drawn by code into a
 * small repeating picture (`materialPixels`); roughness and metal set the
 * shine. Thin instances may tint it (their color multiplies it).
 */
function createProceduralMaterial(
  scene: Scene,
  id: string,
  spec: ModelMaterial,
  textures: RawTexture[],
): StandardMaterial {
  const made = new StandardMaterial(`model-material-${id}`, scene);
  const texture = RawTexture.CreateRGBATexture(
    materialPixels(spec, id),
    PATTERN_PIXELS,
    PATTERN_PIXELS,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  // Texture coordinates are in model units: one repeat of the pattern covers `size` of them.
  texture.uScale = 1 / spec.pattern.size;
  texture.vScale = 1 / spec.pattern.size;
  textures.push(texture);
  made.diffuseTexture = texture;
  made.diffuseColor = Color3.White();
  const [r, g, b] = parseHexColor(spec.color);
  const shine = (1 - spec.roughness) * 0.35;
  // Metal shines in its own color, anything else in white.
  made.specularColor = new Color3(
    shine * (1 - spec.metallic + spec.metallic * r * 2),
    shine * (1 - spec.metallic + spec.metallic * g * 2),
    shine * (1 - spec.metallic + spec.metallic * b * 2),
  );
  made.specularPower = 8 + (1 - spec.roughness) * 56;
  return made;
}

/**
 * Makes one mesh per part of a model's geometry, for drawing with thin
 * instances. The meshes start with no instances (nothing drawn).
 */
export function createModelMeshes(scene: Scene, name: string, geometry: ModelGeometry): Mesh[] {
  return geometry.parts.map((part, index) => {
    const mesh = new Mesh(`${name}-${index}`, scene);
    part.vertexData.applyToMesh(mesh, false);
    mesh.material = part.material;
    mesh.isPickable = false;
    // The users place instances only where the camera looks: no culling work per frame.
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.doNotSyncBoundingInfo = true;
    mesh.thinInstanceSetBuffer('matrix', new Float32Array(16), 16, false);
    mesh.thinInstanceCount = 0;
    return mesh;
  });
}
