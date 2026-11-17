import type { GameData } from '../data/game-data';
import type { SimSystem, SystemRegistry } from '../core/systems';
import type { GameState } from '../core/game-state';
import type { WorldMap } from '../world/world-map';
import { BUILDING_STAGES, STAGE_OF_CATEGORY } from './buildings-data';
import { type PopulationState, ensurePopulationReport } from './population';

/**
 * Buildings with recipes (F07) and production methods (F85), section 8.3.
 *
 * A province has at most one building of each type, with a **level** and a
 * **production method**: one of its type's recipes. A recipe is per level
 * and day: workers by pop group, electricity, inputs → outputs.
 *
 * - **Workers:** a building offers jobs to its province's pops
 *   (`PopulationState.buildingJobs`). Where a pop group is too small for all
 *   its jobs, every employer gets the same share; a building runs only as
 *   far as its scarcest group allows (its **staffing**).
 * - **Goods:** each country has a **national stockpile** (a stand-in until
 *   markets, F65). Buildings take their inputs from it and put their outputs
 *   in. When a good is short, every building that needs it gets the same
 *   share and runs at partial output. **Standing imports** (a stand-in until
 *   trade, F19) bring every day what the country's starting buildings need
 *   but don't make at home.
 * - **Electricity** can't be stored: power plants make what the country's
 *   buildings and the rest of its economy ask for that day, as far as their
 *   fuel goes. Plants that burn nothing (nuclear, hydro, wind, solar) run
 *   first. With too little, buildings run at partial output; with none, they
 *   stop, except for the share a method keeps off the grid (`offGrid`).
 * - A building's **output** (0–1) is its staffing × the scarcest of its
 *   inputs and electricity.
 *
 * Every day, in three steps of the tick (`BUILDING_STAGES`): power plants
 * (energy), then farms and mines (resourceProduction), then everything else
 * (industry). What a step makes is in the stockpile for the next step.
 *
 * All numbers live in typed arrays; a building's place in a per-building
 * array is its **cell**, `province * typeCount + type`; a recipe's place in a
 * per-recipe array is `recipeOffsets[type] + method`. Nothing is allocated
 * after creation. The model draws no random numbers.
 */
export interface BuildingsState {
  /** The building types' ids and the goods' ids, in the order of the arrays (`data/buildings.json`, `data/goods.json`). */
  readonly typeIds: readonly string[];
  readonly typeCount: number;
  readonly goodIds: readonly string[];
  readonly goodCount: number;
  /** Each type's production methods' ids, in the data's order. */
  readonly methodIds: readonly (readonly string[])[];
  /** The index of the good that is electricity. */
  readonly electricityGood: number;

  // ── From the data, ready for the loops ──────────────────────────────────
  /** The step each type produces in: an index into `BUILDING_STAGES`. */
  readonly typeStage: Uint8Array;
  /** The recipes of type t are `recipeOffsets[t]` … `recipeOffsets[t + 1] - 1`, one per method. */
  readonly recipeOffsets: Int32Array;
  /** Per recipe: electricity used, and electricity made, per level and day. */
  readonly recipeElectricity: Float64Array;
  readonly recipePower: Float64Array;
  /** Per recipe: the share of its output it keeps without grid electricity (0–1). */
  readonly recipeOffGrid: Float64Array;
  /** Per recipe: 1 for a power plant that burns nothing (it runs first). */
  readonly recipeFuelFree: Uint8Array;
  /** Per recipe: jobs per level, all groups together. */
  readonly recipeJobs: Float64Array;
  /** Workers per level: the entries of recipe r are `workerOffsets[r]` … `workerOffsets[r + 1] - 1`. */
  readonly workerOffsets: Int32Array;
  readonly workerGroup: Int32Array;
  readonly workerCount: Float64Array;
  /** Inputs and outputs per level and day, stored the same way (outputs without electricity: that is `recipePower`). */
  readonly inputOffsets: Int32Array;
  readonly inputGood: Int32Array;
  readonly inputAmount: Float64Array;
  readonly outputOffsets: Int32Array;
  readonly outputGood: Int32Array;
  readonly outputAmount: Float64Array;
  readonly startingDays: number;
  readonly maxDays: number;

  // ── Fixed for the campaign (worked out from the starting buildings) ──────
  /** Per country and good: the standing imports that arrive every day (never electricity). */
  readonly imports: Float64Array;
  /**
   * Per province: the electricity the rest of the economy and homes use, in
   * MWh per person a day (from its starting country; it follows the people).
   */
  readonly otherPowerPerPerson: Float64Array;

  // ── The state (saved) ────────────────────────────────────────────────────
  /** Each building's level, by cell; 0 where there is none. Change it only through `setBuildingLevel`. */
  readonly level: Uint16Array;
  /** Each building's production method (an index into its type's methods), by cell. */
  readonly method: Uint8Array;
  /** Each country's national stockpile, at `country * goodCount + good`. */
  readonly stock: Float64Array;

