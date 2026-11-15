import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/meshUboDeclaration';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/sceneUboDeclaration';
import type { Scene } from '@babylonjs/core/scene';

/**
 * The material of the land (F125): one per terrain tile.
 *
 * For every pixel it mixes three things:
 * - the ground: the tile's ground picture (a generated color per land cover
 *   class, see `buildGroundPixels`), with a generated surface pattern up
 *   close, and edges between land types that wander a little so the land
 *   cover's cells don't show as squares;
 * - the map mode's color of the pixel's province (row 0 of the color table),
 *   as strongly as `colorStrength` says (it fades as the view zooms in);
 * - the province's highlight (row 1 of the color table: selection, hover…),
 *   as strongly as its alpha says.
 * Then it lights the result from the tile's slope picture (`buildSlopePixels`).
 *
 * The vertex shader raises the land: heights are stored at real scale and
 * multiplied by `heightScale` (the exaggeration of the moment).
 *
 * The shader exists twice because the game runs on two renderers: GLSL for
 * WebGL 2, WGSL for WebGPU. Change both together.
 */
const SHADER_NAME = 'terrainLand';

const VERTEX_GLSL = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float heightScale;
uniform vec4 tileRect;
varying vec2 vTable;
varying vec2 vTile;
varying vec2 vCell;

void main() {
  vTable = uv;
  vTile = (position.xz - tileRect.xy) * tileRect.z;
  vCell = position.xz * tileRect.w;
  gl_Position = viewProjection * world * vec4(position.x, position.y * heightScale, position.z, 1.0);
}
`;

const FRAGMENT_GLSL = `
precision highp float;
uniform sampler2D colorTable;
uniform sampler2D slopeMap;
uniform sampler2D groundMap;
uniform float heightScale;
uniform float tileCells;
uniform vec4 colorMix;
uniform vec3 lightDirection;
uniform vec3 shading;
varying vec2 vTable;
varying vec2 vTile;
varying vec2 vCell;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 cell = vTile * tileCells;
  vec2 wander = vec2(0.0);
  float pattern = 0.0;
  if (colorMix.y > 0.0 || colorMix.z > 0.0) {
    vec2 coarse = vec2(valueNoise(vCell * 0.8), valueNoise(vCell * 0.8 + vec2(37.2, 11.7)));
    vec2 fine = vec2(valueNoise(vCell * 2.6 + vec2(5.3, 71.9)), valueNoise(vCell * 2.6 + vec2(91.1, 47.9)));
    wander = ((coarse - 0.5) * 2.0 + (fine - 0.5)) * colorMix.z;
    pattern = (valueNoise(vCell * 6.0) * 0.55 + valueNoise(vCell * 17.0) * 0.45 - 0.5) * 2.0 * colorMix.y;
  }
  vec4 ground = texture2D(groundMap, (cell + wander + 2.0) / (tileCells + 4.0));
  vec3 terrain = ground.rgb * (1.0 + pattern * ground.a);

  vec3 base = texture2D(colorTable, vec2(vTable.x, 0.25)).rgb;
  vec4 highlight = texture2D(colorTable, vec2(vTable.x, 0.75));
  vec3 color = mix(terrain, base, colorMix.x);
  color = mix(color, highlight.rgb, highlight.a);

  vec2 stored = texture2D(slopeMap, (cell + 0.5) / (tileCells + 1.0)).xy * 2.0 - 1.0;
  vec2 slope = stored * abs(stored) * heightScale;
  vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
  float shade = clamp(1.0 + shading.x * (dot(normal, lightDirection) - lightDirection.y), shading.y, shading.z);
  gl_FragColor = vec4(color * shade, 1.0);
}
`;

const VERTEX_WGSL = `
#include<sceneUboDeclaration>
#include<meshUboDeclaration>
attribute position: vec3f;
attribute uv: vec2f;
uniform heightScale: f32;
uniform tileRect: vec4f;
varying vTable: vec2f;
varying vTile: vec2f;
varying vCell: vec2f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let point: vec3f = vertexInputs.position;
  vertexOutputs.vTable = vertexInputs.uv;
  vertexOutputs.vTile = (point.xz - uniforms.tileRect.xy) * uniforms.tileRect.z;
  vertexOutputs.vCell = point.xz * uniforms.tileRect.w;
  vertexOutputs.position = scene.viewProjection * mesh.world * vec4f(point.x, point.y * uniforms.heightScale, point.z, 1.0);
}
`;

const FRAGMENT_WGSL = `
uniform heightScale: f32;
uniform tileCells: f32;
uniform colorMix: vec4f;
uniform lightDirection: vec3f;
uniform shading: vec3f;
var colorTableSampler: sampler;
var colorTable: texture_2d<f32>;
var slopeMapSampler: sampler;
var slopeMap: texture_2d<f32>;
var groundMapSampler: sampler;
var groundMap: texture_2d<f32>;
varying vTable: vec2f;
varying vTile: vec2f;
varying vCell: vec2f;

