import { GameState, createSnapshot, parseGameData } from '@terra-scutum/sim';
import { describe, expect, it } from 'vitest';
import { countryMarket } from '../src/ui/markets/markets-view';
import {
  REST_OF_WORLD,
  deliveredPrice,
  goodPartners,
  tradeGoods,
  tradePartners,
  tradeTotals,
  worldMarket,
} from '../src/ui/trade/trade-view';
import { RAW_GAME_DATA } from '../src/worker/game-data';

// Trade (F19) as the Trade screen shows it, on the real world's starting data.
const data = parseGameData(RAW_GAME_DATA);
const { goods } = data;
const good = (id: string) => goods.goods.findIndex((entry) => entry.id === id);

const newGame = (player: string) => {
  const state = new GameState({ data, seed: 1 });
  const country = (id: string) => state.world.countryIndex.get(id)!;
  expect(state.applyCommand({ type: 'choosePlayerCountry', country: player })).toEqual({
    ok: true,
  });
  const run = (days: number) => {
    for (let day = 0; day < days; day++) state.advanceDay();
  };
  const snapshot = () => createSnapshot(state);
  return { state, country, run, snapshot };
};

describe('reading the trade snapshot (Japan, an importer of iron ore and coal)', () => {
  const game = newGame('JPN');
  game.run(7 * 2 + 1);
  const snapshot = game.snapshot();
  const trade = snapshot.trade!;
  const market = snapshot.market!;
  const buildings = snapshot.buildings!;

  it('adds up the country’s imports, exports, balance and tariffs', () => {
    const totals = tradeTotals(trade, market);
    expect(trade.country).toBe(game.country('JPN'));
    expect(totals.importValue).toBeGreaterThan(totals.exportValue);
    expect(totals.balance).toBeCloseTo(totals.exportValue - totals.importValue, 3);
    expect(totals.tariffIncome).toBeGreaterThan(0);
    expect(totals.partners).toBeGreaterThan(5);
  });

  it('lists the goods it trades with world prices, delivered costs and how much it makes itself', () => {
    const rows = tradeGoods(trade, market, buildings, goods);
    expect(rows.find((row) => row.good === 'electricity')).toBeUndefined();
    const ore = rows.find((row) => row.good === 'iron_ore')!;
    expect(ore.imported).toBeGreaterThan(0);
    expect(ore.selfSufficiency).toBeLessThan(0.1);
    // Delivered: the world price plus shipping and the 5 % tariff.
    expect(ore.delivered!).toBeGreaterThan(ore.worldPrice * 1.05);
    expect(ore.deliveryShare!).toBeGreaterThan(0.05);
    expect(ore.importValue).toBeCloseTo(ore.imported * ore.delivered!, -2);
  });

  it('says where a good comes from: its biggest suppliers first, with shipping', () => {
    const { from, to } = goodPartners(trade, market, good('iron_ore'));
    expect(from.length).toBeGreaterThan(0);
    expect(to).toEqual([]);
    for (let i = 1; i < from.length; i++)
      expect(from[i].amount).toBeLessThanOrEqual(from[i - 1].amount);
    const total = from.reduce((sum, flow) => sum + flow.amount, 0);
    expect(total).toBeCloseTo(
      trade.imports[game.country('JPN') * trade.goodCount + good('iron_ore')],
      0,
    );
    // Australia, its neighbor across the sea, is among the suppliers.
    expect(from.some((flow) => flow.partner === game.country('AUS'))).toBe(true);
    // The world can't mine all the iron ore its mills need: the rest of the world sells some.
    const rest = from.find((flow) => flow.partner === REST_OF_WORLD);
    expect(rest?.value).toBeCloseTo(
      rest!.amount * deliveredPrice(trade, market, good('iron_ore'), REST_OF_WORLD),
      3,
    );
  });

  it('lists its partners, biggest first, the rest of the world last', () => {
    const rows = tradePartners(trade, market, goods);
    expect(rows.length).toBeGreaterThan(5);
    expect(rows[rows.length - 1].partner).toBe(REST_OF_WORLD);
    const countries = rows.filter((row) => row.partner !== REST_OF_WORLD);
    for (let i = 1; i < countries.length; i++)
      expect(countries[i].bought + countries[i].sold).toBeLessThanOrEqual(
        countries[i - 1].bought + countries[i - 1].sold,
      );
    const australia = rows.find((row) => row.partner === game.country('AUS'))!;
    expect(australia.goodsBought).toContain('iron_ore');
    expect(australia.seaKm).toBeGreaterThan(3000);
    expect(australia.embargo).toBe(false);
  });

  it('shows the World Market: world prices, what is traded, the biggest traders', () => {
    const rows = worldMarket(trade, market, goods);
    expect(rows.find((row) => row.good === 'electricity')).toBeUndefined();
    const ore = rows.find((row) => row.good === 'iron_ore')!;
    expect(ore.factor).toBeGreaterThan(0.9);
    expect(ore.factor).toBeLessThan(1.1);
    expect(ore.traded).toBeGreaterThan(0);
    expect(ore.restOfWorld).toBeGreaterThan(0);
    expect(ore.topImporters[0].country).toBe(game.country('CHN'));
    expect(ore.history.length).toBe(trade.historyWeeks);
  });

  it('gives the Markets screen the world price of every good that can be traded', () => {
    const rows = countryMarket(market, buildings, goods, trade.country, true, trade);
    expect(rows.find((row) => row.good === 'iron_ore')!.worldPrice).toBeCloseTo(
      trade.worldPrice[good('iron_ore')],
      6,
    );
    expect(rows.find((row) => row.good === 'electricity')!.worldPrice).toBeNull();
  });
});

describe('an embargo on the Trade screen', () => {
  it('shows the partner as embargoed, with no trade', () => {
    const game = newGame('JPN');
    game.run(8);
    expect(
      game.state.applyCommand({ type: 'debugSetEmbargo', country: 'JPN', target: 'AUS', on: true }),
    ).toEqual({ ok: true });
    const snapshot = game.snapshot();
    const rows = tradePartners(snapshot.trade!, snapshot.market!, goods);
    const australia = rows.find((row) => row.partner === game.country('AUS'))!;
    expect(australia).toMatchObject({ embargo: true, bought: 0, sold: 0 });
  });
});
