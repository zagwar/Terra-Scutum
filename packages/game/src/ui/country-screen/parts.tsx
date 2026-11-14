import type { ReactNode } from 'react';
import type { ComesWith } from '../shell/catalog';
import { Tip } from '../shell/tip';
import { comesWithText } from '../shell/top-bar';
import { t } from '../i18n';

/**
 * Small building blocks of the country screen (F138): a missing value, a
 * section with a title, a placeholder portrait, a "comes with" note.
 */

/** A value the sim doesn't have yet: a dim "—" whose tooltip says which feature brings it. */
export function Missing({
  label,
  comesWith,
  testId,
  align = 'end',
}: {
  readonly label: string;
  readonly comesWith: ComesWith;
  readonly testId?: string;
  readonly align?: 'start' | 'end';
}) {
  return (
    <span className="cs-missing has-tip" tabIndex={0} data-testid={testId}>
      {t('SHELL_NO_VALUE')}
      <Tip title={label} lines={[comesWithText(comesWith)]} align={align} />
    </span>
  );
}

/** A short dim line under a part that isn't built yet: "Comes with F100 (M3)". */
export function ComesWithNote({
  comesWith,
  testId,
}: {
  readonly comesWith: ComesWith;
  readonly testId?: string;
}) {
  return (
    <p className="cs-comes-with" data-testid={testId}>
      {comesWithText(comesWith)}
    </p>
  );
}

/** One part of the screen: a small title over its content. */
export function Section({
  title,
  hint,
  testId,
  className,
  children,
}: {
  readonly title: string;
  /** Explains the part; shown when hovering the title. */
  readonly hint?: string;
  readonly testId: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={`cs-section ${className ?? ''}`.trim()} data-testid={testId}>
      <h3 className="cs-section-title" title={hint}>
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * A placeholder portrait [DEFAULT]: a grey silhouette drawn in code, until
 * characters (F100) bring generated portraits (section 4.7).
 */
export function Portrait({
  size,
  testId,
}: {
  readonly size: 'large' | 'small';
  readonly testId?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 48"
      className={`cs-portrait cs-portrait-${size}`}
      role="img"
      aria-label={t('COUNTRY_SCREEN_PORTRAIT')}
      data-testid={testId}
    >
      <rect x="0" y="0" width="40" height="48" className="cs-portrait-back" />
      <circle cx="20" cy="17" r="8" className="cs-portrait-figure" />
      <path d="M5 48c0-11 6.5-18 15-18s15 7 15 18Z" className="cs-portrait-figure" />
    </svg>
  );
}

/** The interest groups' pie chart (F119) before it exists: an empty, dashed circle. */
export function EmptyPie() {
  return (
    <svg viewBox="0 0 64 64" className="cs-pie" aria-hidden="true">
      <circle cx="32" cy="32" r="28" className="cs-pie-empty" />
    </svg>
  );
}
