import { merge } from 'topojson-client';
import type { MapSettings } from './config';
import {
  type Polygons,
  areaKm2,
  distanceKm,
  labelPoint,
  polygonsContain,
  toPolygons,
} from './geometry';
import { splitInTwo } from './split';
import { slugify, uniqueIds } from './text';
import type { City, UnitSet } from './units';

/**
 * Builds the game's provinces from the source units. Each cluster of a
 * country gets a target number of provinces from its area and population
 * ([DEFAULT] settings); small units are merged with neighbors and heavy ones
 * are split until the provinces are roughly balanced.
 */
export interface ProvinceDraft {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly polygons: Polygons;
  readonly areaKm2: number;
  readonly center: [number, number];
  readonly cities: readonly City[];
  /** Estimated population (import-time only; not game data). */
  readonly population: number;
  /** Names of the source units it was made from (for the report). */
  readonly sourceUnits: readonly string[];
  /** True if it is part of a split unit. */
  readonly split: boolean;
}

interface Work {
  readonly key: number;
  readonly cluster: number;
  readonly country: string;
  readonly units: number[];
  readonly split: boolean;
  /** For split parts: the name and center of the province they were split from. */
  readonly root: { name: string; center: [number, number] } | null;
  polygons: Polygons | null;
  readonly areaKm2: number;
  readonly population: number;
  readonly cities: City[];
}

export interface ProvinceBuildReport {
  readonly merges: number;
  readonly splits: number;
}