  // ── The layout (worked out from the levels and the owners) ───────────────
  /** The cells that have a building, in order; `cellCount` of them. */
  readonly cells: Int32Array;
  cellCount: number;
  /** The same cells grouped by step: those of step s are `stageOffsets[s]` … `stageOffsets[s + 1] - 1`. */
  readonly stageCells: Int32Array;
  readonly stageOffsets: Int32Array;
  /** Per country and good: what its buildings use and make in a day at full output. */
  readonly capacityUse: Float64Array;
  readonly capacityMake: Float64Array;
  /** The `ownershipVersion` the layout was made with; -1 when the levels changed since. */
  layoutOwnershipVersion: number;

  // ── The report (worked out from the state; not saved) ────────────────────
  /** By cell: the share of its jobs that are filled as its scarcest group allows (0–1), and that group. */
  readonly staffing: Float32Array;
  readonly scarceGroup: Uint8Array;
  /** By cell: people at work, and the wages paid them (US$ a day). */
  readonly workers: Float64Array;
  readonly wages: Float64Array;
  /** By cell: output as a share of full output (0–1). */
  readonly output: Float32Array;
  /** By cell: what holds the building back most (`BUILDING_LIMIT`), and which pop group or good. */
  readonly limitKind: Uint8Array;
  readonly limitWhat: Uint8Array;
  /** Per country and good: made and used today (electricity used includes the rest of the economy's). */
  readonly made: Float64Array;
  readonly used: Float64Array;
  /** Per country: the electricity the rest of the economy and homes asked for today, and what they got. */
  readonly otherPowerWanted: Float64Array;
  readonly otherPowerUsed: Float64Array;
  /** Per province: the jobs its buildings offer and the people at work in them. */
  readonly provinceJobs: Float64Array;
  readonly provinceWorkers: Float64Array;
  /** Goes up every time the report is redone, so hosts know when to resend it. */
  version: number;
  /** What the report was made from; see `ensureBuildingsReport`. */
  reportChanges: number;
  reportPopulationVersion: number;
  reportOwnershipVersion: number;
  /** Goes up whenever the levels, the methods or the stockpile change. */
  changes: number;

  // ── Scratch (no meaning between steps) ───────────────────────────────────
  /** By pop: the share of its jobs a pop can fill (0–1). */
  readonly fill: Float64Array;
  /** Per country and good: asked for in this step, the share of it there is, made in this step. */
  readonly wanted: Float64Array;
  readonly share: Float64Array;
  readonly stageMade: Float64Array;
  /**
   * Per country: electricity asked for (buildings and the rest of the
   * economy), what its fuel-free plants and its other plants could make, how
   * hard each kind runs (0–1), made, and the share of the demand met (0–1).
   */
  readonly powerWanted: Float64Array;
  readonly powerCapacityFree: Float64Array;
  readonly powerCapacityFuel: Float64Array;
  readonly powerLoadFree: Float64Array;
  readonly powerLoadFuel: Float64Array;
  readonly powerMade: Float64Array;
  readonly powerShare: Float64Array;
  /** A copy of the stockpile for the report's trial run. */
  readonly trialStock: Float64Array;
  /** Per step: where its next cell goes while the layout is redone. */
  readonly stageNext: Int32Array;
}

/** What holds a building back most (`BuildingsState.limitKind`). */
export const BUILDING_LIMIT = {
  /** Nothing: it runs at full output. */
  none: 0,
  /** Too few workers of a pop group (`limitWhat`: the group). */
  workers: 1,
  /** Too little electricity. */
  electricity: 2,
  /** Too little of an input (`limitWhat`: the good). */
  input: 3,
  /** A power plant running below full output because no more electricity is asked for. Not a problem. */
  demand: 4,
} as const;

/** A share below this counts as a shortage (so rounding never shows as one). */
const FULL = 0.9995;
const MAX_LEVEL = 65535;

/** The saved part of the buildings. */
export interface BuildingsRestore {
  /** Province index, type index, level and method index of every building, four numbers each. */
  readonly levels: readonly number[];
  /** Per country and good. */
  readonly stock: Float64Array;
}

/**
 * The buildings at the start of a campaign: the recipes from the data, every
 * province's starting buildings (`data/building_start.json`), each country's
 * starting stockpile, its standing imports and the electricity the rest of
 * its economy uses. Call `linkStartingBuildings` next.
 */
