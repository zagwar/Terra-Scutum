import type { DebugApi } from '../src/debug/debug-hooks';

declare global {
  interface Window {
    __terraScutum?: DebugApi;
  }
}
