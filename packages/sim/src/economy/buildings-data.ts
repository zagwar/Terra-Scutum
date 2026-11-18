import { z } from 'zod';
import type { DataCrossCheck } from '../data/game-data';

/**
 * `data/goods.json` and `data/buildings.json` (F07, section 8.3): the goods
 * buildings make and use, and the building types with their recipes. Every
 * value is a [DEFAULT] the designer can change in the data files.
 *
 * F07 built the format with six example buildings; F85 added the building
 * catalog (the food, steel, fuel, metals and consumer goods chains) with
 * production methods. F65 adds prices.
 */
const id = z
  .string()
  .regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, 'ids are lowercase letters, digits and single underscores');

/** The units goods are counted in: tonnes and megawatt-hours (designer decision: real-world units). */
export const GOOD_UNITS = ['t', 'MWh'] as const;
export type GoodUnit = (typeof GOOD_UNITS)[number];

export const goodsSchema = z.strictObject({
  /** The goods, in the order every per-good array uses. */
  goods: z
    .array(
      z.strictObject({
        id,
        unit: z.enum(GOOD_UNITS),
        /**
         * The base price (F65, Victoria 3), in US$ per unit: every market's
         * price starts here and moves with buy and sell orders around it.
         * Real-world 2024 prices where the good has one [DEFAULT].
         */
        basePrice: z.number().positive(),
      }),
    )
    .min(1),
  /**
   * The good that is electricity. It can't be stored: what power plants make
   * in a day is used that day or lost, and plants only make what is asked for.
   */
  electricity: id,
});

export type GoodsConfig = z.infer<typeof goodsSchema>;

/**
 * The building categories of section 8.3's catalog. The category decides in
 * which step of the daily tick a building produces (`STAGE_OF_CATEGORY`).
 */
export const BUILDING_CATEGORIES = [
  'extraction',
  'energy',
  'processing',
  'manufacturing_civilian',
  'manufacturing_military',
  'research',
  'logistics',
  'military',
  'civil',
  'space',
] as const;
export type BuildingCategory = (typeof BUILDING_CATEGORIES)[number];

const amounts = z.record(id, z.number().positive());

/**
 * A **production method** (F85, section 8.3, Victoria-style): one way a
 * building can run, with its own recipe. A recipe is **per level, per day**:
 * a level-3 building needs three times the workers, electricity and inputs
 * and makes three times the outputs. A building runs one method at a time.
 */
export const productionMethodSchema = z.strictObject({
  id,
  /** Workers per level, by pop group (`data/pops.json`). */
  workers: z.record(id, z.int().min(0)),
  /** Electricity per level and day, in the electricity good's unit (MWh). */
  electricity: z.number().positive().optional(),
  /**
   * The share of its output the building keeps without any electricity from
   * the grid (its own generators, hand work): 0 = it stops in a blackout
   * (the default), 1 = it doesn't need the grid. F85: lets a country whose
   * power plants ran out of fuel climb back by itself.
   */
  offGrid: z.number().min(0).max(1).optional(),
  /** Goods used per level and day (never electricity: that is `electricity`). */
  inputs: amounts.optional(),
  /** Goods made per level and day. */
  outputs: amounts,
  /**
   * A subsistence method (F65, Victoria 3's subsistence farms): its workers
   * live on what they make. They earn its output's value less its inputs,
   * between them; it pays no wage, makes no profit and lays nobody off.
   */
  subsistence: z.boolean().optional(),
});

export type ProductionMethod = z.infer<typeof productionMethodSchema>;

export const buildingsSchema = z.strictObject({
  /**
   * The building types, in the order every per-type array uses. Each has one
   * or more production methods; the **first** one is what a newly built
   * building runs (F88 lets the player switch).
   */
  buildings: z
    .array(
      z.strictObject({
        id,
        category: z.enum(BUILDING_CATEGORIES),
        methods: z.array(productionMethodSchema).min(1).max(16),
      }),
    )
    .min(1)
    .max(250),
  /**
   * The national stockpile: since F65 the market's reserve. Goods made and
   * not bought go in; buyers draw on it when the day's goods run short.
   */
  stockpile: z.strictObject({
    /** A campaign starts with this many days of what the country's buildings use at full output. */
    startingDays: z.number().min(0).max(365),
    /** A country keeps at most this many days of what its market buys or sells in a day (its buildings at full output at least); the rest is lost. */
    maxDays: z.number().min(1).max(3650),
  }),
  /** Stand-ins until the building catalog covers the whole economy and the power grid (F74) [DEFAULT]. */
  standIns: z.strictObject({
    /**
     * Electricity the rest of the economy and homes use: this share of what
     * a country's starting power plants can make, less what its starting
     * buildings use, per person of its starting population (it follows the
     * population from then on).
     */
    otherElectricityShare: z.number().min(0).max(1),
    /**
     * F65: the rest of the economy buys this share of what each country's
     * market has left over at the start, after its buildings, pops and
     * (F19) exports, per person from then on.
     */
    restOfEconomyShare: z.number().min(0).max(1),
  }),
});

