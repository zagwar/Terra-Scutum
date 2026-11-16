import { type MapViewConfig, type WorldMap, isCoastZone, neighborsOf } from '@terra-scutum/sim';

/**
 * Province and sea zone colors for each map mode. Pure code: the renderer
 * writes the result into a small texture (one pixel per province), so
 * switching map modes or highlighting a province never touches the meshes.
 *
 * Colors are stored as r, g, b, a bytes, four per province.
 */

/** The map modes that exist so far (section 12.2); more come with their features. */
export const MAP_MODES = ['political', 'provinces', 'regions', 'seaZones', 'population'] as const;
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
 * The color for a population density (people per km²) on the population map
 * mode's scale: the steps' colors, mixed by the logarithm of the density.
 */
export function populationDensityColor(perKm2: number, steps: Colors['populationDensity']): Rgb {
  const last = steps[steps.length - 1];
  if (!(perKm2 > steps[0].perKm2)) return parseHexColor(steps[0].color);
  if (perKm2 >= last.perKm2) return parseHexColor(last.color);
  let i = 1;
  while (steps[i].perKm2 < perKm2) i++;
  const low = steps[i - 1];
  const high = steps[i];
  const amount = Math.log(perKm2 / low.perKm2) / Math.log(high.perKm2 / low.perKm2);
  return mix(parseHexColor(low.color), parseHexColor(high.color), amount);
}

/**
 * The color of every province in a map mode, before any highlighting.
 * `provinceOwner` is the country (index) that owns each province right now;
 * the political map mode colors each province by its owner.
 * `provincePopulation` is everyone living in each province (F06), for the
 * population map mode; without it that mode shows plain land.
 */
export function provinceBaseColors(
  mode: MapMode,
  world: WorldMap,
  colors: Colors,
  provinceOwner: ArrayLike<number>,
  provincePopulation?: ArrayLike<number> | null,
): Uint8Array {
  const result = new Uint8Array(world.provinceIds.length * 4);
  if (mode === 'population' && provincePopulation) {
    world.provinceIds.forEach((_, province) => {
      const area = world.provinceAreaKm2[province];
      const density = area > 0 ? provincePopulation[province] / area : 0;
      write(result, province, populationDensityColor(density, colors.populationDensity));
    });
  } else if (mode === 'political') {
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
    const regionColors = world.regionMapColor.map(parseHexColor);
    world.provinceIds.forEach((id, province) =>
      write(
        result,
        province,
        vary(regionColors[world.provinceRegion[province]], id, colors.regionVariation),
      ),
    );
  } else {
    // Provinces and sea zones map modes: plain land, so the borders (or the sea) stand out.
    const land = parseHexColor(colors.land);
    world.provinceIds.forEach((id, province) =>
      write(result, province, vary(land, id, colors.landVariation)),
    );
  }
  return result;
}

export interface ProvinceHighlight {
  /** Province (or sea zone) indices, or null for none. */
  readonly selected: number | null;
  readonly hovered: number | null;
  /** A whole country to tint (F05, while choosing a country), with the current owners; or null. */
  readonly country?: { readonly index: number; readonly owners: Uint16Array } | null;
}

/**
 * The highlight of every province, to lie over the land (F125): r, g, b and,
 * in alpha, how strongly it covers whatever is under it (0 = no highlight).
 * In order: the highlighted country, the selected province's neighbors, the
 * selected province, the hovered province. Where several meet they are mixed
 * one over the other, so the result looks the same as tinting a color step
 * by step.
 */
export function provinceHighlights(
  target: Uint8Array,
  highlight: ProvinceHighlight,
  world: WorldMap,
  colors: Colors,
): void {
  target.fill(0);
  // Per province while mixing: the color times its strength, and the strength.
  const mixed = new Map<number, [number, number, number, number]>();
  const cover = (province: number, color: Rgb, strength: number) => {
    const now = mixed.get(province) ?? [0, 0, 0, 0];
    mixed.set(province, [
      now[0] * (1 - strength) + color[0] * strength,
      now[1] * (1 - strength) + color[1] * strength,
      now[2] * (1 - strength) + color[2] * strength,
      1 - (1 - now[3]) * (1 - strength),
    ]);
  };
  if (highlight.country) {
    const { index, owners } = highlight.country;
    const tint = parseHexColor(colors.countryHighlight);
    for (let province = 0; province < owners.length; province++)
      if (owners[province] === index) cover(province, tint, colors.countryHighlightStrength);
  }
  if (highlight.selected !== null) {
    const neighborColor = parseHexColor(colors.neighbor);
    for (const neighbor of neighborsOf(world.provinceNeighbors, highlight.selected))
      cover(neighbor, neighborColor, colors.neighborStrength);
    cover(highlight.selected, parseHexColor(colors.selected), colors.selectedStrength);
  }
  if (highlight.hovered !== null) cover(highlight.hovered, [255, 255, 255], colors.hoverBrighten);
  for (const [province, [r, g, b, strength]] of mixed) {
    if (strength <= 0) continue;
    write(target, province, [r / strength, g / strength, b / strength]);
    target[province * 4 + 3] = Math.round(strength * 255);
  }
}

/**
 * The color of every sea zone in a map mode. Every mode but "sea zones" shows
 * a calm sea: one even blue. The sea zones map mode shows coastal sea zones
 * (bordering at least one province) in one blue and open sea in another, so
 * the coast stands out a little. No random shading: two zones of the same
 * kind always look the same.
 */
export function seaZoneColors(mode: MapMode, world: WorldMap, colors: Colors): Uint8Array {
  const result = new Uint8Array(world.seaZoneIds.length * 4);
  const sea = parseHexColor(colors.sea);
  const coastal = parseHexColor(colors.seaCoastal);
  const open = parseHexColor(colors.seaOpen);
  world.seaZoneIds.forEach((_, zone) => {
    if (mode !== 'seaZones') write(result, zone, sea);
    else write(result, zone, isCoastZone(world, zone) ? coastal : open);
  });
  return result;
}

/** Copies `base` into `target` and marks the selected and the hovered sea zone. */
export function applySeaHighlight(
  base: Uint8Array,
  target: Uint8Array,
  highlight: ProvinceHighlight,
  colors: Colors,
): void {
  target.set(base);
  const read = (index: number): Rgb => [
    target[index * 4],
    target[index * 4 + 1],
    target[index * 4 + 2],
  ];
  if (highlight.selected !== null)
    write(
      target,
      highlight.selected,
      mix(read(highlight.selected), parseHexColor(colors.seaSelected), colors.seaSelectedStrength),
    );
  if (highlight.hovered !== null) {
    const white: Rgb = [255, 255, 255];
    write(target, highlight.hovered, mix(read(highlight.hovered), white, colors.hoverBrighten));
  }
}
