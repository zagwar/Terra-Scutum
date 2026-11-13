import type { CalendarDate } from '@terra-scutum/sim';
import { useEffect } from 'react';
import type { TimeChange, TimeState } from '../worker/protocol';
import { formatDate, t } from './i18n';
import { timeKeyAction } from './time-keys';

const SPEEDS = [1, 2, 3, 4, 5] as const;

export interface TimeControlProps {
  readonly date: CalendarDate;
  readonly time: TimeState;
  /** Days per second at speeds 1–5. */
  readonly daysPerSecond: readonly number[];
  readonly onChangeTime: (change: TimeChange) => void;
}

/** True when a key press is meant for a text field rather than the game. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * The date and the game speed controls (F04), top-right where the top bar
 * will be (section 12.1; the full top bar comes with F122): the date, pause /
 * play, and speeds 1–5. Also listens for the time keys (see `time-keys.ts`).
 */
export function TimeControl({ date, time, daysPerSecond, onChangeTime }: TimeControlProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const change = timeKeyAction(event);
      // A held-down Space is still ours, so the page doesn't act on it.
      if (change || (event.code === 'Space' && !event.ctrlKey && !event.metaKey)) {
        // Space would also press the button that has the focus (and scroll the page).
        event.preventDefault();
      }
      if (change) onChangeTime(change);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      // A focused button is pressed when Space is released: not with the time keys.
      if (event.code === 'Space' && !isTyping(event.target)) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onChangeTime]);

  const { paused, speed } = time;
  return (
    <section
      className={paused ? 'panel time-control is-paused' : 'panel time-control'}
      data-testid="time-control"
      data-paused={paused}
      data-speed={speed}
    >
      <button
        type="button"
        className="time-pause-button"
        data-testid="time-pause"
        aria-label={t(paused ? 'TIME_PLAY' : 'TIME_PAUSE')}
        title={t('TIME_PAUSE_HINT')}
        onClick={() => onChangeTime({ kind: 'togglePause' })}
      >
        {paused ? (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 2.5 13.5 8 4 13.5Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3.5" y="2.5" width="3" height="11" />
            <rect x="9.5" y="2.5" width="3" height="11" />
          </svg>
        )}
      </button>
      <div className="time-date-block">
        <div className="time-date" data-testid="time-date">
          {formatDate(date)}
        </div>
        <div className="time-status" data-testid="time-status">
          {paused ? t('TIME_PAUSED') : t('TIME_SPEED', { speed })}
        </div>
      </div>
      <div className="time-speeds" role="group" aria-label={t('TIME_SPEED_GROUP')}>
        {SPEEDS.map((option) => (
          <button
            key={option}
            type="button"
            className={option <= speed ? 'time-speed is-on' : 'time-speed'}
            aria-pressed={option === speed}
            aria-label={t('TIME_SPEED', { speed: option })}
            title={t('TIME_SPEED_HINT', {
              speed: option,
              days: daysPerSecond[option - 1] ?? '?',
            })}
            data-testid={`time-speed-${option}`}
            onClick={() => onChangeTime({ kind: 'setSpeed', speed: option })}
          />
        ))}
      </div>
    </section>
  );
}
