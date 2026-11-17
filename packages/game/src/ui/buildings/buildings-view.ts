import {
  BUILDING_LIMIT,
  type BuildingType,
  type BuildingsConfig,
  type BuildingsSnapshot,
  type GoodsConfig,
  type ProductionMethod,
} from '@terra-scutum/sim';

/**
 * Reads the buildings snapshot (F07, F85) for the screens: a province's
 * buildings, a country's buildings by type with their production methods,
 * its national stockpile with the standing imports, and the buildings that
 * are held back. Pure code, unit tested.
 */

/** One building as the screens show it. */
export interface BuildingRow {
  readonly province: number;
  /** The building type: its index and its entry in `data/buildings.json`. */
  readonly type: number;
  readonly definition: BuildingType;
  readonly level: number;
  /** Its production method: the index into `definition.methods`, and the method. */
  readonly method: number;
  readonly methodDefinition: ProductionMethod;
  /** Output as a share of full output (0–1). */
  readonly output: number;
  /** The jobs it offers, the people at work in it, and the wages paid them (US$ a day). */
  readonly jobs: number;
  readonly workers: number;
  readonly wages: number;
  /** What holds it back most (`BUILDING_LIMIT`), and which pop group or good. */
  readonly limitKind: number;
  readonly limitWhat: number;
}

/** A building is held back when it lacks workers, electricity or an input (not when a power plant only lacks demand). */
export const isHeldBack = (limitKind: number) =>
  limitKind === BUILDING_LIMIT.workers ||
  limitKind === BUILDING_LIMIT.electricity ||
  limitKind === BUILDING_LIMIT.input;

/** The jobs one level of a building offers with this production method. */
export const jobsPerLevel = (method: ProductionMethod) =>
  Object.values(method.workers).reduce((a, b) => a + b, 0);

function rowAt(buildings: BuildingsSnapshot, config: BuildingsConfig, i: number): BuildingRow {
  const cell = buildings.cells[i];
  const province = Math.floor(cell / buildings.typeCount);
  const type = cell - province * buildings.typeCount;
  const definition = config.buildings[type];
  const method = buildings.method[i];
  const methodDefinition = definition.methods[method] ?? definition.methods[0];
  return {
    province,
    type,
    definition,
    level: buildings.level[i],
    method,
    methodDefinition,
    output: buildings.output[i],
    jobs: buildings.level[i] * jobsPerLevel(methodDefinition),
    workers: buildings.workers[i],
    wages: buildings.wages[i],
    limitKind: buildings.limitKind[i],
    limitWhat: buildings.limitWhat[i],
  };
}

/** The first building at or after `cell` (the cells are in rising order). */
function firstAtOrAfter(cells: Int32Array, cell: number): number {
  let low = 0;
  let high = cells.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cells[middle] < cell) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** A province's buildings, in the order of `data/buildings.json`. */
export function provinceBuildings(
  buildings: BuildingsSnapshot,
  config: BuildingsConfig,
  province: number,
): BuildingRow[] {
  const rows: BuildingRow[] = [];
  const end = (province + 1) * buildings.typeCount;
  for (
    let i = firstAtOrAfter(buildings.cells, province * buildings.typeCount);
    i < buildings.cells.length && buildings.cells[i] < end;
    i++
  )
    rows.push(rowAt(buildings, config, i));
  return rows;
}

/** A good and an amount of it. */
export interface GoodAmount {
  readonly good: string;
  readonly amount: number;
}

/**
 * What a building running this production method uses and makes in a day at
 * `levels` levels (times its output, for what it really does today).
 * Electricity it uses comes first among the uses.
 */
export function recipeAmounts(
  definition: ProductionMethod,
  goods: GoodsConfig,
  levels: number,
): { readonly uses: GoodAmount[]; readonly makes: GoodAmount[] } {
  const scaled = (amounts: Readonly<Record<string, number>> | undefined) =>
    Object.entries(amounts ?? {}).map(([good, amount]) => ({ good, amount: amount * levels }));
  return {
    uses: [
      ...(definition.electricity
        ? [{ good: goods.electricity, amount: definition.electricity * levels }]
        : []),
      ...scaled(definition.inputs),
    ],
    makes: scaled(definition.outputs),
  };
}

/** A country's buildings of one type, added up. */
export interface BuildingTypeSummary {
  readonly type: number;
  readonly definition: BuildingType;
  /** How many provinces have one, and their levels together. */
  readonly buildings: number;
  readonly levels: number;
  readonly jobs: number;
  readonly workers: number;
  readonly wages: number;
  /** Average output by level (0–1). */
  readonly output: number;
  /** What its buildings make today, all together. */
  readonly makes: readonly GoodAmount[];
  /** Levels on each production method (by method index; methods with none left out), most first. */
  readonly methods: readonly { readonly method: number; readonly levels: number }[];
  /** How many of them are held back by missing workers, electricity or inputs. */
  readonly heldBack: number;
  /** The single buildings, the biggest first. */
  readonly rows: readonly BuildingRow[];
}

/** Adds up amounts of the same good, in the order the goods first appear. */
export function addAmounts(amounts: readonly GoodAmount[]): GoodAmount[] {
  const total = new Map<string, number>();
  for (const { good, amount } of amounts) total.set(good, (total.get(good) ?? 0) + amount);
  return [...total].map(([good, amount]) => ({ good, amount }));
}

