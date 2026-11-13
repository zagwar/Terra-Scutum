import { z } from 'zod';
import { parseIsoDate } from '../core/calendar';

/**
 * `data/game_config.json`: campaign-wide settings. Every value is a [DEFAULT]
 * the designer can change in the data file.
 */
export const gameConfigSchema = z.strictObject({
  /** The campaign's first day, as "YYYY-MM-DD". */
  startDate: z.string().transform((text, context) => {
    const date = parseIsoDate(text);
    if (!date) {
      context.addIssue({
        code: 'custom',
        message: `"${text}" is not a real date in the form YYYY-MM-DD`,
      });
      return z.NEVER;
    }
    return date;
  }),
  /**
   * Performance budget (section 17.3). The campaign runner reports tick times
   * against these targets.
   */
  performanceBudget: z.strictObject({
    /** Target average time for an ordinary daily tick, in milliseconds. */
    dailyTickAverageMs: z.number().positive(),
    /** Target average time for a tick that also runs the weekly calculations, in milliseconds. */
    weeklyTickAverageMs: z.number().positive(),
  }),
  /**
   * Game speed (F04, section 5.1): real time with pause. The sim worker runs
   * the daily tick by itself at the chosen speed; the speed is not part of
   * the campaign (`GameState`), so it is not saved.
   */
  gameSpeed: z.strictObject({
    /**
     * Days simulated per second of real time at speeds 1–5, slowest first.
     * The worker never runs behind: when a day takes longer than its share
     * of a second, the next day starts at once instead of piling up.
     */
    daysPerSecond: z
      .array(z.number().positive().max(100))
      .length(5)
      .refine((speeds) => speeds.every((speed, i) => i === 0 || speed > speeds[i - 1]), {
        message: 'each speed must be faster than the one before it',
      }),
    /** The speed (1–5) a new game is set to; it starts paused. */
    startSpeed: z.number().int().min(1).max(5),
  }),
});

export type GameConfig = z.infer<typeof gameConfigSchema>;
