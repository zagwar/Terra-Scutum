import type { DataCrossCheck, DataIssue } from '../data/game-data';

/**
 * Cross-file checks for the map data: unique ids, references that exist,
 * borders listed on both sides, and every country and region holding land.
 */
export const checkWorldData: DataCrossCheck = (data, report) => {
  const issue = (file: string, path: string, message: string) =>
    report({ file, path, message } satisfies DataIssue);
  const { countries } = data.countries;
  const { provinces } = data.provinces;
  const { regions } = data.regions;
  const { seaZones } = data.seaZones;

  const unique = <T extends { id: string }>(file: string, list: readonly T[], root: string) => {
    const seen = new Map<string, number>();
    list.forEach((item, index) => {
      const first = seen.get(item.id);
      if (first !== undefined)
        issue(file, `${root}.${index}.id`, `duplicate id "${item.id}" (also at ${root}.${first})`);
      else seen.set(item.id, index);
    });
    return seen;
  };
  const countryIds = unique('countries.json', countries, 'countries');
  const provinceIds = unique('provinces.json', provinces, 'provinces');
  const regionIds = unique('regions.json', regions, 'regions');
  const seaZoneIds = unique('sea_zones.json', seaZones, 'seaZones');

  const provinceNeighbors = new Map(provinces.map((p) => [p.id, new Set(p.adjacentProvinces)]));
  const seaNeighbors = new Map(seaZones.map((s) => [s.id, new Set(s.adjacentSeaZones)]));
  const provincesOfCountry = new Map<string, number>();
  const provincesOfRegion = new Map<string, number>();

  provinces.forEach((p, index) => {
    const at = `provinces.${index}`;
    if (!countryIds.has(p.country))
      issue('provinces.json', `${at}.country`, `unknown country "${p.country}"`);
    if (!regionIds.has(p.region))
      issue('provinces.json', `${at}.region`, `unknown region "${p.region}"`);
    provincesOfCountry.set(p.country, (provincesOfCountry.get(p.country) ?? 0) + 1);
    provincesOfRegion.set(p.region, (provincesOfRegion.get(p.region) ?? 0) + 1);
    p.adjacentProvinces.forEach((other, k) => {
      if (other === p.id)
        issue('provinces.json', `${at}.adjacentProvinces.${k}`, 'a province cannot border itself');
      else if (!provinceIds.has(other))
        issue('provinces.json', `${at}.adjacentProvinces.${k}`, `unknown province "${other}"`);
      else if (!provinceNeighbors.get(other)!.has(p.id)) {
        issue(
          'provinces.json',
          `${at}.adjacentProvinces.${k}`,
          `"${other}" does not list "${p.id}" back as a neighbor`,
        );
      }
    });
    p.adjacentSeaZones.forEach((zone, k) => {
      if (!seaZoneIds.has(zone))
        issue('provinces.json', `${at}.adjacentSeaZones.${k}`, `unknown sea zone "${zone}"`);
    });
  });

  seaZones.forEach((s, index) => {
    s.adjacentSeaZones.forEach((other, k) => {
      const at = `seaZones.${index}.adjacentSeaZones.${k}`;
      if (other === s.id) issue('sea_zones.json', at, 'a sea zone cannot border itself');
      else if (!seaZoneIds.has(other)) issue('sea_zones.json', at, `unknown sea zone "${other}"`);
      else if (!seaNeighbors.get(other)!.has(s.id))
        issue('sea_zones.json', at, `"${other}" does not list "${s.id}" back as a neighbor`);
    });
  });

  countries.forEach((c, index) => {
    if (!provincesOfCountry.has(c.id))
      issue('countries.json', `countries.${index}`, `country "${c.id}" has no provinces`);
    const capital = provinces[provinceIds.get(c.capitalProvince) ?? -1];
    if (!capital)
      issue(
        'countries.json',
        `countries.${index}.capitalProvince`,
        `unknown province "${c.capitalProvince}"`,
      );
    else if (capital.country !== c.id) {
      issue(
        'countries.json',
        `countries.${index}.capitalProvince`,
        `"${c.capitalProvince}" belongs to ${capital.country}, not ${c.id}`,
      );
    }
  });
  regions.forEach((r, index) => {
    if (!provincesOfRegion.has(r.id))
      issue('regions.json', `regions.${index}`, `region "${r.id}" has no provinces`);
  });
};