/** Levels on each production method among some buildings of one type, most first. */
export function methodLevels(
  rows: readonly Pick<BuildingRow, 'method' | 'level'>[],
): { method: number; levels: number }[] {
  const byMethod = new Map<number, number>();
  for (const row of rows) byMethod.set(row.method, (byMethod.get(row.method) ?? 0) + row.level);
  return [...byMethod]
    .map(([method, levels]) => ({ method, levels }))
    .sort((a, b) => b.levels - a.levels || a.method - b.method);
}

/** A country's buildings by type (types it has none of are left out), in the order of `data/buildings.json`. */
export function countryBuildings(
  buildings: BuildingsSnapshot,
  config: BuildingsConfig,
  goods: GoodsConfig,
  provinceOwner: ArrayLike<number>,
  country: number,
): BuildingTypeSummary[] {
  const byType = new Map<number, BuildingRow[]>();
  for (let i = 0; i < buildings.cells.length; i++) {
    const province = Math.floor(buildings.cells[i] / buildings.typeCount);
    if (provinceOwner[province] !== country) continue;
    const row = rowAt(buildings, config, i);
    const list = byType.get(row.type);
    if (list) list.push(row);
    else byType.set(row.type, [row]);
  }
  return [...byType.keys()]
    .sort((a, b) => a - b)
    .map((type) => {
      const rows = byType.get(type)!.sort((a, b) => b.level - a.level || a.province - b.province);
      const sum = (pick: (row: BuildingRow) => number) =>
        rows.reduce((total, row) => total + pick(row), 0);
      const levels = sum((row) => row.level);
      return {
        type,
        definition: config.buildings[type],
        buildings: rows.length,
        levels,
        jobs: sum((row) => row.jobs),
        workers: sum((row) => row.workers),
        wages: sum((row) => row.wages),
        output: levels > 0 ? sum((row) => row.level * row.output) / levels : 0,
        makes: addAmounts(
          rows.flatMap(
            (row) => recipeAmounts(row.methodDefinition, goods, row.level * row.output).makes,
          ),
        ),
        methods: methodLevels(rows),
        heldBack: rows.filter((row) => isHeldBack(row.limitKind)).length,
        rows,
      };
    });
}

/** One good of a country's national stockpile. */
export interface StockRow {
  readonly good: string;
  readonly unit: GoodsConfig['goods'][number]['unit'];
  /** True for electricity: made and used the same day, never in stock. */
  readonly stored: boolean;
  readonly stock: number;
  readonly made: number;
  readonly used: number;
  /** What arrives every day as standing imports (a stand-in until trade, F19). */
  readonly imported: number;
  /** The most the stockpile keeps. */
  readonly limit: number;
  /** How many days the stock lasts while more is used than made; null when it isn't shrinking. */
  readonly daysLeft: number | null;
}

/** A country's national stockpile: the goods its buildings make, use or have in stock. */
export function countryStockpile(
  buildings: BuildingsSnapshot,
  goods: GoodsConfig,
  country: number,
): StockRow[] {
  const rows: StockRow[] = [];
  goods.goods.forEach((good, g) => {
    const at = country * buildings.goodCount + g;
    const stock = buildings.stock[at];
    const made = buildings.made[at];
    const used = buildings.used[at];
    const limit = buildings.stockLimit[at];
    const imported = buildings.imports[at];
    if (stock <= 0 && made <= 0 && used <= 0 && limit <= 0 && imported <= 0) return;
    const stored = good.id !== goods.electricity;
    rows.push({
      good: good.id,
      unit: good.unit,
      stored,
      stock,
      made,
      used,
      imported,
      limit,
      daysLeft:
        stored && used > (made + imported) * 1.000001 ? stock / (used - made - imported) : null,
    });
  });
  return rows;
}

/** A building counts as stopped for the alert at or below this share of full output [DEFAULT]. */
export const ALERT_OUTPUT_AT_MOST = 0.5;

/**
 * A country's buildings that are held back and run at half output or less
 * (the "idle factory" alert): how many, and the worst of them.
 */
export function stoppedBuildings(
  buildings: BuildingsSnapshot,
  config: BuildingsConfig,
  provinceOwner: ArrayLike<number>,
  country: number,
): { readonly count: number; readonly worst: BuildingRow | null } {
  let count = 0;
  let worst = -1;
  for (let i = 0; i < buildings.cells.length; i++) {
    if (!isHeldBack(buildings.limitKind[i]) || buildings.output[i] > ALERT_OUTPUT_AT_MOST) continue;
    if (provinceOwner[Math.floor(buildings.cells[i] / buildings.typeCount)] !== country) continue;
    count += 1;
    // The worst: the lowest output, then the most levels.
    if (
      worst < 0 ||
      buildings.output[i] < buildings.output[worst] ||
      (buildings.output[i] === buildings.output[worst] &&
        buildings.level[i] > buildings.level[worst])
    )
      worst = i;
  }
  return { count, worst: worst < 0 ? null : rowAt(buildings, config, worst) };
}

/**
 * The electricity the rest of the economy and homes of a country use (a
 * stand-in until markets, F65, and the power grid, F74): asked for and got
 * today, in MWh.
 */
export function otherElectricity(
  buildings: BuildingsSnapshot,
  country: number,
): { readonly wanted: number; readonly used: number } {
  return {
    wanted: buildings.otherPowerWanted[country] ?? 0,
    used: buildings.otherPowerUsed[country] ?? 0,
  };
}
