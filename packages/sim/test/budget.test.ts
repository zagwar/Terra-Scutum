import { describe, expect, it } from 'vitest';
import {
  BUDGET_LINES,
  DataValidationError,
  GameState,
  INCOME_LINE_COUNT,
  SAVE_FORMAT_VERSION,
  type SimEvent,
  createSnapshot,
  creditLimit,
  deserializeGameState,
  hashGameState,
  parseGameData,
  serializeGameState,
} from '../src';
import { testBudget, testRawData } from './helpers';

/**
 * The budget (F09) on the tiny test world: AAA (two provinces, rich, a big
 * government) and BBB (one province, poor, a small one), with real taxes.
 */
const LINES = BUDGET_LINES.length;
const line = (id: (typeof BUDGET_LINES)[number]) => BUDGET_LINES.indexOf(id);

function budgetRules() {
  return {
    ...testBudget(),
    taxes: {
      ...testBudget().taxes,
      incomeTax: { lower: 0.1, middle: 0.2, upper: 0.3 },
      dividendsTax: 0.25,
      consumptionTax: 0.1,
    },
    administration: {
      payFactor: [0.6, 0.8, 1, 1.2, 1.4],
      collection: [0.85, 0.95, 1, 1.02, 1.03],
    },
    military: { payFactor: [0.6, 0.8, 1, 1.2, 1.4] },
    welfare: { benefitShare: [0, 0.1, 0.25, 0.4, 0.6] },
    education: {
      shareOfSpending: 0.12,
      costFactor: [0.5, 0.75, 1, 1.25, 1.5],
      trainingFactor: [0.5, 0.75, 1, 1.25, 1.5],
    },
  };
}

interface Finances {
  revenueShare: number;
  spendingShare: number;
  debtShare: number;
  inflationRate: number;
  interestRate?: number;
}

function rawBudget(
  finances: [Finances, Finances],
  change?: (rules: ReturnType<typeof budgetRules>) => void,
) {
  const raw = testRawData();
  const start = raw.countryStart as {
    countries: Record<string, unknown>[];
    sources: Record<string, unknown>;
  };
  start.sources.imfFiscal = { title: 'Test finances' };
  start.countries = start.countries.map((c, i) => ({
    ...c,
    ...finances[i],
    fiscalSource: 'imfFiscal',
  }));
  const rules = budgetRules();
  change?.(rules);
  raw.budget = rules;
  return raw;
}

const BALANCED: [Finances, Finances] = [
  {
    revenueShare: 0.4,
    spendingShare: 0.42,
    debtShare: 0.6,
    inflationRate: 0.02,
    interestRate: 0.02,
  },
  { revenueShare: 0.12, spendingShare: 0.14, debtShare: 0.3, inflationRate: 0.15 },
];

function budgetGame(
  finances: [Finances, Finances] = BALANCED,
  change?: (rules: ReturnType<typeof budgetRules>) => void,
) {
  const data = parseGameData(rawBudget(finances, change));
  const state = new GameState({ data, seed: 1 });
  const events: SimEvent[] = [];
  const run = (days: number) => {
    for (let d = 0; d < days; d++) {
      state.advanceDay();
      events.push(...state.drainEvents());
    }
  };
  const command = (c: Parameters<GameState['applyCommand']>[0]) => state.applyCommand(c);
  return { data, state, events, run, command };
}

const sumLines = (state: GameState, c: number, from: number, to: number) => {
  let total = 0;
  for (let l = from; l < to; l++) total += state.budget.lines[c * LINES + l];
  return total;
};
const income = (state: GameState, c: number) => sumLines(state, c, 0, INCOME_LINE_COUNT);
const spending = (state: GameState, c: number) => sumLines(state, c, INCOME_LINE_COUNT, LINES);
const gdpWeek = (state: GameState, c: number) => state.budget.gdp[c] * 7;

