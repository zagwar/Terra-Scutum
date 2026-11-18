import { type PopsConfig, goodNameKey, needNameKey, popGroupNameKey } from '@terra-scutum/sim';
import {
  formatMoney,
  formatMoneyShort,
  formatPeopleShort,
  formatPercent,
  formatPopulation,
  t,
  tKey,
} from '../i18n';
import type { PopRow, PopulationSummary } from './population-view';

/**
 * Building blocks for showing the population (F06, F65): the key numbers,
 * what people buy, and the table of pops. Used by the province panel and
 * the Population screen.
 */

/** How the standard of living is counted (F65, Victoria 3: wealth). */
export function standardOfLivingHint(): string {
  return t('POPULATION_STANDARD_OF_LIVING_HINT');
}

/**
 * What people buy (F65): each need with the goods that cover it (people
 * buy more of whichever is on sale), or that it has no good yet and is paid
 * at local prices.
 */
export function NeedsList({
  pops,
  testId,
}: {
  readonly pops: PopsConfig;
  readonly testId?: string;
}) {
  return (
    <ul className="needs-list" data-testid={testId}>
      {pops.needs.map((need) => (
        <li key={need.id} data-testid={testId ? `${testId}-${need.id}` : undefined}>
          {t('POPULATION_NEEDS_LIST', {
            need: tKey(needNameKey(need.id)),
            goods: need.goods
              ? need.goods.map((entry) => tKey(goodNameKey(entry.good))).join(', ')
              : t('POPULATION_NEED_NO_GOOD'),
          })}
        </li>
      ))}
    </ul>
  );
}

/** People, workforce, dependents, unemployment and standard of living as a list of facts. */
export function PopulationFacts({
  summary,
  testId,
}: {
  readonly summary: PopulationSummary;
  /** Prefix of the values' test ids. */
  readonly testId: string;
}) {
  return (
    <dl className="facts">
      <dt>{t('POPULATION_PEOPLE')}</dt>
      <dd data-testid={`${testId}-people`}>{formatPopulation(summary.people)}</dd>
      <dt>{t('POPULATION_WORKFORCE')}</dt>
      <dd data-testid={`${testId}-workforce`}>{formatPopulation(summary.workforce)}</dd>
      <dt title={t('POPULATION_DEPENDENTS_HINT')}>{t('POPULATION_DEPENDENTS')}</dt>
      <dd data-testid={`${testId}-dependents`}>{formatPopulation(summary.dependents)}</dd>
      <dt>{t('POPULATION_UNEMPLOYMENT')}</dt>
      <dd data-testid={`${testId}-unemployment`}>{formatPercent(summary.unemployment)}</dd>
      <dt title={standardOfLivingHint()}>{t('POPULATION_STANDARD_OF_LIVING')}</dt>
      <dd data-testid={`${testId}-living`}>
        {t('POPULATION_SCORE', { value: Math.round(summary.standardOfLiving) })}
      </dd>
    </dl>
  );
}

/**
 * The pops as a table. The short form (the province panel) shows people,
 * wage and standard of living; the full form adds jobs and unemployment.
 */
export function PopTable({
  rows,
  pops,
  full = false,
  testId,
}: {
  readonly rows: readonly PopRow[];
  readonly pops: PopsConfig;
  readonly full?: boolean;
  readonly testId: string;
}) {
  return (
    <table className={full ? 'pop-table is-full' : 'pop-table'} data-testid={testId}>
      <thead>
        <tr>
          <th>{t('POPULATION_GROUP')}</th>
          <th>{t('POPULATION_PEOPLE')}</th>
          {full && <th>{t('POPULATION_WITH_JOB')}</th>}
          {full && <th>{t('POPULATION_UNEMPLOYED')}</th>}
          <th title={t('POPULATION_INCOME_HINT')}>{t('POPULATION_INCOME')}</th>
          <th title={standardOfLivingHint()}>{t('POPULATION_LIVING_SHORT')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const id = pops.groups[row.group]?.id ?? String(row.group);
          return (
            <tr key={id} data-testid={`${testId}-${id}`}>
              <th scope="row">{tKey(popGroupNameKey(id))}</th>
              <td title={Math.round(row.people).toLocaleString('en')}>
                {full ? formatPopulation(row.people) : formatPeopleShort(row.people)}
              </td>
              {full && <td>{formatPopulation(row.employed)}</td>}
              {full && <td>{formatPercent(row.unemployment)}</td>}
              <td
                title={
                  full
                    ? undefined
                    : t('POPULATION_POP_HINT', {
                        income: formatMoney(row.incomePerYear),
                        unemployment: formatPercent(row.unemployment),
                      })
                }
              >
                {full ? formatMoney(row.incomePerYear) : formatMoneyShort(row.incomePerYear)}
              </td>
              <td>{Math.round(row.standardOfLiving)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
