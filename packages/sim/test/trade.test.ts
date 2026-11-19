import { describe, expect, it } from 'vitest';
import {
  DataValidationError,
  GameState,
  SAVE_FORMAT_VERSION,
  buildWorldMap,
  computeRoutes,
  createSnapshot,
  deserializeGameState,
  ensureBuildingsReport,
  hashGameState,
  parseGameData,
  serializeGameState,
} from '../src';
import {
  type TestStartingBuilding,
  testBuildingStart,
  testBuildings,
  testData,
  testRawData,
  testTrade,
} from './helpers';

/**
 * Trade between the markets (F19) on the tiny test world: AAA (two
 * provinces, capital alpha_west) and BBB (one province, beta_main), with
 * goods ore, coal, steel (tradable) and electricity (local).
 */
const GOODS = ['ore', 'coal', 'steel', 'electricity'];
const TYPES = ['mine', 'coal_mine', 'power_plant', 'mill', 'dam'];

/** AAA's mill needs coal AAA doesn't mine; BBB mines more coal than it uses. */
const COAL_TRADE: Record<string, TestStartingBuilding[]> = {
  alpha_west: [
    ['dam', 'turbines', 10],
    ['mine', 'machines', 1],
    ['mill', 'modern', 1],
  ],
  beta_main: [
    ['dam', 'turbines', 1],
    ['coal_mine', 'machines', 1],
  ],
};

function game(
  start: Record<string, TestStartingBuilding[]> = COAL_TRADE,
  trade: Partial<ReturnType<typeof testTrade>> = {},
) {
  const raw = testRawData();
  const buildings = testBuildings();
  buildings.standIns.restOfEconomyShare = 1;
  raw.buildings = buildings;
  raw.buildingStart = testBuildingStart(start);
  raw.trade = { ...testTrade(), localGoods: ['electricity'], ...trade };
  const data = parseGameData(raw);
  const state = new GameState({ data, seed: 1 });
  const country = (id: string) => state.world.countryIndex.get(id)!;
  const at = (countryId: string, good: string) =>
    country(countryId) * GOODS.length + GOODS.indexOf(good);
  const cell = (provinceId: string, type: string) =>
    state.world.provinceIndex.get(provinceId)! * TYPES.length + TYPES.indexOf(type);
  const output = (provinceId: string, type: string) =>
    ensureBuildingsReport(state).output[cell(provinceId, type)];
  const run = (days: number) => {
    for (let i = 0; i < days; i++) state.advanceDay();
  };
  const embargo = (on: boolean) =>
    state.applyCommand({ type: 'debugSetEmbargo', country: 'AAA', target: 'BBB', on });
  return { data, state, country, at, output, run, embargo };
}

describe('routes between capitals (F19)', () => {
  it('finds the cheapest route over provinces and sea zones, and none through blocked places', () => {
    const world = buildWorldMap(testData());
    const routes = computeRoutes(world, { sea: 1.5, land: 20 });
    const aaa = world.countryIndex.get('AAA')!;
    const bbb = world.countryIndex.get('BBB')!;
    const n = world.countryIds.length;
    const there = routes.shipping[aaa * n + bbb];
    expect(there).toBeGreaterThan(0);
    expect(Number.isFinite(there)).toBe(true);
    // Shipping = km by land × the land rate + km at sea × the sea rate.
    const km = (pair: number) => routes.landKm[pair] * 20 + routes.seaKm[pair] * 1.5;
    expect(there).toBeCloseTo(km(aaa * n + bbb) / 1000, 4);
    expect(routes.shipping[aaa * n + aaa]).toBe(0);
    // With the provinces between them and both sea zones blocked, BBB can't be reached.
    const blocked = new Uint8Array(world.provinceIds.length + world.seaZoneIds.length);
    blocked[world.provinceIndex.get('alpha_east')!] = 1;
    for (let z = 0; z < world.seaZoneIds.length; z++) blocked[world.provinceIds.length + z] = 1;
    const cut = computeRoutes(world, { sea: 1.5, land: 20 }, blocked);
    expect(cut.shipping[aaa * n + bbb]).toBe(Infinity);
  });
});

