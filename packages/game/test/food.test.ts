import { type FoodSnapshot, GameState, createSnapshot, parseGameData } from '@terra-scutum/sim';
import { describe, expect, it } from 'vitest';
import { createAppStore } from '../src/app-store';
import { foodColor, parseHexColor, provinceBaseColors } from '../src/render/map/map-colors';
import {
  FAMINE_ALERT_ID,
  FOOD_LOW_ALERT_ID,
  createBuildingAlerts,
} from '../src/ui/buildings/building-alerts';
import { dateOfDay } from '../src/ui/food/food-screen';
import { foodTopBarValue } from '../src/ui/food/food-top-bar';
import {
  countryFood,
  foodGoods,
  hungryProvinces,
  reserveDaysText,
  reserveTone,
} from '../src/ui/food/food-view';
import { messageFromEvent } from '../src/ui/shell/messages';
import { RAW_GAME_DATA } from '../src/worker/game-data';

// Food (F08) as the game shows it, on the real world's starting data.
const data = parseGameData(RAW_GAME_DATA);
const state = new GameState({ data, seed: 1 });
for (let day = 0; day < 8; day++) state.advanceDay();
const snapshot = createSnapshot(state);
const food = snapshot.food!;
const buildings = snapshot.buildings!;
const usa = state.world.countryIndex.get('USA')!;
const usaProvinces = state.world.provinceIds
  .map((_, p) => p)
  .filter((p) => state.provinceOwner[p] === usa);

/** A copy of the food snapshot with some of its arrays changed. */
function changed(change: (copy: FoodSnapshot) => void): FoodSnapshot {
  const copy = {
    ...food,
    reserveDays: food.reserveDays.slice(),
    basicShortage: food.basicShortage.slice(),
    starving: food.starving.slice(),
    famineCount: food.famineCount.slice(),
    starvationDeaths: food.starvationDeaths.slice(),
    provinceStarving: food.provinceStarving.slice(),
    provinceSevere: food.provinceSevere.slice(),
    provinceSecurity: food.provinceSecurity.slice(),
    famineSince: food.famineSince.slice(),
  };
  change(copy);
  return copy;
}

describe('reading the food snapshot', () => {
  it('shows a well-fed country at the start: 30 days of reserves, no rationing', () => {
    const summary = countryFood(food, buildings, usa, true);
    expect(summary.mood).toBe('fed');
    expect(summary.reserveDays).toBeGreaterThan(25);
    expect(summary.reserveDays).toBeLessThan(35);
    expect(summary.reserveTonnes).toBeGreaterThan(1e6);
    expect(summary.rationing).toBe('none');
    expect(summary.choice).toBeNull();
    expect(summary.starving).toBe(0);
    expect(summary.security).toBeGreaterThan(0.9);
    expect(reserveTone(summary)).toBe('ok');
  });

  it('names the worst first: famine, then hunger, then low reserves', () => {
    const mood = (change: (copy: FoodSnapshot) => void) =>
      countryFood(changed(change), buildings, usa, true).mood;
    expect(mood((copy) => (copy.reserveDays[usa] = 5))).toBe('low');
    expect(mood((copy) => (copy.basicShortage[usa] = 0.05))).toBe('short');
    expect(mood((copy) => (copy.starving[usa] = 0.01))).toBe('short');
    expect(
      mood((copy) => {
        copy.famineCount[usa] = 2;
        copy.reserveDays[usa] = 1;
      }),
    ).toBe('famine');
  });

  it('lists the food goods: made, eaten, used by buildings, in reserve', () => {
    const rows = foodGoods(food, snapshot.market!, buildings, data.goods, usa);
    expect(rows.map((row) => row.good)).toEqual(['grain', 'livestock_fish', 'processed_food']);
    const grain = rows[0];
    expect(grain.made).toBeGreaterThan(0);
    expect(grain.people).toBeGreaterThan(0);
    expect(grain.buildings).toBeGreaterThan(0);
    expect(grain.stockDays).toBeGreaterThan(10);
    expect(rows[2].buildings).toBe(0);
  });

  it('lists the hungry provinces, famines first', () => {
    const [a, b] = usaProvinces;
    const hungry = changed((copy) => {
      copy.provinceStarving[a] = 0.6;
      copy.provinceStarving[b] = 0.4;
      copy.famineSince[b] = 3;
    });
    const rows = hungryProvinces(hungry, snapshot.population!, state.provinceOwner, usa);
    expect(rows.map((row) => row.province)).toEqual([b, a]);
    expect(rows[0].famineSince).toBe(3);
    expect(rows[1].famineSince).toBeNull();
    expect(hungryProvinces(food, snapshot.population!, state.provinceOwner, usa)).toEqual([]);
  });

  it('writes reserve days short', () => {
    expect(reserveDaysText(29.6)).toBe('30');
    expect(reserveDaysText(Infinity)).toBe('∞');
    expect(reserveDaysText(1234)).toBe('999+');
    expect(reserveDaysText(-1)).toBe('0');
  });

  it('turns a day of the campaign into its date', () => {
    expect(dateOfDay(0, snapshot.date, snapshot.day)).toEqual({ year: 2025, month: 1, day: 1 });
    expect(dateOfDay(31, snapshot.date, snapshot.day)).toEqual({ year: 2025, month: 2, day: 1 });
  });
});

