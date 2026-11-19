import { countryNameKey } from '@terra-scutum/sim';
import { useState } from 'react';
import type { AppState } from '../../app-store';
import { BUILDING_TEST_TOOLS } from '../buildings/building-parts';
import { Flag } from '../flag';
import { formatMoneyShort, formatMoneySigned, formatPercent, t, tKey } from '../i18n';
import type { ShellActions } from '../shell/shell-actions';
import {
  type BudgetLineRow,
  type BudgetSummary,
  balancePoints,
  budgetLines,
  countryBudget,
  worldDebts,
} from './budget-view';

/** How many of the world's biggest debtors the screen lists. */
const WORLD_DEBTS_SHOWN = 10;

/** A budget level's name ("Very low" … "Very high"). */
export const levelName = (level: string) => tKey(`BUDGET_LEVEL_${level.toUpperCase()}`);
/** A budget line's name. */
export const lineName = (id: string) => tKey(`BUDGET_LINE_${id.toUpperCase()}`);

/**
 * The Budget screen (Economy lens; F09, section 8.2, Victoria 3's budget):
 * the player's treasury, debt, credit and inflation; the tax level and
 * every spending line's funding (Victoria 3's levels; designer decision),
 * money printing and the automatic budget; last week's income and spending
 * line by line; what each pop group pays; the world's biggest debtors.
 */
