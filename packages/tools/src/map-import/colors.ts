/**
 * Map colors for countries [DEFAULT]: muted colors, chosen so that countries
 * sharing a border never get the same one.
 */
export const COUNTRY_PALETTE = [
  '#8c6d4f',
  '#5f7f5a',
  '#7a5c7e',
  '#4f6f8f',
  '#9a7b3c',
  '#6b8e8a',
  '#a0614f',
  '#5b6b9a',
  '#7f8f4f',
  '#8f5f6f',
  '#4f8a6f',
  '#9a8a6a',
  '#6a5a8a',
  '#8a6a3a',
  '#5a8a9a',
  '#7a7a4a',
  '#9a5a5a',
  '#5a7a5a',
  '#6a7a9a',
  '#8a7a9a',
] as const;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function assignCountryColors(
  countries: readonly string[],
  neighbors: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, string> {
  const order = [...countries].sort(
    (a, b) => (neighbors.get(b)?.size ?? 0) - (neighbors.get(a)?.size ?? 0) || a.localeCompare(b),
  );
  const colors = new Map<string, string>();
  for (const country of order) {
    const taken = new Set([...(neighbors.get(country) ?? [])].map((n) => colors.get(n)));
    const start = hash(country) % COUNTRY_PALETTE.length;
    let color: string = COUNTRY_PALETTE[start];
    for (let k = 0; k < COUNTRY_PALETTE.length; k++) {
      const candidate = COUNTRY_PALETTE[(start + k) % COUNTRY_PALETTE.length];
      if (!taken.has(candidate)) {
        color = candidate;
        break;
      }
    }
    colors.set(country, color);
  }
  return colors;
}

export function parseHex(color: string): [number, number, number] {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** A slightly lighter or darker version of a color, different for each key (to tell provinces apart). */
export function varyColor(color: string, key: string, amount = 0.14): [number, number, number] {
  const [r, g, b] = parseHex(color);
  const f = 1 + ((hash(key) % 1000) / 1000 - 0.5) * 2 * amount;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return [clamp(r), clamp(g), clamp(b)];
}
