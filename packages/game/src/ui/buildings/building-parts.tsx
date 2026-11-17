import {
  BUILDING_LIMIT,
  type GoodsConfig,
  type PopsConfig,
  buildingNameKey,
  goodNameKey,
  popGroupNameKey,
} from '@terra-scutum/sim';
import { formatAmount, formatPercent, t, tKey } from '../i18n';
import { type BuildingRow, type GoodAmount, isHeldBack, recipeAmounts } from './buildings-view';

/**
 * Building blocks for showing buildings (F07): the output bar, what holds a
 * building back, and amounts of goods. Used by the province panel and the
 * Buildings screen.
 */

/** Until construction exists (F12, M3), levels can be changed by hand with test buttons. */
export const BUILDING_TEST_TOOLS = true;
/** How many days of use the stockpile's test button tops it up to. */
export const TEST_FILL_DAYS = 15;

const unitOf = (goods: GoodsConfig, goodId: string) =>
  goods.goods.find((good) => good.id === goodId)?.unit ?? 't';

/** Amounts of goods as text: "6 kt steel, 2.5 GWh electricity". */
export function amountsText(amounts: readonly GoodAmount[], goods: GoodsConfig): string {
  return amounts
    .map(({ good, amount }) =>
      t('BUILDINGS_AMOUNT', {
        amount: formatAmount(amount, unitOf(goods, good)),
        good: tKey(goodNameKey(good)),
      }),
    )
    .join(', ');
}

/** Why a building doesn't run at full output, or null when it does. */
export function limitText(
  row: Pick<BuildingRow, 'limitKind' | 'limitWhat'>,
  pops: PopsConfig,
  goods: GoodsConfig,
): string | null {
  switch (row.limitKind) {
    case BUILDING_LIMIT.workers:
      return t('BUILDINGS_LIMIT_WORKERS', {
        group: tKey(popGroupNameKey(pops.groups[row.limitWhat]?.id ?? '')).toLowerCase(),
      });
    case BUILDING_LIMIT.electricity:
      return t('BUILDINGS_LIMIT_ELECTRICITY');
    case BUILDING_LIMIT.input:
      return t('BUILDINGS_LIMIT_INPUT', {
        good: tKey(goodNameKey(goods.goods[row.limitWhat]?.id ?? '')),
      });
    case BUILDING_LIMIT.demand:
      return t('BUILDINGS_LIMIT_DEMAND');
    default:
      return null;
  }
}

/** A building's recipe at full output as a tooltip. */
export function recipeHint(row: BuildingRow, goods: GoodsConfig): string {
  const { uses, makes } = recipeAmounts(row.definition, goods, row.level);
  return t('BUILDINGS_RECIPE_HINT', {
    level: row.level,
    makes: amountsText(makes, goods),
    uses: uses.length > 0 ? amountsText(uses, goods) : t('BUILDINGS_RECIPE_NO_INPUTS'),
    jobs: Math.round(row.jobs).toLocaleString('en'),
  });
}

/** Output as a bar and a percentage; red when the building is held back, calm otherwise. */
export function OutputBar({
  output,
  limitKind,
  testId,
}: {
  readonly output: number;
  readonly limitKind: number;
  readonly testId?: string;
}) {
  // "Idle" only when it shows: 99.96 % reads "100 %" and counts as full.
  const status = isHeldBack(limitKind) ? 'held-back' : output < 0.995 ? 'idle' : 'full';
  return (
    <span className="output" data-status={status}>
      <span className="output-bar" aria-hidden="true">
        <span style={{ width: `${Math.round(output * 100)}%` }} />
      </span>
      <span className="output-value" data-testid={testId}>
        {formatPercent(output, 0)}
      </span>
    </span>
  );
}

/** The − level + test buttons for one building type in a province. */
export function LevelButtons({
  buildingId,
  level,
  onSetLevel,
}: {
  readonly buildingId: string;
  readonly level: number;
  readonly onSetLevel: (level: number) => void;
}) {
  const name = tKey(buildingNameKey(buildingId));
  return (
    <span className="level-buttons">
      <button
        type="button"
        className="button is-small"
        disabled={level <= 0}
        aria-label={t('BUILDINGS_TEST_REMOVE', { building: name })}
        title={t('BUILDINGS_TEST_REMOVE', { building: name })}
        data-testid={`building-less-${buildingId}`}
        onClick={() => onSetLevel(level - 1)}
      >
        −
      </button>
      <span className="level-value" data-testid={`building-test-level-${buildingId}`}>
        {level}
      </span>
      <button
        type="button"
        className="button is-small"
        aria-label={t('BUILDINGS_TEST_ADD', { building: name })}
        title={t('BUILDINGS_TEST_ADD', { building: name })}
        data-testid={`building-more-${buildingId}`}
        onClick={() => onSetLevel(level + 1)}
      >
        +
      </button>
    </span>
  );
}
