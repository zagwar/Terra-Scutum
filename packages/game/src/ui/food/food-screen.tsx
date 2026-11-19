import {
  type CalendarDate,
  countryNameKey,
  dateToEpochDay,
  epochDayToDate,
  goodNameKey,
  provinceNameKey,
} from '@terra-scutum/sim';
import { useState } from 'react';
import type { AppState } from '../../app-store';
import { BUILDING_TEST_TOOLS } from '../buildings/building-parts';
import { Flag } from '../flag';
import { formatAmount, formatDate, formatPercent, formatPopulation, t, tKey } from '../i18n';
import { priceMood } from '../markets/markets-view';
import type { ShellActions } from '../shell/shell-actions';
import {
  type FoodGoodRow,
  type FoodProvinceRow,
  type FoodSummary,
  countryFood,
  foodGoods,
  hungryProvinces,
  reserveDaysText,
} from './food-view';

/** The date of a day of the campaign (days since its start), from today's date and day. */
export function dateOfDay(day: number, today: CalendarDate, todayDay: number): CalendarDate {
  return epochDayToDate(dateToEpochDay(today) - todayDay + day);
}

/**
 * The Food screen (Economy lens; F08, section 8.5): the player's country's
 * food reserves and rationing, where its food comes from and goes, how well
 * its people are fed (food security, Victoria 3 1.8) and its famines.
 */
