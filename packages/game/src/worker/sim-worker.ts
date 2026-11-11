/// <reference lib="webworker" />
/**
 * The sim worker: a Web Worker (a background thread of the browser) that owns
 * the simulation, so the heavy daily tick never freezes the 3D view or the UI.
 * All logic is in `sim-host.ts`; this file only connects it to the worker's
 * message channel.
 */
import { RAW_GAME_DATA } from './game-data';
import type { FromSimWorker, ToSimWorker } from './protocol';
import { createSimHost } from './sim-host';

declare const self: DedicatedWorkerGlobalScope;

const host = createSimHost(RAW_GAME_DATA, (message: FromSimWorker) => self.postMessage(message));

self.onmessage = (event: MessageEvent<ToSimWorker>) => host.handle(event.data);
