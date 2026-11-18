import { z } from 'zod';
import type { GameData } from '../data/game-data';
import { GameState } from './game-state';
import { SimError } from './sim-error';
import type { SystemRegistry } from './systems';
import { buildCountryStartTable } from '../world/country-start';
import { buildWorldMap } from '../world/world-map';
import {
  BUILDING_ECONOMY_FIELDS,
  buildingEconomyList,
  buildingLevelList,
} from '../economy/buildings';
import { MARKET_SAVED_ARRAYS, type MarketState } from '../economy/market';
import { createStartingEconomy } from '../economy/starting-economy';

/**
 * Save format versioning.
 *
 * A save is a plain JSON object (`SaveFile`). The game compresses and stores
 * it (IndexedDB, export/import: feature F40); the sim only defines its shape.
 *
 * RULE: whenever the shape of `SaveFile` changes, increase
 * `SAVE_FORMAT_VERSION` by one and add a migration from the previous version
 * to `SAVE_MIGRATIONS`, so older saves keep loading. Saves from a newer
 * version of the game, or with no migration path, are rejected with a clear
 * message instead of loading wrongly.
 */
export const SAVE_FORMAT = 'terra-scutum-save';
export const SAVE_FORMAT_VERSION = 7;

const uint32 = z.number().int().min(0).max(0xffff_ffff);

const saveFileSchema = z.strictObject({
  format: z.literal(SAVE_FORMAT),
  saveVersion: z.literal(SAVE_FORMAT_VERSION),
  seed: uint32,
  day: z.number().int().min(0),
  rng: z.tuple([uint32, uint32, uint32, uint32]),
  /**
   * The map the save was made on: the ids of its provinces and countries, in
   * the order the arrays below use. A save only loads on the same map.
   */
  map: z.strictObject({
    provinces: z.array(z.string()),
    countries: z.array(z.string()),
  }),
  /** Owner of each province: an index into `map.countries`, in the order of `map.provinces`. */
  provinceOwners: z.array(z.number().int().min(0)),
  /** The country the player leads (its id, F05). */
  playerCountry: z.string(),
  /**
   * The population (F06). `groups` are the pop groups' ids in the order the
   * arrays use; `dependents` has one number per province (in the order of
   * `map.provinces`), `size` and `standInJobs` (the jobs the stand-in
   * economy offers; buildings offer the rest), `wealth` (1–99) and
   * `income` (last week's, US$ per worker per day; F65) one per pop
   * (province by province, the groups in order).
   */
  population: z.strictObject({
    groups: z.array(z.string()),
    dependents: z.array(z.number().min(0)),
    size: z.array(z.number().min(0)),
    standInJobs: z.array(z.number().min(0)),
    wealth: z.array(z.number().min(1).max(99)),
    income: z.array(z.number().min(0)),
  }),
  /**
   * The buildings (F07, F85). `types` and `goods` are the building types' and
   * the goods' ids in the order the numbers use; `methods` each type's
   * production methods' ids. `levels` lists every building as four numbers:
   * its province (an index into `map.provinces`), its type, its level and its
   * method (an index into its type's `methods`). `stock` is each country's
   * national stockpile: one number per country and good (country by country,
   * the goods in order). `economy` (F65) lists each building's money and
   * workers, seven numbers in the order of `levels`: its wage level, the
   * share of its jobs kept open, its cash reserves, the weeks until it may
   * raise wages, and this week's sales, costs and wages so far.
   */
  buildings: z.strictObject({
    types: z.array(z.string()),
    goods: z.array(z.string()),
    methods: z.array(z.array(z.string())),
    levels: z.array(z.number().int().min(0)),
    stock: z.array(z.number().min(0)),
    economy: z.array(z.number()),
  }),
  /**
   * The markets (F65): per country and good (`price`, the week's buy and
   * sell orders and the pops' buy orders), per country and need entry
   * (`shares`), per country (the week's pop goods wanted and got, last
   * week's `shortage`), per pop (the week's `weekIncome`, the daily
   * `dividend`), and the days counted this week.
   */
  market: z.strictObject({
    price: z.array(z.number().positive()),
    shares: z.array(z.number().min(0).max(1)),
    weekBuy: z.array(z.number().min(0)),
    weekSell: z.array(z.number().min(0)),
    weekPopBuy: z.array(z.number().min(0)),
    weekPopWanted: z.array(z.number().min(0)),
    weekPopGot: z.array(z.number().min(0)),
    shortage: z.array(z.number().min(0).max(1)),
    weekIncome: z.array(z.number().min(0)),
    dividend: z.array(z.number().min(0)),
    weekDays: z.number().int().min(0).max(7),
  }),
});