export function FoodScreen({
  state,
  actions,
}: {
  readonly state: AppState;
  readonly actions: ShellActions;
}) {
  const { world, food, market, buildings, goods, population, provinceOwner, playerCountry } = state;
  const { snapshot, pops, countryScreen } = state;
  if (
    !world ||
    !food ||
    !market ||
    !buildings ||
    !goods ||
    !population ||
    !provinceOwner ||
    !snapshot ||
    !pops ||
    playerCountry === null
  )
    return null;
  const country = playerCountry;
  const summary = countryFood(food, buildings, country, true);
  const rows = foodGoods(food, market, buildings, goods, country);
  const hungry = hungryProvinces(food, population, provinceOwner, country);
  const flagCode = countryScreen?.flagCodes[country];
  const dateOf = (day: number) => formatDate(dateOfDay(day, snapshot.date, snapshot.day));

  return (
    <div className="food-screen" data-testid="food-screen">
      <div className="population-head">
        {flagCode && <Flag code={flagCode} color={world.countryMapColor[country]} />}
        <h3>{tKey(countryNameKey(world.countryIds[country]))}</h3>
        <span className={`food-mood is-${summary.mood}`} data-testid="food-mood">
          {tKey(`FOOD_MOOD_${summary.mood.toUpperCase()}`)}
        </span>
      </div>
      <p className="panel-note">{t('FOOD_HINT')}</p>

      <FoodFacts summary={summary} />

      <Rationing
        levels={food.levelIds}
        summary={summary}
        onChoose={(level) => void actions.setRationing(level)}
      />

      <h3 className="list-title">{t('FOOD_GOODS_TITLE')}</h3>
      <div className="table-scroll">
        <table className="pop-table is-full food-table" data-testid="food-goods">
          <thead>
            <tr>
              <th>{t('MARKETS_GOOD')}</th>
              <th>{t('FOOD_MADE')}</th>
              <th>{t('FOOD_IMPORTED')}</th>
              <th>{t('FOOD_EXPORTED')}</th>
              <th title={t('FOOD_PEOPLE_HINT')}>{t('FOOD_PEOPLE')}</th>
              <th title={t('FOOD_BUILDINGS_HINT')}>{t('FOOD_BUILDINGS')}</th>
              <th title={t('MARKETS_REST_HINT')}>{t('MARKETS_REST')}</th>
              <th>{t('FOOD_RESERVES')}</th>
              <th title={t('MARKETS_VS_BASE_HINT')}>{t('MARKETS_VS_BASE')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <FoodGoodLine key={row.good} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="list-title">{t('FOOD_GROUPS_TITLE')}</h3>
      <div className="table-scroll">
        <table className="pop-table food-groups" data-testid="food-groups">
          <thead>
            <tr>
              <th>{t('POPULATION_GROUP')}</th>
              <th title={t('FOOD_SECURITY_HINT')}>{t('FOOD_SECURITY')}</th>
              <th title={t('FOOD_STARVING_HINT')}>{t('FOOD_STARVING')}</th>
            </tr>
          </thead>
          <tbody>
            {pops.groups.map((group, g) => (
              <tr key={group.id} data-testid={`food-group-${group.id}`}>
                <th scope="row">{tKey(`POP_GROUP_${group.id.toUpperCase()}`)}</th>
                <td>{formatPercent(food.groupSecurity[g], 0)}</td>
                <td className={food.groupStarving[g] > 0 ? 'price-dear' : undefined}>
                  {formatPercent(food.groupStarving[g], 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="list-title">{t('FOOD_PROVINCES_TITLE', { count: hungry.length })}</h3>
      {hungry.length === 0 ? (
        <p className="panel-note" data-testid="food-nobody-hungry">
          {t('FOOD_NOBODY_HUNGRY')}
        </p>
      ) : (
        <div className="table-scroll">
          <table className="pop-table is-full" data-testid="food-provinces">
            <thead>
              <tr>
                <th>{t('FOOD_PROVINCE')}</th>
                <th>{t('POPULATION_PEOPLE')}</th>
                <th title={t('FOOD_SECURITY_HINT')}>{t('FOOD_SECURITY')}</th>
                <th title={t('FOOD_STARVING_HINT')}>{t('FOOD_STARVING')}</th>
                <th>{t('FOOD_SEVERE')}</th>
                <th title={t('FOOD_FAMINE_HINT')}>{t('FOOD_FAMINE_SINCE')}</th>
                <th>{t('FOOD_DEATHS')}</th>
                <th>{t('FOOD_LOST_BIRTHS')}</th>
              </tr>
            </thead>
            <tbody>
              {hungry.map((row) => (
                <HungryLine
                  key={row.province}
                  row={row}
                  name={tKey(provinceNameKey(world.provinceIds[row.province]))}
                  since={row.famineSince === null ? null : dateOf(row.famineSince)}
                  onOpen={() => actions.show({ kind: 'province', index: row.province })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="panel-note" data-testid="food-note">
        {t('FOOD_NOTE')}
      </p>
      {BUILDING_TEST_TOOLS && <FoodTestTools actions={actions} />}
    </div>
  );
}

function FoodFacts({ summary }: { readonly summary: FoodSummary }) {
  return (
    <dl className="facts food-facts" data-testid="food-facts">
      <dt title={t('FOOD_RESERVES_HINT')}>{t('FOOD_RESERVES')}</dt>
      <dd data-testid="food-reserves">
        {t('FOOD_RESERVES_VALUE', {
          days: reserveDaysText(summary.reserveDays),
          amount: formatAmount(summary.reserveTonnes, 't'),
        })}
      </dd>
      <dt title={t('FOOD_SHORTAGE_HINT')}>{t('FOOD_SHORTAGE')}</dt>
      <dd className={summary.shortage > 0 ? 'price-dear' : undefined} data-testid="food-shortage">
        {formatPercent(summary.shortage)}
      </dd>
      <dt title={t('FOOD_SECURITY_HINT')}>{t('FOOD_SECURITY')}</dt>
      <dd data-testid="food-security">{formatPercent(summary.security, 0)}</dd>
      <dt title={t('FOOD_STARVING_HINT')}>{t('FOOD_STARVING')}</dt>
      <dd className={summary.starving > 0 ? 'price-dear' : undefined} data-testid="food-starving">
        {t('FOOD_STARVING_VALUE', {
          starving: formatPercent(summary.starving),
          severe: formatPercent(summary.severe),
        })}
      </dd>
      <dt title={t('FOOD_FAMINE_HINT')}>{t('FOOD_FAMINES')}</dt>
      <dd className={summary.famines > 0 ? 'price-dear' : undefined} data-testid="food-famines">
        {summary.famines.toLocaleString('en')}
      </dd>
      <dt>{t('FOOD_DEATHS_TOTAL')}</dt>
      <dd data-testid="food-deaths">
        {t('FOOD_DEATHS_VALUE', {
          deaths: formatPopulation(summary.deaths),
          births: formatPopulation(summary.lostBirths),
        })}
      </dd>
    </dl>
  );
}

/** The rationing levels as buttons, Automatic first (F08; the Rationing law, F16, will make it cost time and political capital). */
function Rationing({
  levels,
  summary,
  onChoose,
}: {
  readonly levels: readonly string[];
  readonly summary: FoodSummary;
  readonly onChoose: (level: string | null) => void;
}) {
  const options: (string | null)[] = [null, ...levels];
  return (
    <div className="food-rationing" data-testid="food-rationing">
      <h3 className="list-title">{t('FOOD_RATIONING_TITLE')}</h3>
      <div className="button-row">
        {options.map((level) => {
          const chosen = summary.choice === level;
          return (
            <button
              key={level ?? 'automatic'}
              type="button"
              className={chosen ? 'button is-active' : 'button'}
              aria-pressed={chosen}
              data-testid={`food-rationing-${level ?? 'automatic'}`}
              title={rationingHint(level)}
              onClick={() => onChoose(level)}
            >
              {rationingName(level)}
            </button>
          );
        })}
      </div>
      <p className="panel-note" data-testid="food-rationing-now">
        {t('FOOD_RATIONING_NOW', { level: rationingName(summary.rationing) })}{' '}
        {rationingHint(summary.rationing)}
      </p>
    </div>
  );
}

/** A rationing level's name ("Automatic" for null). */
export function rationingName(level: string | null): string {
  return tKey(`FOOD_RATIONING_${(level ?? 'automatic').toUpperCase()}`);
}

function rationingHint(level: string | null): string {
  return tKey(`FOOD_RATIONING_${(level ?? 'automatic').toUpperCase()}_HINT`);
}

function FoodGoodLine({ row }: { readonly row: FoodGoodRow }) {
  const amount = (value: number) => formatAmount(value, 't');
  const got = row.peopleWanted > 0 ? row.people / row.peopleWanted : 1;
  return (
    <tr data-testid={`food-good-${row.good}`}>
      <th scope="row">{tKey(goodNameKey(row.good))}</th>
      <td>{amount(row.made)}</td>
      <td>{row.imported > 0 ? amount(row.imported) : '—'}</td>
      <td>{row.exported > 0 ? amount(row.exported) : '—'}</td>
      <td
        className={got < 0.9995 ? 'price-dear' : undefined}
        title={t('MARKETS_POPS_GOT', { share: formatPercent(got) })}
      >
        {amount(row.people)}
      </td>
      <td>{amount(row.buildings)}</td>
      <td>{amount(row.rest)}</td>
      <td>
        {row.stockDays === null
          ? amount(row.stock)
          : t('MARKETS_STOCK_DAYS', { amount: amount(row.stock), days: Math.round(row.stockDays) })}
      </td>
      <td className={`price-${priceMood(row.priceFactor)}`}>
        {t('MARKETS_FACTOR', { factor: row.priceFactor.toFixed(2) })}
      </td>
    </tr>
  );
}

function HungryLine({
  row,
  name,
  since,
  onOpen,
}: {
  readonly row: FoodProvinceRow;
  readonly name: string;
  readonly since: string | null;
  readonly onOpen: () => void;
}) {
  return (
    <tr data-testid={`food-province-${row.province}`}>
      <th scope="row">
        <button type="button" className="link-button" onClick={onOpen}>
          {name}
        </button>
      </th>
      <td>{formatPopulation(row.people)}</td>
      <td>{formatPercent(row.security, 0)}</td>
      <td className="price-dear">{formatPercent(row.starving, 0)}</td>
      <td>{formatPercent(row.severe, 0)}</td>
      <td className={since ? 'price-dear' : undefined}>{since ?? '—'}</td>
      <td>{since ? formatPopulation(row.deaths) : '—'}</td>
      <td>{since ? formatPopulation(row.lostBirths) : '—'}</td>
    </tr>
  );
}

/** Test tool (F08): a food crisis, to see hunger and famine come (until the Swarm and wars bring them). */
function FoodTestTools({ actions }: { readonly actions: ShellActions }) {
  const [done, setDone] = useState(false);
  return (
    <details className="test-tools" data-testid="food-test-tools">
      <summary>{t('BUILDINGS_TEST_TITLE')}</summary>
      <p className="panel-note">{t('FOOD_TEST_CRISIS_HINT')}</p>
      <button
        type="button"
        className="button"
        data-testid="food-test-crisis"
        disabled={done}
        onClick={() => {
          setDone(true);
          void actions.testFoodCrisis();
        }}
      >
        {t('FOOD_TEST_CRISIS')}
      </button>
    </details>
  );
}
