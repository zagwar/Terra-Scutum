import {
  BUILDING_LIMIT,
  GameState,
  createSnapshot,
  ensureBuildingsReport,
  parseGameData,
} from '@terra-scutum/sim';
import { describe, expect, it } from 'vitest';
import { createAppStore } from '../src/app-store';
import { industryColor, provinceBaseColors } from '../src/render/map/map-colors';
import { IDLE_BUILDINGS_ALERT_ID, createBuildingAlerts } from '../src/ui/buildings/building-alerts';
import { amountsText, limitText } from '../src/ui/buildings/building-parts';
import {
  countryBuildings,
  countryStockpile,
  isHeldBack,
  provinceBuildings,
  recipeAmounts,
  stoppedBuildings,
} from '../src/ui/buildings/buildings-view';
import { formatAmount, formatMoneyShort } from '../src/ui/i18n';
import { RAW_GAME_DATA } from '../src/worker/game-data';

// The buildings (F07) as the game shows them, on the real world's starting data.
const data = parseGameData(RAW_GAME_DATA);
const newGame = () => {
  const state = new GameState({ data, seed: 1 });
  const province = (id: string) => state.world.provinceIndex.get(id)!;
  const country = (id: string) => state.world.countryIndex.get(id)!;
  const snapshot = () => createSnapshot(state).buildings!;
  /** Sets the level of one building type in every province of a country that has it. */
  const setCountryLevels = (countryId: string, building: string, level: number) => {
    const type = state.buildings.typeIds.indexOf(building);
    state.world.provinceIds.forEach((provinceId, index) => {
      if (state.provinceOwner[index] !== country(countryId)) return;
      if (state.buildings.level[index * state.buildings.typeCount + type] === 0) return;
      state.applyCommand({ type: 'debugSetBuildingLevel', province: provinceId, building, level });
    });
  };
  return { state, province, country, snapshot, setCountryLevels };
};
const { state, province, country, snapshot } = newGame();
const buildings = snapshot();
const { goods, pops } = data;

describe('the world’s starting buildings (F07)', () => {
  it('gives the bigger economies the example buildings, and they all run', () => {
    const report = ensureBuildingsReport(state);
    const owners = new Set<number>();
    for (let i = 0; i < report.cellCount; i++) {
      const cell = report.cells[i];
      owners.add(state.provinceOwner[Math.floor(cell / report.typeCount)]);
      expect(isHeldBack(report.limitKind[cell])).toBe(false);
    }
    expect(owners.size).toBeGreaterThan(100);
    expect(owners.has(country('USA'))).toBe(true);
    // A small economy has none: its people work in the rest of the economy.
    expect(owners.has(country('BDI'))).toBe(false);
    // Buildings are a small part of all jobs so far (the stand-in economy has the rest).
    const sum = (values: ArrayLike<number>) => Array.from(values).reduce((a, b) => a + b, 0);
    const share = sum(state.population.buildingJobs) / sum(state.population.jobs);
    expect(share).toBeGreaterThan(0.003);
    expect(share).toBeLessThan(0.02);
  });
});

