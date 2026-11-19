import { GameState, createSnapshot, parseGameData } from '@terra-scutum/sim';
import { describe, expect, it } from 'vitest';
import { createAppStore } from '../src/app-store';
import {
  BORROWING_ALERT_ID,
  DEFAULT_ALERT_ID,
  INFLATION_ALERT_ID,
  NEAR_LIMIT_ALERT_ID,
  createBuildingAlerts,
} from '../src/ui/buildings/building-alerts';
import { budgetTopBarValue } from '../src/ui/budget/budget-top-bar';
import {
  balancePoints,
  budgetLines,
  budgetTone,
  countryBudget,
  worldDebts,
} from '../src/ui/budget/budget-view';
import { messageFromEvent } from '../src/ui/shell/messages';
import { RAW_GAME_DATA } from '../src/worker/game-data';

// The budget (F09) as the game shows it, on the real world's starting data.
const data = parseGameData(RAW_GAME_DATA);
const state = new GameState({ data, seed: 1 });
for (let day = 0; day < 8; day++) state.advanceDay();
const snapshot = createSnapshot(state);
const budget = snapshot.budget!;
const usa = state.world.countryIndex.get('USA')!;
const deu = state.world.countryIndex.get('DEU')!;
const jpn = state.world.countryIndex.get('JPN')!;

function storeWith(change?: (b: typeof budget) => void) {
  const copy = {
    ...budget,
    treasury: budget.treasury.slice(),
    debt: budget.debt.slice(),
    defaulted: budget.defaulted.slice(),
    inflation: budget.inflation.slice(),
    spendingCut: budget.spendingCut.slice(),
  };
  change?.(copy);
  return createAppStore({
    snapshot,
    budget: copy,
    buildings: snapshot.buildings!,
    market: snapshot.market!,
    buildingTypes: data.buildings,
    goods: data.goods,
    pops: data.pops,
    provinceOwner: snapshot.provinceOwner!,
    world: state.world,
    playerCountry: usa,
  });
}

describe('the Budget screen (F09)', () => {
  it("shows the United States' real 2025 budget", () => {
    const summary = countryBudget(budget, usa);
    expect(summary.income / (summary.gdp / 52)).toBeCloseTo(0.305, 2);
    expect(summary.spending / (summary.gdp / 52)).toBeCloseTo(0.376, 2);
    expect(summary.debtShare).toBeCloseTo(1.24, 1);
    expect(summary.mood).toBe('deficit');
    expect(summary.settings.taxes).toBe('medium');
    expect(summary.automatic).toBe(false);
    expect(budgetTone(summary)).toBe('warn');
    // Germany taxes very high, Japan carries the most debt of the big economies.
    expect(countryBudget(budget, deu).settings.taxes).toBe('very_high');
    expect(worldDebts(budget, 10)).toContain(jpn);
  });

  it('lists every line; the real taxes are there', () => {
    const lines = budgetLines(budget, usa);
    const byId = Object.fromEntries(lines.map((line) => [line.id, line]));
    for (const id of ['income_tax', 'dividends_tax', 'consumption_tax', 'tariffs', 'other_revenue'])
      expect(byId[id].amount).toBeGreaterThan(0);
    for (const id of ['administration', 'military', 'welfare', 'education', 'interest'])
      expect(byId[id].amount).toBeGreaterThan(0);
    expect(byId.income_tax.setting).toBe('taxes');
    expect(byId.interest.setting).toBeNull();
    const total = lines.reduce((sum, line) => sum + (line.income ? line.shareOfGdp : 0), 0);
    expect(total).toBeCloseTo(0.305, 2);
    // People pay taxes: less left after them.
    for (let g = 0; g < data.pops.groups.length; g++)
      if (budget.groupGross[g] > 0) expect(budget.groupNet[g]).toBeLessThan(budget.groupGross[g]);
  });

  it('draws the balance line around zero', () => {
    expect(balancePoints(new Float32Array([1, -1]), 10, 10)).toBe('0.0,1.0 10.0,9.0');
    expect(balancePoints(new Float32Array([]), 10, 10)).toBe('');
  });

  it('shows the treasury and the weekly balance in the top bar', () => {
    const value = budgetTopBarValue(storeWith().getState())!;
    expect(value.text).toMatch(/^\$.+ \(−\$.+\/wk\)$/);
    expect(value.tone).toBe('warn');
    expect(value.lines.join(' ')).toContain('rating');
  });
});

describe('budget alerts and messages (F09)', () => {
  const alertsOf = (change?: (b: typeof budget) => void) => {
    const store = storeWith(change);
    createBuildingAlerts(store).sync();
    return store.getState().alerts.map((alert) => alert.id);
  };
  it('warns of borrowing, the credit limit, a default and high inflation', () => {
    expect(alertsOf((b) => (b.treasury[usa] = 0))).toContain(BORROWING_ALERT_ID);
    expect(alertsOf((b) => (b.debt[usa] = b.creditLimit[usa] * 0.95))).toContain(
      NEAR_LIMIT_ALERT_ID,
    );
    const inDefault = alertsOf((b) => {
      b.defaulted[usa] = 1;
      b.spendingCut[usa] = 0.6;
    });
    expect(inDefault).toContain(DEFAULT_ALERT_ID);
    expect(inDefault).not.toContain(NEAR_LIMIT_ALERT_ID);
    expect(alertsOf((b) => (b.inflation[usa] = 0.3))).toContain(INFLATION_ALERT_ID);
    expect(alertsOf()).not.toContain(DEFAULT_ALERT_ID);
  });

  it('tells of every default, the player’s own in its own words', () => {
    const own = messageFromEvent(
      { type: 'countryDefaulted', country: 'USA' },
      state.world,
      snapshot.date,
      usa,
    )!;
    expect(own.titleKey).toBe('MESSAGE_DEFAULT_OWN_TITLE');
    const other = messageFromEvent(
      { type: 'countryDefaulted', country: 'ARG' },
      state.world,
      snapshot.date,
      usa,
    )!;
    expect(other.titleKey).toBe('MESSAGE_DEFAULT_TITLE');
    expect(other.target).toEqual({ kind: 'country', index: state.world.countryIndex.get('ARG') });
  });
});
