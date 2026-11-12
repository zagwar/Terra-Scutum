import type { DebugApi } from '../src/debug/debug-hooks';

type Selection = { kind: 'province' | 'seaZone'; id: string } | null;

declare global {
  interface Window {
    __terraScutum?: DebugApi;
    __mapPreview?: {
      ready: boolean;
      counts: { countries: number; provinces: number; regions: number; seaZones: number };
      pick(lon: number, lat: number): Selection;
      select(selection: Selection): void;
      setMode(mode: 'countries' | 'regions' | 'seaZones'): void;
    };
  }
}
