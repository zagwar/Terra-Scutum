import type { ReactNode } from 'react';

/**
 * A simple hover tooltip for the shell: a title and a few lines, shown under
 * (or above) the element while the mouse is over it. Plain CSS, no state.
 * The nested tooltips of section 12.3 (every number explains itself) come
 * with F123 and replace this.
 */
export function Tip({
  title,
  lines,
  placement = 'below',
  align = 'start',
  testId,
}: {
  readonly title: string;
  readonly lines?: readonly string[];
  readonly placement?: 'below' | 'above';
  readonly align?: 'start' | 'end';
  readonly testId?: string;
}): ReactNode {
  return (
    <span className={`tip tip-${placement} tip-${align}`} role="tooltip" data-testid={testId}>
      <span className="tip-title">{title}</span>
      {lines?.map((line, i) => (
        <span key={i} className="tip-line">
          {line}
        </span>
      ))}
    </span>
  );
}
