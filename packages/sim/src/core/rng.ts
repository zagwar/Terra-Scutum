/**
 * Seeded random number generator for the sim: xoshiro128** (Blackman & Vigna),
 * seeded through splitmix32.
 *
 * - All sim randomness goes through the single `Rng` owned by `GameState`.
 *   Never use `Math.random()` in the sim.
 * - Fixed algorithm, 32-bit integer math only, so the same seed gives the same
 *   run in every browser and in Node.
 * - The four state words are saved with the game, so a loaded game continues
 *   exactly as the original would have.
 */

export type RngState = readonly [number, number, number, number];

const UINT32_RANGE = 0x1_0000_0000;

/** splitmix32: turns one 32-bit seed into a stream of well-mixed 32-bit values. */
function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let z = a;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  private constructor(state: RngState) {
    this.s0 = state[0] >>> 0;
    this.s1 = state[1] >>> 0;
    this.s2 = state[2] >>> 0;
    this.s3 = state[3] >>> 0;
  }

  /** Creates a generator from a seed (any number; it is truncated to an unsigned 32-bit integer). */
  static fromSeed(seed: number): Rng {
    const next = splitmix32(seed);
    return new Rng([next(), next(), next(), next()]);
  }

  /** Restores a generator from a saved state (see `getState`). */
  static fromState(state: RngState): Rng {
    if ((state[0] | state[1] | state[2] | state[3]) === 0) {
      throw new Error('Rng state must not be all zeros');
    }
    return new Rng(state);
  }

  /** The four state words, for saving. */
  getState(): RngState {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  /** Next unsigned 32-bit integer (0 … 4,294,967,295). */
  nextUint32(): number {
    const r = Math.imul(this.s1, 5);
    const result = Math.imul((r << 7) | (r >>> 25), 9) >>> 0;
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = (this.s3 << 11) | (this.s3 >>> 21);
    // Keep the words unsigned so saved states are plain positive integers.
    this.s0 >>>= 0;
    this.s1 >>>= 0;
    this.s2 >>>= 0;
    this.s3 >>>= 0;
    return result;
  }

  /** Next float in [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  /** Next integer in [min, maxExclusive). Unbiased (rejection sampling). */
  nextInt(min: number, maxExclusive: number): number {
    const range = maxExclusive - min;
    if (!Number.isInteger(min) || !Number.isInteger(maxExclusive) || range <= 0) {
      throw new Error(`Rng.nextInt: invalid range [${min}, ${maxExclusive})`);
    }
    if (range > UINT32_RANGE) {
      throw new Error(`Rng.nextInt: range ${range} is larger than 2^32`);
    }
    const limit = UINT32_RANGE - (UINT32_RANGE % range);
    let value = this.nextUint32();
    while (value >= limit) value = this.nextUint32();
    return min + (value % range);
  }

  /** True with the given probability (0 = never, 1 = always). */
  chance(probability: number): boolean {
    return this.nextFloat() < probability;
  }

  /** A random element of a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[this.nextInt(0, items.length)];
  }
}
