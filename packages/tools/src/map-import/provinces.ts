import { merge } from 'topojson-client';
import type { MapSettings, ProvinceGroupsConfig } from './config';
import { type Polygons, areaKm2, distanceKm, labelPoint, toPolygons } from './geometry';
import { slugify, uniqueIds } from './text';
import type { City, UnitSet } from './units';

/**
 * Builds the game's provinces from the source units (real states and
 * provinces). Provinces always follow real borders: units are only ever
 * combined, never cut. In each cluster of a country:
 *
 * 1. Named groups from `province-groups.json` are combined first ("New England").
 * 2. Light source groupings become one province each ("Greater London", "Bretagne").
 * 3. While the cluster has more provinces than its target ([DEFAULT] settings),
 *    the lightest one merges with a neighbor.
 *
 * Combined provinces get an area name: the named group's name, the source
 * grouping's name, or a direction within the country ("Northern Algeria").
 */
export type NameSource =
  'unit' | 'group' | 'territory' | 'grouping' | 'absorbed' | 'pair' | 'direction';

export interface ProvinceDraft {
  readonly id: string;
  readonly name: string;
  readonly nameSource: NameSource;
  readonly country: string;
  readonly polygons: Polygons;
  readonly areaKm2: number;
  readonly center: [number, number];
  readonly cities: readonly City[];
  /** Estimated population (import-time only; not game data). */
  readonly population: number;
  /** The source units it was made from (indices into the unit set). */
  readonly units: readonly number[];
  /** Names of those source units (for the report). */
  readonly sourceUnits: readonly string[];
}

interface Work {
  readonly key: number;
  readonly cluster: number;
  readonly country: string;
  readonly units: number[];
  /** Set for named groups: the name is fixed and the province is never merged further. */
  readonly fixedName: string | null;
  readonly areaKm2: number;
  readonly population: number;
  readonly cities: City[];
}

export interface ProvinceBuildReport {
  readonly merges: number;
  /** Codes in province-groups.json that match no source unit. */
  readonly unknownGroupCodes: string[];
}

const COMPASS_ONLY =
  /^(central|centre|north|south|east|west|northern|southern|eastern|western|north[ -]?(east|west)(ern)?|south[ -]?(east|west)(ern)?)$/i;
const DIRECTION_WORDS = [
  'Eastern',
  'Northeastern',
  'Northern',
  'Northwestern',
  'Western',
  'Southwestern',
  'Southern',
  'Southeastern',
] as const;

