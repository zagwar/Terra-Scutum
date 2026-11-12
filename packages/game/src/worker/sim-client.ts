import type { CommandResult, SimCommand, SimEvent, SimSnapshot } from '@terra-scutum/sim';
import type { FromSimWorker, SimWorkerErrorKey, ToSimWorker } from './protocol';

export interface SimClientHandlers {
  /** The campaign has started. */
  onReady(ready: ReadyMessage): void;
  /** The sim state changed (after ticks and commands). */
  onUpdate(snapshot: SimSnapshot, events: readonly SimEvent[]): void;
  /** The sim could not start or crashed. */
  onError(key: SimWorkerErrorKey, detail: string): void;
}

/** The game's connection to the sim worker. */
export interface SimClient {
  /** Starts a new campaign. */
  init(seed: number): void;
  /** Sends a sim command; resolves with whether the sim accepted it. */
  sendCommand(command: SimCommand): Promise<CommandResult>;
  /** Simulates the given number of days now; resolves with the new snapshot. */
  step(days: number): Promise<SimSnapshot>;
  dispose(): void;
}

type UpdateMessage = Extract<FromSimWorker, { type: 'update' }>;
export type ReadyMessage = Extract<FromSimWorker, { type: 'ready' }>;

export function createSimClient(handlers: SimClientHandlers): SimClient {
  const worker = new Worker(new URL('./sim-worker.ts', import.meta.url), {
    type: 'module',
    name: 'sim-worker',
  });
  const pending = new Map<number, (update: UpdateMessage) => void>();
  let nextRequestId = 1;

  const send = (message: ToSimWorker) => worker.postMessage(message);

  function request(build: (requestId: number) => ToSimWorker): Promise<UpdateMessage> {
    return new Promise((resolve) => {
      const requestId = nextRequestId++;
      pending.set(requestId, resolve);
      send(build(requestId));
    });
  }

  worker.onmessage = (event: MessageEvent<FromSimWorker>) => {
    const message = event.data;
    switch (message.type) {
      case 'ready':
        handlers.onReady(message);
        break;
      case 'update': {
        handlers.onUpdate(message.snapshot, message.events);
        if (message.requestId !== undefined) {
          pending.get(message.requestId)?.(message);
          pending.delete(message.requestId);
        }
        break;
      }
      case 'error':
        handlers.onError(message.key, message.detail);
        break;
    }
  };
  worker.onerror = (event) => {
    handlers.onError('ERROR_SIM_CRASHED', event.message || 'the sim worker could not be started');
  };

  return {
    init: (seed) => send({ type: 'init', seed }),
    sendCommand: async (command) => {
      const update = await request((requestId) => ({ type: 'command', requestId, command }));
      return update.commandResult ?? { ok: true };
    },
    step: async (days) => {
      const update = await request((requestId) => ({ type: 'step', requestId, days }));
      return update.snapshot;
    },
    dispose: () => worker.terminate(),
  };
}
