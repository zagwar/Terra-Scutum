import { countryNameKey, goodNameKey } from '@terra-scutum/sim';
import { useState } from 'react';
import type { AppState } from '../../app-store';
import { BUILDING_TEST_TOOLS } from '../buildings/building-parts';
import { Flag } from '../flag';
import {
  formatAmount,
  formatMoneyShort,
  formatMoneySigned,
  formatPercent,
  formatPrice,
  t,
  tKey,
} from '../i18n';
import { PriceLine } from '../markets/markets-screen';
import { priceMood } from '../markets/markets-view';
import type { ShellActions } from '../shell/shell-actions';
import {
  type PartnerFlow,
  REST_OF_WORLD,
  type TradeGoodRow,
  goodPartners,
  tradeGoods,
  tradePartners,
  tradeTotals,
  worldMarket,
} from './trade-view';

type TradeTab = 'goods' | 'partners' | 'world';

/**
 * The Trade screen (Economy lens; F19, section 8.6): what the player's
 * country imports and exports, from and to whom, at what prices, and the
 * World Market every country trades on (Victoria 3, version 1.9). The test
 * tools start and lift embargoes until diplomacy (M6).
 */
export function TradeScreen({
  state,
  actions,
}: {
  readonly state: AppState;
  readonly actions: ShellActions;
}) {
  const [tab, setTab] = useState<TradeTab>('goods');
  const [selected, setSelected] = useState<number | null>(null);
  const { world, market, buildings, goods, trade, countryScreen } = state;
  if (!world || !market || !buildings || !goods || !trade) return null;
  const country = trade.country;
  const totals = tradeTotals(trade, market);
  const flagCode = countryScreen?.flagCodes[country];
  const openCountry = (index: number) => {
    actions.closeWindow();
    actions.show({ kind: 'country', index });
  };

  return (
    <div className="markets-screen trade-screen" data-testid="trade-screen">
      <div className="population-head">
        {flagCode && <Flag code={flagCode} color={world.countryMapColor[country]} />}
        <h3 data-testid="trade-country">{tKey(countryNameKey(world.countryIds[country]))}</h3>
      </div>
      <dl className="facts trade-totals" data-testid="trade-totals">
        <dt>{t('TRADE_EXPORTS')}</dt>
        <dd data-testid="trade-exports">{formatMoneyShort(totals.exportValue)}</dd>
        <dt>{t('TRADE_IMPORTS')}</dt>
        <dd data-testid="trade-imports">{formatMoneyShort(totals.importValue)}</dd>
        <dt title={t('TRADE_BALANCE_HINT')}>{t('TRADE_BALANCE')}</dt>
        <dd data-testid="trade-balance" data-status={totals.balance < 0 ? 'bad' : undefined}>
          {formatMoneySigned(totals.balance)}
        </dd>
        <dt title={t('TRADE_TARIFFS_HINT')}>{t('TRADE_TARIFFS')}</dt>
        <dd data-testid="trade-tariffs">{formatMoneyShort(totals.tariffIncome)}</dd>
        <dt>{t('TRADE_PARTNERS')}</dt>
        <dd data-testid="trade-partner-count">{totals.partners}</dd>
        <dt title={t('TRADE_REST_OF_WORLD_HINT')}>{t('TRADE_FROM_REST')}</dt>
        <dd data-testid="trade-from-rest">{formatMoneyShort(totals.restOfWorldValue)}</dd>
      </dl>
      <p className="panel-note">
        {t('TRADE_HINT', {
          tariff: formatPercent(trade.importTariff, 0),
        })}{' '}
        {t('AMOUNT_HINT')}
      </p>
      <div className="tab-row" role="tablist">
        {(['goods', 'partners', 'world'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={tab === option}
            className={tab === option ? 'button is-active' : 'button'}
            data-testid={`trade-tab-${option}`}
            onClick={() => setTab(option)}
          >
            {t(
              option === 'goods'
                ? 'TRADE_TAB_GOODS'
                : option === 'partners'
                  ? 'TRADE_TAB_PARTNERS'
                  : 'TRADE_TAB_WORLD',
            )}
          </button>
        ))}
      </div>

      {tab === 'goods' && (
        <GoodsTab
          state={state}
          rows={tradeGoods(trade, market, buildings, goods)}
          selected={selected}
          onSelect={(g) => setSelected(selected === g ? null : g)}
          openCountry={openCountry}
        />
      )}
      {tab === 'partners' && (
        <PartnersTab state={state} actions={actions} openCountry={openCountry} />
      )}
      {tab === 'world' && <WorldTab state={state} openCountry={openCountry} />}
      <p className="panel-note" data-testid="trade-note">
        {t('TRADE_NOTE')}
      </p>
    </div>
  );
}