export function createBuildings(data: GameData, world: WorldMap): BuildingsState {
  const types = data.buildings.buildings;
  const goodIds = data.goods.goods.map((good) => good.id);
  const groupIds = data.pops.groups.map((group) => group.id);
  const typeCount = types.length;
  const goodCount = goodIds.length;
  const provinces = world.provinceIds.length;
  const countries = world.countryIds.length;
  const groups = groupIds.length;
  const electricityGood = goodIds.indexOf(data.goods.electricity);
  if (groups > 255 || goodCount > 255)
    throw new Error('Buildings: more than 255 pop groups or goods are not supported');

  const methods = types.flatMap((type) => type.methods);
  const recipeOffsets = new Int32Array(typeCount + 1);
  types.forEach((type, t) => (recipeOffsets[t + 1] = recipeOffsets[t] + type.methods.length));
  const flatten = (lists: readonly (readonly [number, number][])[]) => {
    const offsets = new Int32Array(lists.length + 1);
    lists.forEach((list, i) => (offsets[i + 1] = offsets[i] + list.length));
    const flat = lists.flat();
    return {
      offsets,
      keys: Int32Array.from(flat, (entry) => entry[0]),
      amounts: Float64Array.from(flat, (entry) => entry[1]),
    };
  };
  const goodIndex = (good: string) => {
    const index = goodIds.indexOf(good);
    if (index < 0) throw new Error(`Buildings: unknown good "${good}"`);
    return index;
  };
  const workers = flatten(
    methods.map((method) =>
      Object.entries(method.workers)
        .filter(([, count]) => count > 0)
        .map(([group, count]): [number, number] => {
          const index = groupIds.indexOf(group);
          if (index < 0) throw new Error(`Buildings: unknown pop group "${group}"`);
          return [index, count];
        }),
    ),
  );
  const inputs = flatten(
    methods.map((method) =>
      Object.entries(method.inputs ?? {}).map(([good, amount]): [number, number] => [
        goodIndex(good),
        amount,
      ]),
    ),
  );
  const outputs = flatten(
    methods.map((method) =>
      Object.entries(method.outputs)
        .filter(([good]) => good !== data.goods.electricity)
        .map(([good, amount]): [number, number] => [goodIndex(good), amount]),
    ),
  );

  const cellsMax = provinces * typeCount;
  const buildings: BuildingsState = {
    typeIds: types.map((type) => type.id),
    typeCount,
    goodIds,
    goodCount,
    methodIds: types.map((type) => type.methods.map((method) => method.id)),
    electricityGood,
    typeStage: Uint8Array.from(types, (type) =>
      BUILDING_STAGES.indexOf(STAGE_OF_CATEGORY[type.category]),
    ),
    recipeOffsets,
    recipeElectricity: Float64Array.from(methods, (method) => method.electricity ?? 0),
    recipePower: Float64Array.from(
      methods,
      (method) => method.outputs[data.goods.electricity] ?? 0,
    ),
    recipeOffGrid: Float64Array.from(methods, (method) => method.offGrid ?? 0),
    recipeFuelFree: Uint8Array.from(methods, (method) =>
      (method.outputs[data.goods.electricity] ?? 0) > 0 &&
      Object.keys(method.inputs ?? {}).length === 0
        ? 1
        : 0,
    ),
    recipeJobs: Float64Array.from(methods, (method) =>
      Object.values(method.workers).reduce((a, b) => a + b, 0),
    ),
    workerOffsets: workers.offsets,
    workerGroup: workers.keys,
    workerCount: workers.amounts,
    inputOffsets: inputs.offsets,
    inputGood: inputs.keys,
    inputAmount: inputs.amounts,
    outputOffsets: outputs.offsets,
    outputGood: outputs.keys,
    outputAmount: outputs.amounts,
    startingDays: data.buildings.stockpile.startingDays,
    maxDays: data.buildings.stockpile.maxDays,
    imports: new Float64Array(countries * goodCount),
    otherPowerPerPerson: new Float64Array(provinces),
    level: new Uint16Array(cellsMax),
    method: new Uint8Array(cellsMax),
    stock: new Float64Array(countries * goodCount),
    cells: new Int32Array(cellsMax),
    cellCount: 0,
    stageCells: new Int32Array(cellsMax),
    stageOffsets: new Int32Array(BUILDING_STAGES.length + 1),
    capacityUse: new Float64Array(countries * goodCount),
    capacityMake: new Float64Array(countries * goodCount),
    layoutOwnershipVersion: -1,
    staffing: new Float32Array(cellsMax),
    scarceGroup: new Uint8Array(cellsMax),
    workers: new Float64Array(cellsMax),
    wages: new Float64Array(cellsMax),
    output: new Float32Array(cellsMax),
    limitKind: new Uint8Array(cellsMax),
    limitWhat: new Uint8Array(cellsMax),
    made: new Float64Array(countries * goodCount),
    used: new Float64Array(countries * goodCount),
    otherPowerWanted: new Float64Array(countries),
    otherPowerUsed: new Float64Array(countries),
    provinceJobs: new Float64Array(provinces),
    provinceWorkers: new Float64Array(provinces),
    version: 0,
    reportChanges: -1,
    reportPopulationVersion: -1,
    reportOwnershipVersion: -1,
    changes: 0,
    fill: new Float64Array(provinces * groups),
    wanted: new Float64Array(countries * goodCount),
    share: new Float64Array(countries * goodCount),
    stageMade: new Float64Array(countries * goodCount),
    powerWanted: new Float64Array(countries),
    powerCapacityFree: new Float64Array(countries),
    powerCapacityFuel: new Float64Array(countries),
    powerLoadFree: new Float64Array(countries),
    powerLoadFuel: new Float64Array(countries),
    powerMade: new Float64Array(countries),
    powerShare: new Float64Array(countries),
    trialStock: new Float64Array(countries * goodCount),
    stageNext: new Int32Array(BUILDING_STAGES.length),
  };

  // The starting buildings, province by province.
  const typeIndex = new Map(types.map((type, t) => [type.id, t]));
  for (const entry of data.buildingStart.provinces) {
    const p = world.provinceIndex.get(entry.id);
    if (p === undefined) throw new Error(`Building start data: unknown province "${entry.id}"`);
    for (const [buildingId, methodId, level] of entry.buildings) {
      const t = typeIndex.get(buildingId);
      if (t === undefined) throw new Error(`Building start data: unknown building "${buildingId}"`);
      const m = buildings.methodIds[t].indexOf(methodId);
      if (m < 0)
        throw new Error(`Building start data: "${buildingId}" has no method "${methodId}"`);
      buildings.level[p * typeCount + t] = Math.min(MAX_LEVEL, level);
      buildings.method[p * typeCount + t] = m;
    }
  }

  refreshLayout(buildings, world.provinceCountry, -1);
  const { stock, capacityUse, capacityMake, imports } = buildings;
  const standIns = data.buildings.standIns;
  for (let c = 0; c < countries; c++) {
    const market = c * goodCount;
    for (let g = 0; g < goodCount; g++) {
      if (g === electricityGood) continue;
      // The starting stockpile: so many days of what the buildings use at full output.
      stock[market + g] = buildings.startingDays * capacityUse[market + g];
      // Standing imports: what the buildings need but the country doesn't
      // make, plus a small share of everything they use.
      const missing = capacityUse[market + g] - capacityMake[market + g];
      imports[market + g] =
        (missing > 0 ? standIns.standingImportsShare * missing : 0) +
        standIns.standingImportsBuffer * capacityUse[market + g];
    }
  }
  // The rest of the economy and homes use most of what the starting power
  // plants can make, per person of the starting population.
  const startPopulation = new Map(data.provinceStart.provinces.map((p) => [p.id, p.population]));
  for (let c = 0; c < countries; c++) {
    const from = world.countryProvinces.offsets[c];
    const to = world.countryProvinces.offsets[c + 1];
    let people = 0;
    for (let k = from; k < to; k++)
      people += startPopulation.get(world.provinceIds[world.countryProvinces.targets[k]]) ?? 0;
    const at = c * goodCount + electricityGood;
    const other = standIns.otherElectricityShare * capacityMake[at] - capacityUse[at];
    const perPerson = people > 0 && other > 0 ? other / people : 0;
    for (let k = from; k < to; k++)
      buildings.otherPowerPerPerson[world.countryProvinces.targets[k]] = perPerson;
  }
  return buildings;
}