describe('the budget at the start (F09)', () => {
  it('gives every country its real revenue, spending, debt and inflation', () => {
    const { state } = budgetGame();
    const { budget } = state;
    for (const [c, f] of BALANCED.entries()) {
      expect(income(state, c) / gdpWeek(state, c)).toBeCloseTo(f.revenueShare, 3);
      expect(spending(state, c) / gdpWeek(state, c)).toBeCloseTo(f.spendingShare, 3);
      expect(budget.debt[c] / (budget.gdp[c] * 365)).toBeCloseTo(f.debtShare, 6);
      expect(budget.inflation[c]).toBe(f.inflationRate);
      // The treasury: four weeks of spending.
      expect(budget.treasury[c]).toBeCloseTo(4 * spending(state, c), 0);
    }
    // The tax level follows the real revenue: 40 % is high, 12 % very low; welfare too.
    expect(budget.settings[0]).toBe(3);
    expect(budget.settings[3]).toBe(3);
    expect(budget.settings[5]).toBe(0);
    // The pops pay taxes (the test pops buy no goods: no consumption tax; the
    // real world's is checked in the game's tests); the rest is the stand-in.
    expect(budget.lines[line('income_tax')]).toBeGreaterThan(0);
    expect(budget.lines[line('other_revenue')]).toBeGreaterThan(0);
    // The government pays officials and soldiers; interest at the real rate.
    expect(budget.lines[line('administration')]).toBeGreaterThan(0);
    expect(budget.lines[line('military')]).toBeGreaterThan(0);
    expect(budget.interestRate[0]).toBeCloseTo(0.02, 6);
    // BBB has no rate in the data: the fallback by GDP per person.
    expect(budget.interestRate[1]).toBeCloseTo(0.04, 6);
    // The player (AAA) sets its own budget; the others run theirs.
    expect(Array.from(budget.automatic)).toEqual([0, 1]);
  });

  it('caps a starting deficit at a share of GDP (oil funds and aid the game lacks)', () => {
    const { state } = budgetGame([
      { revenueShare: 0.4, spendingShare: 0.9, debtShare: 0.1, inflationRate: 0.02 },
      BALANCED[1],
    ]);
    expect(spending(state, 0) / gdpWeek(state, 0)).toBeCloseTo(0.5, 3);
  });

  it('lowers the standard of living by what taxes take (Victoria 3)', () => {
    const untaxed = new GameState({ data: parseGameData(testRawData()), seed: 1 });
    const { state } = budgetGame();
    let richer = 0;
    for (let i = 0; i < state.population.wealth.length; i++)
      if (state.population.size[i] > 0)
        richer += untaxed.population.wealth[i] - state.population.wealth[i];
    expect(richer).toBeGreaterThan(0);
    // What a pop can spend is its income after taxes, ÷ (1 + the consumption tax).
    const p = 0;
    const { income: gross, netIncome } = state.population;
    expect(netIncome[p]).toBeLessThan(gross[p]);
  });
});

describe('the weekly budget (F09)', () => {
  it('borrows when the treasury runs dry and pays debt back from a surplus', () => {
    const { state, run } = budgetGame([
      { revenueShare: 0.3, spendingShare: 0.4, debtShare: 0.5, inflationRate: 0.02 },
      { revenueShare: 0.3, spendingShare: 0.2, debtShare: 0.5, inflationRate: 0.02 },
    ]);
    const { budget } = state;
    const debt = [budget.debt[0], budget.debt[1]];
    run(7 * 30);
    // AAA's deficit emptied its treasury (four weeks) and then it borrowed.
    expect(budget.treasury[0]).toBe(0);
    expect(budget.debt[0]).toBeGreaterThan(debt[0]);
    // BBB's surplus paid debt back once its treasury held four weeks of spending.
    expect(budget.debt[1]).toBeLessThan(debt[1]);
    expect(budget.treasury[1]).toBeCloseTo(4 * spending(state, 1), -3);
  });

  it('defaults above the credit limit: debt written off, no borrowing, spending cut', () => {
    const { state, run, events, command } = budgetGame([
      { revenueShare: 0.3, spendingShare: 0.4, debtShare: 0.5, inflationRate: 0.02 },
      BALANCED[1],
    ]);
    const { budget, data } = state;
    expect(command({ type: 'debugBudgetCrisis', country: 'AAA' })).toEqual({ ok: true });
    const limit = creditLimit(budget, 0);
    expect(budget.debt[0]).toBeCloseTo(limit * 0.999, 0);
    run(8);
    expect(events).toContainEqual({ type: 'countryDefaulted', country: 'AAA' });
    expect(budget.defaults[0]).toBe(1);
    expect(budget.debt[0]).toBeLessThan(limit * 0.6);
    // It can't borrow for two years: it pays only what comes in.
    run(14);
    expect(budget.spendingCut[0]).toBeLessThan(1);
    expect(budget.treasury[0]).toBeGreaterThanOrEqual(0);
    const debtAfter = budget.debt[0];
    run(28);
    expect(budget.debt[0]).toBeLessThanOrEqual(debtAfter);
    // Its people lose standard of living; lenders charge the default premium.
    expect(state.population.countryLivingPenalty[0]).toBeGreaterThanOrEqual(
      data.budget.default.living,
    );
    expect(budget.interestRate[0]).toBeGreaterThanOrEqual(data.budget.default.premium);
    const snapshot = createSnapshot(state).budget!;
    expect(snapshot.defaulted[0]).toBe(1);
    expect(snapshot.ratings[snapshot.rating[0]]).toBe('D');
  });

  it('charges more interest near the credit limit', () => {
    const { state, run } = budgetGame();
    const before = state.budget.interestRate[0];
    state.budget.debt[0] = creditLimit(state.budget, 0) * 0.95;
    run(7);
    expect(state.budget.interestRate[0]).toBeGreaterThan(before + 0.03);
  });

  it('runs other countries’ budgets: tightens in a deficit near the limit', () => {
    const { state, run } = budgetGame();
    state.budget.debt[1] = creditLimit(state.budget, 1) * 0.9;
    const taxes = state.budget.settings[5];
    run(7);
    expect(state.budget.settings[5]).toBe(taxes + 1);
    // The player's own budget is left alone.
    state.budget.debt[0] = creditLimit(state.budget, 0) * 0.9;
    const playerTaxes = state.budget.settings[0];
    run(7);
    expect(state.budget.settings[0]).toBe(playerTaxes);
  });
});

