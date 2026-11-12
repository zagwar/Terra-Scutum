import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Engine } from '@babylonjs/core/Engines/engine';

export type RendererType = 'webgpu' | 'webgl2';

/** Which renderer to use: `auto` picks WebGPU when the browser supports it, otherwise WebGL 2. */
export type RendererPreference = 'auto' | RendererType;

export interface CreatedEngine {
  readonly engine: AbstractEngine;
  readonly canvas: HTMLCanvasElement;
  readonly type: RendererType;
}

function createCanvas(container: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'scene-canvas';
  container.replaceChildren(canvas);
  return canvas;
}

async function tryCreateWebGpuEngine(container: HTMLElement): Promise<CreatedEngine | null> {
  if (!('gpu' in navigator)) return null;
  try {
    // Loaded on demand, so browsers without WebGPU never download this code.
    const { WebGPUEngine } = await import('@babylonjs/core/Engines/webgpuEngine');
    if (!(await WebGPUEngine.IsSupportedAsync)) return null;
    const canvas = createCanvas(container);
    const engine = new WebGPUEngine(canvas, { antialias: true, adaptToDeviceRatio: true });
    await engine.initAsync();
    return { engine, canvas, type: 'webgpu' };
  } catch (error) {
    console.warn('WebGPU could not start; falling back to WebGL 2.', error);
    return null;
  }
}

/**
 * Creates the Babylon engine and its canvas inside `container`:
 * WebGPU when available, WebGL 2 otherwise.
 *
 * The canvas is created here (not in the HTML) because a canvas that was
 * handed to WebGPU can't be reused for WebGL: the fallback needs a fresh one.
 */
export async function createEngine(
  container: HTMLElement,
  preference: RendererPreference,
): Promise<CreatedEngine> {
  if (preference !== 'webgl2') {
    const webGpu = await tryCreateWebGpuEngine(container);
    if (webGpu) return webGpu;
  }
  const canvas = createCanvas(container);
  // Throws if the browser has no WebGL at all.
  const engine = new Engine(canvas, true, { disableWebGL2Support: false }, true);
  if (engine.webGLVersion < 2) {
    engine.dispose();
    throw new Error('WebGL 2 is not available');
  }
  return { engine, canvas, type: 'webgl2' };
}
