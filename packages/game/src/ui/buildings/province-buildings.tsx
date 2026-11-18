import {
  type BuildingsConfig,
  type BuildingsSnapshot,
  type GoodsConfig,
  type PopsConfig,
  buildingNameKey,
  productionMethodNameKey,
} from '@terra-scutum/sim';
import {
  formatMoneyShort,
  formatMoneySigned,
  formatPercent,
  formatPopulation,
  t,
  tKey,
} from '../i18n';
import {
  BUILDING_TEST_TOOLS,
  LevelButtons,
  OutputBar,
  amountsText,
  limitText,
  recipeHint,
} from './building-parts';
import { isHeldBack, provinceBuildings, recipeAmounts } from './buildings-view';

export interface ProvinceBuildingsProps {
  readonly buildings: BuildingsSnapshot;
  readonly buildingTypes: BuildingsConfig;
  readonly goods: GoodsConfig;
  readonly pops: PopsConfig;
  readonly province: number;
  /** Test tool: sets the level of the province's building of a type (by id). */
  readonly onSetLevel: (buildingId: string, level: number) => void;
}

/**
 * The province panel's buildings part (F07, F85, section 8.3): each building
 * with its level, its output today, what holds it back, its production
 * method, its workers and wages, its money (F65: profit, cash reserves,
 * jobs kept open) and what it makes and uses. Under it the test tools to change levels by hand until
 * construction exists (F12).
 */
export function ProvinceBuildings({
  buildings,
  buildingTypes,
  goods,
  pops,
  province,
  onSetLevel,
}: ProvinceBuildingsProps) {
  const rows = provinceBuildings(buildings, buildingTypes, province);
  const levelOf = (type: number) => rows.find((row) => row.type === type)?.level ?? 0;
  return (
    <div className="province-buildings" data-testid="province-buildings">
      <h3 className="list-title">{t('BUILDINGS_TITLE')}</h3>
      {rows.length === 0 ? (
        <p className="list-empty" data-testid="province-buildings-none">
          {t('BUILDINGS_NONE')}
        </p>
      ) : (
        <>
          <dl className="facts">
            <dt>{t('BUILDINGS_AT_WORK')}</dt>
            <dd data-testid="province-building-workers">
              {t('BUILDINGS_AT_WORK_VALUE', {
                workers: formatPopulation(buildings.provinceWorkers[province]),
                jobs: formatPopulation(buildings.provinceJobs[province]),
              })}
            </dd>
          </dl>
          <ul className="building-list">
            {rows.map((row) => {
              const id = row.definition.id;
              const today = recipeAmounts(row.methodDefinition, goods, row.level * row.output);
              const limit = limitText(row, pops, goods);
              return (
                <li key={id} className="building" data-testid={`building-${id}`}>
                  <div className="building-head" title={recipeHint(row, goods)}>
                    <span className="building-name">{tKey(buildingNameKey(id))}</span>
                    <span className="building-level" data-testid={`building-level-${id}`}>
                      {t('BUILDINGS_LEVEL', { level: row.level })}
                    </span>
                  </div>
                  <div className="building-output" title={t('BUILDINGS_OUTPUT_HINT')}>
                    <span className="building-label">{t('BUILDINGS_OUTPUT')}</span>
                    <OutputBar
                      output={row.output}
                      limitKind={row.limitKind}
                      testId={`building-output-${id}`}
                    />
                  </div>
                  {limit && (
                    <p
                      className={
                        isHeldBack(row.limitKind) ? 'building-limit is-bad' : 'building-limit'
                      }
                      data-testid={`building-limit-${id}`}
                    >
                      {limit}
                    </p>
                  )}
                  <dl className="building-facts">
                    <dt title={t('BUILDINGS_METHOD_HINT')}>{t('BUILDINGS_METHOD')}</dt>
                    <dd data-testid={`building-method-${id}`} title={t('BUILDINGS_METHOD_HINT')}>
                      {tKey(productionMethodNameKey(row.methodDefinition.id))}
                    </dd>
                    <dt>{t('BUILDINGS_WORKERS')}</dt>
                    <dd data-testid={`building-workers-${id}`}>
                      {t('BUILDINGS_WORKERS_VALUE', {
                        workers: Math.round(row.workers).toLocaleString('en'),
                        jobs: Math.round(row.jobs).toLocaleString('en'),
                      })}
                    </dd>
                    <dt>{t('BUILDINGS_WAGES')}</dt>
                    <dd data-testid={`building-wages-${id}`}>
                      {row.subsistence
                        ? t('BUILDINGS_SUBSISTENCE_WAGES', { amount: formatMoneyShort(row.wages) })
                        : t('BUILDINGS_WAGES_LEVEL_VALUE', {
                            amount: formatMoneyShort(row.wages),
                            factor: row.wageFactor.toFixed(2),
                          })}
                    </dd>
                    {!row.subsistence && (
                      <>
                        <dt title={t('BUILDINGS_PROFIT_HINT')}>{t('BUILDINGS_PROFIT')}</dt>
                        <dd
                          data-testid={`building-profit-${id}`}
                          data-status={row.profit < 0 ? 'bad' : undefined}
                          title={t('BUILDINGS_PROFIT_PARTS', {
                            sales: formatMoneyShort(row.revenue),
                            costs: formatMoneyShort(row.inputCost),
                            wages: formatMoneyShort(row.wages),
                          })}
                        >
                          {formatMoneySigned(row.profit)}
                        </dd>
                        <dt>{t('BUILDINGS_RESERVES')}</dt>
                        <dd data-testid={`building-reserves-${id}`}>
                          {t('BUILDINGS_RESERVES_VALUE', {
                            amount: formatMoneyShort(row.reserves),
                            share: formatPercent(
                              row.reserveCap > 0 ? row.reserves / row.reserveCap : 0,
                              0,
                            ),
                          })}
                        </dd>
                        {row.open < 0.999 && (
                          <>
                            <dt title={t('BUILDINGS_LAYING_OFF_HINT')}>
                              {t('BUILDINGS_JOBS_OPEN')}
                            </dt>
                            <dd data-status="bad" data-testid={`building-open-${id}`}>
                              {formatPercent(row.open, 0)}
                            </dd>
                          </>
                        )}
                      </>
                    )}
                    <dt>{t('BUILDINGS_MAKES')}</dt>
                    <dd data-testid={`building-makes-${id}`}>
                      {t('BUILDINGS_A_DAY', { amounts: amountsText(today.makes, goods) })}
                    </dd>
                    {today.uses.length > 0 && (
                      <>
                        <dt>{t('BUILDINGS_USES')}</dt>
                        <dd data-testid={`building-uses-${id}`}>
                          {t('BUILDINGS_A_DAY', { amounts: amountsText(today.uses, goods) })}
                        </dd>
                      </>
                    )}
                  </dl>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {BUILDING_TEST_TOOLS && (
        <details className="test-tools" data-testid="building-test-tools">
          <summary>{t('BUILDINGS_TEST_TITLE')}</summary>
          <p className="hint">{t('BUILDINGS_TEST_NOTE')}</p>
          <ul className="test-levels">
            {buildingTypes.buildings.map((definition, type) => (
              <li key={definition.id}>
                <span>{tKey(buildingNameKey(definition.id))}</span>
                <LevelButtons
                  buildingId={definition.id}
                  level={levelOf(type)}
                  onSetLevel={(level) => onSetLevel(definition.id, level)}
                />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
