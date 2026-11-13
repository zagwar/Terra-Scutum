import { useState } from 'react';
import { t, tKey } from '../i18n';
import { OUTLINER_COMES_WITH, OUTLINER_SECTIONS, outlinerSectionKey } from './catalog';
import { Icon } from './icons';
import type { OutlinerEntry } from './shell-types';
import { comesWithText } from './top-bar';

export interface OutlinerProps {
  readonly entries: readonly OutlinerEntry[];
  readonly onSelect: (entry: OutlinerEntry) => void;
}

/**
 * The outliner (F122, section 12.1), on the right: armies, fronts,
 * operations, fleets, air wings, construction, research, journal entries,
 * espionage and pinned provinces. The whole list and each section can be
 * collapsed. Clicking an entry selects it and moves the camera. Sections
 * without entries are shown dimmed with 0, and say which feature fills them.
 */
export function Outliner({ entries, onSelect }: OutlinerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [closedSections, setClosedSections] = useState<ReadonlySet<string>>(new Set());
  const toggleSection = (id: string) =>
    setClosedSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section
      className={collapsed ? 'panel outliner is-collapsed' : 'panel outliner'}
      data-testid="outliner"
      aria-label={t('OUTLINER_TITLE')}
    >
      <button
        type="button"
        className="outliner-header"
        aria-expanded={!collapsed}
        data-testid="outliner-toggle"
        onClick={() => setCollapsed(!collapsed)}
      >
        <Icon name="outliner" />
        <span className="panel-title">{t('OUTLINER_TITLE')}</span>
        <span className="outliner-chevron" aria-hidden="true">
          {collapsed ? '▸' : '▾'}
        </span>
      </button>
      {!collapsed && (
        <ul className="outliner-sections">
          {OUTLINER_SECTIONS.map((section) => {
            const items = entries.filter((entry) => entry.section === section);
            const open = !closedSections.has(section);
            return (
              <li
                key={section}
                className={items.length === 0 ? 'outliner-section is-empty' : 'outliner-section'}
                data-testid={`outliner-${section}`}
              >
                <button
                  type="button"
                  className="outliner-section-header"
                  aria-expanded={open}
                  title={
                    items.length === 0 ? comesWithText(OUTLINER_COMES_WITH[section]) : undefined
                  }
                  onClick={() => toggleSection(section)}
                >
                  <span>{tKey(outlinerSectionKey(section))}</span>
                  <span className="outliner-count">{items.length}</span>
                </button>
                {open && items.length > 0 && (
                  <ul className="outliner-entries">
                    {items.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          className="outliner-entry"
                          data-testid="outliner-entry"
                          onClick={() => onSelect(entry)}
                        >
                          {tKey(entry.labelKey, entry.params)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