describe('the top bar’s food number', () => {
  it('shows the reserves in days, green while fine and red in a famine', () => {
    const base = { food, buildings, playerCountry: usa };
    const value = foodTopBarValue({ ...createAppStore().getState(), ...base })!;
    expect(value.text).toMatch(/^\d+ d$/);
    expect(value.tone).toBe('ok');
    expect(value.lines.join(' ')).toContain('Rationing: None');
    const famine = changed((copy) => (copy.famineCount[usa] = 1));
    const bad = foodTopBarValue({ ...createAppStore().getState(), ...base, food: famine })!;
    expect(bad.tone).toBe('bad');
    expect(bad.lines.join(' ')).toContain('Provinces in famine: 1');
    expect(foodTopBarValue(createAppStore().getState())).toBeNull();
  });
});

describe('the food map mode', () => {
  const colors = data.mapView.colors.food;
  it('colors by food security, and famine apart', () => {
    expect(foodColor(1, false, colors)).toEqual(parseHexColor(colors.steps.at(-1)!.color));
    expect(foodColor(0, false, colors)).toEqual(parseHexColor(colors.steps[0].color));
    expect(foodColor(0.9, true, colors)).toEqual(parseHexColor(colors.famine));
    const middle = foodColor(0.5, false, colors);
    const low = parseHexColor(colors.steps[2].color);
    const high = parseHexColor(colors.steps[3].color);
    for (let i = 0; i < 3; i++) {
      expect(middle[i]).toBeGreaterThanOrEqual(Math.min(low[i], high[i]) - 1e-9);
      expect(middle[i]).toBeLessThanOrEqual(Math.max(low[i], high[i]) + 1e-9);
    }
  });

  it('paints every province in the food mode', () => {
    const famine = changed((copy) => (copy.famineSince[usaProvinces[0]] = 2));
    const colorsOut = provinceBaseColors(
      'food',
      state.world,
      data.mapView.colors,
      state.provinceOwner,
      null,
      null,
      { security: famine.provinceSecurity, famineSince: famine.famineSince },
    );
    const p = usaProvinces[0];
    expect(Array.from(colorsOut.slice(p * 4, p * 4 + 3))).toEqual(parseHexColor(colors.famine));
  });
});

