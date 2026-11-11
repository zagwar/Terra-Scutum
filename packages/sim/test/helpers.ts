import { type GameData, parseGameData } from '../src';

/** Minimal valid game data for tests (independent of the real files in `data/`). */
export function testData(overrides: { startDate?: string } = {}): GameData {
  return parseGameData({
    gameConfig: {
      startDate: overrides.startDate ?? '2025-01-01',
      performanceBudget: { dailyTickAverageMs: 30, weeklyTickAverageMs: 150 },
    },
  });
}
