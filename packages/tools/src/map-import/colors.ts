/**
 * Map colors for countries [DEFAULT]. Every country gets a color from a
 * palette of clearly different colors, chosen so that countries that touch
 * (or face each other across a narrow sea, or share a neighbor) look as
 * different from each other as possible.
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
const WEIGHT_NEAR = 0.75;
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
  const index = new Map(countries.map((id, i) => [id, i]));
  // links[i]: country index → weight (the strongest link wins).
  const links: Map<number, number>[] = countries.map(() => new Map<number, number>());
  const link = (a: string, b: string, weight: number) => {
    const i = index.get(a);
    const j = index.get(b);
    if (i === undefined || j === undefined || i === j) return;
    if ((links[i].get(j) ?? 0) < weight) links[i].set(j, weight);
    if ((links[j].get(i) ?? 0) < weight) links[j].set(i, weight);
  };
  for (const [a, list] of neighbors) for (const b of list) link(a, b, WEIGHT_BORDER);
  for (const [a, list] of near) for (const b of list) link(a, b, WEIGHT_NEAR);
  for (const list of neighbors.values()) {
    const sorted = [...list].sort();
    for (const a of sorted) for (const b of sorted) if (a < b) link(a, b, WEIGHT_SHARED_NEIGHBOR);
  }

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

/** A slightly lighter or darker version of a color, different for each key (to tell provinces apart). */
export function varyColor(color: string, key: string, amount = 0.14): Rgb {
  const [r, g, b] = parseHex(color);
  const f = 1 + ((hash(key) % 1000) / 1000 - 0.5) * 2 * amount;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return [clamp(r), clamp(g), clamp(b)];
}
