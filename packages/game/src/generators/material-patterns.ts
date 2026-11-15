import type { ModelMaterial } from '@terra-scutum/sim';
import { hashText, mixSeed } from './seeded-random';

/**
 * Procedural materials (F133, section 12.6): a material's surface pattern is
 * drawn by code into a small square picture that repeats seamlessly; no
 * texture files. One repeat covers `pattern.size` model units (metres) on
 * the model, because the generators lay texture coordinates in model units.
 *
 * Patterns [DEFAULT] (start simple, improve later):
 * - `plain`: the color only;
 * - `noise`: soft blotches (concrete, painted metal);
 * - `bark`: streaks running up the trunk;
 * - `foliage`: small dark and light leaf clumps;
 * - `windows`: a wall with one window per repeat (the accent color is the glass);
 * - `tiles`: rows of roof tiles (the accent color is the joints).
 */
export const PATTERN_PIXELS = 64;

export function parseHexColor(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Value noise that repeats every `period` lattice cells (so the picture tiles seamlessly). */
function periodicNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const corner = (i: number, j: number) =>
    mixSeed(seed, ((i % period) + period) % period, ((j % period) + period) % period) / 4294967296;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = corner(xi, yi) + (corner(xi + 1, yi) - corner(xi, yi)) * sx;
  const bottom = corner(xi, yi + 1) + (corner(xi + 1, yi + 1) - corner(xi, yi + 1)) * sx;
  return top + (bottom - top) * sy;
}

/** Two octaves of periodic noise at `cells` lattice cells per picture: about 0…1. */
function fractal(u: number, v: number, cells: number, seed: number): number {
  return (
    periodicNoise(u * cells, v * cells, cells, seed) * 0.65 +
    periodicNoise(u * cells * 2, v * cells * 2, cells * 2, seed + 1) * 0.35
  );
}

/**
 * The material's picture: `size` × `size` pixels, RGBA, row by row from the
 * bottom (v = 0) up. The same material always gives the same picture.
 */
export function materialPixels(
  material: ModelMaterial,
  materialId: string,
  size = PATTERN_PIXELS,
): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const base = parseHexColor(material.color);
  const accent = parseHexColor(material.pattern.accent ?? material.color);
  const { kind, strength } = material.pattern;
  const seed = hashText(materialId);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      let shade = 1; // brightness of the base color
      let accentShare = 0; // how much of the accent color shows
      switch (kind) {
        case 'plain':
          break;
        case 'noise':
          shade = 1 + (fractal(u, v, 4, seed) - 0.5) * 2 * strength;
          break;
        case 'bark': {
          // Streaks: the noise changes fast across the trunk and slowly up it.
          const streak = periodicNoise(u * 16, v * 2, 16, seed);
          shade = 1 + (streak - 0.5) * 2 * strength;
          break;
        }
        case 'foliage': {
          const clumps = fractal(u, v, 8, seed);
          shade = 1 + (clumps - 0.5) * 2.4 * strength;
          break;
        }
        case 'windows': {
          shade = 1 + (fractal(u, v, 4, seed) - 0.5) * 0.3 * strength;
          const inWindow = u > 0.22 && u < 0.78 && v > 0.3 && v < 0.82;
          if (inWindow) {
            accentShare = strength;
            // Glass reflects a little more at the top.
            shade *= 0.9 + 0.2 * v;
          }
          break;
        }
        case 'tiles': {
          shade = 1 + (periodicNoise(u * 8, v * 2, 8, seed) - 0.5) * 2 * strength;
          // A joint along the bottom of each row of tiles.
          if (v < 0.14) accentShare = strength;
          break;
        }
      }
      const index = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const mixed = base[channel] * (1 - accentShare) + accent[channel] * accentShare;
        pixels[index + channel] = Math.max(0, Math.min(255, Math.round(mixed * shade * 255)));
      }
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}
