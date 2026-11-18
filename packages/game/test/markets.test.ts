import { GameState, createSnapshot, parseGameData } from '@terra-scutum/sim';
import { describe, expect, it } from 'vitest';
import { createAppStore } from '../src/app-store';
import {
  LAYOFFS_ALERT_ID,
  SHORTAGE_ALERT_ID,
  createBuildingAlerts,
} from '../src/ui/buildings/building-alerts';
import {
  countryBuildings,
  layingOffBuildings,
  provinceBuildings,
} from '../src/ui/buildings/buildings-view';
import { formatMoneySigned, formatPrice } from '../src/ui/i18n';
import { countryMarket, priceMood, sparklinePoints } from '../src/ui/markets/markets-view';
import { RAW_GAME_DATA } from '../src/worker/game-data';

// The markets (F65) as the game shows them, on the real world's starting data.
const data = parseGameData(RAW_GAME_DATA);
const newGame = () => {
  const state = new GameState({ data, seed: 1 });
  const country = (id: string) => state.world.countryIndex.get(id)!;
  const province = (id: string) => state.world.provinceIndex.get(id)!;
  const run = (days: number) => {
    for (let day = 0; day < days; day++) state.advanceDay();
  };
  return { state, country, province, run };
};

describe('reading the market snapshot', () => {
  const game = newGame();
  game.run(7 * 3 + 1);
  const snapshot = createSnapshot(game.state);
  const market = snapshot.market!;
  const usa = game.country('USA');
  const rows = countryMarket(market, snapshot.buildings!, data.goods, usa, true);
  const of = (good: string) => rows.find((row) => row.good === good)!;

  it('lists every good of the country’s market with its price against its base price', () => {
    expect(rows.map((row) => row.good)).toEqual(data.goods.goods.map((good) => good.id));
    for (const row of rows) {
      expect(row.priceFactor).toBeGreaterThanOrEqual(0.25);
      expect(row.priceFactor).toBeLessThanOrEqual(1.75);
      expect(row.price).toBeCloseTo(row.basePrice * row.priceFactor, 6);
    }
    // Three weeks in, the markets that started in balance are still near their base prices.
    expect(of('grain').priceFactor).toBeGreaterThan(0.9);
    expect(of('grain').priceFactor).toBeLessThan(1.1);
  });

  it('splits the buy orders between buildings, people, the rest of the economy and exporters', () => {
    for (const row of rows) {
      if (!row.stored) continue;
      expect(row.buildingsBuy + row.popsBuy + row.restBuy + row.exportsBuy).toBeCloseTo(row.buy, 3);
    }
    // People buy grain and processed food; no building uses processed food.
    expect(of('grain').popsBuy).toBeGreaterThan(0);
    expect(of('processed_food').buildingsBuy).toBe(0);
    expect(of('processed_food').popsBuy).toBeGreaterThan(0);
    // Electricity is never in stock; its buyers still add up.
    const power = of('electricity');
    expect(power.stored).toBe(false);
    expect(power.stockDays).toBeNull();
    expect(power.buildingsBuy + power.popsBuy + power.restBuy).toBeCloseTo(power.buy, 3);
  });

  it('carries the player’s price history, a week at a time', () => {
    expect(market.historyWeeks).toBeGreaterThanOrEqual(3);
    expect(of('steel').history.length).toBe(market.historyWeeks);
    const line = sparklinePoints(of('steel').history, 72, 22);
    expect(line.split(' ').length).toBe(market.historyWeeks);
    expect(sparklinePoints([1], 72, 22)).toBe('');
    // The base price draws in the middle, the limits at the edges.
    expect(sparklinePoints([1, 1.75, 0.25], 100, 30)).toBe('0.0,15.0 50.0,0.0 100.0,30.0');
  });

  it('colors a price by how it compares with its base price', () => {
    expect(priceMood(0.5)).toBe('cheap');
    expect(priceMood(1)).toBe('normal');
    expect(priceMood(1.5)).toBe('dear');
  });

  it('formats prices and signed money', () => {
    expect(formatPrice(612.4, 't')).toBe('$612 per t');
    expect(formatPrice(9.4, 'MWh')).toBe('$9.40 per MWh');
    expect(formatMoneySigned(64_700)).toBe('$64.7k');
    expect(formatMoneySigned(-1_200_000)).toBe('−$1.2M');
  });
});