/** The recipe a building runs (an index into the per-recipe arrays). */
export const recipeOf = (buildings: BuildingsState, cell: number) =>
  buildings.recipeOffsets[cell % buildings.typeCount] + buildings.method[cell];

/**
 * Redoes the jobs buildings offer the pops of one province (or of every
 * province, with -1) from the levels, and with them the pops' total jobs.
 */
export function refreshBuildingJobs(
  buildings: BuildingsState,
  population: PopulationState,
  province: number,
): void {
  const { level, method, recipeOffsets, workerOffsets, workerGroup, workerCount, typeCount } =
    buildings;
  const { buildingJobs, standInJobs, jobs } = population;
  const groups = population.groupCount;
  const first = province < 0 ? 0 : province;
  const last = province < 0 ? population.dependents.length : province + 1;
  for (let p = first; p < last; p++) {
    const row = p * groups;
    for (let g = 0; g < groups; g++) buildingJobs[row + g] = 0;
    for (let t = 0; t < typeCount; t++) {
      const cell = p * typeCount + t;
      const levels = level[cell];
      if (levels === 0) continue;
      const r = recipeOffsets[t] + method[cell];
      for (let k = workerOffsets[r]; k < workerOffsets[r + 1]; k++)
        buildingJobs[row + workerGroup[k]] += levels * workerCount[k];
    }
    for (let g = 0; g < groups; g++) jobs[row + g] = standInJobs[row + g] + buildingJobs[row + g];
  }
  population.reportOwnershipVersion = -1;
}

/**
 * At the start of a campaign: the buildings take over their share of the
 * jobs from the stand-in economy (section 8.1). The stand-in becomes "the
 * rest of the economy": it offers the jobs the starting buildings don't, so
 * each country still starts at its real unemployment rate, and from then on
 * keeps pace with the workforce at that share.
 */
export function linkStartingBuildings(
  buildings: BuildingsState,
  population: PopulationState,
): void {
  refreshBuildingJobs(buildings, population, -1);
  const { size, buildingJobs, standInJobs, standInTarget, employmentTarget, jobs } = population;
  for (let i = 0; i < size.length; i++) {
    const target = size[i] > 0 ? employmentTarget[i] - buildingJobs[i] / size[i] : 0;
    standInTarget[i] = target > 0 ? target : 0;
    standInJobs[i] = size[i] * standInTarget[i];
    jobs[i] = standInJobs[i] + buildingJobs[i];
  }
  population.reportOwnershipVersion = -1;
}

