import { type ComesWith, at } from '../shell/catalog';

/**
 * The parts of the country screen (F138, section 12.4.1) that don't exist in
 * the sim yet, with the feature that brings each one. The screen shows them
 * as a dim "—" (or greyed out) with "Comes with F… (M…)". **When a feature
 * fills one, replace its placeholder in the screen and remove it here.**
 * The lists (laws, cabinet seats, stances, diplomatic actions) are data:
 * `data/country_screen.json`.
 */
export const COUNTRY_SCREEN_COMES_WITH = {
  // Header and leader
  ideology: at('F117', 'M3'),
  leader: at('F100', 'M3'),
  aiPersonality: at('F25', 'M6'),
  // Politics
  politicalCapital: at('F72', 'M3'),
  legitimacy: at('F119', 'M3'),
  stability: at('F10', 'M2'),
  interestGroups: at('F119', 'M3'),
  nextElection: at('F72', 'M3'),
  // Relations and intelligence
  opinionOfUs: at('F24', 'M6'),
  alliance: at('F24', 'M6'),
  treaties: at('F24', 'M6'),
  guarantees: at('F24', 'M6'),
  war: at('F59', 'M8c'),
  unStatus: at('F41', 'M6'),
  intelLevel: at('F66', 'M6'),
  // Overview
  militaryStrength: at('F78', 'M8a'),
} as const satisfies Record<string, ComesWith>;

export type CountryScreenPart = keyof typeof COUNTRY_SCREEN_COMES_WITH;