export type SaveFile = z.infer<typeof saveFileSchema>;

type UnknownRecord = Record<string, unknown>;

/**
 * Upgrades a save by exactly one version: the entry at key N turns a version-N
 * save into version N+1. It gets the game data too, for values an old save
 * never stored (their starting values).
 */
export type SaveMigration = (save: UnknownRecord, data: GameData) => UnknownRecord;
export type SaveMigrations = Readonly<Record<number, SaveMigration>>;

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The ids of the data's provinces and countries in index order (sorted by id, as in `WorldMap`). */
function mapIdsOf(data: GameData): { provinces: string[]; countries: string[] } {
  return {
    provinces: data.provinces.provinces.map((p) => p.id).sort(byId),
    countries: data.countries.countries.map((c) => c.id).sort(byId),
  };
}

/** Migrations for every older save version that can still be loaded. */
export const SAVE_MIGRATIONS: SaveMigrations = {
  // Version 2 (F02) added province ownership. Version 1 saves are from before
  // anything could change owner: every province has its starting owner.
  1: (save, data) => {
    const map = mapIdsOf(data);
    const countryIndex = new Map(map.countries.map((id, i) => [id, i]));
    const startingOwner = new Map(data.provinces.provinces.map((p) => [p.id, p.country]));
    return {
      ...save,
      map,
      provinceOwners: map.provinces.map((id) => countryIndex.get(startingOwner.get(id)!)),
    };
  },
  // Version 3 (F05) stores the player's country. Older saves were all played
  // as the one fixed in the data (`playerCountry` in `data/game_config.json`).
  2: (save, data) => ({ ...save, playerCountry: data.gameConfig.playerCountry }),
  // Version 4 (F06) stores the population. Older saves are from before people
  // were simulated: they get the starting population.
  3: (save, data) => {
    const world = buildWorldMap(data);
    const { population } = createStartingEconomy(
      data,
      world,
      buildCountryStartTable(data.countryStart, world),
    );
    return {
      ...save,
      population: {
        groups: [...population.groupIds],
        dependents: Array.from(population.dependents),
        size: Array.from(population.size),
        jobs: Array.from(population.jobs),
      },
    };
  },
  // Version 5 (F07) stores the buildings, and of the jobs only the ones the
  // stand-in economy offers. Older saves are from before buildings: they get
  // the starting buildings, which take over their jobs from the saved ones.
  4: (save, data) => {
    const world = buildWorldMap(data);
    const countryStart = buildCountryStartTable(data.countryStart, world);
    const { population, buildings } = createStartingEconomy(data, world, countryStart);
    const old = save.population as { jobs?: unknown } & UnknownRecord;
    const { jobs, ...rest } = old;
    const savedJobs = Array.isArray(jobs) ? (jobs as number[]) : [];
    return {
      ...save,
      population: {
        ...rest,
        standInJobs: Array.from(population.buildingJobs, (offered, i) =>
          Math.max(0, (Number(savedJobs[i]) || 0) - offered),
        ),
      },
      buildings: {
        types: [...buildings.typeIds],
        goods: [...buildings.goodIds],
        levels: buildingLevelList(buildings).filter((_, i) => i % 4 !== 3),
        stock: Array.from(buildings.stock),
      },
    };
  },
  // Version 6 (F85) brought the building catalog with production methods and
  // real starting buildings. The six example buildings of a version 5 save
  // don't carry over: it gets the starting buildings and stockpiles, and the
  // stand-in economy offers the same share of every pop as at the start of a
  // new campaign.
  5: (save, data) => {
    const world = buildWorldMap(data);
    const countryStart = buildCountryStartTable(data.countryStart, world);
    const { population, buildings } = createStartingEconomy(data, world, countryStart);
    const old = save.population as { size?: unknown } & UnknownRecord;
    const sizes = Array.isArray(old.size) ? (old.size as number[]) : [];
    return {
      ...save,
      population: {
        ...old,
        standInJobs: Array.from(
          population.standInTarget,
          (share, i) => share * (Number(sizes[i]) || 0),
        ),
      },
      buildings: {
        types: [...buildings.typeIds],
        goods: [...buildings.goodIds],
        methods: buildings.methodIds.map((ids) => [...ids]),
        levels: buildingLevelList(buildings),
        stock: Array.from(buildings.stock),
      },
    };
  },
  // Version 7 (F65) adds the markets, the pops' wealth and income, and each
  // building's money and workers. Older saves get the markets of a new
  // campaign (base prices, the starting wealth); their buildings pay the
  // going wage with empty reserves.
  6: (save, data) => {
    const world = buildWorldMap(data);
    const countryStart = buildCountryStartTable(data.countryStart, world);
    const { population, market } = createStartingEconomy(data, world, countryStart);
    const old = save.population as UnknownRecord;
    const buildings = save.buildings as { levels?: unknown } & UnknownRecord;
    const count = Array.isArray(buildings.levels) ? buildings.levels.length / 4 : 0;
    const economy: number[] = [];
    for (let b = 0; b < count; b++) economy.push(1, 1, 0, 0, 0, 0, 0);
    return {
      ...save,
      population: {
        ...old,
        wealth: Array.from(population.wealth),
        income: Array.from(population.income),
      },
      buildings: { ...buildings, economy },
      market: marketSave(market),
    };
  },
};

