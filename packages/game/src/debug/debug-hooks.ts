import type { CommandResult, SimCommand, SimEvent, SimSnapshot } from '@terra-scutum/sim';
import type { AppState, AppStore } from '../app-store';
import type { GameRenderer } from '../render/game-renderer';
import type { SimClient } from '../worker/sim-client';

/**
 * Test hooks, installed as `window.__terraScutum` only when the game is
 * opened with `?debug=<scenario>`. Playwright uses them to wait for the game,
 * drive the sim and read its state.
 */
export interface DebugApi {
  /** True once both the 3D renderer and the sim are running. */
  isReady(): boolean;
  getState(): AppState;
  /** Frames drawn so far; null until the renderer has started. */
  getFrameCount(): number | null;
  step(days: number): Promise<SimSnapshot>;
  sendCommand(command: SimCommand): Promise<CommandResult>;
  /** Every sim event received since the game started. */
  readonly events: SimEvent[];
}

declare global {
  interface Window {
    __terraScutum?: DebugApi;
  }
}

export interface DebugHooks {
  setRenderer(renderer: GameRenderer): void;
  recordEvents(events: readonly SimEvent[]): void;
}

export function installDebugHooks(store: AppStore, sim: SimClient): DebugHooks {
  let renderer: GameRenderer | null = null;
  const events: SimEvent[] = [];

  window.__terraScutum = {
    isReady() {
      const state = store.getState();
      return (
        state.sim === 'running' && (state.renderer === 'webgpu' || state.renderer === 'webgl2')
      );
    },
    getState: () => store.getState(),
    getFrameCount: () => renderer?.getFrameCount() ?? null,
    step: (days) => sim.step(days),
    sendCommand: (command) => sim.sendCommand(command),
    events,
  };

  return {
    setRenderer(created) {
      renderer = created;
    },
    recordEvents(received) {
      events.push(...received);
    },
  };
}