describe('reading the buildings snapshot', () => {
  it('lists a province’s buildings in the order of buildings.json', () => {
    const rows = provinceBuildings(buildings, data.buildings, province('deu_bavaria'));
    expect(rows.map((row) => row.definition.id)).toEqual([
      'farm',
      'iron_mine',
      'coal_mine',
      'coal_power_plant',
      'food_processing_plant',
      'steel_mill',
    ]);
    const steel = rows[5];
    expect(steel).toMatchObject({ level: 8, output: 1, limitKind: BUILDING_LIMIT.none });
    expect(steel.jobs).toBe(8 * 4000);
    expect(steel.workers).toBeCloseTo(steel.jobs, 0);
    expect(steel.wages).toBeGreaterThan(0);
    expect(provinceBuildings(buildings, data.buildings, province('bra_brazilian_island'))).toEqual(
      [],
    );
  });

  it('works out what a building uses and makes at its level', () => {
    const steelMill = data.buildings.buildings.find((building) => building.id === 'steel_mill')!;
    const { uses, makes } = recipeAmounts(steelMill, goods, 3);
    expect(makes).toEqual([{ good: 'steel', amount: 15_000 }]);
    expect(uses).toEqual([
      { good: 'electricity', amount: 7_500 },
      { good: 'iron_ore', amount: 24_000 },
      { good: 'coal', amount: 10_500 },
    ]);
    expect(amountsText(uses, goods)).toBe('7.5 GWh electricity, 24 kt iron ore, 10.5 kt coal');
  });

  it('sums up a country’s buildings by type', () => {
    const types = countryBuildings(buildings, data.buildings, state.provinceOwner, country('USA'));
    expect(types.map((type) => type.definition.id)).toContain('steel_mill');
    const steel = types.find((type) => type.definition.id === 'steel_mill')!;
    expect(steel.levels).toBe(310);
    expect(steel.jobs).toBe(310 * 4000);
    expect(steel.output).toBeCloseTo(1, 6);
    expect(steel.heldBack).toBe(0);
    expect(steel.rows.reduce((sum, row) => sum + row.level, 0)).toBe(310);
    // The biggest first: California has the most people.
    expect(state.world.provinceIds[steel.rows[0].province]).toBe('usa_california');
    expect(
      countryBuildings(buildings, data.buildings, state.provinceOwner, country('BDI')),
    ).toEqual([]);
  });

  it('shows a country’s national stockpile', () => {
    const rows = countryStockpile(buildings, goods, country('USA'));
    const of = (good: string) => rows.find((row) => row.good === good)!;
    expect(rows.map((row) => row.good)).toEqual(goods.goods.map((good) => good.id));
    // 15 days of the 2.48 million tonnes of ore the steel mills use a day.
    expect(of('iron_ore')).toMatchObject({ stored: true, daysLeft: null });
    expect(of('iron_ore').stock).toBeCloseTo(15 * 2_480_000, 0);
    expect(of('iron_ore').made).toBeCloseTo(2_480_000, 0);
    expect(of('steel')).toMatchObject({ stock: 0, used: 0 });
    expect(of('steel').limit).toBeCloseTo(30 * 1_550_000, 0);
    expect(of('electricity')).toMatchObject({ stored: false, stock: 0 });
    expect(of('electricity').made).toBeCloseTo(of('electricity').used, 3);
    expect(countryStockpile(buildings, goods, country('BDI'))).toEqual([]);
  });

  it('finds the buildings that are stopped, the worst first', () => {
    const game = newGame();
    const usa = game.country('USA');
    const stopped = () =>
      stoppedBuildings(game.snapshot(), data.buildings, game.state.provinceOwner, usa);
    expect(stopped()).toEqual({ count: 0, worst: null });
    game.setCountryLevels('USA', 'iron_mine', 0);
    // The stockpile lasts 15 days; then the steel mills stop.
    for (let day = 0; day < 10; day++) game.state.advanceDay();
    expect(stopped().count).toBe(0);
    expect(countryStockpile(game.snapshot(), goods, usa)[2].daysLeft).toBeCloseTo(5, 6);
    for (let day = 0; day < 10; day++) game.state.advanceDay();
    const { count, worst } = stopped();
    expect(count).toBe(45);
    expect(worst).toMatchObject({ output: 0, limitKind: BUILDING_LIMIT.input, level: 37 });
    expect(limitText(worst!, pops, goods)).toBe('Held back: not enough iron ore.');
    expect(game.state.world.provinceIds[worst!.province]).toBe('usa_california');
  });

  it('says what holds a building back', () => {
    const limit = (limitKind: number, limitWhat: number) =>
      limitText({ limitKind, limitWhat }, pops, goods);
    expect(limit(BUILDING_LIMIT.none, 0)).toBeNull();
    expect(limit(BUILDING_LIMIT.workers, 1)).toBe('Held back: not enough skilled workers.');
    expect(limit(BUILDING_LIMIT.electricity, 0)).toBe('Held back: not enough electricity.');
    expect(limit(BUILDING_LIMIT.input, 3)).toBe('Held back: not enough coal.');
    expect(limit(BUILDING_LIMIT.demand, 0)).toBe('No more electricity is needed today.');
  });
});

