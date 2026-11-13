/**
 * Map colors for countries [DEFAULT]. Every country has a traditional color
 * (the one commonly associated with it, from `country-colors.json`). It keeps
 * that color unless a country that touches it (or faces it across a narrow
 * sea, or shares a neighbor with it) would look too much alike: then the
 * less important of the two gets the nearest shade that can be told apart
 * (`assignTraditionalColors`). A country without a traditional color gets
 * one from a palette of clearly different colors (`assignCountryColors`).
 *
 * "How different two colors look" is measured in OKLab, a color space built
 * so that equal distances look like equal differences to the eye. Colors are
 * described as lightness, chroma (how colorful) and hue (which color).
 */

export type Rgb = [number, number, number];
type Lab = [number, number, number];

export function parseHex(color: string): Rgb {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) =>
  255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklab([r8, g8, b8]: Rgb): Lab {
  const r = toLinear(r8);
  const g = toLinear(g8);
  const b = toLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** The color for a lightness (0–1), chroma and hue (degrees), or null if a screen can't show it. */
function oklchToRgb(lightness: number, chroma: number, hueDegrees: number): Rgb | null {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  if (linear.some((c) => c < -0.0005 || c > 1.0005)) return null;
  const [r, g, bl] = linear.map((c) => Math.round(fromLinear(Math.min(1, Math.max(0, c)))));
  return [r, g, bl];
}

/** How different two colors look (OKLab distance): about 0.02 is barely visible, 0.1 is obvious. */
export function colorDifference(a: string, b: string): number {
  const [l1, a1, b1] = rgbToOklab(parseHex(a));
  const [l2, a2, b2] = rgbToOklab(parseHex(b));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Lightness counts for this much of a difference in color when telling countries apart. */
const LIGHTNESS_WEIGHT = 0.35;

/**
 * How easily two countries' colors are told apart on the map. Like
 * `colorDifference`, but a difference in lightness counts for much less than
 * a difference in color: a light and a dark shade of the same color read as
 * "the same color" (and provinces of one country are already shaded lighter
 * and darker). About 0.1 or more is easy to tell apart.
 */
export function mapColorContrast(a: string, b: string): number {
  const [l1, a1, b1] = rgbToOklab(parseHex(a));
  const [l2, a2, b2] = rgbToOklab(parseHex(b));
  return Math.hypot(LIGHTNESS_WEIGHT * (l1 - l2), a1 - a2, b1 - b2);
}

/**
 * The palette: twelve hues in three tiers (light, medium, dark; the medium
 * tier's hues sit between the others'), plus three near-greys. A color a
 * screen can't show is made less colorful until it can.
 */
function buildPalette(): string[] {
  const tiers = [
    { lightness: 0.8, chroma: 0.095, hueOffset: 0 },
    { lightness: 0.67, chroma: 0.125, hueOffset: 15 },
    { lightness: 0.54, chroma: 0.11, hueOffset: 0 },
  ];
  const palette: string[] = [];
  const add = (lightness: number, chroma: number, hue: number) => {
    for (let c = chroma; c >= 0; c -= 0.005) {
      const rgb = oklchToRgb(lightness, c, hue);
      if (rgb) {
        palette.push(toHex(rgb));
        return;
      }
    }
  };
  for (const tier of tiers)
    for (let hue = 0; hue < 360; hue += 30) add(tier.lightness, tier.chroma, hue + tier.hueOffset);
  add(0.84, 0.02, 85);
  add(0.62, 0.015, 85);
  add(0.56, 0.03, 250);
  return palette;
}

export const COUNTRY_PALETTE: readonly string[] = buildPalette();

/** How much each kind of link counts when keeping two countries' colors apart. */
const WEIGHT_BORDER = 1;
const WEIGHT_NEAR = 0.6;
const WEIGHT_SHARED_NEIGHBOR = 0.45;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Gives every country a palette color.
 *
 * - `neighbors`: countries sharing a land border. Their colors are kept as far apart as possible.
 * - `near`: countries close to each other without a land border (across a strait or a narrow sea).
 * - Countries that share a neighbor are kept apart too, a little less strictly.
 *
 * Countries are colored one by one (the most hemmed-in first), each taking
 * the color that differs most from the ones around it; then every country is
 * looked at again a few times in case a better color has become available.
 * The result is always the same for the same input.
 */
export function assignCountryColors(
  countries: readonly string[],
  neighbors: ReadonlyMap<string, ReadonlySet<string>>,
  near: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): Map<string, string> {
  const palette = COUNTRY_PALETTE;
  const links = buildLinks(countries, neighbors, near);

  const difference = palette.map((a) => palette.map((b) => mapColorContrast(a, b)));
  const choice = new Int32Array(countries.length).fill(-1);
  const used = new Int32Array(palette.length);

  /** The best palette color for a country, given the colors around it right now. */
  const pick = (country: number): number => {
    let best = 0;
    let bestScore = -Infinity;
    let bestUsed = Infinity;
    const start = hash(countries[country]) % palette.length;
    for (let k = 0; k < palette.length; k++) {
      const candidate = (start + k) % palette.length;
      // The score: the smallest difference to a linked country (weaker links count for less).
      let score = Infinity;
      for (const [other, weight] of links[country]) {
        if (choice[other] < 0) continue;
        score = Math.min(score, difference[candidate][choice[other]] / weight);
      }
      // Compare coarsely, so that among (nearly) equally good colors the least used one wins.
      const rounded = Number.isFinite(score) ? Math.round(score * 100) : Infinity;
      const count = used[candidate] - (choice[country] === candidate ? 1 : 0);
      if (rounded > bestScore || (rounded === bestScore && count < bestUsed)) {
        best = candidate;
        bestScore = rounded;
        bestUsed = count;
      }
    }
    return best;
  };
  const set = (country: number, color: number) => {
    if (choice[country] >= 0) used[choice[country]] -= 1;
    choice[country] = color;
    used[color] += 1;
  };

  const order = countries
    .map((_, i) => i)
    .sort((a, b) => links[b].size - links[a].size || countries[a].localeCompare(countries[b]));
  for (const country of order) set(country, pick(country));
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const country of order) {
      const better = pick(country);
      if (better !== choice[country]) {
        set(country, better);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return new Map(countries.map((id, i) => [id, palette[choice[i]]]));
}

/**
 * Which countries' colors must be kept apart, and how strongly: for each
 * country (by position in `countries`), the linked countries and a weight
 * (land border 1, nearly touching less, sharing a neighbor less still).
 */
function buildLinks(
  countries: readonly string[],
  neighbors: ReadonlyMap<string, ReadonlySet<string>>,
  near: ReadonlyMap<string, ReadonlySet<string>>,
  sharedNeighbors = true,
): Map<number, number>[] {
  const index = new Map(countries.map((id, i) => [id, i]));
  const links: Map<number, number>[] = countries.map(() => new Map<number, number>());
  // The strongest link between two countries wins.
  const link = (a: string, b: string, weight: number) => {
    const i = index.get(a);
    const j = index.get(b);
    if (i === undefined || j === undefined || i === j) return;
    if ((links[i].get(j) ?? 0) < weight) links[i].set(j, weight);
    if ((links[j].get(i) ?? 0) < weight) links[j].set(i, weight);
  };
  for (const [a, list] of neighbors) for (const b of list) link(a, b, WEIGHT_BORDER);
  for (const [a, list] of near) for (const b of list) link(a, b, WEIGHT_NEAR);
  if (sharedNeighbors) {
    for (const list of neighbors.values()) {
      const sorted = [...list].sort();
      for (const a of sorted) for (const b of sorted) if (a < b) link(a, b, WEIGHT_SHARED_NEIGHBOR);
    }
  }
  return links;
}

/** Bordering countries' colors must be at least this far apart (see `mapColorContrast`). */
export const MIN_BORDER_CONTRAST = 0.09;
/** Colors stay light enough to stand out from the dark sea, and are never blown out. */
const MIN_LIGHTNESS = 0.38;
const MAX_LIGHTNESS = 0.93;

/**
 * Shades close to a color: a little lighter or darker, a little more or less
 * colorful, the hue turned a little; for near-greys also a slight tint. The
 * color itself comes first; the rest are sorted by how far they are from it.
 */
function shadesOf(color: string): string[] {
  const [l0, a, b] = rgbToOklab(parseHex(color));
  const chroma = Math.hypot(a, b);
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  const lightness = Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, l0));
  const shades = new Set<string>();
  const add = (l: number, c: number, h: number) => {
    const clamped = Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, l));
    for (let reduced = c; reduced >= 0; reduced -= 0.005) {
      const rgb = oklchToRgb(clamped, reduced, h);
      if (rgb) {
        shades.add(toHex(rgb));
        return;
      }
    }
  };
  for (const dl of [0, -0.05, 0.05, -0.1, 0.1, -0.15, 0.15]) {
    for (const dh of [0, -12, 12, -24, 24, -36, 36, -48, 48])
      for (const scale of [1, 0.8, 1.15]) add(lightness + dl, chroma * scale, hue + dh);
    // A grey or a white has no hue to turn: give it a slight tint instead.
    if (chroma < 0.04) for (let h = 0; h < 360; h += 30) add(lightness + dl, 0.045, h);
  }
  const start = lightness === l0 ? color : [...shades][0];
  return [start, ...[...shades].filter((shade) => shade !== start)]
    .map((shade, order) => ({ shade, order, cost: colorDifference(shade, color) }))
    .sort((p, q) => p.cost - q.cost || p.order - q.order)
    .map((entry) => entry.shade);
}