/** Puts saved buildings back: the levels, the methods and the stockpiles. */
export function restoreBuildings(
  buildings: BuildingsState,
  population: PopulationState,
  saved: BuildingsRestore,
): void {
  const provinces = population.dependents.length;
  if (saved.stock.length !== buildings.stock.length || saved.levels.length % 4 !== 0)
    throw new Error('Buildings: the restored arrays do not match the map and the goods');
  buildings.level.fill(0);
  buildings.method.fill(0);
  const whole = (n: number, below: number) => Number.isInteger(n) && n >= 0 && n < below;
  for (let i = 0; i < saved.levels.length; i += 4) {
    const province = saved.levels[i];
    const type = saved.levels[i + 1];
    const level = saved.levels[i + 2];
    const method = saved.levels[i + 3];
    if (
      !whole(province, provinces) ||
      !whole(type, buildings.typeCount) ||
      !whole(level, 65536) ||
      !whole(method, buildings.methodIds[type]?.length ?? 0)
    )
      throw new Error('Buildings: a restored building does not fit the map or the building types');
    buildings.level[province * buildings.typeCount + type] = level;
    buildings.method[province * buildings.typeCount + type] = method;
  }
  buildings.stock.set(saved.stock);
  buildings.layoutOwnershipVersion = -1;
  buildings.changes += 1;
  refreshBuildingJobs(buildings, population, -1);
}

/**
 * Sets the level of a province's building of one type (both indices; 0
 * removes it): the jobs it offers change at once. A new building runs its
 * type's first method. Construction (F12), damage and the Swarm will change
 * levels through here.
 */
export function setBuildingLevel(
  state: GameState,
  province: number,
  type: number,
  level: number,
): void {
  const buildings = state.buildings;
  if (!Number.isInteger(province) || province < 0 || province >= state.world.provinceIds.length)
    throw new Error(`setBuildingLevel: no province with index ${province}`);
  if (!Number.isInteger(type) || type < 0 || type >= buildings.typeCount)
    throw new Error(`setBuildingLevel: no building type with index ${type}`);
  if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL)
    throw new Error(`setBuildingLevel: ${level} is not a level (0 to ${MAX_LEVEL})`);
  const cell = province * buildings.typeCount + type;
  if (buildings.level[cell] === level) return;
  if (buildings.level[cell] === 0) buildings.method[cell] = 0;
  buildings.level[cell] = level;
  buildings.layoutOwnershipVersion = -1;
  buildings.changes += 1;
  refreshBuildingJobs(buildings, state.population, province);
}

/**
 * Switches a province's building of one type to another production method
 * (indices): its jobs, inputs and outputs change at once. Switching by the
 * player, with its time and cost, comes with F88.
 */
export function setBuildingMethod(
  state: GameState,
  province: number,
  type: number,
  method: number,
): void {
  const buildings = state.buildings;
  if (!Number.isInteger(province) || province < 0 || province >= state.world.provinceIds.length)
    throw new Error(`setBuildingMethod: no province with index ${province}`);
  if (!Number.isInteger(type) || type < 0 || type >= buildings.typeCount)
    throw new Error(`setBuildingMethod: no building type with index ${type}`);
  if (!Number.isInteger(method) || method < 0 || method >= buildings.methodIds[type].length)
    throw new Error(`setBuildingMethod: "${buildings.typeIds[type]}" has no method ${method}`);
  const cell = province * buildings.typeCount + type;
  if (buildings.method[cell] === method) return;
  buildings.method[cell] = method;
  buildings.layoutOwnershipVersion = -1;
  buildings.changes += 1;
  refreshBuildingJobs(buildings, state.population, province);
}

/**
 * Adds an amount of a good to a country's national stockpile (both indices),
 * or takes it out (a negative amount; never below nothing). Trade, aid and
 * events will move goods through here.
 */
export function addToStockpile(
  state: GameState,
  country: number,
  good: number,
  amount: number,
): void {
  const buildings = state.buildings;
  if (!Number.isInteger(country) || country < 0 || country >= state.world.countryIds.length)
    throw new Error(`addToStockpile: no country with index ${country}`);
  if (!Number.isInteger(good) || good < 0 || good >= buildings.goodCount)
    throw new Error(`addToStockpile: no good with index ${good}`);
  if (!Number.isFinite(amount) || good === buildings.electricityGood) return;
  const at = country * buildings.goodCount + good;
  buildings.stock[at] = Math.max(0, buildings.stock[at] + amount);
  buildings.changes += 1;
}

/**
 * Tops a country's national stockpile up to so many days of what its
 * buildings use at full output (never takes anything out).
 */
export function fillStockpile(state: GameState, country: number, days: number): void {
  const buildings = state.buildings;
  if (!Number.isInteger(country) || country < 0 || country >= state.world.countryIds.length)
    throw new Error(`fillStockpile: no country with index ${country}`);
  if (buildings.layoutOwnershipVersion !== state.ownershipVersion)
    refreshLayout(buildings, state.provinceOwner, state.ownershipVersion);
  for (let g = 0; g < buildings.goodCount; g++) {
    if (g === buildings.electricityGood) continue;
    const at = country * buildings.goodCount + g;
    const wanted = days * buildings.capacityUse[at];
    if (buildings.stock[at] < wanted) buildings.stock[at] = wanted;
  }
  buildings.changes += 1;
}