describe('budget levels (F09)', () => {
  it('raises taxes: more income tax, less for the pops', () => {
    const { state, run, command } = budgetGame();
    run(8);
    const before = state.budget.lines[line('income_tax')];
    const net = state.population.netIncome[0];
    expect(
      command({ type: 'setBudgetLevel', country: 'AAA', setting: 'taxes', level: 'very_high' }),
    ).toEqual({ ok: true });
    expect(state.market.taxes.incomeTax[0]).toBeCloseTo(0.1 * 1.5, 6);
    run(7);
    expect(state.budget.lines[line('income_tax')]).toBeGreaterThan(before * 1.1);
    expect(state.population.netIncome[0]).toBeLessThan(net);
  });

  it('pays officials and soldiers by the funding level; low funding collects less', () => {
    const { state, run, command } = budgetGame();
    run(8);
    const admin = state.budget.lines[line('administration')];
    const military = state.budget.lines[line('military')];
    const otherRevenue = state.budget.lines[line('other_revenue')];
    command({
      type: 'setBudgetLevel',
      country: 'AAA',
      setting: 'administration',
      level: 'very_low',
    });
    command({ type: 'setBudgetLevel', country: 'AAA', setting: 'military', level: 'very_high' });
    run(14);
    expect(state.budget.lines[line('administration')] / admin).toBeCloseTo(0.6, 4);
    expect(state.budget.lines[line('military')] / military).toBeCloseTo(1.4, 4);
    expect(state.budget.lines[line('other_revenue')]).toBeLessThan(otherRevenue);
  });

  it('welfare pays the unemployed; education speeds up training', () => {
    const { state, run, command } = budgetGame();
    run(8);
    const welfare = state.budget.lines[line('welfare')];
    expect(welfare).toBeGreaterThan(0);
    command({ type: 'setBudgetLevel', country: 'AAA', setting: 'welfare', level: 'very_low' });
    command({ type: 'setBudgetLevel', country: 'AAA', setting: 'education', level: 'very_high' });
    expect(state.population.trainingFactor[0]).toBe(1.5);
    expect(state.population.trainingFactor[2]).toBe(1);
    run(14);
    expect(state.budget.lines[line('welfare')]).toBe(0);
    expect(state.budget.lines[line('education')]).toBeGreaterThan(0);
  });

  it('printing money fills the treasury and raises inflation, which costs living standards', () => {
    const { state, run, command } = budgetGame(BALANCED, (rules) => {
      rules.inflation.printing.push({ id: 'massive', shareOfGdpPerYear: 0.15 });
    });
    expect(command({ type: 'setMoneyPrinting', country: 'AAA', level: 'massive' })).toEqual({
      ok: true,
    });
    run(7 * 30);
    expect(state.budget.lines[line('printed_money')]).toBeGreaterThan(0);
    expect(state.budget.inflation[0]).toBeGreaterThan(0.3);
    expect(state.population.countryLivingPenalty[0]).toBeGreaterThan(1);
    // BBB's real 15 % drifts back toward normal.
    expect(state.budget.inflation[1]).toBeLessThan(0.09);
  });

  it('refuses bad commands', () => {
    const { command } = budgetGame();
    expect(
      command({ type: 'setBudgetLevel', country: 'ZZZ', setting: 'taxes', level: 'low' }),
    ).toMatchObject({ ok: false, reasonKey: 'COMMAND_UNKNOWN_COUNTRY' });
    expect(
      command({ type: 'setBudgetLevel', country: 'AAA', setting: 'taxes', level: 'huge' }),
    ).toMatchObject({ ok: false, reasonKey: 'COMMAND_INVALID' });
    expect(
      command({
        type: 'setBudgetLevel',
        country: 'AAA',
        setting: 'nonsense' as 'taxes',
        level: 'low',
      }),
    ).toMatchObject({ ok: false, reasonKey: 'COMMAND_INVALID' });
    expect(command({ type: 'setMoneyPrinting', country: 'AAA', level: 'lots' })).toMatchObject({
      ok: false,
    });
    expect(command({ type: 'setAutomaticBudget', country: 'AAA', on: true })).toEqual({
      ok: true,
    });
  });

  it('the player who chooses another country leaves the old one to the automatic budget', () => {
    const { state, command } = budgetGame();
    command({ type: 'choosePlayerCountry', country: 'BBB' });
    expect(Array.from(state.budget.automatic)).toEqual([1, 0]);
  });
});

