import { type MapViewConfig, type WorldMap, neighborsOf } from '@terra-scutum/sim';

/**
 * Province and sea zone colors for each map mode. Pure code: the renderer
 * writes the result into a small texture (one pixel per province), so
 * switching map modes or highlighting a province never touches the meshes.
 *
 * Colors are stored as r, g, b, a bytes, four per province.
 */

/** The map modes that exist so far (section 12.2); more come with their features. */
export const MAP_MODES = ['political', 'provinces', 'regions'] as const;
export type MapMode = (typeof MAP_MODES)[number];

type Rgb = readonly [number, number, number];
type Colors = MapViewConfig['colors'];

export function parseHexColor(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** A stable number from 0 to 1 for a text (the same on every machine). */
function hashFraction(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 999;
}

/** Makes a color a little lighter or darker, by an amount that depends on `key`. */
function vary(color: Rgb, key: string, amount: number): Rgb {
  const factor = 1 + (hashFraction(key) - 0.5) * 2 * amount;
  return [color[0] * factor, color[1] * factor, color[2] * factor];
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ];
}

function write(target: Uint8Array, index: number, color: Rgb): void {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  target[index * 4] = clamp(color[0]);
  target[index * 4 + 1] = clamp(color[1]);
  target[index * 4 + 2] = clamp(color[2]);
  target[index * 4 + 3] = 255;
}

/**
 * Picks a palette entry for every region so that regions sharing a border
 * get different colors (as long as the palette is big enough).
 */
export function assignRegionPalette(world: WorldMap, paletteSize: number): Uint16Array {
  const regionCount = world.regionIds.length;
  const touching: Set<number>[] = world.regionIds.map(() => new Set<number>());
  for (let province = 0; province < world.provinceIds.length; province++) {
    const region = world.provinceRegion[province];
    for (const neighbor of neighborsOf(world.provinceNeighbors, province)) {
      const other = world.provinceRegion[neighbor];
      if (other !== region) touching[region].add(other);
    }
  }
  const choice = new Uint16Array(regionCount).fill(0xffff);
  for (let region = 0; region < regionCount; region++) {
    const taken = new Set<number>();
    for (const other of touching[region]) if (choice[other] !== 0xffff) taken.add(choice[other]);
    let pick = region % paletteSize;
    for (let attempt = 0; attempt < paletteSize && taken.has(pick); attempt++)
      pick = (pick + 1) % paletteSize;
    choice[region] = pick;
  }
  return choice;
}

/**
 * The color of every province in a map mode, before any highlighting.
 * `provinceOwner` is the country (index) that owns each province right now;
 * the political map mode colors each province by its owner.
 */
export function provinceBaseColors(
  mode: MapMode,
  world: WorldMap,
  colors: Colors,
  provinceOwner: ArrayLike<number>,
): Uint8Array {
  const result = new Uint8Array(world.provinceIds.length * 4);
  if (mode === 'political') {
    const countryColors = world.countryMapColor.map(parseHexColor);
    const unowned = parseHexColor(colors.land);
    world.provinceIds.forEach((id, province) =>
      write(
        result,
        province,
        vary(countryColors[provinceOwner[province]] ?? unowned, id, colors.politicalVariation),
      ),
    );
  } else if (mode === 'regions') {
    const palette = colors.regionPalette.map(parseHexColor);
    const choice = assignRegionPalette(world, palette.length);
    world.provinceIds.forEach((id, province) => {
      const region = world.provinceRegion[province];
      write(result, province, vary(palette[choice[region]], id, colors.regionVariation));
    });
  } else {
    const land = parseHexColor(colors.land);
    world.provinceIds.forEach((id, province) =>
      write(result, province, vary(land, id, colors.landVariation)),
    );
  }
  return result;
}

export interface ProvinceHighlight {
  /** Province indices, or null for none. */
  readonly selected: number | null;
  readonly hovered: number | null;
}

/** Copies `base` into `target` and marks the selected province, its neighbors and the hovered province. */
export function applyHighlight(
  base: Uint8Array,
  target: Uint8Array,
  highlight: ProvinceHighlight,
  world: WorldMap,
  colors: Colors,
): void {
  target.set(base);
  const read = (index: number): Rgb => [
    target[index * 4],
    target[index * 4 + 1],
    target[index * 4 + 2],
  ];
  if (highlight.selected !== null) {
    const neighborColor = parseHexColor(colors.neighbor);
    for (const neighbor of neighborsOf(world.provinceNeighbors, highlight.selected))
      write(target, neighbor, mix(read(neighbor), neighborColor, colors.neighborStrength));
    write(target, highlight.selected, parseHexColor(colors.selected));
  }
  if (highlight.hovered !== null) {
    const white: Rgb = [255, 255, 255];
    write(target, highlight.hovered, mix(read(highlight.hovered), white, colors.hoverBrighten));
  }
}

/** The color of every sea zone: deep or shallow water, each zone shaded slightly differently. */
export function seaZoneColors(world: WorldMap, colors: Colors): Uint8Array {
  const result = new Uint8Array(world.seaZoneIds.length * 4);
  const deep = parseHexColor(colors.seaDeep);
  const shallow = parseHexColor(colors.seaShallow);
  world.seaZoneIds.forEach((id, zone) =>
    write(result, zone, vary(world.seaZoneDeep[zone] ? deep : shallow, id, colors.seaVariation)),
  );
  return result;
}
