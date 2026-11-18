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
  jobsPerLevel,
  otherElectricity,
  provinceBuildings,
  recipeAmounts,
  stoppedBuildings,
} from '../src/ui/buildings/buildings-view';
import { formatAmount, formatMoneyShort } from '../src/ui/i18n';
import { RAW_GAME_DATA } from '../src/worker/game-data';

// The buildings (F07, F85) as the game shows them, on the real world's starting data.
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
  /** Sets the level of one building type in every province of the world that has it (F19: so nobody can export its goods). */
  const setWorldLevels = (building: string, level: number) => {
    const type = state.buildings.typeIds.indexOf(building);
    state.world.provinceIds.forEach((provinceId, index) => {
      if (state.buildings.level[index * state.buildings.typeCount + type] === 0) return;
      state.applyCommand({ type: 'debugSetBuildingLevel', province: provinceId, building, level });
    });
  };
  return { state, province, country, snapshot, setCountryLevels, setWorldLevels };
};
const { state, province, country, snapshot } = newGame();
const buildings = snapshot();
const { goods, pops } = data;

describe('the world’s starting buildings (F85)', () => {
  it('gives every country its real buildings, and they (nearly) all run', () => {
    const report = ensureBuildingsReport(state);
    const owners = new Set<number>();
    let heldBack = 0;
    for (let i = 0; i < report.cellCount; i++) {
      const cell = report.cells[i];
      owners.add(state.provinceOwner[Math.floor(cell / report.typeCount)]);
      if (isHeldBack(report.limitKind[cell])) heldBack += 1;
    }
    // Only a microstate's one factory level is too big for its few workers
    // (Liechtenstein), and (F65) some small countries' homes ask for more
    // electricity than their power plants have to spare (F19: a few more,
    // since the standing imports' extra 5 % of fuels is gone and homes heat a
    // little more with electricity; until construction, F12, and the grid, F74).
    expect(heldBack).toBeLessThanOrEqual(40);
    expect(report.cellCount).toBeGreaterThan(10_000);
    expect(owners.size).toBeGreaterThan(165);
    expect(owners.has(country('USA'))).toBe(true);
    expect(owners.has(country('BDI'))).toBe(true);
    // Buildings offer about a third of all jobs: farming and the catalog's industries.
    const sum = (values: ArrayLike<number>) => Array.from(values).reduce((a, b) => a + b, 0);
    const share = sum(state.population.buildingJobs) / sum(state.population.jobs);
    expect(share).toBeGreaterThan(0.25);
    expect(share).toBeLessThan(0.4);
  });
});