export function buildProvinces(
  set: UnitSet,
  settings: MapSettings,
  groups: ProvinceGroupsConfig,
  nameOverrides: Readonly<Record<string, string>>,
  countryNames: ReadonlyMap<string, string>,
): { provinces: ProvinceDraft[]; report: ProvinceBuildReport } {
  const s = settings.provinces;
  const { units } = set;
  const geometries = set.topology.objects.units.geometries;

  // People per province in each country: √(population × unit) gives diminishing returns, so
  // huge countries get more provinces but not proportionally more.
  const countryPopulation = new Map<string, number>();
  for (const [, members] of set.clusters) {
    for (const i of members) {
      const unit = units[i];
      countryPopulation.set(
        unit.country,
        (countryPopulation.get(unit.country) ?? 0) + unit.population,
      );
    }
  }
  const popPerProvince = (country: string) =>
    Math.max(1, Math.sqrt((countryPopulation.get(country) ?? 0) * s.populationUnit));
  const load = (w: Work) =>
    w.areaKm2 / s.areaPerProvinceKm2 + w.population / popPerProvince(w.country);

  // Named groups, by country: "code:US-CT", "grouping:East Wales", "name:Saint George" or
  // "territory:HKG" → group index.
  const groupKeys = new Map<string, Map<string, number>>();
  groups.groups.forEach((group, index) => {
    let keys = groupKeys.get(group.country);
    if (!keys) groupKeys.set(group.country, (keys = new Map<string, number>()));
    for (const code of group.units ?? []) keys.set(`code:${code}`, index);
    for (const name of group.groupings ?? []) keys.set(`grouping:${name}`, index);
    for (const name of group.names ?? []) keys.set(`name:${name}`, index);
    for (const code of group.territories ?? []) keys.set(`territory:${code}`, index);
  });
  const keepSeparate = new Set(groups.keepSeparate);
  const usedCodes = new Set<string>();

  let nextKey = 0;
  let merges = 0;
  const combine = (parts: Work[], fixedName: string | null): Work => ({
    key: nextKey++,
    cluster: parts[0].cluster,
    country: parts[0].country,
    units: parts.flatMap((w) => w.units).sort((a, b) => a - b),
    fixedName,
    areaKm2: parts.reduce((sum, w) => sum + w.areaKm2, 0),
    population: parts.reduce((sum, w) => sum + w.population, 0),
    cities: parts.flatMap((w) => w.cities).sort((a, b) => b.population - a.population),
  });

  const finished: { work: Work; name: string; nameSource: NameSource }[] = [];

  for (const [cluster, clusterMembers] of [...set.clusters].sort((a, b) => a[0] - b[0])) {
    const country = units[clusterMembers[0]].country;
    let works: Work[] = clusterMembers.map((i) => {
      const unit = units[i];
      return {
        key: nextKey++,
        cluster,
        country,
        units: [i],
        fixedName: null,
        areaKm2: unit.areaKm2,
        population: unit.population,
        cities: [...unit.cities],
      };
    });
    const target = Math.max(1, Math.round(works.reduce((sum, w) => sum + load(w), 0)));

    // 1. Named groups.
    const keys = groupKeys.get(country);
    if (keys) {
      const byGroup = new Map<number, Work[]>();
      for (const w of works) {
        const unit = units[w.units[0]];
        const candidates = [
          unit.iso === null ? null : `code:${unit.iso}`,
          `name:${unit.name}`,
          unit.grouping === null ? null : `grouping:${unit.grouping}`,
          `territory:${unit.sourceCode}`,
        ];
        let group: number | undefined;
        for (const key of candidates) {
          if (key === null || group !== undefined) continue;
          group = keys.get(key);
          if (group !== undefined) usedCodes.add(`${country}|${key}`);
        }
        if (group === undefined) continue;
        byGroup.set(group, [...(byGroup.get(group) ?? []), w]);
      }
      for (const [group, parts] of [...byGroup].sort((a, b) => a[0] - b[0])) {
        const removed = new Set(parts);
        works = works
          .filter((w) => !removed.has(w))
          .concat(combine(parts, groups.groups[group].name));
        merges += parts.length - 1;
      }
    }

    // 2. Light source groupings (each connected piece of one) become single provinces. They are
    //    real regions with real names, so they are not merged any further.
    const wholeGroupings = new Set<Work>();
    {
      const byUnit = new Map(
        works.filter((w) => w.units.length === 1 && !w.fixedName).map((w) => [w.units[0], w]),
      );
      const byGrouping = new Map<string, number[]>();
      // Only groupings still complete (none of their units taken by a named group), and not in
      // countries whose states are kept separate.
      const taken = new Set(
        works.filter((w) => w.fixedName).flatMap((w) => w.units.map((i) => units[i].grouping)),
      );
      if (!keepSeparate.has(country)) {
        for (const i of byUnit.keys()) {
          const g = units[i].grouping;
          if (g && !taken.has(g)) byGrouping.set(g, [...(byGrouping.get(g) ?? []), i]);
        }
      }
      for (const [, members] of [...byGrouping].sort((a, b) => a[0].localeCompare(b[0]))) {
        const memberSet = new Set(members);
        const seen = new Set<number>();
        for (const start of members) {
          if (seen.has(start)) continue;
          const component: number[] = [];
          const stack = [start];
          seen.add(start);
          while (stack.length > 0) {
            const i = stack.pop()!;
            component.push(i);
            for (const j of set.neighbors[i] ?? []) {
              if (memberSet.has(j) && !seen.has(j)) {
                seen.add(j);
                stack.push(j);
              }
            }
          }
          if (component.length < 2) continue;
          const parts = component.map((i) => byUnit.get(i)!);
          const merged = combine(parts, null);
          if (load(merged) >= s.wholeGroupingBelowLoad) continue;
          wholeGroupings.add(merged);
          const removed = new Set(parts);
          works = works.filter((w) => !removed.has(w)).concat(merged);
          merges += parts.length - 1;
        }
      }
    }

    // 3. Merge the lightest provinces into neighbors until the cluster reaches its target.
    const centers = new Map<Work, [number, number]>();
    const center = (w: Work): [number, number] => {
      let c = centers.get(w);
      if (!c) {
        let x = 0;
        let y = 0;
        let total = 0;
        for (const i of w.units) {
          const unit = units[i];
          const weight = Math.max(unit.areaKm2, 1e-6);
          x += unit.center[0] * weight;
          y += unit.center[1] * weight;
          total += weight;
        }
        c = [x / total, y / total];
        centers.set(w, c);
      }
      return c;
    };
    const groupingsOf = (w: Work) => new Set(w.units.map((i) => units[i].grouping));
    while (works.length > target && !keepSeparate.has(country)) {
      const ownerOfUnit = new Map<number, Work>();
      for (const w of works) for (const i of w.units) ownerOfUnit.set(i, w);
      const loads = new Map(works.map((w) => [w, load(w)]));
      const candidates = works
        .filter((w) => !w.fixedName && !wholeGroupings.has(w) && loads.get(w)! < s.mergeBelowLoad)
        .sort((a, b) => loads.get(a)! - loads.get(b)! || a.key - b.key);
      let merged = false;
      for (const small of candidates) {
        const adjacent = new Set<Work>();
        for (const i of small.units) {
          for (const j of set.neighbors[i] ?? []) {
            const other = ownerOfUnit.get(j);
            if (other && other !== small && !other.fixedName && !wholeGroupings.has(other))
              adjacent.add(other);
          }
        }
        let partners = [...adjacent];
        if (partners.length === 0) {
          if (loads.get(small)! >= s.seaMergeBelowLoad) continue;
          const here = center(small);
          const others = works.filter((w) => w !== small && !w.fixedName && !wholeGroupings.has(w));
          if (others.length === 0) continue;
          const distances = new Map(others.map((w) => [w, distanceKm(here, center(w))]));
          others.sort((a, b) => distances.get(a)! - distances.get(b)! || a.key - b.key);
          partners = [others[0]];
        }
        const mine = groupingsOf(small);
        const score = (w: Work) => {
          const shared = [...groupingsOf(w)].some((g) => g !== null && mine.has(g));
          return (loads.get(small)! + loads.get(w)!) * (shared ? 1 : s.groupingMergePenalty);
        };
        partners.sort((a, b) => score(a) - score(b) || a.key - b.key);
        const partner = partners[0];
        works = works
          .filter((w) => w !== small && w !== partner)
          .concat(combine([partner, small], null));
        merges += 1;
        merged = true;
        break;
      }
      if (!merged) break;
    }

    // Names for this cluster's provinces.
    const clusterName = (() => {
      const codesInCluster = new Set(clusterMembers.map((i) => units[i].sourceCode));
      const first = units[clusterMembers[0]];
      return codesInCluster.size === 1 && !first.homeTerritory
        ? first.territoryName
        : (countryNames.get(country) ?? country);
    })();
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const i of clusterMembers) {
      const [x, y] = units[i].center;
      box.minX = Math.min(box.minX, x);
      box.maxX = Math.max(box.maxX, x);
      box.minY = Math.min(box.minY, y);
      box.maxY = Math.max(box.maxY, y);
    }
    const direction = (w: Work): string => {
      const [x, y] = center(w);
      const cx = (box.minX + box.maxX) / 2;
      const cy = (box.minY + box.maxY) / 2;
      const dx = (x - cx) / Math.max(0.5, (box.maxX - box.minX) / 2);
      const dy = (y - cy) / Math.max(0.5, (box.maxY - box.minY) / 2);
      if (Math.hypot(dx, dy) < 0.35) return 'Central';
      const index = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
      return DIRECTION_WORDS[index];
    };
    for (const w of works) {
      const [name, source] = nameFor(w);
      finished.push({ work: w, name, nameSource: source });
    }

    function nameFor(w: Work): [string, NameSource] {
      if (w.fixedName) return [w.fixedName, 'group'];
      const members = w.units;
      const first = units[members[0]];
      const territories = new Set(members.map((i) => units[i].sourceCode));
      if (territories.size === 1 && !first.homeTerritory) {
        const allOfIt =
          clusterMembers.filter((i) => units[i].sourceCode === first.sourceCode).length ===
          members.length;
        if (allOfIt) return [first.territoryName, 'territory'];
      }
      if (members.length === 1) return [first.name, 'unit'];
      if (members.length === clusterMembers.length) return [clusterName, 'territory'];
      const groupings = new Set(members.map((i) => units[i].grouping));
      if (groupings.size === 1 && first.grouping) {
        const whole = clusterMembers.every(
          (i) => units[i].grouping !== first.grouping || members.includes(i),
        );
        if (whole) {
          const compass = compassAdjective(first.grouping);
          return compass ? [`${compass} ${clusterName}`, 'grouping'] : [first.grouping, 'grouping'];
        }
      }
      const total = load(w);
      const parts = members
        .map((i) => ({ unit: units[i], share: unitLoad(i) / Math.max(total, 1e-9) }))
        .sort((a, b) => b.share - a.share);
      if (parts[0].share >= s.dominantShare) return [parts[0].unit.name, 'absorbed'];
      if (members.length === 2) {
        const [a, b] = [parts[0].unit.name, parts[1].unit.name].sort((p, q) => p.localeCompare(q));
        return [a === b ? a : `${a} and ${b}`, 'pair'];
      }
      const d = direction(w);
      return [d === 'Central' ? `Central ${clusterName}` : `${d} ${clusterName}`, 'direction'];
    }
    function unitLoad(i: number): number {
      const unit = units[i];
      return unit.areaKm2 / s.areaPerProvinceKm2 + unit.population / popPerProvince(unit.country);
    }
  }

  // Duplicate names inside a country: add the biggest member's name to tell them apart.
  const byCountryName = new Map<string, typeof finished>();
  for (const f of finished) {
    const k = `${f.work.country}|${f.name}`;
    byCountryName.set(k, [...(byCountryName.get(k) ?? []), f]);
  }
  for (const list of byCountryName.values()) {
    if (list.length < 2) continue;
    for (const f of list) {
      const biggest = [...f.work.units].sort(
        (a, b) => units[b].population - units[a].population || a - b,
      )[0];
      if (f.work.units.length > 1 || units[biggest].name !== f.name)
        f.name = `${f.name} (${units[biggest].name})`;
    }
  }

  const unknownGroupCodes = groups.groups
    .flatMap((group) => [
      ...(group.units ?? []).map((v) => `${group.country}|code:${v}`),
      ...(group.groupings ?? []).map((v) => `${group.country}|grouping:${v}`),
      ...(group.names ?? []).map((v) => `${group.country}|name:${v}`),
      ...(group.territories ?? []).map((v) => `${group.country}|territory:${v}`),
    ])
    .filter((key) => !usedCodes.has(key))
    .map((key) => key.replace('|', ' '));

  // Geometry, islets, ids.
  const geometryOf = (members: number[]): Polygons =>
    members.length === 1
      ? units[members[0]].polygons
      : toPolygons(merge(set.topology, members.map((i) => geometries[i]) as never));
  const built = finished.map((f) => {
    const pieces = geometryOf(f.work.units).map((polygon) => ({
      polygon,
      area: areaKm2([polygon]),
    }));
    const largest = Math.max(...pieces.map((p) => p.area));
    const polygons = pieces
      .filter((p) => p.area >= s.minIsletAreaKm2 || p.area === largest)
      .map((p) => p.polygon);
    return { ...f, polygons };
  });
  built.sort(
    (a, b) =>
      a.work.country.localeCompare(b.work.country) ||
      a.name.localeCompare(b.name) ||
      a.work.key - b.work.key,
  );
  const ids = uniqueIds(built.map((f) => `${f.work.country.toLowerCase()}_${slugify(f.name)}`));
  const provinces = built.map((f, index): ProvinceDraft => {
    const id = ids[index];
    return {
      id,
      name: nameOverrides[id] ?? f.name,
      nameSource: f.nameSource,
      country: f.work.country,
      polygons: f.polygons,
      areaKm2: areaKm2(f.polygons),
      center: labelPoint(f.polygons),
      cities: f.work.cities,
      population: f.work.population,
      units: f.work.units,
      sourceUnits: f.work.units.map((i) => units[i].name),
    };
  });
  return { provinces, report: { merges, unknownGroupCodes } };
}

/** "North West" → "Northwestern", "Centre" → "Central"; null if the name is not just a direction. */
export function compassAdjective(name: string): string | null {
  if (!COMPASS_ONLY.test(name)) return null;
  const key = name.toLowerCase().replace(/[ -]/g, '').replace(/ern$/, '');
  const table: Record<string, string> = {
    central: 'Central',
    centre: 'Central',
    north: 'Northern',
    south: 'Southern',
    east: 'Eastern',
    west: 'Western',
    northeast: 'Northeastern',
    northwest: 'Northwestern',
    southeast: 'Southeastern',
    southwest: 'Southwestern',
  };
  return table[key] ?? null;
}
