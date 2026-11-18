import type {
  BuildingsSnapshot,
  FoodSnapshot,
  GoodsConfig,
  MarketSnapshot,
  PopulationSnapshot,
} from '@terra-scutum/sim';

/**
 * Reads the food snapshot (F08) for the Food screen, the top bar, the
 * province panel and the alerts. Pure code, unit tested.
 */

/** How a country is doing for food, worst first: a famine, people going hungry or short, reserves low, all fine. */
export type FoodMood = 'famine' | 'short' | 'low' | 'fed';

/** The share of basic food missing from which the screens speak of a shortage [DEFAULT]. */
export const FOOD_SHORTAGE_AT_LEAST = 0.02;

export interface FoodSummary {
  readonly mood: FoodMood;
  /** Food reserves in days of what the country buys today (`Infinity` when it buys none), and in tonnes. */
  readonly reserveDays: number;
  readonly reserveTonnes: number;
  /** The rationing level in force (its id); for the player's country also its choice (null: automatic). */
  readonly rationing: string;
  readonly choice: string | null;
  /** Last week's basic food shortage, the average food security, the shares starving and severely starving (0–1). */
  readonly shortage: number;
  readonly security: number;
  readonly starving: number;
  readonly severe: number;
  /** Provinces in famine; deaths and lost births from starvation since the start. */
  readonly famines: number;
  readonly deaths: number;
  readonly lostBirths: number;
}

/** A country's food (`player`: it is the player's country, whose rationing choice the snapshot has). */
export function countryFood(
  food: FoodSnapshot,
  buildings: BuildingsSnapshot,
  country: number,
  player: boolean,
): FoodSummary {
  let tonnes = 0;
  for (const g of food.foodGoods) tonnes += buildings.stock[country * buildings.goodCount + g];
  const reserveDays = food.reserveDays[country];
  const famines = food.famineCount[country];
  const shortage = food.basicShortage[country];
  const starving = food.starving[country];
  const mood: FoodMood =
    famines > 0
      ? 'famine'
      : starving > 0 || shortage >= FOOD_SHORTAGE_AT_LEAST
        ? 'short'
        : reserveDays < food.lowReserveDays
          ? 'low'
          : 'fed';
  return {
    mood,
    reserveDays,
    reserveTonnes: tonnes,
    rationing: food.levelIds[food.rationing[country]],
    choice: player && food.rationingChoice >= 0 ? food.levelIds[food.rationingChoice] : null,
    shortage,
    security: food.security[country],
    starving,
    severe: food.severe[country],
    famines,
    deaths: food.starvationDeaths[country],
    lostBirths: food.lostBirths[country],
  };
}

/** One food good of a country: where it comes from and where it goes, a day. */
export interface FoodGoodRow {
  readonly good: string;
  readonly made: number;
  readonly imported: number;
  readonly exported: number;
  /** Eaten by the people (and what they asked for), used by buildings (ranches, food factories), bought by the rest of the economy. */
  readonly people: number;
  readonly peopleWanted: number;
  readonly buildings: number;
  readonly rest: number;
  /** In the reserves, and how many days of today's buying that is (null when nobody buys it). */
  readonly stock: number;
  readonly stockDays: number | null;
  /** The price as a share of the base price. */
  readonly priceFactor: number;
}

export function foodGoods(
  food: FoodSnapshot,
  market: MarketSnapshot,
  buildings: BuildingsSnapshot,
  goods: GoodsConfig,
  country: number,
): FoodGoodRow[] {
  return Array.from(food.foodGoods, (g) => {
    const at = country * market.goodCount + g;
    const buy = market.buy[at];
    return {
      good: goods.goods[g].id,
      made: buildings.made[at],
      imported: buildings.imports[at],
      exported: market.exportGot[at],
      people: market.popGot[at],
      peopleWanted: market.popOrder[at],
      buildings: market.buildingOrder[at],
      rest: market.restGot[at],
      stock: buildings.stock[at],
      stockDays: buy > 0 ? buildings.stock[at] / buy : null,
      priceFactor: market.price[at] / market.basePrice[g],
    };
  });
}

/** One province where people go hungry. */
export interface FoodProvinceRow {
  readonly province: number;
  readonly people: number;
  /** Average food security, shares starving and severely starving (0–1). */
  readonly security: number;
  readonly starving: number;
  readonly severe: number;
  /** The day its famine began (days since the campaign's start), or null; its deaths and lost births since. */
  readonly famineSince: number | null;
  readonly deaths: number;
  readonly lostBirths: number;
}

/** A country's provinces where people starve or that are in famine: famines first, then the hungriest. */
export function hungryProvinces(
  food: FoodSnapshot,
  population: PopulationSnapshot,
  provinceOwner: ArrayLike<number>,
  country: number,
): FoodProvinceRow[] {
  const rows: FoodProvinceRow[] = [];
  for (let p = 0; p < provinceOwner.length; p++) {
    if (provinceOwner[p] !== country) continue;
    const famine = food.famineSince[p] >= 0;
    if (!famine && food.provinceStarving[p] <= 0) continue;
    rows.push(provinceFood(food, population, p));
  }
  return rows.sort(
    (a, b) =>
      Number(b.famineSince !== null) - Number(a.famineSince !== null) ||
      b.starving - a.starving ||
      a.security - b.security ||
      a.province - b.province,
  );
}

/** A province's food. */
export function provinceFood(
  food: FoodSnapshot,
  population: PopulationSnapshot,
  province: number,
): FoodProvinceRow {
  const famine = food.famineSince[province] >= 0;
  return {
    province,
    people: population.provincePopulation[province],
    security: food.provinceSecurity[province],
    starving: food.provinceStarving[province],
    severe: food.provinceSevere[province],
    famineSince: famine ? food.famineSince[province] : null,
    deaths: famine ? food.famineDeaths[province] : 0,
    lostBirths: famine ? food.famineLostBirths[province] : 0,
  };
}

/** How full the reserves are, for the top bar's color: fine, low, or a famine or a shortage. */
export function reserveTone(summary: FoodSummary): 'ok' | 'warn' | 'bad' {
  if (summary.mood === 'famine' || summary.mood === 'short') return 'bad';
  if (summary.mood === 'low') return 'warn';
  return 'ok';
}

/** Days of reserves as the top bar shows them: whole days, "∞" when nothing is eaten, at most "999+". */
export function reserveDaysText(days: number): string {
  if (!Number.isFinite(days)) return '∞';
  if (days >= 999.5) return '999+';
  return String(Math.max(0, Math.round(days)));
}