export function buildProvinces(
  set: UnitSet,
  settings: MapSettings,
  nameOverrides: Readonly<Record<string, string>>,
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

  let nextKey = 0;
  let merges = 0;
  let splits = 0;
  const unitGeometry = (members: number[]): Polygons => {
    if (members.length === 1) return units[members[0]].polygons;
    const merged = merge(set.topology, members.map((i) => geometries[i]) as never);
    return toPolygons(merged);
  };
  /**
   * Name choices for a province made of whole units, best first: a whole source territory's
   * name (e.g. "Bermuda"); the unit's own name; the source grouping (e.g. "Bretagne") when it
   * holds most of the people; then the most populous units' names.
   */
  const nameCandidates = (members: number[], clusterMembers: number[]): string[] => {
    const out: string[] = [];
    const territories = new Set(members.map((i) => units[i].sourceCode));
    if (territories.size === 1) {
      const unit = units[members[0]];
      const allOfIt =
        clusterMembers.filter((i) => units[i].sourceCode === unit.sourceCode).length ===
        members.length;
      if (!unit.homeTerritory && allOfIt) out.push(unit.territoryName);
    }
    if (members.length > 1) {
      const total = members.reduce((sum, i) => sum + units[i].population, 0);
      const byGrouping = new Map<string, number>();
      for (const i of members) {
        const g = units[i].grouping;
        if (g) byGrouping.set(g, (byGrouping.get(g) ?? 0) + units[i].population);
      }
      const top = [...byGrouping].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      const whole =
        top && clusterMembers.every((i) => units[i].grouping !== top[0] || members.includes(i));
      if (top && whole && top[1] > total / 2 && !COMPASS_ONLY.test(top[0])) out.push(top[0]);
    }
    const byPopulation = [...members].sort(
      (a, b) => units[b].population - units[a].population || a - b,
    );
    for (const i of byPopulation.slice(0, 3)) out.push(units[i].name);
    return [...new Set(out)];
  };

  type Draft = { work: Work; name: string; candidates: string[] };
  const drafts: Draft[] = [];

  for (const [cluster, clusterMembers] of [...set.clusters].sort((a, b) => a[0] - b[0])) {
    const country = units[clusterMembers[0]].country;
    let works: Work[] = clusterMembers.map((i) => {
      const unit = units[i];
      return {
        key: nextKey++,
        cluster,
        country,
        units: [i],
        split: false,
        root: null,
        polygons: unit.polygons,
        areaKm2: unit.areaKm2,
        population: unit.population,
        cities: [...unit.cities],
      };
    });
    const target = Math.max(1, Math.round(works.reduce((sum, w) => sum + load(w), 0)));

    const ownerOfUnit = new Map<number, Work>();
    const reindex = () => {
      ownerOfUnit.clear();
      for (const w of works) if (!w.split) for (const i of w.units) ownerOfUnit.set(i, w);
    };
    reindex();
    // Combine light source groupings (each connected piece of one) into single provinces first.
    {
      const groups = new Map<string, number[]>();
      for (const i of clusterMembers) {
        const g = units[i].grouping;
        if (g) groups.set(g, [...(groups.get(g) ?? []), i]);
      }
      const byUnit = new Map(works.map((w) => [w.units[0], w]));
      for (const [, members] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
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
          const merged: Work = {
            key: nextKey++,
            cluster,
            country,
            units: [...component].sort((a, b) => a - b),
            split: false,
            root: null,
            polygons: null,
            areaKm2: parts.reduce((sum, w) => sum + w.areaKm2, 0),
            population: parts.reduce((sum, w) => sum + w.population, 0),
            cities: parts.flatMap((w) => w.cities).sort((a, b) => b.population - a.population),
          };
          if (load(merged) >= s.wholeGroupingBelowLoad) continue;
          const removed = new Set(parts);
          works = works.filter((w) => !removed.has(w)).concat(merged);
          merges += component.length - 1;
        }
      }
      reindex();
    }
    const centers = new Map<Work, [number, number]>();
    const center = (w: Work): [number, number] => {
      let c = centers.get(w);
      if (!c) {
        if (w.split) {
          c = labelPoint(w.polygons ?? []);
        } else {
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
        }
        centers.set(w, c);
      }
      return c;
    };

    const mergeSmallest = (): boolean => {
      const loads = new Map(works.map((w) => [w, load(w)]));
      const candidates = works
        .filter((w) => !w.split && loads.get(w)! < s.mergeBelowLoad)
        .sort((a, b) => loads.get(a)! - loads.get(b)! || a.key - b.key);
      for (const small of candidates) {
        const adjacent = new Set<Work>();
        for (const i of small.units) {
          for (const j of set.neighbors[i] ?? []) {
            const other = ownerOfUnit.get(j);
            if (other && other !== small && other.cluster === cluster) adjacent.add(other);
          }
        }
        let partners = [...adjacent];
        if (partners.length === 0) {
          if (loads.get(small)! >= s.seaMergeBelowLoad) continue;
          const here = center(small);
          const others = works.filter((w) => !w.split && w !== small);
          if (others.length === 0) continue;
          const distances = new Map(others.map((w) => [w, distanceKm(here, center(w))]));
          others.sort((a, b) => distances.get(a)! - distances.get(b)! || a.key - b.key);
          partners = [others[0]];
        }
        const groupingOf = (w: Work) => new Set(w.units.map((i) => units[i].grouping));
        const score = (w: Work) => {
          const shared = [...groupingOf(small)].some((g) => g !== null && groupingOf(w).has(g));
          return (load(small) + load(w)) * (shared ? 1 : s.groupingMergePenalty);
        };
        partners.sort((a, b) => score(a) - score(b) || a.key - b.key);
        const partner = partners[0];
        const merged: Work = {
          key: nextKey++,
          cluster,
          country,
          units: [...partner.units, ...small.units].sort((a, b) => a - b),
          split: false,
          root: null,
          polygons: null,
          areaKm2: partner.areaKm2 + small.areaKm2,
          population: partner.population + small.population,
          cities: [...partner.cities, ...small.cities].sort((a, b) => b.population - a.population),
        };
        works = works.filter((w) => w !== small && w !== partner).concat(merged);
        reindex();
        merges += 1;
        return true;
      }
      return false;
    };

    const splitHeaviest = (): boolean => {
      const heavy = [...works].sort((a, b) => load(b) - load(a) || a.key - b.key)[0];
      if (!heavy) return false;
      heavy.polygons ??= unitGeometry(heavy.units);
      const cityPopulation = heavy.cities.reduce((sum, c) => sum + c.population, 0);
      const ruralPopulation = Math.max(0, heavy.population - cityPopulation);
      const perPerson = 1 / popPerProvince(country);
      const halves = splitInTwo({
        polygons: heavy.polygons,
        areaWeight: heavy.areaKm2 / s.areaPerProvinceKm2 + ruralPopulation * perPerson,
        points: heavy.cities.map((c) => ({
          lon: c.lon,
          lat: c.lat,
          weight: Math.min(c.population, heavy.population) * perPerson,
        })),
      });
      if (!halves) return false;
      const root = heavy.root ?? {
        name: nameCandidates(heavy.units, clusterMembers)[0],
        center: labelPoint(heavy.polygons),
      };
      const parts = halves.map((polygons): Work => {
        const area = areaKm2(polygons);
        const cities = heavy.cities.filter((c) => polygonsContain(polygons, c.lon, c.lat));
        const cityPop = cities.reduce(
          (sum, c) => sum + Math.min(c.population, heavy.population),
          0,
        );
        return {
          key: nextKey++,
          cluster,
          country,
          units: heavy.units,
          split: true,
          root,
          polygons,
          areaKm2: area,
          population: Math.min(
            heavy.population,
            cityPop + (heavy.areaKm2 > 0 ? (ruralPopulation * area) / heavy.areaKm2 : 0),
          ),
          cities,
        };
      });
      works = works.filter((w) => w !== heavy).concat(parts);
      reindex();
      splits += 1;
      return true;
    };

    // Reach the target count, then keep trading "merge the lightest" for "split the heaviest"
    // while that makes the provinces more even.
    for (let iteration = 0; iteration < 5000; iteration++) {
      const unsplit = works.filter((w) => !w.split);
      const lightest = unsplit.length > 0 ? Math.min(...unsplit.map(load)) : Infinity;
      const heaviest = Math.max(...works.map(load));
      if (works.length > target) {
        if (!mergeSmallest()) break;
      } else if (works.length < target) {
        if (!splitHeaviest()) break;
      } else if (lightest < s.minMergeLoad && heaviest / 2 >= s.minMergeLoad) {
        if (!mergeSmallest() || !splitHeaviest()) break;
      } else if (heaviest > s.maxLoad) {
        if (!splitHeaviest()) break;
      } else {
        break;
      }
    }

    for (const work of works) {
      work.polygons ??= unitGeometry(work.units);
      drafts.push({
        work,
        name: '',
        candidates: work.split ? [] : nameCandidates(work.units, clusterMembers),
      });
    }
  }

  // Whole-unit provinces take their first name choice unless another province of the same
  // country wants the same name (then both fall back to their next choice).
  const byCountry = new Map<string, Draft[]>();
  for (const d of drafts)
    if (!d.work.split) byCountry.set(d.work.country, [...(byCountry.get(d.work.country) ?? []), d]);
  for (const list of byCountry.values()) {
    const level = new Map<Draft, number>(list.map((d) => [d, 0]));
    for (let round = 0; round < 4; round++) {
      const wanted = new Map<string, number>();
      for (const d of list) {
        const name = d.candidates[Math.min(level.get(d)!, d.candidates.length - 1)];
        wanted.set(name, (wanted.get(name) ?? 0) + 1);
      }
      let changed = false;
      for (const d of list) {
        const i = level.get(d)!;
        if (
          wanted.get(d.candidates[Math.min(i, d.candidates.length - 1)])! > 1 &&
          i < d.candidates.length - 1
        ) {
          level.set(d, i + 1);
          changed = true;
        }
      }
      if (!changed) break;
    }
    for (const d of list) d.name = d.candidates[Math.min(level.get(d)!, d.candidates.length - 1)]!;
  }

  nameSplitParts(drafts, settings);

  // Drop islets (keep each province's largest piece), then give ids.
  const finished = drafts.map(({ work, name }) => {
    const pieces = (work.polygons ?? []).map((polygon) => ({ polygon, area: areaKm2([polygon]) }));
    const largest = Math.max(...pieces.map((p) => p.area));
    const kept = pieces
      .filter((p) => p.area >= s.minIsletAreaKm2 || p.area === largest)
      .map((p) => p.polygon);
    return { work, name, polygons: kept };
  });
  finished.sort(
    (a, b) =>
      a.work.country.localeCompare(b.work.country) ||
      a.name.localeCompare(b.name) ||
      a.work.key - b.work.key,
  );
  const ids = uniqueIds(finished.map((f) => `${f.work.country.toLowerCase()}_${slugify(f.name)}`));
  const provinces = finished.map((f, index): ProvinceDraft => {
    const id = ids[index];
    return {
      id,
      name: nameOverrides[id] ?? f.name,
      country: f.work.country,
      polygons: f.polygons,
      areaKm2: areaKm2(f.polygons),
      center: labelPoint(f.polygons),
      cities: f.work.cities,
      population: f.work.population,
      sourceUnits: f.work.units.map((i) => units[i].name),
      split: f.work.split,
    };
  });
  return { provinces, report: { merges, splits } };
}