describe('reading the buildings snapshot', () => {
  it('lists a province’s buildings in the order of buildings.json, with their methods', () => {
    const rows = provinceBuildings(buildings, data.buildings, province('deu_bavaria'));
    const ids = rows.map((row) => row.definition.id);
    const order = data.buildings.buildings.map((building) => building.id);
    expect(ids).toEqual([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(ids).toEqual(expect.arrayContaining(['farm', 'steel_mill', 'solar_farm']));
    const farm = rows.find((row) => row.definition.id === 'farm')!;
    expect(farm.methodDefinition.id).toBe('mechanized_farming');
    const steel = rows.find((row) => row.definition.id === 'steel_mill')!;
    expect(steel).toMatchObject({ output: 1, limitKind: BUILDING_LIMIT.none, method: 0 });
    expect(steel.jobs).toBe(steel.level * jobsPerLevel(steel.methodDefinition));
    expect(steel.workers).toBeCloseTo(steel.jobs, 0);
    expect(steel.wages).toBeGreaterThan(0);
    expect(provinceBuildings(buildings, data.buildings, province('bra_brazilian_island'))).toEqual(
      [],
    );
    // A poor country farms by hand.
    const indiaFarms = countryBuildings(
      buildings,
      data.buildings,
      goods,
      state.provinceOwner,
      country('IND'),
    ).find((type) => type.definition.id === 'farm')!;
    expect(
      indiaFarms.methods.map(({ method }) => indiaFarms.definition.methods[method].id),
    ).not.toContain('mechanized_farming');
  });

  it('works out what a building uses and makes at its level', () => {
    const steelMill = data.buildings.buildings.find((building) => building.id === 'steel_mill')!;
    const { uses, makes } = recipeAmounts(steelMill.methods[0], goods, 3);
    expect(makes).toEqual([{ good: 'steel', amount: 15_000 }]);
    expect(uses).toEqual([
      { good: 'electricity', amount: 7_500 },
      { good: 'iron_ore', amount: 24_000 },
      { good: 'coal', amount: 10_500 },
    ]);
    expect(amountsText(uses, goods)).toBe('7.5 GWh electricity, 24 kt iron ore, 10.5 kt coal');
  });

  it('sums up a country’s buildings by type', () => {
    const types = countryBuildings(
      buildings,
      data.buildings,
      goods,
      state.provinceOwner,
      country('USA'),
    );
    expect(types.map((type) => type.definition.id)).toContain('steel_mill');
    const steel = types.find((type) => type.definition.id === 'steel_mill')!;
    // About 80 million tonnes of steel a year, as in 2024.
    expect(steel.levels * 5000 * 365).toBeGreaterThan(75e6);
    expect(steel.levels * 5000 * 365).toBeLessThan(85e6);
    expect(steel.jobs).toBe(steel.levels * 2500);
    expect(steel.output).toBeCloseTo(1, 6);
    expect(steel.heldBack).toBe(0);
    expect(steel.methods).toEqual([{ method: 0, levels: steel.levels }]);
    expect(steel.makes).toEqual([{ good: 'steel', amount: steel.levels * 5000 }]);
    expect(steel.rows.reduce((sum, row) => sum + row.level, 0)).toBe(steel.levels);
    expect(steel.rows[0].level).toBeGreaterThanOrEqual(steel.rows[steel.rows.length - 1].level);
  });

  it('shows a country’s national stockpile with its imports (F19)', () => {
    const rows = countryStockpile(buildings, goods, country('USA'));
    const of = (good: string) => rows.find((row) => row.good === good)!;
    expect(rows.map((row) => row.good)).toEqual(goods.goods.map((good) => good.id));
    // The steel mills use more iron ore than the United States mines: the rest is imported.
    const ore = of('iron_ore');
    expect(ore).toMatchObject({ stored: true, daysLeft: null });
    // F65: 15 days of what everyone buys.
    expect(ore.stock).toBeGreaterThanOrEqual(15 * ore.used);
    expect(ore.stock).toBeLessThan(15 * ore.used * 1.1);
    expect(ore.made).toBeLessThan(ore.used);
    expect(ore.imported).toBeCloseTo(ore.used - ore.made, 0);
    // F65: no building uses processed food; the people buy it, so it is in stock.
    expect(of('processed_food')).toMatchObject({ used: 0 });
    expect(of('processed_food').stock).toBeGreaterThan(0);
    expect(of('electricity')).toMatchObject({ stored: false, stock: 0, imported: 0 });
    // Homes, shops and offices use most of the electricity.
    const other = otherElectricity(buildings, country('USA'));
    expect(other.used).toBeCloseTo(other.wanted, 3);
    expect(other.wanted).toBeGreaterThan(of('electricity').used * 0.8);
    expect(of('electricity').made).toBeCloseTo(of('electricity').used, 3);
  });

  it('finds the buildings that are stopped, the worst first', () => {
    const game = newGame();
    const usa = game.country('USA');
    const refineries = countryBuildings(
      game.snapshot(),
      data.buildings,
      goods,
      game.state.provinceOwner,
      usa,
    ).find((type) => type.definition.id === 'oil_refinery')!;
    const stopped = () =>
      stoppedBuildings(game.snapshot(), data.buildings, game.state.provinceOwner, usa);
    expect(stopped()).toEqual({ count: 0, worst: null });
    // Every oil field in the world closes (F19: otherwise the United States imports its crude oil).
    game.setWorldLevels('oil_field', 0);
    // The crude oil in stock lasts about 16 days.
    for (let day = 0; day < 10; day++) game.state.advanceDay();
    expect(stopped().count).toBe(0);
    const crude = countryStockpile(game.snapshot(), goods, usa).find(
      (row) => row.good === 'crude_oil',
    )!;
    expect(crude.daysLeft).toBeGreaterThan(5);
    expect(crude.daysLeft).toBeLessThan(7);
    for (let day = 0; day < 10; day++) game.state.advanceDay();
    const { count, worst } = stopped();
    expect(count).toBe(refineries.buildings);
    expect(worst).toMatchObject({
      limitKind: BUILDING_LIMIT.input,
      level: refineries.rows[0].level,
    });
    expect(worst!.output).toBeLessThan(0.1);
    expect(limitText(worst!, pops, goods)).toBe('Held back: not enough crude oil.');
  });

  it('says what holds a building back', () => {
    const limit = (limitKind: number, limitWhat: number) =>
      limitText({ limitKind, limitWhat }, pops, goods);
    expect(limit(BUILDING_LIMIT.none, 0)).toBeNull();
    expect(limit(BUILDING_LIMIT.workers, 1)).toBe('Held back: not enough skilled workers.');
    expect(limit(BUILDING_LIMIT.electricity, 0)).toBe('Held back: not enough electricity.');
    expect(limit(BUILDING_LIMIT.input, 3)).toBe('Held back: not enough coal.');
    expect(limit(BUILDING_LIMIT.input, 4)).toBe('Held back: not enough crude oil.');
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
    game.setWorldLevels('oil_field', 0);
    pass(20);
    const [alert] = store.getState().alerts;
    expect(alert).toMatchObject({ id: IDLE_BUILDINGS_ALERT_ID, typeId: 'idle_factory' });
    expect(alert.params).toMatchObject({ building: 'Oil refinery', output: '0 %' });
    // Another country's trouble is not the player's alert.
    store.update({ playerCountry: game.country('DEU') });
    expect(store.getState().alerts).toEqual([]);
    store.update({ playerCountry: game.country('USA') });
    const idle = () =>
      store.getState().alerts.filter((alert) => alert.id === IDLE_BUILDINGS_ALERT_ID);
    expect(idle()).toHaveLength(1);
    // Dismissed, it stays away while the problem lasts…
    store.update({
      alerts: store.getState().alerts.filter((a) => a.id !== IDLE_BUILDINGS_ALERT_ID),
    });
    pass(3);
    expect(idle()).toEqual([]);
    // …and comes back with the next problem.
    game.state.applyCommand({ type: 'debugFillStockpile', country: 'USA', days: 5 });
    pass(1);
    expect(idle()).toEqual([]);
    pass(10);
    expect(idle()).toHaveLength(1);
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