describe('famine messages and alerts', () => {
  it('tells the player of famines in their own country only', () => {
    const province = state.world.provinceIds[usaProvinces[0]];
    const started = messageFromEvent(
      { type: 'famineStarted', province, country: 'USA' },
      state.world,
      snapshot.date,
      usa,
    );
    expect(started).toMatchObject({
      typeId: 'famine_started',
      target: { kind: 'province', index: usaProvinces[0] },
    });
    const ended = messageFromEvent(
      { type: 'famineEnded', province, country: 'USA', deaths: 12_345 },
      state.world,
      snapshot.date,
      usa,
    );
    expect(ended).toMatchObject({ typeId: 'famine_ended', params: { deaths: '12,345' } });
    const elsewhere = messageFromEvent(
      { type: 'famineStarted', province, country: 'USA' },
      state.world,
      snapshot.date,
      state.world.countryIndex.get('DEU'),
    );
    expect(elsewhere).toBeNull();
  });

  it('warns of a famine (showing the worst province) and of low reserves', () => {
    const store = createAppStore({
      world: state.world,
      provinceOwner: state.provinceOwner,
      playerCountry: usa,
      buildingTypes: data.buildings,
      goods: data.goods,
      pops: data.pops,
      buildings,
      market: snapshot.market!,
      population: snapshot.population!,
      food,
    });
    store.subscribe(createBuildingAlerts(store).sync);
    store.update({ food: { ...food } });
    const alert = (id: number) => store.getState().alerts.find((a) => a.id === id);
    expect(alert(FAMINE_ALERT_ID)).toBeUndefined();
    expect(alert(FOOD_LOW_ALERT_ID)).toBeUndefined();
    store.update({ food: changed((copy) => (copy.reserveDays[usa] = 4)) });
    expect(alert(FOOD_LOW_ALERT_ID)).toMatchObject({
      typeId: 'food_reserves_low',
      params: { days: '4' },
    });
    const p = usaProvinces[1];
    store.update({
      food: changed((copy) => {
        copy.reserveDays[usa] = 4;
        copy.famineCount[usa] = 1;
        copy.famineSince[p] = 5;
        copy.provinceStarving[p] = 0.5;
      }),
    });
    expect(alert(FAMINE_ALERT_ID)).toMatchObject({
      typeId: 'famine',
      params: { count: 1, starving: '50 %' },
      target: { kind: 'province', index: p },
    });
    // The famine says it louder: no low reserves alert beside it.
    expect(alert(FOOD_LOW_ALERT_ID)).toBeUndefined();
  });
});

describe('a food crisis on the real map (the Food screen’s test tool, F08)', () => {
  it('starves a country that has nothing left but some livestock and fish: famine within weeks', () => {
    const crisis = new GameState({ data, seed: 1 });
    const { world, buildings } = crisis;
    const deu = world.countryIndex.get('DEU')!;
    const foodIds = new Set(data.food.goods);
    const makesFood = data.buildings.buildings.map((type) =>
      type.methods.some((method) => Object.keys(method.outputs).some((id) => foodIds.has(id))),
    );
    for (let p = 0; p < world.provinceIds.length; p++) {
      if (crisis.provinceOwner[p] !== deu) continue;
      for (let type = 0; type < buildings.typeCount; type++)
        if (makesFood[type] && buildings.level[p * buildings.typeCount + type] > 0)
          crisis.applyCommand({
            type: 'debugSetBuildingLevel',
            province: world.provinceIds[p],
            building: data.buildings.buildings[type].id,
            level: 0,
          });
    }
    for (const good of foodIds)
      crisis.applyCommand({ type: 'debugSetStockpile', country: 'DEU', good, amount: 0 });
    for (const other of world.countryIds)
      if (other !== 'DEU')
        crisis.applyCommand({ type: 'debugSetEmbargo', country: 'DEU', target: other, on: true });
    for (let day = 0; day < 35; day++) crisis.advanceDay();
    // Livestock and fish (from the rest of the world) count for at most 40 % of basic food.
    expect(crisis.food.basicShortage[deu]).toBeGreaterThan(0.5);
    expect(crisis.food.countryStarving[deu]).toBe(1);
    expect(crisis.food.famineCount[deu]).toBeGreaterThan(0);
    expect(crisis.food.levelIds[crisis.food.rationing[deu]]).toBe('emergency');
  }, 30_000);
});