export function BudgetScreen({
  state,
  actions,
}: {
  readonly state: AppState;
  readonly actions: ShellActions;
}) {
  const { world, budget, pops, playerCountry, countryScreen } = state;
  if (!world || !budget || !pops || playerCountry === null) return null;
  const country = playerCountry;
  const summary = countryBudget(budget, country);
  const lines = budgetLines(budget, country);
  const flagCode = countryScreen?.flagCodes[country];
  const income = lines.filter((line) => line.income);
  const spending = lines.filter((line) => !line.income);

  return (
    <div className="budget-screen" data-testid="budget-screen">
      <div className="population-head">
        {flagCode && <Flag code={flagCode} color={world.countryMapColor[country]} />}
        <h3>{tKey(countryNameKey(world.countryIds[country]))}</h3>
        <span className={`food-mood budget-mood is-${summary.mood}`} data-testid="budget-mood">
          {tKey(`BUDGET_MOOD_${summary.mood.toUpperCase()}`)}
        </span>
      </div>
      <p className="panel-note">{t('BUDGET_HINT')}</p>

      <BudgetFacts summary={summary} />
      <BalanceLine history={budget.history} />

      <h3 className="list-title">{t('BUDGET_SETTINGS_TITLE')}</h3>
      <div className="budget-settings" data-testid="budget-settings">
        {budget.settingIds.map((setting) => (
          <LevelRow
            key={setting}
            id={setting}
            name={tKey(`BUDGET_SETTING_${setting.toUpperCase()}`)}
            hint={tKey(`BUDGET_SETTING_${setting.toUpperCase()}_HINT`)}
            levels={budget.levels}
            chosen={summary.settings[setting]}
            nameOf={levelName}
            onChoose={(level) => void actions.setBudgetLevel(setting, level)}
          />
        ))}
        <LevelRow
          id="printing"
          name={t('BUDGET_PRINTING')}
          hint={t('BUDGET_PRINTING_HINT')}
          levels={budget.printingLevels}
          chosen={summary.printing}
          nameOf={(level) => tKey(`BUDGET_PRINTING_${level.toUpperCase()}`)}
          onChoose={(level) => void actions.setMoneyPrinting(level)}
        />
        <div className="budget-level-row">
          <span className="budget-level-name" title={t('BUDGET_AUTOMATIC_HINT')}>
            {t('BUDGET_AUTOMATIC')}
          </span>
          <div className="button-row">
            {[false, true].map((on) => (
              <button
                key={String(on)}
                type="button"
                className={summary.automatic === on ? 'button is-active' : 'button'}
                aria-pressed={summary.automatic === on}
                data-testid={`budget-automatic-${on ? 'on' : 'off'}`}
                onClick={() => void actions.setAutomaticBudget(on)}
              >
                {t(on ? 'BUDGET_AUTOMATIC_ON' : 'BUDGET_AUTOMATIC_OFF')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="budget-columns">
        <LineTable
          title={t('BUDGET_INCOME_TITLE', { amount: formatMoneyShort(summary.income) })}
          rows={income}
          testId="budget-income"
        />
        <LineTable
          title={t('BUDGET_SPENDING_TITLE', { amount: formatMoneyShort(summary.spending) })}
          rows={spending}
          testId="budget-spending"
          placeholders={budget.placeholderLines}
        />
      </div>

      <h3 className="list-title">{t('BUDGET_TAXES_TITLE')}</h3>
      <div className="table-scroll">
        <table className="pop-table" data-testid="budget-taxes">
          <thead>
            <tr>
              <th>{t('POPULATION_GROUP')}</th>
              <th title={t('BUDGET_INCOME_TAX_HINT')}>{t('BUDGET_INCOME_TAX')}</th>
              <th title={t('BUDGET_GROSS_HINT')}>{t('BUDGET_GROSS')}</th>
              <th title={t('BUDGET_NET_HINT')}>{t('BUDGET_NET')}</th>
            </tr>
          </thead>
          <tbody>
            {pops.groups.map((group, g) => (
              <tr key={group.id} data-testid={`budget-tax-${group.id}`}>
                <th scope="row">{tKey(`POP_GROUP_${group.id.toUpperCase()}`)}</th>
                <td>{formatPercent(budget.incomeTax[g])}</td>
                <td>{formatMoneyShort(budget.groupGross[g])}</td>
                <td>{formatMoneyShort(budget.groupNet[g])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel-note" data-testid="budget-other-taxes">
        {t('BUDGET_OTHER_TAXES', {
          dividends: formatPercent(budget.dividendTax),
          consumption: formatPercent(budget.consumptionTax),
          benefit: formatPercent(budget.benefitShare, 0),
        })}
      </p>

      <h3 className="list-title">{t('BUDGET_WORLD_TITLE')}</h3>
      <div className="table-scroll">
        <table className="pop-table" data-testid="budget-world">
          <thead>
            <tr>
              <th>{t('BUDGET_COUNTRY')}</th>
              <th>{t('BUDGET_DEBT')}</th>
              <th>{t('BUDGET_RATING')}</th>
              <th>{t('BUDGET_INTEREST')}</th>
              <th>{t('BUDGET_INFLATION')}</th>
            </tr>
          </thead>
          <tbody>
            {worldDebts(budget, WORLD_DEBTS_SHOWN).map((c) => {
              const other = countryBudget(budget, c);
              return (
                <tr key={c} className={c === country ? 'is-selected' : undefined}>
                  <th scope="row">{tKey(countryNameKey(world.countryIds[c]))}</th>
                  <td>{formatPercent(other.debtShare, 0)}</td>
                  <td>{other.rating}</td>
                  <td>{formatPercent(other.interestRate)}</td>
                  <td>{formatPercent(other.inflation)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="panel-note" data-testid="budget-note">
        {t('BUDGET_NOTE')}
      </p>
      {BUILDING_TEST_TOOLS && <BudgetTestTools actions={actions} />}
    </div>
  );
}

function BudgetFacts({ summary }: { readonly summary: BudgetSummary }) {
  const balanceClass = summary.balance < 0 ? 'price-dear' : 'price-cheap';
  return (
    <dl className="facts budget-facts" data-testid="budget-facts">
      <dt title={t('BUDGET_TREASURY_HINT')}>{t('BUDGET_TREASURY')}</dt>
      <dd data-testid="budget-treasury">{formatMoneyShort(summary.treasury)}</dd>
      <dt title={t('BUDGET_BALANCE_HINT')}>{t('BUDGET_BALANCE')}</dt>
      <dd className={balanceClass} data-testid="budget-balance">
        {t('BUDGET_PER_WEEK', { amount: formatMoneySigned(summary.balance) })}
      </dd>
      <dt title={t('BUDGET_DEBT_HINT')}>{t('BUDGET_DEBT')}</dt>
      <dd data-testid="budget-debt">
        {t('BUDGET_DEBT_VALUE', {
          amount: formatMoneyShort(summary.debt),
          share: formatPercent(summary.debtShare, 0),
        })}
      </dd>
      <dt title={t('BUDGET_CREDIT_HINT')}>{t('BUDGET_CREDIT')}</dt>
      <dd className={summary.used >= 0.9 ? 'price-dear' : undefined} data-testid="budget-credit">
        {t('BUDGET_CREDIT_VALUE', {
          limit: formatMoneyShort(summary.creditLimit),
          used: formatPercent(summary.used, 0),
        })}
      </dd>
      <dt title={t('BUDGET_RATING_HINT')}>{t('BUDGET_RATING')}</dt>
      <dd
        className={summary.mood === 'default' ? 'price-dear' : undefined}
        data-testid="budget-rating"
      >
        {summary.rating}
      </dd>
      <dt title={t('BUDGET_INTEREST_HINT')}>{t('BUDGET_INTEREST')}</dt>
      <dd data-testid="budget-interest">{formatPercent(summary.interestRate)}</dd>
      <dt title={t('BUDGET_INFLATION_HINT')}>{t('BUDGET_INFLATION')}</dt>
      <dd
        className={summary.inflation > 0.1 ? 'price-dear' : undefined}
        data-testid="budget-inflation"
      >
        {formatPercent(summary.inflation)}
      </dd>
      <dt title={t('BUDGET_GDP_HINT')}>{t('BUDGET_GDP')}</dt>
      <dd data-testid="budget-gdp">
        {t('BUDGET_GDP_VALUE', {
          gdp: formatMoneyShort(summary.gdp),
          revenue: formatPercent(summary.realRevenueShare, 0),
          spending: formatPercent(summary.realSpendingShare, 0),
        })}
      </dd>
      {summary.spendingCut < 1 && (
        <>
          <dt title={t('BUDGET_CUT_HINT')}>{t('BUDGET_CUT')}</dt>
          <dd className="price-dear" data-testid="budget-cut">
            {formatPercent(summary.spendingCut, 0)}
          </dd>
        </>
      )}
    </dl>
  );
}

/** Last weeks' balances as a small line: zero is the dashed middle. */
function BalanceLine({ history }: { readonly history: Float32Array }) {
  const width = 240;
  const height = 36;
  const points = balancePoints(history, width, height);
  return (
    <div className="budget-balance-line" data-testid="budget-balance-line">
      <span className="list-title-inline">{t('BUDGET_BALANCE_LINE')}</span>
      {points ? (
        <svg
          className="price-line"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          <title>{t('MARKETS_HISTORY_WEEKS', { weeks: history.length })}</title>
          <line x1="0" x2={width} y1={height / 2} y2={height / 2} className="price-line-base" />
          <polyline points={points} className="price-line-path" />
        </svg>
      ) : (
        <span className="price-line-empty">{t('MARKETS_HISTORY_SOON')}</span>
      )}
    </div>
  );
}

/** One setting's levels as buttons. */
function LevelRow({
  id,
  name,
  hint,
  levels,
  chosen,
  nameOf,
  onChoose,
}: {
  readonly id: string;
  readonly name: string;
  readonly hint: string;
  readonly levels: readonly string[];
  readonly chosen: string;
  readonly nameOf: (level: string) => string;
  readonly onChoose: (level: string) => void;
}) {
  return (
    <div className="budget-level-row" data-testid={`budget-setting-${id}`}>
      <span className="budget-level-name" title={hint}>
        {name}
      </span>
      <div className="button-row">
        {levels.map((level) => (
          <button
            key={level}
            type="button"
            className={chosen === level ? 'button is-active' : 'button'}
            aria-pressed={chosen === level}
            data-testid={`budget-${id}-${level}`}
            onClick={() => onChoose(level)}
          >
            {nameOf(level)}
          </button>
        ))}
      </div>
    </div>
  );
}

function LineTable({
  title,
  rows,
  testId,
  placeholders = [],
}: {
  readonly title: string;
  readonly rows: readonly BudgetLineRow[];
  readonly testId: string;
  readonly placeholders?: readonly { readonly id: string; readonly comesWith: string }[];
}) {
  return (
    <div className="budget-lines">
      <h3 className="list-title">{title}</h3>
      <table className="pop-table is-full" data-testid={testId}>
        <thead>
          <tr>
            <th>{t('BUDGET_LINE')}</th>
            <th>{t('BUDGET_A_WEEK')}</th>
            <th title={t('BUDGET_OF_GDP_HINT')}>{t('BUDGET_OF_GDP')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-testid={`budget-line-${row.id}`}>
              <th scope="row" title={tKey(`BUDGET_LINE_${row.id.toUpperCase()}_HINT`)}>
                {lineName(row.id)}
              </th>
              <td>{row.amount > 0 ? formatMoneyShort(row.amount) : '—'}</td>
              <td>{row.amount > 0 ? formatPercent(row.shareOfGdp) : '—'}</td>
            </tr>
          ))}
          {placeholders.map((line) => (
            <tr key={line.id} className="is-placeholder" data-testid={`budget-line-${line.id}`}>
              <th scope="row" title={tKey(`BUDGET_LINE_${line.id.toUpperCase()}_HINT`)}>
                {lineName(line.id)}
              </th>
              <td colSpan={2}>{t('SHELL_COMES_WITH_FEATURE', { feature: line.comesWith })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Test tool (F09): the player's country at the edge of a default, to see what happens. */
function BudgetTestTools({ actions }: { readonly actions: ShellActions }) {
  const [done, setDone] = useState(false);
  return (
    <details className="test-tools" data-testid="budget-test-tools">
      <summary>{t('BUILDINGS_TEST_TITLE')}</summary>
      <p className="panel-note">{t('BUDGET_TEST_CRISIS_HINT')}</p>
      <button
        type="button"
        className="button"
        data-testid="budget-test-crisis"
        disabled={done}
        onClick={() => {
          setDone(true);
          void actions.testBudgetCrisis();
        }}
      >
        {t('BUDGET_TEST_CRISIS')}
      </button>
    </details>
  );
}