export type BuildingsConfig = z.infer<typeof buildingsSchema>;
export type BuildingType = BuildingsConfig['buildings'][number];

/** The three steps of the daily tick buildings produce in, in order (docs/13_technical.md, "A single daily tick"). */
export const BUILDING_STAGES = ['energy', 'resourceProduction', 'industry'] as const;
export type BuildingStage = (typeof BUILDING_STAGES)[number];

/** Which step a building of each category produces in. */
export const STAGE_OF_CATEGORY: Readonly<Record<BuildingCategory, BuildingStage>> = {
  energy: 'energy',
  extraction: 'resourceProduction',
  processing: 'industry',
  manufacturing_civilian: 'industry',
  manufacturing_military: 'industry',
  research: 'industry',
  logistics: 'industry',
  military: 'industry',
  civil: 'industry',
  space: 'industry',
};

export const goodNameKey = (goodId: string) => `GOOD_${goodId.toUpperCase()}`;
export const goodUnitKey = (unit: GoodUnit) => `GOOD_UNIT_${unit.toUpperCase()}`;
export const buildingNameKey = (buildingId: string) => `BUILDING_${buildingId.toUpperCase()}`;
export const productionMethodNameKey = (methodId: string) =>
  `PRODUCTION_METHOD_${methodId.toUpperCase()}`;
export const buildingCategoryNameKey = (category: BuildingCategory) =>
  `BUILDING_CATEGORY_${category.toUpperCase()}`;

/** Checks `data/goods.json` and `data/buildings.json`: ids are unique and known. */
export const checkBuildings: DataCrossCheck = (data, report) => {
  const goods = data.goods;
  const goodIds = goods.goods.map((good) => good.id);
  goodIds.forEach((goodId, index) => {
    if (goodIds.indexOf(goodId) !== index)
      report({
        file: 'goods.json',
        path: `goods.${index}.id`,
        message: `duplicate good "${goodId}"`,
      });
  });
  if (!goodIds.includes(goods.electricity))
    report({
      file: 'goods.json',
      path: 'electricity',
      message: `unknown good "${goods.electricity}"`,
    });

  const file = 'buildings.json';
  const issue = (path: string, message: string) => report({ file, path, message });
  const buildings = data.buildings.buildings;
  const buildingIds = buildings.map((building) => building.id);
  const groups = new Map(data.pops.groups.map((group) => [group.id, group]));
  buildings.forEach((building, index) => {
    const at = `buildings.${index}`;
    if (buildingIds.indexOf(building.id) !== index)
      issue(`${at}.id`, `duplicate building "${building.id}"`);
    const methodIds = building.methods.map((method) => method.id);
    building.methods.forEach((method, m) => {
      const where = `${at}.methods.${m}`;
      if (methodIds.indexOf(method.id) !== m)
        issue(`${where}.id`, `"${building.id}" lists the method "${method.id}" twice`);
      for (const groupId of Object.keys(method.workers)) {
        const group = groups.get(groupId);
        if (!group) issue(`${where}.workers.${groupId}`, `unknown pop group "${groupId}"`);
        else if (group.military || group.alwaysEmployed)
          issue(
            `${where}.workers.${groupId}`,
            `buildings can't hire "${groupId}" (soldiers and always-employed groups get their jobs elsewhere)`,
          );
      }
      if (Object.values(method.workers).reduce((a, b) => a + b, 0) <= 0)
        issue(`${where}.workers`, 'a building needs workers');
      if (method.offGrid !== undefined && method.electricity === undefined)
        issue(`${where}.offGrid`, 'only a method that uses electricity can run without it');
      for (const goodId of Object.keys(method.inputs ?? {})) {
        if (!goodIds.includes(goodId))
          issue(`${where}.inputs.${goodId}`, `unknown good "${goodId}"`);
        else if (goodId === goods.electricity)
          issue(
            `${where}.inputs.${goodId}`,
            'electricity is not an input: use the "electricity" field',
          );
        if (Object.hasOwn(method.outputs, goodId))
          issue(`${where}.outputs.${goodId}`, `"${goodId}" is both an input and an output`);
      }
      if (Object.keys(method.outputs).length === 0)
        issue(`${where}.outputs`, 'a building needs at least one output');
      for (const goodId of Object.keys(method.outputs)) {
        if (!goodIds.includes(goodId))
          issue(`${where}.outputs.${goodId}`, `unknown good "${goodId}"`);
        else if (goodId === goods.electricity) {
          if (building.category !== 'energy')
            issue(
              `${where}.outputs.${goodId}`,
              'only buildings of the energy category make electricity',
            );
          if (method.electricity !== undefined)
            issue(`${where}.electricity`, "a building that makes electricity can't also use it");
        }
      }
    });
  });
};
