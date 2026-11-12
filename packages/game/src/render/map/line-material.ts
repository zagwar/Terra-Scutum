import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Constants } from '@babylonjs/core/Engines/constants';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/meshUboDeclaration';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/sceneUboDeclaration';
import type { Scene } from '@babylonjs/core/scene';
import type { MapLineStyle } from '@terra-scutum/sim';
import { parseHexColor } from './map-colors';

/**
 * The material for map lines (borders, coasts, the selection outline).
 *
 * Lines keep the same width on screen at every zoom level: the mesh holds two
 * vertices per point (see `buildLineGeometry`), and this shader pushes them
 * apart by the line's width in pixels, with mitered corners.
 *
 * One mesh can hold lines of several kinds (`LINE_*` flags per vertex). The
 * shader gives each its style: "coast" for coasts, "emphasis" for lines with
 * the flag in `emphasisFlag` (country borders in one map mode, region borders
 * in another), "plain" for the rest. Changing styles is a uniform update.
 *
 * The shader exists twice because the game runs on two renderers: GLSL for
 * WebGL 2, WGSL for WebGPU.
 */
const SHADER_NAME = 'mapLine';

const VERTEX_GLSL = `
precision highp float;
attribute vec3 position;
attribute vec4 neighbors;
attribute vec2 sideAndKind;
uniform mat4 world;
uniform mat4 viewProjection;
uniform vec2 resolution;
uniform vec3 lineWidths;
uniform float emphasisFlag;
uniform vec4 plainColor;
uniform vec4 emphasisColor;
uniform vec4 coastColor;
varying vec4 vColor;

void main() {
  float kind = sideAndKind.y;
  float coast = step(3.5, kind);
  float emphasis = emphasisFlag > 0.5 ? mod(floor(kind / emphasisFlag), 2.0) : 0.0;
  float lineWidth = mix(mix(lineWidths.x, lineWidths.y, emphasis), lineWidths.z, coast);
  vColor = mix(mix(plainColor, emphasisColor, emphasis), coastColor, coast);

  mat4 transform = viewProjection * world;
  vec4 current = transform * vec4(position, 1.0);
  vec4 previous = transform * vec4(neighbors.x, position.y, neighbors.y, 1.0);
  vec4 next = transform * vec4(neighbors.z, position.y, neighbors.w, 1.0);
  vec2 halfSize = resolution * 0.5;
  vec2 currentPx = current.xy / current.w * halfSize;
  vec2 fromPrevious = currentPx - previous.xy / previous.w * halfSize;
  vec2 toNext = next.xy / next.w * halfSize - currentPx;
  float lengthIn = length(fromPrevious);
  float lengthOut = length(toNext);
  vec2 directionIn = lengthIn > 0.0001 ? fromPrevious / lengthIn : vec2(1.0, 0.0);
  vec2 directionOut = lengthOut > 0.0001 ? toNext / lengthOut : directionIn;
  if (lengthIn <= 0.0001) directionIn = directionOut;
  vec2 normalIn = vec2(-directionIn.y, directionIn.x);
  vec2 normalOut = vec2(-directionOut.y, directionOut.x);
  vec2 miter = normalIn + normalOut;
  float miterLength = length(miter);
  miter = miterLength > 0.001 ? miter / miterLength : normalIn;
  // Sharp corners would give very long spikes: limit them.
  float stretch = 1.0 / max(dot(miter, normalIn), 0.4);
  vec2 offsetPx = miter * (stretch * sideAndKind.x * lineWidth * 0.5);
  current.xy += offsetPx / halfSize * current.w;
  gl_Position = current;
}
`;

const FRAGMENT_GLSL = `
precision highp float;
varying vec4 vColor;

void main() {
  gl_FragColor = vColor;
}
`;

