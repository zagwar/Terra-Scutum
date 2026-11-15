/**
 * Seeded random numbers for the generators (F133): the same seed always
 * makes the same model. (The sim has its own generator in `core/rng.ts`;
 * models are only pictures, so they don't share it and never affect the sim.)
 */
export interface SeededRandom {
  /** A number from 0 (included) to 1 (not included). */
  next(): number;
  /** A number between `low` and `high`. */
  between(low: number, high: number): number;
  /** A number in a [lowest, highest] range from the data. */
  inRange(range: readonly [number, number]): number;
  /** A whole number in a [lowest, highest] range, both included. */
  intInRange(range: readonly [number, number]): number;
  /** True with this probability (0…1). */
  chance(probability: number): boolean;
}

/** mulberry32: small, fast and good enough for shapes. */
export function seededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (low: number, high: number) => low + (high - low) * next();
  return {
    next,
    between,
    inRange: ([low, high]) => between(low, high),
    intInRange: ([low, high]) => {
      const lowest = Math.ceil(low);
      const highest = Math.floor(high);
      return highest <= lowest ? lowest : lowest + Math.floor(next() * (highest - lowest + 1));
    },
    chance: (probability) => next() < probability,
  };
}

/** Mixes whole numbers into one seed (for example a model id's hash and a variant number). */
export function mixSeed(...parts: readonly number[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    h = Math.imul(h ^ (part >>> 0), 0x01000193) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995) >>> 0;
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** A whole number from a text (a model id), the same every time. */
export function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** A number from 0 to 1 for a point of a grid (the same every time): scattering things over the map. */
export function hashUnit(a: number, b: number, c: number, d = 0): number {
  return mixSeed(a, b, c, d) / 4294967296;
}