describe('the start of a campaign (F19)', () => {
  it('imports what a country needs but doesn’t make, from a country with spare', () => {
    const { state, at, data } = game();
    const report = ensureBuildingsReport(state);
    const need =
      report.ordered[at('AAA', 'coal')] +
      state.market.popOrder[at('AAA', 'coal')] -
      report.made[at('AAA', 'coal')];
    expect(need).toBeGreaterThan(0);
    expect(state.trade.imports[at('AAA', 'coal')]).toBeCloseTo(need, 3);
    expect(state.trade.exports[at('BBB', 'coal')]).toBeCloseTo(need, 3);
    expect(state.trade.restOfWorld[GOODS.indexOf('coal')]).toBe(0);
    // Electricity is local: never traded.
    expect(state.trade.imports[at('AAA', 'electricity')]).toBe(0);
    // AAA's coal costs what it costs delivered: world price + shipping + tariff.
    const base = data.goods.goods[1].basePrice;
    const n = state.world.countryIds.length;
    const shipping = state.trade.shipping[state.world.countryIndex.get('BBB')! * n];
    expect(state.trade.landed[at('AAA', 'coal')]).toBeCloseTo(base * 1.05 + shipping, 3);
    expect(state.market.price[at('AAA', 'coal')]).toBeGreaterThan(base);
    expect(state.market.price[at('BBB', 'coal')]).toBeCloseTo(base, 6);
  });

  it('lets the rest of the world sell what no country makes', () => {
    // AAA's mill needs ore that nobody mines.
    const { state, at, output, run } = game({
      alpha_west: [
        ['dam', 'turbines', 10],
        ['coal_mine', 'machines', 1],
        ['mill', 'modern', 1],
      ],
    });
    const ore = GOODS.indexOf('ore');
    expect(state.trade.restOfWorld[ore]).toBeGreaterThan(0);
    expect(state.trade.imports[at('AAA', 'ore')]).toBeCloseTo(state.trade.restOfWorld[ore], 3);
    run(60);
    expect(output('alpha_west', 'mill')).toBeCloseTo(1, 3);
  });
});

describe('goods moving every day (F19)', () => {
  it('ships exports out of the exporter’s stockpile and into the importer’s', () => {
    const { state, at, output, run } = game();
    run(120);
    // Without trade AAA's mill would have used its 10 days of coal long ago.
    expect(output('alpha_west', 'mill')).toBeCloseTo(1, 3);
    expect(state.trade.delivered[GOODS.indexOf('coal')]).toBeCloseTo(1, 6);
    expect(state.buildings.imports[at('AAA', 'coal')]).toBeGreaterThan(0);
    expect(state.market.exportGot[at('BBB', 'coal')]).toBeCloseTo(
      state.market.exportOrder[at('BBB', 'coal')],
      3,
    );
    // Each week's split puts the flow from BBB to AAA in the report.
    const snapshot = createSnapshot(state).trade!;
    const coal = GOODS.indexOf('coal');
    const n = snapshot.countryCount;
    expect(snapshot.fromPartner[coal * (n + 1) + state.world.countryIndex.get('BBB')!]).toBeCloseTo(
      state.trade.imports[at('AAA', 'coal')],
      0,
    );
    expect(snapshot.importValue[at('AAA', 'coal')]).toBeGreaterThan(0);
    expect(snapshot.tariffIncome[state.world.countryIndex.get('AAA')!]).toBeGreaterThan(0);
  });

  it('serves the country’s own buyers before its exporters', () => {
    const { state, at, run } = game();
    // BBB's coal mine closes: what is left in its stockpile stays at home first.
    expect(
      state.applyCommand({
        type: 'debugSetBuildingLevel',
        province: 'beta_main',
        building: 'coal_mine',
        level: 0,
      }),
    ).toEqual({ ok: true });
    run(3);
    expect(state.market.exportGot[at('BBB', 'coal')]).toBeLessThanOrEqual(
      state.market.exportOrder[at('BBB', 'coal')],
    );
  });
});

