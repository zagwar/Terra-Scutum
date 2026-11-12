import { parseHex, varyColor } from './colors';
import { encodePng } from './png';
import type { Grid } from './raster';

/**
 * Renders a preview picture of the generated map from the import's grids:
 * land colored by `landColor`, province borders dark, sea zones in shades of
 * blue with their borders. `scale` keeps every scale-th pixel.
 */
export interface PreviewInput {
  readonly grid: Grid;
  /** Province label per pixel (0 = water, 0xffff = land outside the game). */
  readonly land: Uint16Array;
  /** Sea zone label per pixel (0 = not a sea zone). */
  readonly sea: Uint16Array;
  /** Color for each province label (index = label). */
  readonly landColor: (label: number) => [number, number, number];
  /** Optional group per province label: borders between groups are drawn thicker. */
  readonly group?: (label: number) => number;
  readonly scale: number;
}

const WATER: [number, number, number] = [26, 44, 66];
const LAKE: [number, number, number] = [40, 60, 84];
const OUTSIDE_LAND: [number, number, number] = [92, 92, 92];

export function renderPreview(input: PreviewInput): Buffer {
  const { grid, land, sea, scale } = input;
  const width = Math.floor(grid.width / scale);
  const height = Math.floor(grid.height / scale);
  const rgba = new Uint8Array(width * height * 4);
  const at = (x: number, y: number) =>
    Math.min(grid.height - 1, y * scale) * grid.width + Math.min(grid.width - 1, x * scale);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = at(x, y);
      const l = land[i];
      let color: [number, number, number];
      if (l === 0xffff) color = OUTSIDE_LAND;
      else if (l !== 0) color = input.landColor(l);
      else if (sea[i] !== 0) {
        const shade = varyColor('#1d3550', `zone${sea[i]}`, 0.22);
        color = shade;
      } else color = LAKE;
      const right = at(Math.min(width - 1, x + 1), y);
      const down = at(x, Math.min(height - 1, y + 1));
      if (l !== 0 && l !== 0xffff) {
        const differs = (j: number) => land[j] !== l && land[j] !== 0;
        if (differs(right) || differs(down)) {
          const thick =
            input.group &&
            [right, down].some(
              (j) =>
                land[j] !== 0 && land[j] !== 0xffff && input.group!(land[j]) !== input.group!(l),
            );
          color = thick ? [20, 20, 20] : [color[0] * 0.55, color[1] * 0.55, color[2] * 0.55];
        }
      } else if (l === 0 && sea[i] !== 0) {
        if (
          (land[right] === 0 && sea[right] !== sea[i] && sea[right] !== 0) ||
          (land[down] === 0 && sea[down] !== sea[i] && sea[down] !== 0)
        ) {
          color = [70, 100, 130];
        }
      }
      const o = (y * width + x) * 4;
      rgba[o] = color[0];
      rgba[o + 1] = color[1];
      rgba[o + 2] = color[2];
      rgba[o + 3] = 255;
    }
  }
  return encodePng(width, height, rgba);
}

export { parseHex, WATER };
