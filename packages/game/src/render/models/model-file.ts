import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { ModelGeometry, ModelGeometryPart } from './model-library';

/**
 * Loads a real model from a glTF file (F133, section 12.6 "Replacing assets
 * later"): a model entry `{ "source": "file", "file": "models/x.glb" }` in
 * `data/models.json`. Each mesh of the file becomes one part (with the
 * file's own material), its placement in the file baked into its corners,
 * so it can be drawn with thin instances like a generated model. The glTF
 * loader is only downloaded the first time a file model is needed.
 */
export async function loadModelFile(
  scene: Scene,
  url: string,
  scale: number,
): Promise<ModelGeometry> {
  // Registers the glTF loader (once).
  await import('@babylonjs/loaders/glTF/2.0');
  const extension = /\.gltf(\?|#|$)/i.test(url) ? '.gltf' : '.glb';
  const container = await LoadAssetContainerAsync(url, scene, { pluginExtension: extension });
  const parts: ModelGeometryPart[] = [];
  let height = 0;
  let radius = 0;
  let triangles = 0;
  const scaling = Matrix.Scaling(scale, scale, scale);
  for (const abstractMesh of container.meshes) {
    if (!(abstractMesh instanceof Mesh) || abstractMesh.getTotalVertices() === 0) continue;
    abstractMesh.computeWorldMatrix(true);
    const world = abstractMesh.getWorldMatrix().multiply(scaling);
    const vertexData = VertexData.ExtractFromMesh(abstractMesh, true, true).transform(world);
    // glTF is right-handed: the loader mirrors it, which turns the faces inside out. Turn them back.
    if (world.determinant() < 0 && vertexData.indices) {
      const indices = Array.from(vertexData.indices);
      for (let i = 0; i < indices.length; i += 3)
        [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
      vertexData.indices = indices;
    }
    const positions = vertexData.positions ?? [];
    for (let i = 0; i < positions.length; i += 3) {
      height = Math.max(height, positions[i + 1]);
      radius = Math.max(radius, Math.abs(positions[i]), Math.abs(positions[i + 2]));
    }
    triangles += (vertexData.indices?.length ?? 0) / 3;
    const material =
      abstractMesh.material ?? new StandardMaterial(`${abstractMesh.name}-material`, scene);
    parts.push({ vertexData, material });
  }
  // Keep the materials (and their textures) in the scene; the file's own meshes aren't needed.
  for (const material of container.materials) scene.addMaterial(material);
  for (const texture of container.textures) scene.addTexture(texture);
  for (const mesh of container.meshes) mesh.dispose(false, false);
  if (parts.length === 0) throw new Error(`${url}: the model file has no meshes`);
  return { parts, height, radius, triangles };
}
