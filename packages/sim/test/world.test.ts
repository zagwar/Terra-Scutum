import { describe, expect, it } from 'vitest';
import {
  DataValidationError,
  GameState,
  buildWorldMap,
  countryNameKey,
  formatDataIssue,
  isCoastalSeaZone,
  neighborsOf,
  parseGameData,
  provinceNameKey,
  regionNameKey,
  seaZoneNameKey,
} from '../src';
import { testData, testRawData, type testWorld } from './helpers';

type Raw = ReturnType<typeof testRawData> & ReturnType<typeof testWorld>;

function issuesAfter(change: (raw: Raw) => void): string[] {
  const raw = structuredClone(testRawData()) as Raw;
  change(raw);
  try {
    parseGameData(raw);
  } catch (error) {
    if (error instanceof DataValidationError) return error.issues.map(formatDataIssue);
    throw error;
  }
  return [];
}

describe('map data checks', () => {
  it('accepts the test world', () => {
    expect(issuesAfter(() => {})).toEqual([]);
  });

  it('rejects provinces that point at countries, regions or sea zones that do not exist', () => {
    const issues = issuesAfter((raw) => {
      raw.provinces.provinces[0].country = 'ZZZ';
      raw.provinces.provinces[0].region = 'nowhere';
      raw.provinces.provinces[0].adjacentSeaZones = ['dry_sea'];
    });
    expect(issues.join('\n')).toContain('unknown country "ZZZ"');
    expect(issues.join('\n')).toContain('unknown region "nowhere"');
    expect(issues.join('\n')).toContain('unknown sea zone "dry_sea"');
  });

  it('requires borders to be listed on both sides and forbids self-borders', () => {
    expect(
      issuesAfter((raw) => {
        raw.provinces.provinces[2].adjacentProvinces = [];
      }).join('\n'),
    ).toContain('"beta_main" does not list "alpha_east" back as a neighbor');
    expect(
      issuesAfter((raw) => {
        raw.provinces.provinces[0].adjacentProvinces.push('alpha_west');
      }).join('\n'),
    ).toContain('a province cannot border itself');
    expect(
      issuesAfter((raw) => {
        raw.seaZones.seaZones[1].adjacentSeaZones = [];
      }).join('\n'),
    ).toContain('"east_sea" does not list "west_sea" back as a neighbor');
  });

  it('checks capitals, empty countries and regions, and duplicate ids', () => {
    expect(
      issuesAfter((raw) => {
        raw.countries.countries[0].capitalProvince = 'beta_main';
      }).join('\n'),
    ).toContain('"beta_main" belongs to BBB, not AAA');
    expect(
      issuesAfter((raw) => {
        raw.countries.countries.push({
          id: 'CCC',
          capitalProvince: 'beta_main',
          mapColor: '#000000',
        });
      }).join('\n'),
    ).toContain('country "CCC" has no provinces');
    expect(
      issuesAfter((raw) => {
        raw.regions.regions.push({
          id: 'empty',
          climate: 'polar',
          center: [0, 0],
          mapColor: '#123456',
        });
      }).join('\n'),
    ).toContain('region "empty" has no provinces');
    expect(
      issuesAfter((raw) => {
        raw.seaZones.seaZones.push({ ...raw.seaZones.seaZones[0] });
      }).join('\n'),
    ).toContain('duplicate id "west_sea"');
  });

  it('rejects malformed values with the file and field', () => {
    const issues = issuesAfter((raw) => {
      raw.provinces.provinces[0].center = [200, 10];
      raw.countries.countries[0].mapColor = 'red';
      raw.regions.regions[0].climate = 'humid';
    });
    expect(issues).toContain(
      'data/provinces.json → provinces.0.center.0: Too big: expected number to be <=180',
    );
    expect(issues.some((i) => i.startsWith('data/countries.json → countries.0.mapColor'))).toBe(
      true,
    );
    expect(issues.some((i) => i.startsWith('data/regions.json → regions.0.climate'))).toBe(true);
  });
});

