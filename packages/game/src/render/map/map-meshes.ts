import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import '@babylonjs/core/Engines/Extensions/engine.rawTexture';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.rawTexture';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { FillGeometry, LineGeometry } from './map-geometry';

/**
 * Babylon meshes for the map layers. Each layer (all provinces, all sea
 * zones, one kind of border) is a single mesh, so the whole map is a handful
 * of draw calls however many provinces there are.
 */

/**
 * A texture with one pixel per province (or sea zone). The fill mesh looks
 * its colors up here, so recoloring the map is a tiny texture update.
 */
export interface ColorTable {
  readonly texture: RawTexture;
  /** How many pixels wide the texture is (at least the number of items). */
  readonly width: number;
  /** Replaces all colors: r, g, b, a bytes per item. */
  update(colors: Uint8Array): void;
  dispose(): void;
}

export function createColorTable(name: string, scene: Scene, itemCount: number): ColorTable {
  let width = 64;
  while (width < itemCount) width *= 2;
  if (width > scene.getEngine().getCaps().maxTextureSize)
    throw new Error(`the map has too many items (${itemCount}) for one color table`);
  const data = new Uint8Array(width * 4);
  const texture = new RawTexture(
    data,
    width,
    1,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Constants.TEXTURE_NEAREST_SAMPLINGMODE,
  );
  texture.name = name;
  texture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  return {
    texture,
    width,
    update(colors) {
      data.set(colors);
      texture.update(data);
    },
    dispose: () => texture.dispose(),
  };
}

/** An unlit material that takes its color from a color table. */
export function createFillMaterial(name: string, scene: Scene, table: ColorTable): Material {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveTexture = table.texture;
  material.backFaceCulling = false;
  // The map is flat: layers are drawn in a fixed order instead of being depth-tested.
  material.disableDepthWrite = true;
  material.depthFunction = Constants.ALWAYS;
  return material;
}

function finishMapMesh(mesh: Mesh, material: Material, renderingGroup: number): void {
  mesh.material = material;
  mesh.renderingGroupId = renderingGroup;
  mesh.isPickable = false; // picking goes through the shape lookup, not the meshes
}

export function createFillMesh(
  name: string,
  scene: Scene,
  geometry: FillGeometry,
  table: ColorTable,
  material: Material,
  renderingGroup: number,
): Mesh {
  const vertexCount = geometry.vertexItems.length;
  // Every vertex points at its province's pixel in the color table.
  const uvs = new Float32Array(vertexCount * 2);
  for (let i = 0; i < vertexCount; i++) {
    uvs[i * 2] = (geometry.vertexItems[i] + 0.5) / table.width;
    uvs[i * 2 + 1] = 0.5;
  }
  const mesh = new Mesh(name, scene);
  mesh.setVerticesData(VertexBuffer.PositionKind, geometry.positions);
  mesh.setVerticesData(VertexBuffer.UVKind, uvs);
  mesh.setIndices(geometry.indices, vertexCount);
  finishMapMesh(mesh, material, renderingGroup);
  return mesh;
}

export function createLineMesh(
  name: string,
  scene: Scene,
  geometry: LineGeometry,
  material: Material,
  renderingGroup: number,
  drawOrder: number,
): Mesh {
  const engine = scene.getEngine();
  const mesh = new Mesh(name, scene);
  mesh.setVerticesData(VertexBuffer.PositionKind, geometry.positions);
  mesh.setVerticesBuffer(
    new VertexBuffer(engine, geometry.neighbors, 'neighbors', false, false, 4),
  );
  // Province borders change kind when provinces change owner (see `uploadLineKinds`).
  const kindsCanChange = geometry.borders.length > 0;
  mesh.setVerticesBuffer(
    new VertexBuffer(engine, geometry.sideAndKind, 'sideAndKind', kindsCanChange, false, 2),
  );
  mesh.setIndices(geometry.indices, geometry.sideAndKind.length / 2);
  finishMapMesh(mesh, material, renderingGroup);
  // Lines are see-through, so they're drawn after the fills, in this order.
  mesh.alphaIndex = drawOrder;
  return mesh;
}

/** Sends a line mesh its geometry's `sideAndKind` again, after `updateBorderKinds` changed it. */
export function uploadLineKinds(mesh: Mesh, geometry: LineGeometry): void {
  mesh.getVertexBuffer('sideAndKind')?.update(geometry.sideAndKind);
}

/**
 * Puts a copy of a mesh one world-width to the west and one to the east, so
 * the map continues past its edges (it wraps east–west). The copies share the
 * original's geometry: no extra memory.
 */
export function addWrapCopies(mesh: Mesh, worldWidth: number): Mesh[] {
  const copies = [-1, 1].map((direction) => {
    const copy = mesh.clone(`${mesh.name}-${direction < 0 ? 'west' : 'east'}`);
    copy.position.x = direction * worldWidth;
    copy.renderingGroupId = mesh.renderingGroupId;
    copy.alphaIndex = mesh.alphaIndex;
    copy.isPickable = false;
    return copy;
  });
  return [mesh, ...copies];
}