describe('embargoes and trade agreements (F19, test commands until diplomacy)', () => {
  it('an embargo stops trade between two countries at once, and lifting it brings it back', () => {
    const { state, at, output, run, embargo } = game();
    run(10);
    expect(embargo(true)).toEqual({ ok: true });
    expect(state.trade.imports[at('AAA', 'coal')]).toBe(0);
    expect(state.trade.exports[at('BBB', 'coal')]).toBe(0);
    run(60);
    expect(output('alpha_west', 'mill')).toBeLessThan(0.5);
    expect(embargo(false)).toEqual({ ok: true });
    run(60);
    expect(state.trade.imports[at('AAA', 'coal')]).toBeGreaterThan(0);
    expect(output('alpha_west', 'mill')).toBeGreaterThan(0.99);
  });

  it('a trade agreement takes the tariffs off', () => {
    const { state, at, run } = game();
    run(10);
    const before = state.trade.landed[at('AAA', 'coal')];
    expect(
      state.applyCommand({
        type: 'debugSetTradeAgreement',
        country: 'BBB',
        target: 'AAA',
        on: true,
      }),
    ).toEqual({ ok: true });
    const base = state.market.basePrice[GOODS.indexOf('coal')];
    expect(state.trade.landed[at('AAA', 'coal')]).toBeCloseTo(before - 0.05 * base, 3);
    expect(state.trade.tariffIncome[state.world.countryIndex.get('AAA')!]).toBe(0);
  });

  it('closing a building type everywhere leaves nothing to import (test command)', () => {
    const { state, at, output, run } = game();
    expect(
      state.applyCommand({
        type: 'debugSetBuildingLevelEverywhere',
        building: 'coal_mine',
        level: 0,
      }),
    ).toEqual({ ok: true });
    run(60);
    expect(state.trade.exports[at('BBB', 'coal')]).toBe(0);
    expect(output('alpha_west', 'mill')).toBe(0);
    expect(
      state.applyCommand({ type: 'debugSetBuildingLevelEverywhere', building: 'castle', level: 0 })
        .ok,
    ).toBe(false);
  });

  it('refuses bad commands', () => {
    const { state } = game();
    for (const bad of [
      { type: 'debugSetEmbargo', country: 'ZZZ', target: 'AAA', on: true },
      { type: 'debugSetEmbargo', country: 'AAA', target: 'AAA', on: true },
      { type: 'debugSetTradeAgreement', country: 'AAA', target: 'BBB', on: 'yes' },
    ] as const)
      expect(state.applyCommand(bad as never).ok).toBe(false);
  });
});

describe('saves (F19)', () => {
  it('a game loaded in mid-week continues exactly like the original, embargoes too', () => {
    const { state, data, run, embargo } = game();
    run(17);
    embargo(true);
    run(3);
    const copy = deserializeGameState(JSON.parse(JSON.stringify(serializeGameState(state))), {
      data,
    });
    expect(hashGameState(copy)).toBe(hashGameState(state));
    expect(copy.trade.embargo).toEqual(state.trade.embargo);
    for (let i = 0; i < 30; i++) {
      state.advanceDay();
      copy.advanceDay();
    }
    expect(hashGameState(copy)).toBe(hashGameState(state));
  });

  it('loads a version 7 save (from before trade) with the trade of a new campaign', () => {
    const { state, data, run } = game();
    run(10);
    const { trade: _trade, ...old } = serializeGameState(state);
    void _trade;
    expect(SAVE_FORMAT_VERSION).toBe(10);
    const loaded = deserializeGameState({ ...old, saveVersion: 7 }, { data });
    expect(loaded.day).toBe(10);
    expect([...loaded.trade.imports]).toEqual([...game().state.trade.imports]);
  });

  it('is deterministic', () => {
    const a = game();
    const b = game();
    a.run(40);
    b.run(40);
    expect(hashGameState(a.state)).toBe(hashGameState(b.state));
  });
});

describe('trade.json (F19)', () => {
  it('checks the local goods: they exist, and electricity is one of them', () => {
    const raw = testRawData();
    raw.trade = { ...testTrade(), localGoods: ['coal', 'gold'] };
    try {
      parseGameData(raw);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DataValidationError);
      const text = (error as Error).message;
      expect(text).toContain('unknown good "gold"');
      expect(text).toContain('electricity');
    }
  });
});
