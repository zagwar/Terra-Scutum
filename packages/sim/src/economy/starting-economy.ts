import type { GameData } from '../data/game-data';
import type { CountryStartTable } from '../world/country-start';
import type { WorldMap } from '../world/world-map';
import {
  type BuildingsState,
  createBuildings,
  linkStartingBuildings,
  refreshBuildingJobs,
} from './buildings';
import { type PopulationState, createPopulation } from './population';

/**
 * The economy at the start of a campaign: the population (F06), the
 * starting buildings (F07, F85), each province's pop mix fitted to its
 * buildings' jobs (`fitPopsToBuildings`), and the buildings taking over
 * their jobs from the stand-in economy (`linkStartingBuildings`).
 */
export function createStartingEconomy(
  data: GameData,
  world: WorldMap,
  countryStart: CountryStartTable,
): { population: PopulationState; buildings: BuildingsState } {
  const population = createPopulation(data, world, countryStart);
  const buildings = createBuildings(data, world);
  refreshBuildingJobs(buildings, population, -1);
  fitPopsToBuildings(population, world);
  linkStartingBuildings(buildings, population);
  return { population, buildings };
}

/**
 * F85: each province starts with the workers its buildings need (a steel
 * province has more skilled workers, a farming province more laborers),
 * while every province keeps its workforce and every country its number of
 * people in each pop group (F06's split by GDP per person).
 *
 * Per country: the people the buildings' jobs need (their jobs, plus the
 * unemployed share each pop has) come first, scaled down where a pop group
 * of the whole country or a province's workforce is too small for them;
 * the rest of each province's workforce takes the groups the country has
 * left over, in the same proportions everywhere. Province totals and
 * country totals come out exactly as before. Call it before
 * `linkStartingBuildings`, with `population.buildingJobs` up to date.
 */
export function fitPopsToBuildings(population: PopulationState, world: WorldMap): void {
  const { size, buildingJobs, employmentTarget, standInJobs, jobs } = population;
  const groups = population.groupCount;
  const countries = world.countryIds.length;
  const need = new Float64Array(groups);
  const left = new Float64Array(groups);
  const total = new Float64Array(groups);
  const { offsets, targets } = world.countryProvinces;
  for (let c = 0; c < countries; c++) {
    total.fill(0);
    need.fill(0);
    for (let k = offsets[c]; k < offsets[c + 1]; k++) {
      const row = targets[k] * groups;
      for (let g = 0; g < groups; g++) {
        total[g] += size[row + g];
        const target = employmentTarget[row + g];
        need[g] += target > 0 ? buildingJobs[row + g] / target : 0;
      }
    }
    // A group of the whole country too small for its jobs: everyone of it
    // works in buildings, shared by the jobs.
    const groupScale = new Float64Array(groups);
    for (let g = 0; g < groups; g++) groupScale[g] = need[g] > total[g] ? total[g] / need[g] : 1;

    // The people the buildings need, province by province (`wanted` reuses `need`).
    left.set(total);
    let leftAll = 0;
    const wanted = new Float64Array(groups);
    for (let k = offsets[c]; k < offsets[c + 1]; k++) {
      const row = targets[k] * groups;
      let workforce = 0;
      let wantedAll = 0;
      for (let g = 0; g < groups; g++) {
        workforce += size[row + g];
        const target = employmentTarget[row + g];
        wanted[g] = target > 0 ? (buildingJobs[row + g] / target) * groupScale[g] : 0;
        wantedAll += wanted[g];
      }
      const scale = wantedAll > workforce ? workforce / wantedAll : 1;
      for (let g = 0; g < groups; g++) {
        // Stash what the province's buildings take in `size` for now.
        size[row + g] = wanted[g] * scale;
        left[g] -= size[row + g];
      }
      // What the province has left for the rest: its workforce less that.
      standInJobs[row] = workforce - wantedAll * scale;
    }
    for (let g = 0; g < groups; g++) {
      if (left[g] < 0) left[g] = 0;
      leftAll += left[g];
    }
    // The rest of each province's workforce takes the groups left over.
    for (let k = offsets[c]; k < offsets[c + 1]; k++) {
      const row = targets[k] * groups;
      const rest = standInJobs[row];
      for (let g = 0; g < groups; g++) {
        if (leftAll > 0) size[row + g] += (rest * left[g]) / leftAll;
        standInJobs[row + g] = size[row + g] * employmentTarget[row + g];
      }
      for (let g = 0; g < groups; g++) jobs[row + g] = standInJobs[row + g] + buildingJobs[row + g];
    }
  }
  population.reportOwnershipVersion = -1;
}