/** Grouping names that only give a direction ("North", "Eastern"…) are not used as province names. */
const COMPASS_ONLY =
  /^(central|centre|north|south|east|west|northern|southern|eastern|western|north[ -]?(east|west)(ern)?|south[ -]?(east|west)(ern)?)$/i;

const DIRECTIONS = [
  'East',
  'Northeast',
  'North',
  'Northwest',
  'West',
  'Southwest',
  'South',
  'Southeast',
] as const;

/**
 * Names the parts of split provinces: after their biggest city when it is big
 * enough (and not already used in the country), otherwise "<Province> (North)" etc.
 */
function nameSplitParts(drafts: { work: Work; name: string }[], settings: MapSettings): void {
  const usedByCountry = new Map<string, Set<string>>();
  const used = (country: string) => {
    let set = usedByCountry.get(country);
    if (!set) usedByCountry.set(country, (set = new Set()));
    return set;
  };
  for (const d of drafts) if (!d.work.split) used(d.work.country).add(d.name);

  const parts = drafts.filter((d) => d.work.split);
  const byRoot = new Map<string, { work: Work; name: string }[]>();
  for (const part of parts) {
    const key = `${part.work.country}|${part.work.root!.name}`;
    byRoot.set(key, [...(byRoot.get(key) ?? []), part]);
  }
  for (const group of byRoot.values()) {
    const rootCenter = group[0].work.root!.center;
    for (const part of group) {
      const taken = used(part.work.country);
      const city = [...part.work.cities]
        .sort((a, b) => b.population - a.population)
        .find((c) => c.population >= settings.provinces.cityNameMinPopulation);
      if (city && !taken.has(`${part.work.root!.name} (${city.name})`)) {
        part.name = `${part.work.root!.name} (${city.name})`;
      } else {
        const here = labelPoint(part.work.polygons ?? []);
        const dx = (here[0] - rootCenter[0]) * Math.cos((rootCenter[1] * Math.PI) / 180);
        const dy = here[1] - rootCenter[1];
        const index = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
        const direction = Math.hypot(dx, dy) < 0.3 ? 'Central' : DIRECTIONS[index];
        let name = `${part.work.root!.name} (${direction})`;
        for (let n = 2; taken.has(name); n++) name = `${part.work.root!.name} (${direction} ${n})`;
        part.name = name;
      }
      taken.add(part.name);
    }
  }
}
