/**
 * Turns a name into an id fragment: lowercase ASCII letters, digits and single
 * underscores ("Île-de-France" → "ile_de_france").
 */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[øØ]/g, 'o')
    .replace(/[đĐ]/g, 'd')
    .replace(/[łŁ]/g, 'l')
    .replace(/[ıİ]/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'unnamed';
}

/** Gives each item a unique id, adding _2, _3… when the same id comes up again. */
export function uniqueIds(baseIds: readonly string[]): string[] {
  const seen = new Map<string, number>();
  const used = new Set(baseIds);
  return baseIds.map((base) => {
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    if (count === 1) return base;
    let candidate = `${base}_${count}`;
    let n = count;
    while (used.has(candidate)) candidate = `${base}_${++n}`;
    used.add(candidate);
    return candidate;
  });
}

/** Cleans up a place name from the source data (trims, removes doubled spaces). */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}
