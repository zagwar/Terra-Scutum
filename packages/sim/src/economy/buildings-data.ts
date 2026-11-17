import { z } from 'zod';
import type { DataCrossCheck } from '../data/game-data';

/**
 * `data/goods.json` and `data/buildings.json` (F07, section 8.3): the goods
 * buildings make and use, and the building types with their recipes. Every
 * value is a [DEFAULT] the designer can change in the data files.
 *
 * F07 has only the handful of goods and example buildings that prove the
 * system. F85 adds the building catalog and each country's real starting
 * buildings; F65 adds the full goods list and prices.
 */
const id = z
  .string()
  .regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, 'ids are lowercase letters, digits and single underscores');

/** The units goods are counted in: tonnes and megawatt-hours (designer decision: real-world units). */
export const GOOD_UNITS = ['t', 'MWh'] as const;
export type GoodUnit = (typeof GOOD_UNITS)[number];

export const goodsSchema = z.strictObject({
  /** The goods, in the order every per-good array uses. */
  goods: z.array(z.strictObject({ id, unit: z.enum(GOOD_UNITS) })).min(1),
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

export const buildingsSchema = z.strictObject({
  /**
   * The building types, in the order every per-type array uses. A recipe is
   * **per level, per day**: a level-3 building needs three times the
   * workers, electricity and inputs and makes three times the outputs.
   */
  buildings: z
    .array(
      z.strictObject({
        id,
        category: z.enum(BUILDING_CATEGORIES),
        /** Workers per level, by pop group (`data/pops.json`). */
        workers: z.record(id, z.int().positive()),
        /** Electricity per level and day, in the electricity good's unit (MWh). */
        electricity: z.number().positive().optional(),
        /** Goods used per level and day (never electricity: that is `electricity`). */
        inputs: amounts.optional(),
        /** Goods made per level and day. */
        outputs: amounts,
      }),
    )
    .min(1)
    .max(250),
  /**
   * The national stockpile, a stand-in until markets (F65): each country
   * keeps the goods its buildings make until its buildings use them.
   */
  stockpile: z.strictObject({
    /** A campaign starts with this many days of what the country's buildings use at full output. */
    startingDays: z.number().min(0).max(365),
    /** A country keeps at most this many days of what its buildings use or make at full output; the rest is lost. */
    maxDays: z.number().min(1).max(3650),
  }),
  /**
   * Where buildings stand at the start, a stand-in until each country's real
   * starting buildings (F85): every `anchors` building gets one level per so
   * many billion US$ of the country's GDP, plus as many levels of the
   * buildings that make its inputs and electricity as it takes to run them.
   * A country's levels are shared among its provinces by population.
   */
  startingBuildings: z.strictObject({
    anchors: z.array(
      z.strictObject({ building: id, gdpBillionUsdPerLevel: z.number().positive() }),
    ),
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
    for (const groupId of Object.keys(building.workers)) {
      const group = groups.get(groupId);
      if (!group) issue(`${at}.workers.${groupId}`, `unknown pop group "${groupId}"`);
      else if (group.military || group.alwaysEmployed)
        issue(
          `${at}.workers.${groupId}`,
          `buildings can't hire "${groupId}" (soldiers and always-employed groups get their jobs elsewhere)`,
        );
    }
    if (Object.keys(building.workers).length === 0)
      issue(`${at}.workers`, 'a building needs workers');
    for (const goodId of Object.keys(building.inputs ?? {})) {
      if (!goodIds.includes(goodId)) issue(`${at}.inputs.${goodId}`, `unknown good "${goodId}"`);
      else if (goodId === goods.electricity)
        issue(`${at}.inputs.${goodId}`, 'electricity is not an input: use the "electricity" field');
      if (Object.hasOwn(building.outputs, goodId))
        issue(`${at}.outputs.${goodId}`, `"${goodId}" is both an input and an output`);
    }
    if (Object.keys(building.outputs).length === 0)
      issue(`${at}.outputs`, 'a building needs at least one output');
    for (const goodId of Object.keys(building.outputs)) {
      if (!goodIds.includes(goodId)) issue(`${at}.outputs.${goodId}`, `unknown good "${goodId}"`);
      else if (goodId === goods.electricity) {
        if (building.category !== 'energy')
          issue(
            `${at}.outputs.${goodId}`,
            'only buildings of the energy category make electricity',
          );
        if (building.electricity !== undefined)
          issue(`${at}.electricity`, "a building that makes electricity can't also use it");
      }
    }
  });

  const anchors = data.buildings.startingBuildings.anchors;
  anchors.forEach((anchor, index) => {
    const at = `startingBuildings.anchors.${index}.building`;
    if (!buildingIds.includes(anchor.building)) issue(at, `unknown building "${anchor.building}"`);
    if (anchors.findIndex((other) => other.building === anchor.building) !== index)
      issue(at, `"${anchor.building}" is listed twice`);
  });
};