const VERTEX_WGSL = `
#include<sceneUboDeclaration>
#include<meshUboDeclaration>
attribute position: vec3f;
attribute neighbors: vec4f;
attribute sideAndKind: vec2f;
uniform resolution: vec2f;
uniform lineWidths: vec3f;
uniform emphasisFlag: f32;
uniform plainColor: vec4f;
uniform emphasisColor: vec4f;
uniform coastColor: vec4f;
varying vColor: vec4f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let kind: f32 = vertexInputs.sideAndKind.y;
  let coast: f32 = step(3.5, kind);
  var emphasis: f32 = 0.0;
  if (uniforms.emphasisFlag > 0.5) { emphasis = floor(kind / uniforms.emphasisFlag) % 2.0; }
  let lineWidth: f32 = mix(mix(uniforms.lineWidths.x, uniforms.lineWidths.y, emphasis), uniforms.lineWidths.z, coast);
  vertexOutputs.vColor = mix(mix(uniforms.plainColor, uniforms.emphasisColor, emphasis), uniforms.coastColor, coast);

  let transform: mat4x4f = scene.viewProjection * mesh.world;
  let point: vec3f = vertexInputs.position;
  let current: vec4f = transform * vec4f(point, 1.0);
  let previous: vec4f = transform * vec4f(vertexInputs.neighbors.x, point.y, vertexInputs.neighbors.y, 1.0);
  let next: vec4f = transform * vec4f(vertexInputs.neighbors.z, point.y, vertexInputs.neighbors.w, 1.0);
  let halfSize: vec2f = uniforms.resolution * 0.5;
  let currentPx: vec2f = current.xy / current.w * halfSize;
  let fromPrevious: vec2f = currentPx - previous.xy / previous.w * halfSize;
  let toNext: vec2f = next.xy / next.w * halfSize - currentPx;
  let lengthIn: f32 = length(fromPrevious);
  let lengthOut: f32 = length(toNext);
  var directionIn: vec2f = vec2f(1.0, 0.0);
  if (lengthIn > 0.0001) { directionIn = fromPrevious / lengthIn; }
  var directionOut: vec2f = directionIn;
  if (lengthOut > 0.0001) { directionOut = toNext / lengthOut; }
  if (lengthIn <= 0.0001) { directionIn = directionOut; }
  let normalIn: vec2f = vec2f(-directionIn.y, directionIn.x);
  let normalOut: vec2f = vec2f(-directionOut.y, directionOut.x);
  var miter: vec2f = normalIn + normalOut;
  let miterLength: f32 = length(miter);
  if (miterLength > 0.001) { miter = miter / miterLength; } else { miter = normalIn; }
  let stretch: f32 = 1.0 / max(dot(miter, normalIn), 0.4);
  let offsetPx: vec2f = miter * (stretch * vertexInputs.sideAndKind.x * lineWidth * 0.5);
  vertexOutputs.position = vec4f(current.xy + offsetPx / halfSize * current.w, current.z, current.w);
}
`;

const FRAGMENT_WGSL = `
varying vColor: vec4f;

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  fragmentOutputs.color = fragmentInputs.vColor;
}
`;

ShaderStore.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX_GLSL;
ShaderStore.ShadersStore[`${SHADER_NAME}PixelShader`] = FRAGMENT_GLSL;
ShaderStore.ShadersStoreWGSL[`${SHADER_NAME}VertexShader`] = VERTEX_WGSL;
ShaderStore.ShadersStoreWGSL[`${SHADER_NAME}PixelShader`] = FRAGMENT_WGSL;

export interface LineStyles {
  readonly plain: MapLineStyle;
  /** Style for lines carrying `emphasisFlag` (one of the `LINE_*` flags; 0 = none). */
  readonly emphasis?: MapLineStyle;
  readonly emphasisFlag?: number;
  readonly coast?: MapLineStyle;
}

export interface LineMaterial {
  readonly material: ShaderMaterial;
  setStyles(styles: LineStyles): void;
  /** Call when the canvas size changes: line widths are in screen pixels. */
  updateResolution(): void;
}

const UNIFORMS = [
  'resolution',
  'lineWidths',
  'emphasisFlag',
  'plainColor',
  'emphasisColor',
  'coastColor',
];

function toColor4(style: MapLineStyle): Color4 {
  const [r, g, b] = parseHexColor(style.color);
  return new Color4(r / 255, g / 255, b / 255, style.opacity);
}

export function createLineMaterial(name: string, scene: Scene, styles: LineStyles): LineMaterial {
  const engine: AbstractEngine = scene.getEngine();
  const webGpu = engine.isWebGPU;
  const material = new ShaderMaterial(
    name,
    scene,
    { vertex: SHADER_NAME, fragment: SHADER_NAME },
    {
      attributes: ['position', 'neighbors', 'sideAndKind'],
      uniforms: webGpu ? UNIFORMS : ['world', 'viewProjection', ...UNIFORMS],
      uniformBuffers: webGpu ? ['Scene', 'Mesh'] : undefined,
      needAlphaBlending: true,
      shaderLanguage: webGpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
    },
  );
  material.backFaceCulling = false;
  // The map is flat: layers are drawn in a fixed order instead of being depth-tested.
  material.disableDepthWrite = true;
  material.depthFunction = Constants.ALWAYS;

  let current = styles;
  const updateResolution = () => {
    material.setVector2(
      'resolution',
      new Vector2(engine.getRenderWidth(), engine.getRenderHeight()),
    );
    // Widths are given in CSS pixels; the canvas may have more real pixels than that.
    const scale = 1 / engine.getHardwareScalingLevel();
    const { plain, emphasis = plain, coast = plain } = current;
    material.setVector3(
      'lineWidths',
      new Vector3(plain.widthPx * scale, emphasis.widthPx * scale, coast.widthPx * scale),
    );
  };
  const setStyles = (next: LineStyles) => {
    current = next;
    const { plain, emphasis = plain, coast = plain } = next;
    material.setColor4('plainColor', toColor4(plain));
    material.setColor4('emphasisColor', toColor4(emphasis));
    material.setColor4('coastColor', toColor4(coast));
    material.setFloat('emphasisFlag', next.emphasisFlag ?? 0);
    updateResolution();
  };
  setStyles(styles);
  return { material, setStyles, updateResolution };
}
