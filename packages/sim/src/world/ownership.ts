import { type WorldMap, neighborsOf } from './world-map';

/**
 * Province ownership (section 4): every province is owned by one country, and
 * ownership changes at the province level during a campaign. The owners live
 * in `GameState.provinceOwner` (one country index per province); the helpers
 * here answer questions about them. They are pure, so the game's UI can use
 * them on the owners it gets in the snapshot.
 */

/** The value in an owner array for a province nobody owns (not used yet: every province has an owner). */
export const NO_OWNER = 0xffff;

/** A fresh owner array holding every province's starting owner. */
export function startingOwners(world: WorldMap): Uint16Array {
  return world.provinceCountry.slice();
}

/** What a country holds right now. */
export interface CountrySummary {
  /** Province indices, in index order. */
  readonly provinces: number[];
  readonly areaKm2: number;
  /** Indices of the countries it shares a land border with, in index order. */
  readonly neighbors: number[];
}

export function summarizeCountry(
  world: WorldMap,
  provinceOwner: ArrayLike<number>,
  country: number,
): CountrySummary {
  const provinces: number[] = [];
  const neighbors = new Set<number>();
  let areaKm2 = 0;
  for (let province = 0; province < world.provinceIds.length; province++) {
    if (provinceOwner[province] !== country) continue;
    provinces.push(province);
    areaKm2 += world.provinceAreaKm2[province];
    for (const neighbor of neighborsOf(world.provinceNeighbors, province)) {
      const other = provinceOwner[neighbor];
      if (other !== country && other !== NO_OWNER) neighbors.add(other);
    }
  }
  return { provinces, areaKm2, neighbors: [...neighbors].sort((a, b) => a - b) };
}

/** How many provinces each country owns. */
export function countProvincesByOwner(
  world: WorldMap,
  provinceOwner: ArrayLike<number>,
): Uint16Array {
  const counts = new Uint16Array(world.countryIds.length);
  for (let province = 0; province < world.provinceIds.length; province++) {
    const owner = provinceOwner[province];
    if (owner !== NO_OWNER) counts[owner] += 1;
  }
  return counts;
}
