import { t } from './i18n';

export interface LinkListProps {
  /** What to list, already sorted: the index of each item and its name. */
  readonly items: readonly { readonly index: number; readonly name: string }[];
  readonly testId: string;
  readonly onSelect: (index: number) => void;
}

/** A panel's list of clickable names (provinces, sea zones…), or "None" when it is empty. */
export function LinkList({ items, testId, onSelect }: LinkListProps) {
  if (items.length === 0)
    return (
      <p className="list-empty" data-testid={testId}>
        {t('PANEL_NONE')}
      </p>
    );
  return (
    <ul className="link-list" data-testid={testId}>
      {items.map(({ index, name }) => (
        <li key={index}>
          <button type="button" className="link-button" onClick={() => onSelect(index)}>
            {name}
          </button>
        </li>
      ))}
    </ul>
  );
}
