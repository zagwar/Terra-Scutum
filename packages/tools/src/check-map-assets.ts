import {
  type GameData,
  countryNameKey,
  provinceNameKey,
  regionNameKey,
  seaZoneNameKey,
} from '@terra-scutum/sim';

/**
 * Checks that go beyond the sim's own data checks: every map item has a name
 * in the English texts, and the shape files (TopoJSON) hold exactly the
 * provinces and sea zones of the data files.
 */
export function checkMapNames(data: GameData, texts: ReadonlyMap<string, string>): string[] {
  const problems: string[] = [];
  const need = (key: string, what: string) => {
    if (!texts.has(key)) problems.push(`no English name for ${what} (translation key ${key})`);
  };
  for (const c of data.countries.countries) need(countryNameKey(c.id), `country ${c.id}`);
  for (const p of data.provinces.provinces) need(provinceNameKey(p.id), `province ${p.id}`);
  for (const r of data.regions.regions) need(regionNameKey(r.id), `region ${r.id}`);
  for (const s of data.seaZones.seaZones) need(seaZoneNameKey(s.id), `sea zone ${s.id}`);
  return problems;
}

interface TopologyLike {
  type?: unknown;
  objects?: Record<string, { geometries?: { id?: unknown; type?: unknown }[] }>;
}

export function checkGeometry(
  file: string,
  content: unknown,
  objectName: string,
  expectedIds: readonly string[],
): string[] {
  const topo = content as TopologyLike;
  if (topo?.type !== 'Topology') return [`${file}: not a TopoJSON topology`];
  const geometries = topo.objects?.[objectName]?.geometries;
  if (!Array.isArray(geometries)) return [`${file}: has no "${objectName}" object`];
  const problems: string[] = [];
  const ids = geometries.map((g) => g.id);
  const expected = new Set(expectedIds);
  const seen = new Set<unknown>();
  for (const [index, id] of ids.entries()) {
    if (typeof id !== 'string' || !expected.has(id))
      problems.push(`${file}: shape ${index} has unknown id ${String(id)}`);
    if (seen.has(id)) problems.push(`${file}: two shapes have the id ${String(id)}`);
    seen.add(id);
    const type = geometries[index].type;
    if (type !== 'Polygon' && type !== 'MultiPolygon')
      problems.push(`${file}: shape ${String(id)} is empty`);
  }
  for (const id of expectedIds) if (!seen.has(id)) problems.push(`${file}: no shape for ${id}`);
  return problems;
}
