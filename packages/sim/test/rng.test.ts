import { describe, expect, it } from 'vitest';
import { Rng } from '../src';

/** Reference xoshiro128** written with BigInt, straight from the published C code. */
function referenceXoshiro128ss(state: [number, number, number, number], count: number): number[] {
  const mask = 0xffff_ffffn;
  const rotl = (x: bigint, k: bigint) => ((x << k) | (x >> (32n - k))) & mask;
  const s = state.map((word) => BigInt(word));
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(Number((rotl((s[1] * 5n) & mask, 7n) * 9n) & mask));
    const t = (s[1] << 9n) & mask;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11n);
  }
  return out;
}

describe('Rng', () => {
  it('matches the xoshiro128** reference implementation', () => {
    const rng = Rng.fromState([1, 2, 3, 4]);
    const expected = referenceXoshiro128ss([1, 2, 3, 4], 2000);
    expect(expected[0]).toBe(11520); // published first output for state {1, 2, 3, 4}
    for (const value of expected) expect(rng.nextUint32()).toBe(value);

    const big = [0xdeadbeef, 0x9e3779b9, 0xffffffff, 0x12345678] as [
      number,
      number,
      number,
      number,
    ];
    const rng2 = Rng.fromState(big);
    for (const value of referenceXoshiro128ss(big, 2000)) expect(rng2.nextUint32()).toBe(value);
  });

  it('gives the same sequence for the same seed and different ones for different seeds', () => {
    const a = Rng.fromSeed(42);
    const b = Rng.fromSeed(42);
    const c = Rng.fromSeed(43);
    const seqA = Array.from({ length: 100 }, () => a.nextUint32());
    const seqB = Array.from({ length: 100 }, () => b.nextUint32());
    const seqC = Array.from({ length: 100 }, () => c.nextUint32());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('has a fixed sequence for seed 42 (guards against accidental algorithm changes)', () => {
    const rng = Rng.fromSeed(42);
    expect(Array.from({ length: 4 }, () => rng.nextUint32())).toMatchInlineSnapshot(`
      [
        2837322924,
        544945897,
        479756282,
        3500138142,
      ]
    `);
  });

  it('continues exactly from a saved state', () => {
    const rng = Rng.fromSeed(7);
    for (let i = 0; i < 50; i++) rng.nextUint32();
    const state = rng.getState();
    for (const word of state) {
      expect(Number.isInteger(word)).toBe(true);
      expect(word).toBeGreaterThanOrEqual(0);
      expect(word).toBeLessThanOrEqual(0xffff_ffff);
    }
    const restored = Rng.fromState(state);
    for (let i = 0; i < 100; i++) expect(restored.nextUint32()).toBe(rng.nextUint32());
  });

  it('rejects an all-zero state (the generator would only ever return 0)', () => {
    expect(() => Rng.fromState([0, 0, 0, 0])).toThrow();
  });

  it('nextFloat stays in [0, 1) and is roughly uniform', () => {
    const rng = Rng.fromSeed(1);
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const value = rng.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      sum += value;
    }
    expect(sum / 20000).toBeCloseTo(0.5, 1);
  });

  it('nextInt covers its range evenly and never leaves it', () => {
    const rng = Rng.fromSeed(2);
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < 60000; i++) {
      const value = rng.nextInt(10, 16);
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThan(16);
      counts[value - 10] += 1;
    }
    for (const count of counts) expect(Math.abs(count - 10000)).toBeLessThan(500);
    expect(() => rng.nextInt(5, 5)).toThrow();
    expect(() => rng.nextInt(0.5, 3)).toThrow();
  });

  it('chance and pick behave at the edges', () => {
    const rng = Rng.fromSeed(3);
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
      expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']));
    }
    expect(() => rng.pick([])).toThrow();
  });
});