describe('the budget in saves and snapshots (F09)', () => {
  it('continues exactly from a save made mid-week', () => {
    const { state, run, command } = budgetGame();
    command({ type: 'setBudgetLevel', country: 'AAA', setting: 'welfare', level: 'very_high' });
    run(7 * 3 + 3);
    const saved: unknown = JSON.parse(JSON.stringify(serializeGameState(state)));
    const loaded = deserializeGameState(saved, { data: state.data });
    expect(hashGameState(loaded)).toBe(hashGameState(state));
    run(20);
    for (let d = 0; d < 20; d++) loaded.advanceDay();
    expect(hashGameState(loaded)).toBe(hashGameState(state));
  });

  it('loads a version 9 save with a new campaign’s budget', () => {
    const { state, run } = budgetGame();
    run(10);
    const { budget: _budget, population, market, ...old } = serializeGameState(state);
    void _budget;
    const { netIncome: _net, ...oldPopulation } = population;
    void _net;
    const { weekNet: _weekNet, ...oldMarket } = market;
    void _weekNet;
    expect(SAVE_FORMAT_VERSION).toBe(10);
    const loaded = deserializeGameState(
      { ...old, population: oldPopulation, market: oldMarket, saveVersion: 9 },
      { data: state.data },
    );
    expect(loaded.day).toBe(10);
    expect(loaded.budget.debt[0]).toBeGreaterThan(0);
    expect(Array.from(loaded.budget.automatic)).toEqual([0, 1]);
    loaded.advanceDay();
  });

  it('sends the budget in the snapshot', () => {
    const { state, run } = budgetGame();
    run(15);
    const budget = createSnapshot(state).budget!;
    expect(budget.lineIds).toEqual(BUDGET_LINES);
    expect(budget.treasury[0]).toBe(state.budget.treasury[0]);
    expect(budget.history.length).toBe(state.budget.historyCount);
    expect(budget.groupGross[0]).toBeGreaterThan(budget.groupNet[0]);
    expect(budget.creditLimit[0]).toBeCloseTo(creditLimit(state.budget, 0), 0);
    expect(budget.ratings.at(-1)).toBe('D');
  });
});

describe('budget.json checks (F09)', () => {
  const issues = (change: (rules: ReturnType<typeof budgetRules>) => void) => {
    try {
      parseGameData(rawBudget(BALANCED, change));
      return '';
    } catch (error) {
      if (error instanceof DataValidationError) return error.message;
      throw error;
    }
  };
  it('accepts the rules and the real file’s shape', () => {
    expect(issues(() => {})).toBe('');
  });
  it('needs one value per level, rising, and a stratum for every pop group', () => {
    expect(issues((r) => (r.welfare.benefitShare = [0, 0.1, 0.25]))).toContain(
      'needs one value per level',
    );
    expect(issues((r) => (r.military.payFactor = [1, 0.8, 1, 1.2, 1.4]))).toContain(
      'must not fall',
    );
    expect(issues((r) => delete (r.taxes.strata as Record<string, string>).owners)).toContain(
      '"owners" has no stratum',
    );
  });
  it('checks the printing levels, ratings and automatic rules', () => {
    expect(
      issues((r) => (r.inflation.printing[0] = { id: 'none', shareOfGdpPerYear: 0.1 })),
    ).toContain('prints nothing');
    expect(issues((r) => (r.credit.ratings = [{ id: 'AAA', below: 0.5 }]))).toContain(
      'whole credit limit',
    );
    expect(issues((r) => (r.auto.loosenBelow = 0.9))).toContain('below tightenAbove');
  });
});