function partnerName(state: AppState, partner: number): string {
  if (partner === REST_OF_WORLD) return t('TRADE_REST_OF_WORLD');
  return tKey(countryNameKey(state.world!.countryIds[partner]));
}

function PartnerName({
  state,
  partner,
  openCountry,
}: {
  readonly state: AppState;
  readonly partner: number;
  readonly openCountry: (index: number) => void;
}) {
  if (partner === REST_OF_WORLD)
    return (
      <span className="trade-rest" title={t('TRADE_REST_OF_WORLD_HINT')}>
        {t('TRADE_REST_OF_WORLD')}
      </span>
    );
  const code = state.countryScreen?.flagCodes[partner];
  return (
    <button type="button" className="link-button" onClick={() => openCountry(partner)}>
      {code && <Flag code={code} color={state.world!.countryMapColor[partner]} />}{' '}
      {partnerName(state, partner)}
    </button>
  );
}

function GoodsTab({
  state,
  rows,
  selected,
  onSelect,
  openCountry,
}: {
  readonly state: AppState;
  readonly rows: readonly TradeGoodRow[];
  readonly selected: number | null;
  readonly onSelect: (g: number) => void;
  readonly openCountry: (index: number) => void;
}) {
  const chosen = rows.find((row) => row.index === selected) ?? null;
  return (
    <>
      <div className="table-scroll">
        <table className="pop-table is-full markets-table" data-testid="trade-goods">
          <thead>
            <tr>
              <th>{t('MARKETS_GOOD')}</th>
              <th title={t('TRADE_HOME_PRICE_HINT')}>{t('TRADE_HOME_PRICE')}</th>
              <th title={t('TRADE_WORLD_PRICE_HINT')}>{t('TRADE_WORLD_PRICE')}</th>
              <th>{t('TRADE_IMPORTED')}</th>
              <th>{t('TRADE_EXPORTED')}</th>
              <th title={t('TRADE_DELIVERED_HINT')}>{t('TRADE_DELIVERED')}</th>
              <th title={t('TRADE_SELF_HINT')}>{t('TRADE_SELF')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const amount = (value: number) => (value > 0 ? formatAmount(value, row.unit) : '—');
              return (
                <tr
                  key={row.good}
                  data-testid={`trade-good-${row.good}`}
                  className={row.index === selected ? 'is-selected' : undefined}
                >
                  <th scope="row">{tKey(goodNameKey(row.good))}</th>
                  <td>{formatPrice(row.homePrice, row.unit)}</td>
                  <td className={`price-${priceMood(row.worldFactor)}`}>
                    {formatPrice(row.worldPrice, row.unit)}{' '}
                    <span className="trade-factor">
                      {t('MARKETS_FACTOR', { factor: row.worldFactor.toFixed(2) })}
                    </span>
                  </td>
                  <td
                    data-testid={`trade-imported-${row.good}`}
                    data-status={row.imported > 0 && row.arrived < 0.995 ? 'bad' : undefined}
                    title={
                      row.imported > 0 && row.arrived < 0.995
                        ? t('TRADE_ARRIVED', { share: formatPercent(row.arrived, 0) })
                        : undefined
                    }
                  >
                    {amount(row.imported)}
                  </td>
                  <td data-testid={`trade-exported-${row.good}`}>{amount(row.exported)}</td>
                  <td>
                    {row.delivered === null
                      ? '—'
                      : t('TRADE_DELIVERED_VALUE', {
                          price: formatPrice(row.delivered, row.unit),
                          share: formatPercent(row.deliveryShare ?? 0, 0),
                        })}
                  </td>
                  <td>
                    {row.selfSufficiency === null ? '—' : formatPercent(row.selfSufficiency, 0)}
                  </td>
                  <td>
                    {(row.imported > 0 || row.exported > 0) && (
                      <button
                        type="button"
                        className="button"
                        data-testid={`trade-partners-${row.good}`}
                        aria-pressed={row.index === selected}
                        onClick={() => onSelect(row.index)}
                      >
                        {t('TRADE_FROM_WHOM')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {chosen && <GoodPartners state={state} row={chosen} openCountry={openCountry} />}
    </>
  );
}

function GoodPartners({
  state,
  row,
  openCountry,
}: {
  readonly state: AppState;
  readonly row: TradeGoodRow;
  readonly openCountry: (index: number) => void;
}) {
  const { from, to } = goodPartners(state.trade!, state.market!, row.index);
  const list = (flows: readonly PartnerFlow[], testId: string, heading: string) =>
    flows.length > 0 && (
      <>
        <h4>{heading}</h4>
        <table className="pop-table is-full" data-testid={testId}>
          <thead>
            <tr>
              <th>{t('TRADE_PARTNER')}</th>
              <th>{t('TRADE_AMOUNT')}</th>
              <th>{t('TRADE_VALUE')}</th>
              {testId === 'trade-from' && <th>{t('TRADE_SHIPPING')}</th>}
            </tr>
          </thead>
          <tbody>
            {flows.slice(0, 12).map((flow) => (
              <tr key={flow.partner}>
                <th scope="row">
                  <PartnerName state={state} partner={flow.partner} openCountry={openCountry} />
                </th>
                <td>{formatAmount(flow.amount, row.unit)}</td>
                <td>{formatMoneyShort(flow.value)}</td>
                {flow.shipping !== null && <td>{formatPrice(flow.shipping, row.unit)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {flows.length > 12 && (
          <p className="panel-note">{t('TRADE_MORE_PARTNERS', { count: flows.length - 12 })}</p>
        )}
      </>
    );
  const name = tKey(goodNameKey(row.good));
  return (
    <section className="trade-good-partners" data-testid="trade-good-partners">
      {list(from, 'trade-from', t('TRADE_FROM_HEADING', { good: name }))}
      {list(to, 'trade-to', t('TRADE_TO_HEADING', { good: name }))}
    </section>
  );
}

function PartnersTab({
  state,
  actions,
  openCountry,
}: {
  readonly state: AppState;
  readonly actions: ShellActions;
  readonly openCountry: (index: number) => void;
}) {
  const { trade, market, goods, world } = state;
  const [target, setTarget] = useState<number | null>(null);
  if (!trade || !market || !goods || !world) return null;
  const rows = tradePartners(trade, market, goods);
  const goodList = (ids: readonly string[]) =>
    ids.length === 0
      ? '—'
      : ids
          .slice(0, 3)
          .map((id) => tKey(goodNameKey(id)))
          .join(', ') + (ids.length > 3 ? '…' : '');
  const others = world.countryIds
    .map((_, index) => index)
    .filter((index) => index !== trade.country)
    .sort((a, b) => partnerName(state, a).localeCompare(partnerName(state, b)));
  const chosen = target ?? others[0];
  return (
    <>
      <div className="table-scroll">
        <table className="pop-table is-full markets-table" data-testid="trade-partners">
          <thead>
            <tr>
              <th>{t('TRADE_PARTNER')}</th>
              <th>{t('TRADE_BUY_FROM')}</th>
              <th>{t('TRADE_SELL_TO')}</th>
              <th>{t('TRADE_GOODS_BOUGHT')}</th>
              <th>{t('TRADE_GOODS_SOLD')}</th>
              <th title={t('TRADE_ROUTE_HINT')}>{t('TRADE_ROUTE')}</th>
              <th>{t('TRADE_STATUS')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.partner}
                data-testid={
                  row.partner === REST_OF_WORLD
                    ? 'trade-partner-rest'
                    : `trade-partner-${world.countryIds[row.partner]}`
                }
              >
                <th scope="row">
                  <PartnerName state={state} partner={row.partner} openCountry={openCountry} />
                </th>
                <td>{row.bought > 0 ? formatMoneyShort(row.bought) : '—'}</td>
                <td>{row.sold > 0 ? formatMoneyShort(row.sold) : '—'}</td>
                <td>{goodList(row.goodsBought)}</td>
                <td>{goodList(row.goodsSold)}</td>
                <td>
                  {row.landKm === null || row.seaKm === null || row.shipping === null
                    ? '—'
                    : t('TRADE_ROUTE_VALUE', {
                        land: Math.round(row.landKm).toLocaleString('en-US'),
                        sea: Math.round(row.seaKm).toLocaleString('en-US'),
                        price: formatPrice(row.shipping, 't'),
                      })}
                </td>
                <td data-status={row.embargo ? 'bad' : undefined}>
                  {row.embargo ? t('TRADE_EMBARGO') : row.agreement ? t('TRADE_AGREEMENT') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {BUILDING_TEST_TOOLS && (
        <details className="test-tools" data-testid="trade-test-tools">
          <summary>{t('BUILDINGS_TEST_TITLE')}</summary>
          <p className="hint">{t('TRADE_TEST_HINT')}</p>
          <p className="test-tools-row">
            <select
              value={chosen}
              aria-label={t('TRADE_PARTNER')}
              data-testid="trade-test-country"
              onChange={(event) => setTarget(Number(event.target.value))}
            >
              {others.map((index) => (
                <option key={index} value={index}>
                  {partnerName(state, index)}
                </option>
              ))}
            </select>{' '}
            <button
              type="button"
              className="button"
              data-testid="trade-test-embargo"
              onClick={() => void actions.testSetEmbargo(trade.country, chosen, true)}
            >
              {t('TRADE_TEST_EMBARGO')}
            </button>{' '}
            <button
              type="button"
              className="button"
              data-testid="trade-test-lift"
              onClick={() => void actions.testSetEmbargo(trade.country, chosen, false)}
            >
              {t('TRADE_TEST_LIFT')}
            </button>
          </p>
        </details>
      )}
    </>
  );
}

function WorldTab({
  state,
  openCountry,
}: {
  readonly state: AppState;
  readonly openCountry: (index: number) => void;
}) {
  const { trade, market, goods } = state;
  if (!trade || !market || !goods) return null;
  const rows = worldMarket(trade, market, goods);
  const who = (list: readonly { country: number; amount: number }[]) =>
    list.length === 0 ? (
      '—'
    ) : (
      <ul className="trade-who">
        {list.map((entry) => (
          <li key={entry.country}>
            <PartnerName state={state} partner={entry.country} openCountry={openCountry} />
          </li>
        ))}
      </ul>
    );
  return (
    <>
      <p className="panel-note">{t('TRADE_WORLD_HINT')}</p>
      <div className="table-scroll">
        <table className="pop-table is-full markets-table" data-testid="trade-world">
          <thead>
            <tr>
              <th>{t('MARKETS_GOOD')}</th>
              <th>{t('TRADE_WORLD_PRICE')}</th>
              <th title={t('MARKETS_VS_BASE_HINT')}>{t('MARKETS_VS_BASE')}</th>
              <th title={t('MARKETS_HISTORY_HINT')}>{t('MARKETS_HISTORY')}</th>
              <th>{t('TRADE_TRADED')}</th>
              <th title={t('TRADE_REST_OF_WORLD_HINT')}>{t('TRADE_REST_OF_WORLD')}</th>
              <th>{t('TRADE_TOP_EXPORTERS')}</th>
              <th>{t('TRADE_TOP_IMPORTERS')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.good} data-testid={`trade-world-${row.good}`}>
                <th scope="row">{tKey(goodNameKey(row.good))}</th>
                <td>{formatPrice(row.worldPrice, row.unit)}</td>
                <td className={`price-${priceMood(row.factor)}`}>
                  {t('MARKETS_FACTOR', { factor: row.factor.toFixed(2) })}
                </td>
                <td>
                  <PriceLine history={row.history} />
                </td>
                <td
                  data-status={row.arrived < 0.995 ? 'bad' : undefined}
                  title={
                    row.arrived < 0.995
                      ? t('TRADE_ARRIVED', { share: formatPercent(row.arrived, 0) })
                      : undefined
                  }
                >
                  {row.traded > 0 ? formatAmount(row.traded, row.unit) : '—'}
                </td>
                <td>{row.restOfWorld > 0 ? formatAmount(row.restOfWorld, row.unit) : '—'}</td>
                <td>{who(row.topExporters)}</td>
                <td>{who(row.topImporters)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