/**
 * Redoes the layout from the levels and the owners: which cells have a
 * building, grouped by step, and what each country's buildings use and make
 * at full output.
 */
function refreshLayout(
  buildings: BuildingsState,
  provinceOwner: Uint16Array,
  ownershipVersion: number,
): void {
  const { level, method, cells, stageCells, stageOffsets, typeStage, typeCount, goodCount } =
    buildings;
  const { capacityUse, capacityMake, electricityGood, recipeOffsets } = buildings;
  const stages = BUILDING_STAGES.length;
  let count = 0;
  stageOffsets.fill(0);
  for (let cell = 0; cell < level.length; cell++) {
    if (level[cell] === 0) continue;
    cells[count++] = cell;
    stageOffsets[typeStage[cell % typeCount] + 1] += 1;
  }
  buildings.cellCount = count;
  for (let s = 0; s < stages; s++) stageOffsets[s + 1] += stageOffsets[s];
  const next = buildings.stageNext;
  for (let s = 0; s < stages; s++) next[s] = stageOffsets[s];
  capacityUse.fill(0);
  capacityMake.fill(0);
  for (let i = 0; i < count; i++) {
    const cell = cells[i];
    const t = cell % typeCount;
    const r = recipeOffsets[t] + method[cell];
    stageCells[next[typeStage[t]]++] = cell;
    const levels = level[cell];
    const market = provinceOwner[(cell / typeCount) | 0] * goodCount;
    for (let k = buildings.inputOffsets[r]; k < buildings.inputOffsets[r + 1]; k++)
      capacityUse[market + buildings.inputGood[k]] += levels * buildings.inputAmount[k];
    for (let k = buildings.outputOffsets[r]; k < buildings.outputOffsets[r + 1]; k++)
      capacityMake[market + buildings.outputGood[k]] += levels * buildings.outputAmount[k];
    capacityUse[market + electricityGood] += levels * buildings.recipeElectricity[r];
    capacityMake[market + electricityGood] += levels * buildings.recipePower[r];
  }
  buildings.layoutOwnershipVersion = ownershipVersion;
}

/**
 * The start of a day's production: who works where (staffing, people at
 * work, wages), how much electricity is asked for (by the buildings and the
 * rest of the economy), and how hard each kind of power plant has to run
 * for it (the ones that burn nothing first).
 */
function prepareDay(
  buildings: BuildingsState,
  population: PopulationState,
  provinceOwner: Uint16Array,
): void {
  const { fill, level, method, cells, staffing, scarceGroup, workers, wages } = buildings;
  const { workerOffsets, workerGroup, workerCount, recipeElectricity, recipePower } = buildings;
  const { recipeOffsets, recipeFuelFree, powerWanted, powerCapacityFree, powerCapacityFuel } =
    buildings;
  const { powerLoadFree, powerLoadFuel, otherPowerWanted, otherPowerPerPerson, typeCount } =
    buildings;
  const { size, jobs, wage, dependents } = population;
  const groups = population.groupCount;
  // Where a pop is too small for all its jobs, every employer gets the same share.
  for (let i = 0; i < fill.length; i++)
    fill[i] = jobs[i] > size[i] ? size[i] / jobs[i] : jobs[i] > 0 ? 1 : 0;

  powerWanted.fill(0);
  powerCapacityFree.fill(0);
  powerCapacityFuel.fill(0);
  otherPowerWanted.fill(0);
  buildings.powerMade.fill(0);
  buildings.made.fill(0);
  buildings.used.fill(0);
  // The rest of the economy and homes: their electricity follows the people.
  for (let p = 0; p < dependents.length; p++) {
    const rate = otherPowerPerPerson[p];
    if (rate === 0) continue;
    let people = dependents[p];
    for (let g = 0; g < groups; g++) people += size[p * groups + g];
    otherPowerWanted[provinceOwner[p]] += rate * people;
  }
  for (let c = 0; c < powerWanted.length; c++) powerWanted[c] = otherPowerWanted[c];

  const count = buildings.cellCount;
  for (let i = 0; i < count; i++) {
    const cell = cells[i];
    const province = (cell / typeCount) | 0;
    const t = cell - province * typeCount;
    const r = recipeOffsets[t] + method[cell];
    const row = province * groups;
    let staffed = 1;
    let scarce = 0;
    let people = 0;
    let pay = 0;
    for (let k = workerOffsets[r]; k < workerOffsets[r + 1]; k++) {
      const pop = row + workerGroup[k];
      const filled = fill[pop];
      if (filled < staffed) {
        staffed = filled;
        scarce = workerGroup[k];
      }
      people += workerCount[k] * filled;
      pay += workerCount[k] * filled * wage[pop];
    }
    const levels = level[cell];
    staffing[cell] = staffed;
    scarceGroup[cell] = scarce;
    workers[cell] = levels * people;
    wages[cell] = levels * pay;
    const country = provinceOwner[province];
    powerWanted[country] += levels * staffed * recipeElectricity[r];
    if (recipeFuelFree[r] === 1) powerCapacityFree[country] += levels * staffed * recipePower[r];
    else powerCapacityFuel[country] += levels * staffed * recipePower[r];
  }
  // Electricity can't be stored: the plants make what is asked for, if they
  // can; the ones that burn nothing first, the others for the rest.
  for (let c = 0; c < powerWanted.length; c++) {
    const wanted = powerWanted[c];
    const free = powerCapacityFree[c];
    powerLoadFree[c] = free > wanted ? wanted / free : 1;
    const rest = free > wanted ? 0 : wanted - free;
    const fuel = powerCapacityFuel[c];
    powerLoadFuel[c] = fuel > rest ? rest / fuel : 1;
  }
}