/** The markets as a save stores them. */
function marketSave(market: MarketState): SaveFile['market'] {
  const out = Object.fromEntries(
    MARKET_SAVED_ARRAYS.map((key) => [key, Array.from(market[key])]),
  ) as Record<(typeof MARKET_SAVED_ARRAYS)[number], number[]>;
  return { ...out, weekDays: market.weekDays };
}

/** Writes the state as a plain JSON-compatible object. */
export function serializeGameState(state: GameState): SaveFile {
  const [s0, s1, s2, s3] = state.rng.getState();
  return {
    format: SAVE_FORMAT,
    saveVersion: SAVE_FORMAT_VERSION,
    seed: state.seed,
    day: state.day,
    rng: [s0, s1, s2, s3],
    map: { provinces: [...state.world.provinceIds], countries: [...state.world.countryIds] },
    provinceOwners: Array.from(state.provinceOwner),
    playerCountry: state.world.countryIds[state.playerCountry],
    population: {
      groups: [...state.population.groupIds],
      dependents: Array.from(state.population.dependents),
      size: Array.from(state.population.size),
      standInJobs: Array.from(state.population.standInJobs),
      wealth: Array.from(state.population.wealth),
      income: Array.from(state.population.income),
    },
    buildings: {
      types: [...state.buildings.typeIds],
      goods: [...state.buildings.goodIds],
      methods: state.buildings.methodIds.map((ids) => [...ids]),
      levels: buildingLevelList(state.buildings),
      stock: Array.from(state.buildings.stock),
      economy: buildingEconomyList(state.buildings),
    },
    market: marketSave(state.market),
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Brings a parsed save up to the current save format version, one migration
 * at a time. Throws a `SimError` (with a translation key) if it can't.
 */
export function migrateSave(
  raw: unknown,
  data: GameData,
  migrations: SaveMigrations = SAVE_MIGRATIONS,
  targetVersion: number = SAVE_FORMAT_VERSION,
): UnknownRecord {
  if (!isRecord(raw) || raw.format !== SAVE_FORMAT) {
    throw new SimError('SAVE_ERROR_NOT_A_SAVE');
  }
  const foundVersion = raw.saveVersion;
  if (typeof foundVersion !== 'number' || !Number.isInteger(foundVersion) || foundVersion < 1) {
    throw new SimError('SAVE_ERROR_CORRUPT', {}, 'missing or invalid saveVersion');
  }
  if (foundVersion > targetVersion) {
    throw new SimError('SAVE_ERROR_NEWER_VERSION', {
      saveVersion: foundVersion,
      gameVersion: targetVersion,
    });
  }

  let save = raw;
  for (let version = foundVersion; version < targetVersion; version++) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new SimError('SAVE_ERROR_TOO_OLD', {
        saveVersion: foundVersion,
        gameVersion: targetVersion,
      });
    }
    save = { ...migrate(save, data), saveVersion: version + 1 };
  }
  return save;
}

