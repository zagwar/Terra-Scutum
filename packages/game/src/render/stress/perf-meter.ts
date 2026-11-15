import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import type { Scene } from '@babylonjs/core/scene';

/**
 * The render stress test's counter (F139): frame rate, frame time, the
 * main thread's work per frame, draw calls, triangles and memory, measured
 * in the browser that shows the game.
 *
 * - **Frame time**: the time between the starts of two frames (what the
 *   player feels); FPS is 1000 / its average.
 * - **CPU per frame**: the main thread's time inside a frame (the game's own
 *   work: camera, terrain, scenery, the stress load; plus Babylon preparing
 *   the draw calls). The graphics card's own time is not in it.
 * - **Memory**: the page's JavaScript heap where the browser tells it
 *   (Chrome and Edge); graphics memory and the whole tab are in the
 *   browser's task manager (Chrome: Shift+Esc).
 */
export interface PerfNumbers {
  readonly frames: number;
  readonly fps: number;
  readonly frameMs: number;
  /** The slowest frame. */
  readonly worstFrameMs: number;
  /** 99 of 100 frames were at most this long (the "1 % low"). */
  readonly p99FrameMs: number;
  readonly cpuMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  /** JavaScript heap in megabytes, or null where the browser doesn't say. */
  readonly heapMb: number | null;
}

export interface PerfMeter {
  /** The last second or so. */
  live(): PerfNumbers;
  /** Starts a measurement window (the benchmark measures each view in one). */
  beginWindow(): void;
  /** Everything since `beginWindow`. */
  window(): PerfNumbers;
  dispose(): void;
}

interface Frame {
  readonly at: number;
  readonly frameMs: number;
  readonly cpuMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
}

const LIVE_MS = 1000;

function heapMb(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? memory.usedJSHeapSize / 1024 / 1024 : null;
}

function summarize(frames: readonly Frame[]): PerfNumbers {
  const count = frames.length;
  if (count === 0)
    return {
      frames: 0,
      fps: 0,
      frameMs: 0,
      worstFrameMs: 0,
      p99FrameMs: 0,
      cpuMs: 0,
      drawCalls: 0,
      triangles: 0,
      heapMb: heapMb(),
    };
  let frameTotal = 0;
  let cpuTotal = 0;
  let worst = 0;
  let drawCalls = 0;
  let triangles = 0;
  for (const frame of frames) {
    frameTotal += frame.frameMs;
    cpuTotal += frame.cpuMs;
    worst = Math.max(worst, frame.frameMs);
    drawCalls = Math.max(drawCalls, frame.drawCalls);
    triangles = Math.max(triangles, frame.triangles);
  }
  const sorted = frames.map((frame) => frame.frameMs).sort((a, b) => a - b);
  const frameMs = frameTotal / count;
  return {
    frames: count,
    fps: frameMs > 0 ? 1000 / frameMs : 0,
    frameMs,
    worstFrameMs: worst,
    p99FrameMs: sorted[Math.min(count - 1, Math.ceil(count * 0.99) - 1)],
    cpuMs: cpuTotal / count,
    drawCalls,
    triangles,
    heapMb: heapMb(),
  };
}

export function createPerfMeter(scene: Scene): PerfMeter {
  const engine: AbstractEngine = scene.getEngine();
  const instrumentation = new SceneInstrumentation(scene);
  const recent: Frame[] = [];
  let windowFrames: Frame[] = [];
  let measuring = false;
  let lastBegin = 0;
  let renderStart = 0;
  let frameMs = 0;

  const onBegin = engine.onBeginFrameObservable.add(() => {
    const now = performance.now();
    frameMs = lastBegin > 0 ? now - lastBegin : 0;
    lastBegin = now;
  });
  // First in line: the map's own work before drawing counts as the frame's CPU time.
  const onBefore = scene.onBeforeAnimationsObservable.add(
    () => (renderStart = performance.now()),
    undefined,
    true,
  );
  const onAfter = scene.onAfterRenderObservable.add(() => {
    const now = performance.now();
    if (frameMs <= 0) return;
    const frame: Frame = {
      at: now,
      frameMs,
      cpuMs: now - renderStart,
      drawCalls: instrumentation.drawCallsCounter.current,
      triangles: scene.getActiveIndices() / 3,
    };
    recent.push(frame);
    while (recent.length > 0 && now - recent[0].at > LIVE_MS && recent.length > 2) recent.shift();
    if (measuring) windowFrames.push(frame);
  });

  return {
    live: () => summarize(recent),
    beginWindow() {
      windowFrames = [];
      measuring = true;
    },
    window: () => summarize(windowFrames),
    dispose() {
      engine.onBeginFrameObservable.remove(onBegin);
      scene.onBeforeAnimationsObservable.remove(onBefore);
      scene.onAfterRenderObservable.remove(onAfter);
      instrumentation.dispose();
    },
  };
}
