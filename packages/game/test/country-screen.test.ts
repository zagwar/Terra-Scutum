import { flagCodesByIndex, parseGameData } from '@terra-scutum/sim';
import { describe, expect, it } from 'vitest';
import { COUNTRY_SCREEN_COMES_WITH } from '../src/ui/country-screen/country-screen-catalog';
import { SCREENS, screenNameKey } from '../src/ui/shell/catalog';
import { flagUrl } from '../src/ui/flag';
import { tKey } from '../src/ui/i18n';
import { RAW_GAME_DATA } from '../src/worker/game-data';
import trackerText from '../../../docs/12_feature_tracker.md?raw';

/** The milestone the feature tracker gives a feature ("| F24 | … | M6 | …"). */
function trackerMilestone(feature: string): string | undefined {
  const row = trackerText.split('\n').find((line: string) => line.startsWith(`| ${feature} |`));
  return row?.split('|')[3]?.trim();
}

describe('the country screen (F138)', () => {
  const data = parseGameData(RAW_GAME_DATA);

  it('has a flag picture for every country', () => {
    const ids = data.countries.countries.map((c) => c.id).sort();
    const codes = flagCodesByIndex(ids, data.countryFlags);
    const missing = ids.filter((_, i) => flagUrl(codes[i]) === undefined);
    expect(missing).toEqual([]);
    expect(codes[ids.indexOf('USA')]).toBe('us');
    expect(codes[ids.indexOf('KOS')]).toBe('xk');
  });

  it('names the right milestone for every "comes with" note', () => {
    const notes = [
      ...Object.values(COUNTRY_SCREEN_COMES_WITH),
      ...data.countryScreen.laws,
      ...data.countryScreen.cabinetSeats,
      data.countryScreen.publicOpinion,
      ...data.countryScreen.diplomaticActions,
      SCREENS.decisions.comesWith,
      SCREENS.ledger.comesWith,
    ];
    for (const { feature, milestone } of notes)
      expect(trackerMilestone(feature), feature).toBe(milestone);
  });

  it('has a name for the screens its buttons open', () => {
    for (const screen of ['laws', 'government', 'decisions', 'ledger'] as const)
      expect(tKey(screenNameKey(screen))).not.toBe(screenNameKey(screen));
  });
});