fn hash(p: vec2f) -> f32 {
  var q: vec3f = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  q = q + dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

fn valueNoise(p: vec2f) -> f32 {
  let i: vec2f = floor(p);
  let f: vec2f = fract(p);
  let u: vec2f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
             mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x), u.y);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let cell: vec2f = fragmentInputs.vTile * uniforms.tileCells;
  let at: vec2f = fragmentInputs.vCell;
  var wander: vec2f = vec2f(0.0, 0.0);
  var pattern: f32 = 0.0;
  if (uniforms.colorMix.y > 0.0 || uniforms.colorMix.z > 0.0) {
    let coarse: vec2f = vec2f(valueNoise(at * 0.8), valueNoise(at * 0.8 + vec2f(37.2, 11.7)));
    let fine: vec2f = vec2f(valueNoise(at * 2.6 + vec2f(5.3, 71.9)), valueNoise(at * 2.6 + vec2f(91.1, 47.9)));
    wander = ((coarse - 0.5) * 2.0 + (fine - 0.5)) * uniforms.colorMix.z;
    pattern = (valueNoise(at * 6.0) * 0.55 + valueNoise(at * 17.0) * 0.45 - 0.5) * 2.0 * uniforms.colorMix.y;
  }
  let ground: vec4f = textureSample(groundMap, groundMapSampler, (cell + wander + 2.0) / (uniforms.tileCells + 4.0));
  let terrain: vec3f = ground.rgb * (1.0 + pattern * ground.a);

  let base: vec3f = textureSample(colorTable, colorTableSampler, vec2f(fragmentInputs.vTable.x, 0.25)).rgb;
  let highlight: vec4f = textureSample(colorTable, colorTableSampler, vec2f(fragmentInputs.vTable.x, 0.75));
  var color: vec3f = mix(terrain, base, uniforms.colorMix.x);
  color = mix(color, highlight.rgb, highlight.a);

  let stored: vec2f = textureSample(slopeMap, slopeMapSampler, (cell + 0.5) / (uniforms.tileCells + 1.0)).xy * 2.0 - 1.0;
  let slope: vec2f = stored * abs(stored) * uniforms.heightScale;
  let normal: vec3f = normalize(vec3f(-slope.x, 1.0, -slope.y));
  let shade: f32 = clamp(1.0 + uniforms.shading.x * (dot(normal, uniforms.lightDirection) - uniforms.lightDirection.y), uniforms.shading.y, uniforms.shading.z);
  fragmentOutputs.color = vec4f(color * shade, 1.0);
}
`;

ShaderStore.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX_GLSL;
ShaderStore.ShadersStore[`${SHADER_NAME}PixelShader`] = FRAGMENT_GLSL;
ShaderStore.ShadersStoreWGSL[`${SHADER_NAME}VertexShader`] = VERTEX_WGSL;
ShaderStore.ShadersStoreWGSL[`${SHADER_NAME}PixelShader`] = FRAGMENT_WGSL;

/** What changes with the view, the same for every tile. */
export interface LandLook {
  /** Heights (stored at real scale) are multiplied by this. */
  readonly heightScale: number;
  /** How much of the map mode's color covers the terrain: 0…1. */
  readonly colorStrength: number;
  /** How strongly the generated surface pattern shows: 0 = off. */
  readonly detailStrength: number;
  /** How far the edges between land types wander, in land cover cells: 0 = off. */
  readonly wander: number;
}

/** What never changes for the map: where the light comes from and how strong the shading is. */
export interface LandLight {
  /** The direction towards the light (x east, y up, z north), length 1. */
  readonly direction: readonly [number, number, number];
  readonly strength: number;
  readonly shadeMin: number;
  readonly shadeMax: number;
}

export interface LandTilePictures {
  readonly colorTable: BaseTexture;
  readonly slopeMap: BaseTexture;
  readonly groundMap: BaseTexture;
  /** The tile's south-west corner and side length (map units), and its cells per side. */
  readonly minX: number;
  readonly minZ: number;
  readonly size: number;
  readonly tileCells: number;
}

const UNIFORMS = ['heightScale', 'tileRect', 'tileCells', 'colorMix', 'lightDirection', 'shading'];

export function createLandMaterial(
  name: string,
  scene: Scene,
  pictures: LandTilePictures,
  light: LandLight,
  look: LandLook,
): ShaderMaterial {
  const engine: AbstractEngine = scene.getEngine();
  const webGpu = engine.isWebGPU;
  const material = new ShaderMaterial(
    name,
    scene,
    { vertex: SHADER_NAME, fragment: SHADER_NAME },
    {
      attributes: ['position', 'uv'],
      uniforms: webGpu ? UNIFORMS : ['world', 'viewProjection', ...UNIFORMS],
      uniformBuffers: webGpu ? ['Scene', 'Mesh'] : undefined,
      samplers: ['colorTable', 'slopeMap', 'groundMap'],
      shaderLanguage: webGpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
    },
  );
  // The land is seen from above; its triangles may face either way.
  material.backFaceCulling = false;
  material.setTexture('colorTable', pictures.colorTable);
  material.setTexture('slopeMap', pictures.slopeMap);
  material.setTexture('groundMap', pictures.groundMap);
  material.setVector4(
    'tileRect',
    new Vector4(
      pictures.minX,
      pictures.minZ,
      1 / pictures.size,
      pictures.tileCells / pictures.size,
    ),
  );
  material.setFloat('tileCells', pictures.tileCells);
  material.setVector3('lightDirection', new Vector3(...light.direction));
  material.setVector3('shading', new Vector3(light.strength, light.shadeMin, light.shadeMax));
  applyLandLook(material, look);
  return material;
}

export function applyLandLook(material: ShaderMaterial, look: LandLook): void {
  material.setFloat('heightScale', look.heightScale);
  material.setVector4(
    'colorMix',
    new Vector4(look.colorStrength, look.detailStrength, look.wander, 0),
  );
}
