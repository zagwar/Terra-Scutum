import {
  BUILDING_LIMIT,
  buildingNameKey,
  countryNameKey,
  goodNameKey,
  productionMethodNameKey,
  provinceNameKey,
} from '@terra-scutum/sim';
import { useState } from 'react';
import type { AppState } from '../../app-store';
import { Flag } from '../flag';
import {
  formatAmount,
  formatMoneyShort,
  formatMoneySigned,
  formatPeopleShort,
  formatPercent,
  formatPopulation,
  t,
  tKey,
} from '../i18n';
import type { ShellActions } from '../shell/shell-actions';
import {
  BUILDING_TEST_TOOLS,
  OutputBar,
  TEST_FILL_DAYS,
  amountsText,
  limitText,
} from './building-parts';
import { countryBuildings, countryStockpile, otherElectricity } from './buildings-view';

/**
 * The Buildings screen (Economy lens; a first pass in F07, section 8.3): the
 * player's country's buildings by type with their workers, output and
 * production methods (F85), where each type stands, and the national
 * stockpile with its standing imports. F11 and F87 fill it out;
 * construction joins it with F12.
 */
export function BuildingsScreen({
  state,
  actions,
}: {
  readonly state: AppState;
  readonly actions: ShellActions;
}) {
  const { world, buildings, buildingTypes, goods, pops, provinceOwner, playerCountry } = state;
  const [openType, setOpenType] = useState<number | null>(null);
  if (!world || !buildings || !buildingTypes || !goods || !pops || !provinceOwner) return null;
  if (playerCountry === null) return null;
  const country = playerCountry;
  const countryName = tKey(countryNameKey(world.countryIds[country]));
  const types = countryBuildings(buildings, buildingTypes, goods, provinceOwner, country);
  const stock = countryStockpile(buildings, goods, country);
  const other = otherElectricity(buildings, country);
  const electricityUnit = goods.goods.find((good) => good.id === goods.electricity)?.unit ?? 'MWh';
  const flagCode = state.countryScreen?.flagCodes[country];
  const total = (pick: (type: (typeof types)[number]) => number) =>
    types.reduce((sum, type) => sum + pick(type), 0);
  const open = types.find((type) => type.type === openType) ?? null;

  return (
    <div className="buildings-screen" data-testid="buildings-screen">
      <div className="population-head">
        {flagCode && <Flag code={flagCode} color={world.countryMapColor[country]} />}
        <h3 data-testid="buildings-country">{countryName}</h3>
      </div>

      {types.length === 0 ? (
        <p className="list-empty" data-testid="buildings-none">
          {t('BUILDINGS_SCREEN_NONE', { country: countryName })}
        </p>
      ) : (
        <>
          <dl className="facts buildings-facts">
            <dt>{t('BUILDINGS_SCREEN_COUNT')}</dt>
            <dd data-testid="buildings-count">
              {t('BUILDINGS_SCREEN_COUNT_VALUE', {
                count: total((type) => type.buildings).toLocaleString('en'),
                levels: total((type) => type.levels).toLocaleString('en'),
              })}
            </dd>
            <dt>{t('BUILDINGS_AT_WORK')}</dt>
            <dd data-testid="buildings-workers">
              {t('BUILDINGS_AT_WORK_VALUE', {
                workers: formatPopulation(total((type) => type.workers)),
                jobs: formatPopulation(total((type) => type.jobs)),
              })}
            </dd>
            <dt>{t('BUILDINGS_WAGES')}</dt>
            <dd>
              {t('BUILDINGS_WAGES_VALUE', {
                amount: formatMoneyShort(total((type) => type.wages)),
              })}
            </dd>
            <dt>{t('BUILDINGS_SCREEN_HELD_BACK')}</dt>
            <dd
              data-testid="buildings-held-back"
              data-status={total((type) => type.heldBack) > 0 ? 'bad' : 'good'}
            >
              {total((type) => type.heldBack).toLocaleString('en')}
            </dd>
          </dl>

          <h4 className="list-title" title={t('BUILDINGS_SCREEN_TYPES_HINT')}>
            {t('BUILDINGS_SCREEN_TYPES')}
          </h4>
          <p className="hint">{t('BUILDINGS_SCREEN_TYPES_HINT')}</p>
          <div className="table-scroll">
            <table className="pop-table is-full" data-testid="buildings-types">
              <thead>
                <tr>
                  <th>{t('BUILDINGS_SCREEN_BUILDING')}</th>
                  <th>{t('BUILDINGS_SCREEN_LEVELS')}</th>
                  <th>{t('BUILDINGS_SCREEN_PROVINCES')}</th>
                  <th>{t('BUILDINGS_WORKERS')}</th>
                  <th title={t('BUILDINGS_OUTPUT_HINT')}>{t('BUILDINGS_OUTPUT')}</th>
                  <th title={t('AMOUNT_HINT')}>{t('BUILDINGS_SCREEN_MAKES')}</th>
                  <th title={t('BUILDINGS_PROFIT_HINT')}>{t('BUILDINGS_PROFIT')}</th>
                  <th title={t('BUILDINGS_WAGE_LEVEL_HINT')}>{t('BUILDINGS_WAGE_LEVEL')}</th>
                  <th>{t('BUILDINGS_SCREEN_HELD_BACK')}</th>
                  <th title={t('BUILDINGS_LAYING_OFF_HINT')}>{t('BUILDINGS_LAYING_OFF')}</th>
                </tr>
              </thead>
              <tbody>
                {types.map((type) => {
                  const id = type.definition.id;
                  return (
                    <tr
                      key={id}
                      className={type.type === openType ? 'is-open' : undefined}
                      data-testid={`buildings-type-${id}`}
                    >
                      <th scope="row">
                        <button
                          type="button"
                          className="link-button"
                          aria-expanded={type.type === openType}
                          data-testid={`buildings-open-${id}`}
                          onClick={() => setOpenType(type.type === openType ? null : type.type)}
                        >
                          {tKey(buildingNameKey(id))}
                        </button>
                        <span
                          className="building-methods"
                          title={t('BUILDINGS_METHOD_HINT')}
                          data-testid={`buildings-methods-${id}`}
                        >
                          {type.methods
                            .map(({ method, levels }) =>
                              t('BUILDINGS_METHOD_SHARE', {
                                method: tKey(
                                  productionMethodNameKey(type.definition.methods[method].id),
                                ),
                                share: formatPercent(type.levels > 0 ? levels / type.levels : 0, 0),
                              }),
                            )
                            .join(', ')}
                        </span>
                      </th>
                      <td>{type.levels.toLocaleString('en')}</td>
                      <td>{type.buildings.toLocaleString('en')}</td>
                      <td title={Math.round(type.workers).toLocaleString('en')}>
                        {formatPeopleShort(type.workers)}
                      </td>
                      <td>
                        <OutputBar
                          output={type.output}
                          limitKind={
                            type.heldBack > 0
                              ? BUILDING_LIMIT.workers
                              : type.output < 0.9995
                                ? BUILDING_LIMIT.demand
                                : BUILDING_LIMIT.none
                          }
                          testId={`buildings-output-${id}`}
                        />
                      </td>
                      <td>{amountsText(type.makes, goods)}</td>
                      <td
                        data-status={type.profit < 0 ? 'bad' : undefined}
                        data-testid={`buildings-profit-${id}`}
                      >
                        {formatMoneySigned(type.profit)}
                      </td>
                      <td>{t('BUILDINGS_WAGE_FACTOR', { factor: type.wageFactor.toFixed(2) })}</td>
                      <td data-status={type.heldBack > 0 ? 'bad' : undefined}>
                        {type.heldBack.toLocaleString('en')}
                      </td>
                      <td data-status={type.layingOff > 0 ? 'bad' : undefined}>
                        {type.layingOff.toLocaleString('en')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {open && (
            <>
              <h4 className="list-title" data-testid="buildings-where-title">
                {t('BUILDINGS_SCREEN_WHERE', {
                  building: tKey(buildingNameKey(open.definition.id)),
                  count: open.rows.length,
                })}
              </h4>
              <div className="table-scroll">
                <table className="pop-table is-full" data-testid="buildings-where">
                  <thead>
                    <tr>
                      <th>{t('POPULATION_PROVINCE')}</th>
                      <th>{t('BUILDINGS_SCREEN_LEVELS')}</th>
                      <th>{t('BUILDINGS_METHOD')}</th>
                      <th>{t('BUILDINGS_WORKERS')}</th>
                      <th>{t('BUILDINGS_OUTPUT')}</th>
                      <th title={t('BUILDINGS_PROFIT_HINT')}>{t('BUILDINGS_PROFIT')}</th>
                      <th title={t('BUILDINGS_WAGE_LEVEL_HINT')}>{t('BUILDINGS_WAGE_LEVEL')}</th>
                      <th>{t('BUILDINGS_SCREEN_STATUS')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.rows.map((row) => (
                      <tr key={row.province}>
                        <th scope="row">
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              actions.closeWindow();
                              actions.show({ kind: 'province', index: row.province });
                            }}
                          >
                            {tKey(provinceNameKey(world.provinceIds[row.province]))}
                          </button>
                        </th>
                        <td>{row.level}</td>
                        <td>{tKey(productionMethodNameKey(row.methodDefinition.id))}</td>
                        <td>
                          {t('BUILDINGS_WORKERS_VALUE', {
                            workers: formatPeopleShort(row.workers),
                            jobs: formatPeopleShort(row.jobs),
                          })}
                        </td>
                        <td>
                          <OutputBar output={row.output} limitKind={row.limitKind} />
                        </td>
                        <td data-status={row.profit < 0 ? 'bad' : undefined}>
                          {row.subsistence
                            ? t('BUILDINGS_SUBSISTENCE')
                            : formatMoneySigned(row.profit)}
                        </td>
                        <td>
                          {row.subsistence
                            ? '—'
                            : t('BUILDINGS_WAGE_FACTOR', { factor: row.wageFactor.toFixed(2) })}
                        </td>
                        <td>{limitText(row, pops, goods) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <h4 className="list-title">{t('STOCKPILE_TITLE')}</h4>
      <p className="hint">
        {t('STOCKPILE_HINT', { days: buildingTypes.stockpile.maxDays })} {t('AMOUNT_HINT')}
      </p>
      {stock.length > 0 && (
        <div className="table-scroll">
          <table className="pop-table is-full" data-testid="stockpile">
            <thead>
              <tr>
                <th>{t('STOCKPILE_GOOD')}</th>
                <th>{t('STOCKPILE_IN_STOCK')}</th>
                <th>{t('STOCKPILE_MADE')}</th>
                <th>{t('STOCKPILE_USED')}</th>
                <th title={t('STOCKPILE_IMPORTED_HINT')}>{t('STOCKPILE_IMPORTED')}</th>
                <th>{t('STOCKPILE_LASTS')}</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((row) => {
                // Used up: nothing in stock and nothing made, though the country's buildings use or make it.
                const empty = row.stored && row.stock <= 0 && row.made <= 0 && row.limit > 0;
                const full = row.stored && row.limit > 0 && row.stock >= row.limit * 0.9995;
                return (
                  <tr key={row.good} data-testid={`stockpile-${row.good}`}>
                    <th scope="row">{capitalize(tKey(goodNameKey(row.good)))}</th>
                    <td
                      data-testid={`stockpile-stock-${row.good}`}
                      title={row.stored ? Math.round(row.stock).toLocaleString('en') : undefined}
                    >
                      {row.stored ? formatAmount(row.stock, row.unit) : t('STOCKPILE_NOT_STORED')}
                    </td>
                    <td data-testid={`stockpile-made-${row.good}`}>
                      {formatAmount(row.made, row.unit)}
                    </td>
                    <td data-testid={`stockpile-used-${row.good}`}>
                      {formatAmount(row.used, row.unit)}
                    </td>
                    <td data-testid={`stockpile-imported-${row.good}`}>
                      {row.imported > 0 ? formatAmount(row.imported, row.unit) : '—'}
                    </td>
                    <td
                      data-testid={`stockpile-lasts-${row.good}`}
                      data-status={empty || row.daysLeft !== null ? 'bad' : undefined}
                    >
                      {empty
                        ? t('STOCKPILE_EMPTY')
                        : row.daysLeft !== null
                          ? t('STOCKPILE_DAYS', { days: Math.ceil(row.daysLeft) })
                          : full
                            ? t('STOCKPILE_FULL')
                            : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {other.wanted > 0 && (
        <dl className="facts">
          <dt title={t('STOCKPILE_OTHER_ELECTRICITY_HINT')}>{t('STOCKPILE_OTHER_ELECTRICITY')}</dt>
          <dd
            data-testid="stockpile-other-electricity"
            data-status={other.used < other.wanted * 0.9995 ? 'bad' : undefined}
            title={t('STOCKPILE_OTHER_ELECTRICITY_HINT')}
          >
            {t('STOCKPILE_OTHER_ELECTRICITY_VALUE', {
              used: formatAmount(other.used, electricityUnit),
              wanted: formatAmount(other.wanted, electricityUnit),
            })}
          </dd>
        </dl>
      )}
      {BUILDING_TEST_TOOLS && (
        <p className="test-tools-row">
          <button
            type="button"
            className="button"
            title={t('STOCKPILE_TEST_FILL_HINT', { days: TEST_FILL_DAYS })}
            data-testid="stockpile-test-fill"
            onClick={() => void actions.testFillStockpile(country, TEST_FILL_DAYS)}
          >
            {t('STOCKPILE_TEST_FILL')}
          </button>
        </p>
      )}
      <p className="panel-note" data-testid="buildings-note">
        {t('BUILDINGS_PLACEHOLDER_NOTE')}
      </p>
    </div>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
