import { countryNameKey, goodNameKey } from '@terra-scutum/sim';
import type { AppState } from '../../app-store';
import { Flag } from '../flag';
import { formatAmount, formatPercent, formatPrice, t, tKey } from '../i18n';
import type { ShellActions } from '../shell/shell-actions';
import { type MarketRow, countryMarket, priceMood, sparklinePoints } from './markets-view';

/**
 * The Markets screen (Economy lens; F65, section 8.6): the player's
 * country's national market. Every good with its price (and how it compares
 * with its base price), its price over the past weeks, what is sold and
 * bought in a day and by whom (F19: exporters too), the imports, the world
 * price and the stock. The prices follow Victoria 3's rule, weekly.
 */
export function MarketsScreen({
  state,
}: {
  readonly state: AppState;
  readonly actions: ShellActions;
}) {
  const { world, market, buildings, goods, playerCountry, countryScreen, trade } = state;
  if (!world || !market || !buildings || !goods || playerCountry === null) return null;
  const country = playerCountry;
  const rows = countryMarket(market, buildings, goods, country, true, trade);
  const shortage = market.shortage[country] ?? 0;
  const flagCode = countryScreen?.flagCodes[country];

  return (
    <div className="markets-screen" data-testid="markets-screen">
      <div className="population-head">
        {flagCode && <Flag code={flagCode} color={world.countryMapColor[country]} />}
        <h3 data-testid="markets-country">{tKey(countryNameKey(world.countryIds[country]))}</h3>
        <span
          className={shortage > 0.0005 ? 'markets-shortage is-short' : 'markets-shortage'}
          data-testid="markets-shortage"
        >
          {shortage > 0.0005
            ? t('MARKETS_SHORTAGE', { share: formatPercent(shortage) })
            : t('MARKETS_NO_SHORTAGE')}
        </span>
      </div>
      <p className="panel-note">
        {t('MARKETS_HINT')} {t('AMOUNT_HINT')}
      </p>
      <div className="table-scroll">
        <table className="pop-table is-full markets-table" data-testid="markets-table">
          <thead>
            <tr>
              <th>{t('MARKETS_GOOD')}</th>
              <th title={t('MARKETS_PRICE_HINT')}>{t('MARKETS_PRICE')}</th>
              <th title={t('MARKETS_VS_BASE_HINT')}>{t('MARKETS_VS_BASE')}</th>
              <th title={t('MARKETS_HISTORY_HINT')}>{t('MARKETS_HISTORY')}</th>
              <th title={t('TRADE_WORLD_PRICE_HINT')}>{t('TRADE_WORLD_PRICE')}</th>
              <th title={t('MARKETS_SELL_HINT')}>{t('MARKETS_SELL')}</th>
              <th title={t('MARKETS_BUY_HINT')}>{t('MARKETS_BUY')}</th>
              <th>{t('MARKETS_BUILDINGS')}</th>
              <th>{t('MARKETS_POPS')}</th>
              <th title={t('MARKETS_REST_HINT')}>{t('MARKETS_REST')}</th>
              <th title={t('MARKETS_EXPORTS_HINT')}>{t('MARKETS_EXPORTS')}</th>
              <th>{t('MARKETS_STOCK')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <MarketLine key={row.good} row={row} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel-note" data-testid="markets-note">
        {t('MARKETS_NOTE')}
      </p>
    </div>
  );
}

function MarketLine({ row }: { readonly row: MarketRow }) {
  const mood = priceMood(row.priceFactor);
  const amount = (value: number) => formatAmount(value, row.unit);
  return (
    <tr data-testid={`markets-${row.good}`}>
      <th scope="row">{tKey(goodNameKey(row.good))}</th>
      <td data-testid={`markets-price-${row.good}`}>{formatPrice(row.price, row.unit)}</td>
      <td
        className={`price-${mood}`}
        data-testid={`markets-factor-${row.good}`}
        title={t('MARKETS_BASE_PRICE', { price: formatPrice(row.basePrice, row.unit) })}
      >
        {t('MARKETS_FACTOR', { factor: row.priceFactor.toFixed(2) })}
      </td>
      <td>
        <PriceLine history={row.history} />
      </td>
      <td data-testid={`markets-world-${row.good}`}>
        {row.worldPrice === null ? '—' : formatPrice(row.worldPrice, row.unit)}
      </td>
      <td
        title={
          row.imported > 0
            ? t('MARKETS_SELL_IMPORTED', { amount: amount(row.imported) })
            : undefined
        }
      >
        {amount(row.sell)}
        {row.imported > 0 && <span className="markets-imported">*</span>}
      </td>
      <td data-testid={`markets-buy-${row.good}`}>{amount(row.buy)}</td>
      <td>{amount(row.buildingsBuy)}</td>
      <td
        className={row.popsGot < 0.9995 ? 'price-dear' : undefined}
        title={t('MARKETS_POPS_GOT', { share: formatPercent(row.popsGot) })}
      >
        {amount(row.popsBuy)}
      </td>
      <td>{amount(row.restBuy)}</td>
      <td data-testid={`markets-exports-${row.good}`}>
        {row.exportsBuy > 0 ? amount(row.exportsBuy) : '—'}
      </td>
      <td>
        {!row.stored
          ? t('STOCKPILE_NOT_STORED')
          : row.stockDays === null
            ? amount(row.stock)
            : t('MARKETS_STOCK_DAYS', {
                amount: amount(row.stock),
                days: Math.round(row.stockDays),
              })}
      </td>
    </tr>
  );
}

/** The price of the past weeks as a small line: the base price is the dashed middle. */
export function PriceLine({ history }: { readonly history: readonly number[] }) {
  const width = 72;
  const height = 22;
  const points = sparklinePoints(history, width, height);
  if (!points) return <span className="price-line-empty">{t('MARKETS_HISTORY_SOON')}</span>;
  return (
    <svg className="price-line" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <title>{t('MARKETS_HISTORY_WEEKS', { weeks: history.length })}</title>
      <line x1="0" x2={width} y1={height / 2} y2={height / 2} className="price-line-base" />
      <polyline points={points} className="price-line-path" />
    </svg>
  );
}
