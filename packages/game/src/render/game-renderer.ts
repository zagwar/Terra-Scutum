import { type RendererPreference, type RendererType, createEngine } from './create-engine';
import { createPlaceholderScene } from './placeholder-scene';

export interface GameRendererOptions {
  readonly preference: RendererPreference;
  /** False in debug scenarios, so screenshots always show the same picture. */
  readonly animate: boolean;
}

/** The 3D view: owns the Babylon engine, its canvas and the scene being shown. */
export interface GameRenderer {
  readonly type: RendererType;
  /** How many frames have been drawn (used by tests to know the scene is really rendering). */
  getFrameCount(): number;
  dispose(): void;
}

export async function createGameRenderer(
  container: HTMLElement,
  options: GameRendererOptions,
): Promise<GameRenderer> {
  const { engine, type } = await createEngine(container, options.preference);
  const scene = createPlaceholderScene(engine, options.animate);

  let frameCount = 0;
  engine.runRenderLoop(() => {
    scene.render();
    frameCount += 1;
  });

  const resizeObserver = new ResizeObserver(() => engine.resize());
  resizeObserver.observe(container);

  return {
    type,
    getFrameCount: () => frameCount,
    dispose() {
      resizeObserver.disconnect();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
