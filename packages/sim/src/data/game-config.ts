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
});

export type GameConfig = z.infer<typeof gameConfigSchema>;