export interface TraditionalColors {
  readonly colors: Map<string, string>;
  /** Countries that could not keep their traditional color exactly (id, wanted, got), most changed first. */
  readonly adjusted: { id: string; wanted: string; got: string; change: number }[];
}

/**
 * Gives every country its traditional color (`preferred`), or the nearest
 * shade of it that can still be told apart from the countries around it.
 * Countries are handled from the most to the least important (`importance`,
 * higher first), so the important ones keep their exact colors and smaller
 * neighbors give way. A country missing from `preferred` gets a palette color.
 * The result is always the same for the same input.
 */
export function assignTraditionalColors(
  countries: readonly string[],
  neighbors: ReadonlyMap<string, ReadonlySet<string>>,
  near: ReadonlyMap<string, ReadonlySet<string>>,
  preferred: ReadonlyMap<string, string>,
  importance: ReadonlyMap<string, number>,
): TraditionalColors {
  // Traditional colors only give way to countries that touch or nearly touch (not to ones that
  // merely share a neighbor): keeping the colors people expect matters more here.
  const links = buildLinks(countries, neighbors, near, false);
  const fallback = assignCountryColors(countries, neighbors, near);
  const wanted = countries.map((id) => preferred.get(id) ?? fallback.get(id)!);
  const chosen: (string | null)[] = countries.map(() => null);
  const order = countries
    .map((_, i) => i)
    .sort(
      (a, b) =>
        (importance.get(countries[b]) ?? 0) - (importance.get(countries[a]) ?? 0) ||
        countries[a].localeCompare(countries[b]),
    );
  for (const country of order) {
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const shade of shadesOf(wanted[country])) {
      // The score: how well the shade stands apart from the linked countries colored so far (1 = enough).
      let score = Infinity;
      for (const [other, weight] of links[country]) {
        const color = chosen[other];
        if (color !== null)
          score = Math.min(score, mapColorContrast(shade, color) / (MIN_BORDER_CONTRAST * weight));
      }
      if (score >= 1) {
        best = shade; // shades come nearest first: this is the closest one that works
        break;
      }
      if (score > bestScore) {
        best = shade;
        bestScore = score;
      }
    }
    chosen[country] = best ?? wanted[country];
  }
  const colors = new Map(countries.map((id, i) => [id, chosen[i]!]));
  const adjusted = countries
    .map((id, i) => ({
      id,
      wanted: wanted[i],
      got: chosen[i]!,
      change: colorDifference(wanted[i], chosen[i]!),
    }))
    .filter((entry) => entry.got !== entry.wanted)
    .sort((a, b) => b.change - a.change || a.id.localeCompare(b.id));
  return { colors, adjusted };
}

/** A slightly lighter or darker version of a color, different for each key (to tell provinces apart). */
export function varyColor(color: string, key: string, amount = 0.14): Rgb {
  const [r, g, b] = parseHex(color);
  const f = 1 + ((hash(key) % 1000) / 1000 - 0.5) * 2 * amount;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return [clamp(r), clamp(g), clamp(b)];
}