describe('buildings’ money on the screens', () => {
  it('shows each building’s sales, costs, profit, wage level and reserves', () => {
    const game = newGame();
    const buildings = createSnapshot(game.state).buildings!;
    const rows = provinceBuildings(buildings, data.buildings, game.province('deu_bavaria'));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      if (row.subsistence) {
        expect(row.profit).toBe(0);
        continue;
      }
      expect(row.profit).toBeCloseTo(row.revenue - row.inputCost - row.wages, 3);
      expect(row.wageFactor).toBeGreaterThan(0);
      expect(row.wageFactor).toBeLessThanOrEqual(1);
      expect(row.reserves).toBeLessThanOrEqual(row.reserveCap + 1e-6);
    }
    const types = countryBuildings(
      buildings,
      data.buildings,
      data.goods,
      game.state.provinceOwner,
      game.country('DEU'),
    );
    for (const type of types) {
      expect(type.profit).toBeCloseTo(
        type.rows.reduce((sum, row) => sum + row.profit, 0),
        3,
      );
    }
  });
});

describe('the economy’s alerts (F65)', () => {
  it('warns when the player’s buildings lay workers off, naming the one that closed the most jobs', () => {
    const game = newGame();
    const buildings = createSnapshot(game.state).buildings!;
    const usa = game.country('USA');
    // A building keeping only 40 % of its jobs open.
    const index = Array.from(buildings.cells).findIndex(
      (cell) => game.state.provinceOwner[Math.floor(cell / buildings.typeCount)] === usa,
    );
    buildings.open[index] = 0.4;
    const laying = layingOffBuildings(buildings, data.buildings, game.state.provinceOwner, usa);
    expect(laying.count).toBe(1);
    expect(laying.jobsClosed).toBeGreaterThan(0);
    const store = createAppStore({
      world: game.state.world,
      provinceOwner: game.state.provinceOwner,
      playerCountry: usa,
      buildingTypes: data.buildings,
      goods: data.goods,
      pops: data.pops,
      buildings,
    });
    store.subscribe(createBuildingAlerts(store).sync);
    store.update({ buildings: { ...buildings } });
    const alert = store.getState().alerts.find((a) => a.id === LAYOFFS_ALERT_ID);
    expect(alert).toMatchObject({ typeId: 'layoffs', params: { count: 1, open: '40 %' } });
  });

  it('warns when the player’s people went without part of their goods last week', () => {
    const game = newGame();
    const snapshot = createSnapshot(game.state);
    const usa = game.country('USA');
    const market = { ...snapshot.market!, shortage: snapshot.market!.shortage.slice() };
    const store = createAppStore({
      world: game.state.world,
      provinceOwner: game.state.provinceOwner,
      playerCountry: usa,
      buildingTypes: data.buildings,
      goods: data.goods,
      pops: data.pops,
      buildings: snapshot.buildings!,
      market,
    });
    store.subscribe(createBuildingAlerts(store).sync);
    store.update({ market: { ...market } });
    expect(store.getState().alerts.find((a) => a.id === SHORTAGE_ALERT_ID)).toBeUndefined();
    market.shortage[usa] = 0.12;
    store.update({ market: { ...market } });
    const alert = store.getState().alerts.find((a) => a.id === SHORTAGE_ALERT_ID);
    expect(alert).toMatchObject({
      typeId: 'shortage',
      params: { share: '12.0 %' },
      target: { kind: 'country', index: usa },
    });
  });
});