/**
 * One step of a day's production (an index into `BUILDING_STAGES`), on the
 * given stockpiles: its buildings ask for their inputs, get the same share
 * of whatever is short, and produce. What they make is in the stockpile
 * when the step ends. The first step also brings the standing imports.
 */
function runStage(
  buildings: BuildingsState,
  stage: number,
  stock: Float64Array,
  provinceOwner: Uint16Array,
): void {
  const { level, method, stageCells, staffing, output, limitKind, limitWhat, scarceGroup } =
    buildings;
  const { inputOffsets, inputGood, inputAmount, outputOffsets, outputGood, outputAmount } =
    buildings;
  const { recipeOffsets, recipeElectricity, recipePower, recipeOffGrid, recipeFuelFree } =
    buildings;
  const { typeCount, goodCount, electricityGood } = buildings;
  const { wanted, share, stageMade, made, used } = buildings;
  const { powerLoadFree, powerLoadFuel, powerMade, powerShare, powerWanted } = buildings;
  const from = buildings.stageOffsets[stage];
  const to = buildings.stageOffsets[stage + 1];

  if (stage === 0) {
    // The standing imports of the day arrive (a stand-in until trade, F19).
    const imports = buildings.imports;
    for (let m = 0; m < stock.length; m++) stock[m] += imports[m];
  }

  wanted.fill(0);
  stageMade.fill(0);
  for (let i = from; i < to; i++) {
    const cell = stageCells[i];
    const province = (cell / typeCount) | 0;
    const t = cell - province * typeCount;
    const r = recipeOffsets[t] + method[cell];
    const country = provinceOwner[province];
    const market = country * goodCount;
    const load =
      recipePower[r] > 0 ? (recipeFuelFree[r] === 1 ? powerLoadFree : powerLoadFuel)[country] : 1;
    const running = level[cell] * staffing[cell] * load;
    for (let k = inputOffsets[r]; k < inputOffsets[r + 1]; k++)
      wanted[market + inputGood[k]] += running * inputAmount[k];
  }
  for (let m = 0; m < share.length; m++) share[m] = wanted[m] > stock[m] ? stock[m] / wanted[m] : 1;

  for (let i = from; i < to; i++) {
    const cell = stageCells[i];
    const province = (cell / typeCount) | 0;
    const t = cell - province * typeCount;
    const r = recipeOffsets[t] + method[cell];
    const country = provinceOwner[province];
    const market = country * goodCount;
    // The scarcest thing decides; `low` finds which one to name.
    let low = staffing[cell];
    let kind: number = low < FULL ? BUILDING_LIMIT.workers : BUILDING_LIMIT.none;
    let what = scarceGroup[cell];
    let supplied = 1;
    if (recipePower[r] > 0) {
      const load = (recipeFuelFree[r] === 1 ? powerLoadFree : powerLoadFuel)[country];
      supplied = load;
      if (load < low && load < FULL) {
        low = load;
        kind = BUILDING_LIMIT.demand;
        what = 0;
      }
    }
    let scarcest = 1;
    let grid = 0;
    if (recipeElectricity[r] > 0) {
      const off = recipeOffGrid[r];
      grid = (1 - off) * powerShare[country];
      scarcest = off + grid;
      if (scarcest < low && scarcest < FULL) {
        low = scarcest;
        kind = BUILDING_LIMIT.electricity;
        what = 0;
      }
    }
    for (let k = inputOffsets[r]; k < inputOffsets[r + 1]; k++) {
      const there = share[market + inputGood[k]];
      if (there < scarcest) scarcest = there;
      if (there < low && there < FULL) {
        low = there;
        kind = BUILDING_LIMIT.input;
        what = inputGood[k];
      }
    }
    const through = staffing[cell] * supplied * scarcest;
    output[cell] = through;
    limitKind[cell] = kind;
    limitWhat[cell] = what;
    const running = level[cell] * through;
    for (let k = inputOffsets[r]; k < inputOffsets[r + 1]; k++) {
      const good = market + inputGood[k];
      const amount = running * inputAmount[k];
      used[good] += amount;
      stock[good] = stock[good] > amount ? stock[good] - amount : 0;
    }
    for (let k = outputOffsets[r]; k < outputOffsets[r + 1]; k++)
      stageMade[market + outputGood[k]] += running * outputAmount[k];
    if (recipeElectricity[r] > 0) {
      // Of the electricity it runs on, the grid's part (its own generators
      // make the rest): all of it when the grid has enough.
      const electricityFactor = recipeOffGrid[r] + grid;
      if (electricityFactor > 0)
        used[market + electricityGood] +=
          (running * recipeElectricity[r] * powerShare[country]) / electricityFactor;
    }
    powerMade[country] += running * recipePower[r];
  }
  for (let m = 0; m < stock.length; m++) {
    stock[m] += stageMade[m];
    made[m] += stageMade[m];
  }

  if (stage === 0) {
    // The power plants ran: how much of the electricity asked for is there?
    const { otherPowerWanted, otherPowerUsed } = buildings;
    for (let c = 0; c < powerShare.length; c++) {
      const asked = powerWanted[c];
      powerShare[c] = powerMade[c] >= asked * (1 - 1e-9) ? 1 : powerMade[c] / asked;
      made[c * goodCount + electricityGood] = powerMade[c];
      otherPowerUsed[c] = otherPowerWanted[c] * powerShare[c];
      used[c * goodCount + electricityGood] += otherPowerUsed[c];
    }
  } else if (stage === BUILDING_STAGES.length - 1) {
    // The day is done: a country keeps only so many days of what it uses or makes.
    const { capacityUse, capacityMake, maxDays } = buildings;
    for (let m = 0; m < stock.length; m++) {
      const most = maxDays * (capacityUse[m] > capacityMake[m] ? capacityUse[m] : capacityMake[m]);
      if (stock[m] > most) stock[m] = most;
    }
    for (let c = 0; c < powerShare.length; c++) stock[c * goodCount + electricityGood] = 0;
  }
}

