import { buildCountryStartTable, buildWorldMap, parseGameData } from '@terra-scutum/sim';
import type { Objects, Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import provincesText from '../../../data/geometry/provinces.topo.json?raw';
import { decodePolygons } from '../src/render/map/map-geometry';
import { createMapProjection } from '../src/render/map/map-projection';
import { createShapeLookup } from '../src/render/map/shape-lookup';
import {
  POWER_KIND,
  RAIL_KIND,
  ROAD_KIND,
  STRESS_BUG,
  STRESS_BUILDING,
  STRESS_UNIT,
  apportion,
  placeStressLoad,
} from '../src/render/stress/stress-placement';
import { RAW_GAME_DATA } from '../src/worker/game-data';

// On the real map: the render stress test's load where `?debug=stress` puts it (F139).
type MapTopology = Topology<Objects<Record<string, never>>>;
const data = parseGameData(RAW_GAME_DATA);
const world = buildWorldMap(data);
const start = buildCountryStartTable(data.countryStart, world);
const projection = createMapProjection(data.mapView.projection);
const polygons = decodePolygons(
  JSON.parse(provincesText) as MapTopology,
  'provinces',
  (id) => world.provinceIndex.get(id)!,
  projection,
);
const lookup = createShapeLookup(polygons, projection);
const ground = {
  x: (longitude: number) => projection.x(longitude),
  z: (latitude: number) => projection.z(latitude),
  latitude: (z: number) => projection.latitude(z),
  provinceAt: (x: number, z: number) => lookup.find(x, z),
};
const config = data.stressTest.render;
const variants = (id: string) => {
  const entry = data.models.models[id];
  return entry.source === 'generator' ? entry.variants : 1;
};
const placement = placeStressLoad(world, start.population, config, variants, ground);
const { statics, bugs, defenders } = placement;
const count = (kind: number) => {
  let n = 0;
  for (let i = 0; i < statics.count; i++) if (statics.kind[i] === kind) n += 1;
  return n;
};

describe('the render stress test’s load (F139)', () => {
  it('splits a total into whole parts by weight', () => {
    expect(Array.from(apportion([1, 1, 2], 8))).toEqual([2, 2, 4]);
    expect(Array.from(apportion([1, 1, 1], 4)).reduce((a, b) => a + b)).toBe(4);
    expect(Array.from(apportion([0, 0], 5))).toEqual([0, 0]);
  });

  it('puts about the asked-for number of buildings in cities, every one in its own province', () => {
    const buildings = count(STRESS_BUILDING);
    expect(buildings).toBeGreaterThan(config.buildings * 0.98);
    expect(buildings).toBeLessThanOrEqual(config.buildings);
    for (let i = 0; i < statics.count; i += 97) {
      if (statics.kind[i] !== STRESS_BUILDING) continue;
      expect(lookup.find(statics.x[i], statics.z[i])).toBeGreaterThanOrEqual(0);
    }
    // Countries with more people get more buildings: India more than Iceland.
    const inCountry = (id: string) => {
      const country = world.countryIndex.get(id)!;
      let n = 0;
      for (let i = 0; i < statics.count; i++)
        if (
          statics.kind[i] === STRESS_BUILDING &&
          world.provinceCountry[lookup.find(statics.x[i], statics.z[i])] === country
        )
          n += 1;
      return n;
    };
    expect(inCountry('IND')).toBeGreaterThan(inCountry('ISL') * 5);
  });

  it('places the units, the battle’s defenders and its bugs, each with a model and a variant', () => {
    expect(count(STRESS_UNIT)).toBe(config.units);
    expect(defenders.count).toBe(config.battle.defenders);
    expect(bugs.count).toBe(config.battle.bugs);
    for (let i = 0; i < bugs.count; i++) {
      expect(bugs.kind[i]).toBe(STRESS_BUG);
      expect(config.battle.bugModels).toContain(placement.models[bugs.model[i]]);
      expect(bugs.variant[i]).toBeLessThan(variants(placement.models[bugs.model[i]]));
    }
    // The bugs attack from the east, the defenders hold the west.
    const meanX = (set: typeof bugs) => {
      let sum = 0;
      for (let i = 0; i < set.count; i++) sum += set.x[i];
      return sum / set.count;
    };
    expect(meanX(bugs)).toBeGreaterThan(meanX(defenders));
    expect(Math.abs(meanX(bugs) - projection.x(config.battle.longitude))).toBeLessThan(3);
  });

  it('links neighboring provinces with roads, and with rail and power lines inside a country', () => {
    const kinds = new Map<number, number>();
    for (const line of placement.lines) kinds.set(line.kind, (kinds.get(line.kind) ?? 0) + 1);
    expect(kinds.get(ROAD_KIND)).toBeGreaterThan(2000);
    expect(kinds.get(RAIL_KIND)).toBeGreaterThan(1000);
    expect(kinds.get(POWER_KIND)).toBe(kinds.get(RAIL_KIND));
    for (const line of placement.lines) expect(line.points.length).toBe(6);
  });

  it('is the same every time', () => {
    const again = placeStressLoad(world, start.population, config, variants, ground);
    expect(Array.from(again.statics.x.subarray(0, 500))).toEqual(
      Array.from(statics.x.subarray(0, 500)),
    );
    expect(again.lines.length).toBe(placement.lines.length);
  });
});