describe('the idle factory alert', () => {
  it('appears while the player’s buildings are stopped, and stays away once dismissed', () => {
    const game = newGame();
    const store = createAppStore({
      world: game.state.world,
      provinceOwner: game.state.provinceOwner,
      playerCountry: game.country('USA'),
      buildingTypes: data.buildings,
      goods,
      pops,
      buildings: game.snapshot(),
    });
    store.subscribe(createBuildingAlerts(store).sync);
    const pass = (days: number) => {
      for (let day = 0; day < days; day++) game.state.advanceDay();
      store.update({ buildings: game.snapshot() });
    };
    pass(1);
    expect(store.getState().alerts).toEqual([]);
    game.setCountryLevels('USA', 'iron_mine', 0);
    pass(20);
    const [alert] = store.getState().alerts;
    expect(alert).toMatchObject({
      id: IDLE_BUILDINGS_ALERT_ID,
      typeId: 'idle_factory',
      target: { kind: 'province', index: game.province('usa_california') },
    });
    expect(alert.params).toMatchObject({ count: 45, building: 'Steel mill', output: '0 %' });
    // Another country's trouble is not the player's alert.
    store.update({ playerCountry: game.country('DEU') });
    expect(store.getState().alerts).toEqual([]);
    store.update({ playerCountry: game.country('USA') });
    expect(store.getState().alerts).toHaveLength(1);
    // Dismissed, it stays away while the problem lasts…
    store.update({ alerts: [] });
    pass(3);
    expect(store.getState().alerts).toEqual([]);
    // …and comes back with the next problem.
    game.state.applyCommand({ type: 'debugFillStockpile', country: 'USA', days: 5 });
    pass(1);
    expect(store.getState().alerts).toEqual([]);
    pass(10);
    expect(store.getState().alerts).toHaveLength(1);
  });
});

describe('the industry map mode', () => {
  const steps = data.mapView.colors.industry;
  const hex = (color: readonly number[]) =>
    `#${color.map((part) => Math.round(part).toString(16).padStart(2, '0')).join('')}`;

  it('colors people at work in buildings on the scale of map_view.json', () => {
    expect(hex(industryColor(0, steps))).toBe(steps[0].color);
    expect(hex(industryColor(steps[3].workers, steps))).toBe(steps[3].color);
    expect(hex(industryColor(1e9, steps))).toBe(steps[steps.length - 1].color);
  });

  it('colors every province by the people at work in its buildings', () => {
    const table = provinceBaseColors(
      'industry',
      state.world,
      data.mapView.colors,
      state.provinceOwner,
      null,
      buildings.provinceWorkers,
    );
    const colorOf = (id: string) => [...table.subarray(province(id) * 4, province(id) * 4 + 3)];
    const brightness = (id: string) => colorOf(id).reduce((sum, part) => sum + part, 0);
    expect(brightness('usa_california')).toBeLessThan(brightness('usa_wyoming'));
    expect(hex(colorOf('bra_brazilian_island'))).toBe(steps[0].color);
    // Without the buildings (before the sim's first answer) the land is plain.
    const plain = provinceBaseColors(
      'industry',
      state.world,
      data.mapView.colors,
      state.provinceOwner,
    );
    expect([...plain]).toEqual([
      ...provinceBaseColors('provinces', state.world, data.mapView.colors, state.provinceOwner),
    ]);
  });
});

describe('amounts of goods', () => {
  it('shortens real units so the numbers stay small', () => {
    expect(formatAmount(0, 't')).toBe('0 t');
    expect(formatAmount(950, 't')).toBe('950 t');
    expect(formatAmount(5_000, 't')).toBe('5 kt');
    expect(formatAmount(24_500, 't')).toBe('24.5 kt');
    expect(formatAmount(999_600, 't')).toBe('1 Mt');
    expect(formatAmount(1_400_000, 't')).toBe('1.4 Mt');
    expect(formatAmount(37_200_000, 't')).toBe('37.2 Mt');
    expect(formatAmount(2.5e9, 't')).toBe('2.5 Gt');
    expect(formatAmount(25, 'MWh')).toBe('25 MWh');
    expect(formatAmount(2_500, 'MWh')).toBe('2.5 GWh');
    expect(formatAmount(1_123_400, 'MWh')).toBe('1.12 TWh');
    expect(formatAmount(-3_000, 't')).toBe('−3 kt');
    expect(formatMoneyShort(1_070_000_000)).toBe('$1.07B');
  });
});
