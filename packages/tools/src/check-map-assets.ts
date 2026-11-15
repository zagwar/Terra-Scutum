import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  type GameData,
  alertTypeNameKey,
  cabinetSeatNameKey,
  diplomaticActionNameKey,
  lawCategoryNameKey,
  opinionStanceNameKey,
  messageTypeNameKey,
  modelNameKey,
  countryNameKey,
  governmentTypeNameKey,
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
  for (const g of data.governmentTypes.governmentTypes)
    need(governmentTypeNameKey(g.id), `government type ${g.id}`);
  for (const m of data.notifications.messageTypes)
    need(messageTypeNameKey(m.id), `message type ${m.id}`);
  for (const a of data.notifications.alertTypes) need(alertTypeNameKey(a.id), `alert type ${a.id}`);
  const screen = data.countryScreen;
  for (const l of screen.laws) need(lawCategoryNameKey(l.id), `law ${l.id}`);
  for (const s of screen.cabinetSeats) need(cabinetSeatNameKey(s.id), `cabinet seat ${s.id}`);
  for (const s of screen.publicOpinion.stances) need(opinionStanceNameKey(s), `stance ${s}`);
  for (const a of screen.diplomaticActions)
    need(diplomaticActionNameKey(a.id), `diplomatic action ${a.id}`);
  for (const id of Object.keys(data.models.models)) need(modelNameKey(id), `model ${id}`);
  for (const view of data.stressTest.render.views) need(view.name, `stress test view ${view.name}`);
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

/**
 * The terrain (F125): every tile `data/terrain_tiles.json` lists has its file
 * in `tileDir` (one folder per level), and there are no files it doesn't list.
 */
export function checkTerrainTiles(data: GameData, tileDir: string): string[] {
  const problems: string[] = [];
  const hint = 'run `npm run import:terrain` again';
  data.terrainTiles.levels.forEach((level, index) => {
    const dir = join(tileDir, String(index));
    const listed = new Set(level.tiles.map((tile) => `${tile}.bin`));
    const found = existsSync(dir) ? readdirSync(dir) : [];
    let missing = 0;
    for (const file of listed) if (!found.includes(file)) missing += 1;
    const extra = found.filter((file) => !listed.has(file)).length;
    if (missing > 0)
      problems.push(`terrain level ${index}: ${missing} listed tile file(s) are missing (${hint})`);
    if (extra > 0)
      problems.push(`terrain level ${index}: ${extra} file(s) are not in the tile list (${hint})`);
  });
  return problems;
}

/** `data/geometry/rivers.json` (F125): whole numbers, an even count of them, at least two points per river. */
export function checkRivers(file: string, content: unknown): string[] {
  const rivers = content as {
    unitsPerDegree?: unknown;
    rivers?: { weight?: unknown; points?: unknown }[];
  };
  if (typeof rivers?.unitsPerDegree !== 'number' || !Array.isArray(rivers.rivers))
    return [`${file}: not a rivers file`];
  const problems: string[] = [];
  rivers.rivers.forEach((river, index) => {
    const { points } = river;
    if (
      typeof river.weight !== 'number' ||
      !Array.isArray(points) ||
      points.length < 4 ||
      points.length % 2 !== 0 ||
      !points.every((value) => Number.isInteger(value))
    )
      problems.push(`${file}: river ${index} is malformed`);
  });
  if (rivers.rivers.length === 0) problems.push(`${file}: has no rivers`);
  return problems;
}