describe('world map lookups', () => {
  const world = buildWorldMap(testData());

  it('numbers everything in id order', () => {
    expect(world.provinceIds).toEqual(['alpha_east', 'alpha_west', 'beta_main']);
    expect(world.countryIds).toEqual(['AAA', 'BBB']);
    expect(world.seaZoneIds).toEqual(['east_sea', 'west_sea']);
    expect(world.provinceIndex.get('beta_main')).toBe(2);
  });

  it('links provinces, countries, regions and sea zones', () => {
    const p = (id: string) => world.provinceIndex.get(id)!;
    const names = (list: Int32Array, ids: readonly string[]) => [...list].map((i) => ids[i]);
    expect(names(neighborsOf(world.provinceNeighbors, p('alpha_east')), world.provinceIds)).toEqual(
      ['alpha_west', 'beta_main'],
    );
    expect(names(neighborsOf(world.provinceSeaZones, p('alpha_east')), world.seaZoneIds)).toEqual([
      'east_sea',
      'west_sea',
    ]);
    expect(
      names(
        neighborsOf(world.seaZoneProvinces, world.seaZoneIndex.get('east_sea')!),
        world.provinceIds,
      ),
    ).toEqual(['alpha_east', 'beta_main']);
    expect(
      names(neighborsOf(world.countryProvinces, world.countryIndex.get('AAA')!), world.provinceIds),
    ).toEqual(['alpha_east', 'alpha_west']);
    expect(
      names(neighborsOf(world.regionProvinces, world.regionIndex.get('south')!), world.provinceIds),
    ).toEqual(['beta_main']);
    expect(world.countryIds[world.provinceCountry[p('beta_main')]]).toBe('BBB');
    expect(world.provinceAreaKm2[p('alpha_east')]).toBe(2000);
  });

  it("knows each country's capital and map color", () => {
    const c = (id: string) => world.countryIndex.get(id)!;
    expect(world.provinceIds[world.countryCapital[c('AAA')]]).toBe('alpha_west');
    expect(world.provinceIds[world.countryCapital[c('BBB')]]).toBe('beta_main');
    expect(world.countryMapColor).toEqual(['#112233', '#445566']);
    expect(world.regionMapColor).toEqual(['#778899', '#aa8844']);
  });

  it("knows each sea zone's label point and whether it is coastal", () => {
    const z = (id: string) => world.seaZoneIndex.get(id)!;
    expect([...world.seaZoneCenter]).toEqual([2, 5, 0, 5]); // east_sea, then west_sea
    expect(isCoastalSeaZone(world, z('east_sea'))).toBe(true);
    // A sea zone that no province borders is open sea.
    const raw = structuredClone(testRawData()) as Raw;
    for (const province of raw.provinces.provinces)
      province.adjacentSeaZones = province.adjacentSeaZones.filter((id) => id !== 'west_sea');
    const open = buildWorldMap(parseGameData(raw));
    expect(isCoastalSeaZone(open, open.seaZoneIndex.get('west_sea')!)).toBe(false);
    expect(isCoastalSeaZone(open, open.seaZoneIndex.get('east_sea')!)).toBe(true);
  });

  it('is part of every game state', () => {
    const state = new GameState({ data: testData(), seed: 1 });
    expect(state.world.provinceIds).toHaveLength(3);
  });

  it('names map items with translation keys', () => {
    expect(countryNameKey('USA')).toBe('COUNTRY_USA');
    expect(provinceNameKey('usa_texas_houston')).toBe('PROVINCE_USA_TEXAS_HOUSTON');
    expect(regionNameKey('great_plains')).toBe('REGION_GREAT_PLAINS');
    expect(seaZoneNameKey('north_sea')).toBe('SEA_ZONE_NORTH_SEA');
  });
});