/** Runs one step of today's production on the real stockpiles (the first step prepares the day). */
function produce(state: GameState, stage: number): void {
  const buildings = state.buildings;
  if (stage === 0) {
    if (buildings.layoutOwnershipVersion !== state.ownershipVersion)
      refreshLayout(buildings, state.provinceOwner, state.ownershipVersion);
    prepareDay(buildings, state.population, state.provinceOwner);
  }
  runStage(buildings, stage, buildings.stock, state.provinceOwner);
  buildings.changes += 1;
}

/**
 * Makes sure the report matches the state; redoes it if not. The report is
 * **what the buildings do today, from the state as it is**: a trial run of
 * the day's production on a copy of the stockpiles. So a campaign continued
 * from a save shows the same numbers, and a new game shows them before the
 * first day. Everything that reads the report (the snapshot, later systems)
 * calls this first.
 */
export function ensureBuildingsReport(state: GameState): BuildingsState {
  const buildings = state.buildings;
  const population = ensurePopulationReport(state);
  if (
    buildings.reportChanges === buildings.changes &&
    buildings.reportPopulationVersion === population.version &&
    buildings.reportOwnershipVersion === state.ownershipVersion
  )
    return buildings;

  if (buildings.layoutOwnershipVersion !== state.ownershipVersion)
    refreshLayout(buildings, state.provinceOwner, state.ownershipVersion);
  const trial = buildings.trialStock;
  trial.set(buildings.stock);
  prepareDay(buildings, population, state.provinceOwner);
  for (let stage = 0; stage < BUILDING_STAGES.length; stage++)
    runStage(buildings, stage, trial, state.provinceOwner);

  const { cells, level, recipeJobs, typeCount, provinceJobs, provinceWorkers } = buildings;
  provinceJobs.fill(0);
  provinceWorkers.fill(0);
  for (let i = 0; i < buildings.cellCount; i++) {
    const cell = cells[i];
    const province = (cell / typeCount) | 0;
    provinceJobs[province] += level[cell] * recipeJobs[recipeOf(buildings, cell)];
    provinceWorkers[province] += buildings.workers[cell];
  }
  buildings.reportChanges = buildings.changes;
  buildings.reportPopulationVersion = population.version;
  buildings.reportOwnershipVersion = state.ownershipVersion;
  buildings.version += 1;
  return buildings;
}

/** The buildings as a save stores them: province, type, level and method of each, four numbers per building. */
export function buildingLevelList(buildings: BuildingsState): number[] {
  const list: number[] = [];
  for (let cell = 0; cell < buildings.level.length; cell++) {
    if (buildings.level[cell] === 0) continue;
    const province = (cell / buildings.typeCount) | 0;
    list.push(
      province,
      cell - province * buildings.typeCount,
      buildings.level[cell],
      buildings.method[cell],
    );
  }
  return list;
}

const stageSystem = (stage: number): SimSystem => ({
  daily(state) {
    produce(state, stage);
  },
});

/**
 * The building systems: the three steps of a day's production, each in its
 * slot of the tick (energy, resourceProduction, industry). They belong
 * together: the first prepares the day for the other two.
 */
export const buildingSystems: SystemRegistry = {
  energy: stageSystem(0),
  resourceProduction: stageSystem(1),
  industry: stageSystem(2),
};