export interface LoadOptions {
  readonly data: GameData;
  readonly systems?: SystemRegistry;
}

/**
 * Rebuilds a `GameState` from a save (already parsed from JSON). Old saves are
 * migrated first. Throws a `SimError` with a translation key if the save
 * can't be loaded.
 */
export function deserializeGameState(raw: unknown, options: LoadOptions): GameState {
  const parsed = saveFileSchema.safeParse(migrateSave(raw, options.data));
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(save)'}: ${issue.message}`)
      .join('; ');
    throw new SimError('SAVE_ERROR_CORRUPT', {}, detail);
  }
  const save = parsed.data;
  if ((save.rng[0] | save.rng[1] | save.rng[2] | save.rng[3]) === 0) {
    throw new SimError('SAVE_ERROR_CORRUPT', {}, 'rng state is all zeros');
  }
  // The arrays in a save are in the order of its own map: it must be this game's map.
  const map = mapIdsOf(options.data);
  const sameIds = (saved: readonly string[], current: readonly string[]) =>
    saved.length === current.length && saved.every((id, i) => id === current[i]);
  if (!sameIds(save.map.provinces, map.provinces) || !sameIds(save.map.countries, map.countries)) {
    throw new SimError('SAVE_ERROR_DIFFERENT_MAP');
  }
  if (
    save.provinceOwners.length !== map.provinces.length ||
    save.provinceOwners.some((owner) => owner >= map.countries.length)
  ) {
    throw new SimError('SAVE_ERROR_CORRUPT', {}, 'provinceOwners does not match the map');
  }
  const playerCountry = map.countries.indexOf(save.playerCountry);
  if (playerCountry < 0) {
    throw new SimError('SAVE_ERROR_CORRUPT', {}, `unknown player country "${save.playerCountry}"`);
  }
  // The population's arrays are in the order of the map and of the pop groups.
  const groups = options.data.pops.groups.map((group) => group.id);
  if (!sameIds(save.population.groups, groups)) {
    throw new SimError('SAVE_ERROR_CORRUPT', {}, 'the pop groups are not the ones of this game');
  }
  const pops = map.provinces.length * groups.length;
  if (
    save.population.dependents.length !== map.provinces.length ||
    save.population.size.length !== pops ||
    save.population.standInJobs.length !== pops ||
    save.population.wealth.length !== pops ||
    save.population.income.length !== pops
  ) {
    throw new SimError('SAVE_ERROR_CORRUPT', {}, 'population does not match the map');
  }
  // The buildings' numbers are in the order of the map, the building types and the goods.
  const types = options.data.buildings.buildings.map((building) => building.id);
  const goods = options.data.goods.goods.map((good) => good.id);
  const methods = options.data.buildings.buildings.map((b) => b.methods.map((m) => m.id));
  if (
    !sameIds(save.buildings.types, types) ||
    !sameIds(save.buildings.goods, goods) ||
    save.buildings.methods.length !== methods.length ||
    !methods.every((ids, t) => sameIds(save.buildings.methods[t], ids))
  ) {
    throw new SimError(
      'SAVE_ERROR_CORRUPT',
      {},
      'the building types, methods or goods are not the ones of this game',
    );
  }
  const levels = save.buildings.levels;
  let levelsFit = levels.length % 4 === 0;
  for (let i = 0; levelsFit && i < levels.length; i += 4)
    levelsFit =
      levels[i] < map.provinces.length &&
      levels[i + 1] < types.length &&
      levels[i + 2] <= 65535 &&
      levels[i + 3] < methods[levels[i + 1]].length;
  if (
    !levelsFit ||
    save.buildings.stock.length !== map.countries.length * goods.length ||
    save.buildings.economy.length !== (levels.length / 4) * BUILDING_ECONOMY_FIELDS
  ) {
    throw new SimError('SAVE_ERROR_CORRUPT', {}, 'buildings do not match the map');
  }
  // The markets' arrays are in the order of the map, the goods, the needs and the pops.
  const markets = map.countries.length * goods.length;
  const entries = options.data.pops.needs.reduce((sum, need) => sum + (need.goods?.length ?? 0), 0);
  const m = save.market;
  if (
    m.price.length !== markets ||
    m.weekBuy.length !== markets ||
    m.weekSell.length !== markets ||
    m.weekPopBuy.length !== markets ||
    m.shares.length !== map.countries.length * entries ||
    m.weekPopWanted.length !== map.countries.length ||
    m.weekPopGot.length !== map.countries.length ||
    m.shortage.length !== map.countries.length ||
    m.weekIncome.length !== pops ||
    m.dividend.length !== pops
  ) {
    throw new SimError('SAVE_ERROR_CORRUPT', {}, 'markets do not match the map and the goods');
  }
  return new GameState({
    data: options.data,
    seed: save.seed,
    systems: options.systems,
    restore: {
      day: save.day,
      rngState: save.rng,
      provinceOwner: Uint16Array.from(save.provinceOwners),
      playerCountry,
      population: {
        dependents: Float64Array.from(save.population.dependents),
        size: Float64Array.from(save.population.size),
        standInJobs: Float64Array.from(save.population.standInJobs),
        wealth: Float64Array.from(save.population.wealth),
        income: Float64Array.from(save.population.income),
      },
      buildings: {
        levels,
        stock: Float64Array.from(save.buildings.stock),
        economy: save.buildings.economy,
      },
      market: {
        price: Float64Array.from(m.price),
        shares: Float64Array.from(m.shares),
        weekBuy: Float64Array.from(m.weekBuy),
        weekSell: Float64Array.from(m.weekSell),
        weekPopBuy: Float64Array.from(m.weekPopBuy),
        weekPopWanted: Float64Array.from(m.weekPopWanted),
        weekPopGot: Float64Array.from(m.weekPopGot),
        shortage: Float32Array.from(m.shortage),
        weekIncome: Float64Array.from(m.weekIncome),
        dividend: Float64Array.from(m.dividend),
        weekDays: m.weekDays,
      },
    },
  });
}

function fnv1a(text: string, offsetBasis: number): number {
  let hash = offsetBasis >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}

/**
 * A short fingerprint of the whole state (16 hex characters). Two runs with
 * the same seed, data and commands must give the same fingerprint; the
 * determinism tests and the campaign runner rely on it.
 */
export function hashGameState(state: GameState): string {
  const text = JSON.stringify(serializeGameState(state));
  const high = fnv1a(text, 0x811c_9dc5);
  const low = fnv1a(text, 0x01c9_dc5b);
  return high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0');
}
