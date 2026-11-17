import type { MapMode } from '../../render/map/map-colors';

/**
 * What the UI shell (F122, section 12.1) holds: the lenses and their screens,
 * and the items of the top bar. Nearly all of them are empty until their
 * features are built; each names the feature (and milestone) that fills it,
 * so the player sees "comes with F09 (M2)" instead of a missing button.
 * When a feature fills a screen or a number, it replaces the placeholder here.
 */

/** A feature from the feature tracker and its milestone, for "comes with …" notes. */
export interface ComesWith {
  readonly feature: string;
  readonly milestone: string;
}

export const LENS_IDS = [
  'economy',
  'politics',
  'military',
  'diplomacy',
  'society',
  'science',
  'space',
  'swarm',
] as const;
export type LensId = (typeof LENS_IDS)[number];

export interface ScreenInfo {
  readonly lens: LensId;
  /** The feature that builds the screen, or null once it is built. */
  readonly comesWith: ComesWith | null;
}

export const at = (feature: string, milestone: string): ComesWith => ({ feature, milestone });

/** Every screen reachable from a lens (section 12.1), with the feature that builds it. */
export const SCREENS = {
  budget: { lens: 'economy', comesWith: at('F09', 'M2') },
  buildings: { lens: 'economy', comesWith: null },
  productionChains: { lens: 'economy', comesWith: at('F87', 'M3') },
  markets: { lens: 'economy', comesWith: at('F65', 'M2') },
  trade: { lens: 'economy', comesWith: at('F19', 'M4') },
  corporations: { lens: 'economy', comesWith: at('F89', 'M4') },
  government: { lens: 'politics', comesWith: at('F119', 'M3') },
  laws: { lens: 'politics', comesWith: at('F16', 'M3') },
  movements: { lens: 'politics', comesWith: at('F121', 'M5') },
  characters: { lens: 'politics', comesWith: at('F100', 'M3') },
  elections: { lens: 'politics', comesWith: at('F72', 'M3') },
  armies: { lens: 'military', comesWith: at('F78', 'M8a') },
  planner: { lens: 'military', comesWith: at('F91', 'M8a') },
  militaryProduction: { lens: 'military', comesWith: at('F14', 'M3') },
  designers: { lens: 'military', comesWith: at('F51', 'M8b') },
  divisionTemplates: { lens: 'military', comesWith: at('F52', 'M8a') },
  unitRoster: { lens: 'military', comesWith: at('F92', 'M8c') },
  memorial: { lens: 'military', comesWith: at('F94', 'M8c') },
  relations: { lens: 'diplomacy', comesWith: at('F24', 'M6') },
  treaties: { lens: 'diplomacy', comesWith: at('F24', 'M6') },
  unitedNations: { lens: 'diplomacy', comesWith: at('F41', 'M6') },
  intelligence: { lens: 'diplomacy', comesWith: at('F66', 'M6') },
  // Built in F06 (a first pass; F11 fills it out).
  population: { lens: 'society', comesWith: null },
  ideology: { lens: 'society', comesWith: at('F118', 'M3') },
  publicOpinion: { lens: 'society', comesWith: at('F21', 'M5') },
  refugees: { lens: 'society', comesWith: at('F33', 'M9') },
  migration: { lens: 'society', comesWith: at('F108', 'M9') },
  research: { lens: 'science', comesWith: at('F36', 'M10') },
  xenoLab: { lens: 'science', comesWith: at('F56', 'M10') },
  orbit: { lens: 'space', comesWith: at('F49', 'M8b') },
  launches: { lens: 'space', comesWith: at('F49', 'M8b') },
  stations: { lens: 'space', comesWith: at('F49', 'M8b') },
  moon: { lens: 'space', comesWith: at('F109', 'M10') },
  swarmIntel: { lens: 'swarm', comesWith: at('F29', 'M7') },
  hiveTracker: { lens: 'swarm', comesWith: at('F27', 'M7') },
  bugKnowledge: { lens: 'swarm', comesWith: at('F57', 'M10') },
  journal: { lens: 'politics', comesWith: at('F96', 'M3') },
  // Opened from the country screen's buttons (F138), not listed in a lens [DEFAULT].
  decisions: { lens: 'politics', comesWith: at('F97', 'M3') },
  ledger: { lens: 'economy', comesWith: at('F124', 'M5') },
} as const satisfies Record<string, ScreenInfo>;
export type ScreenId = keyof typeof SCREENS;

/**
 * The screens each lens lists, in order (the journal is reached from the top
 * bar only; decisions and the ledger from the country screen).
 */
export const LENS_SCREENS: Readonly<Record<LensId, readonly ScreenId[]>> = {
  economy: ['budget', 'buildings', 'productionChains', 'markets', 'trade', 'corporations'],
  politics: ['government', 'laws', 'movements', 'characters', 'elections'],
  military: [
    'armies',
    'planner',
    'militaryProduction',
    'designers',
    'divisionTemplates',
    'unitRoster',
    'memorial',
  ],
  diplomacy: ['relations', 'treaties', 'unitedNations', 'intelligence'],
  society: ['population', 'ideology', 'publicOpinion', 'refugees', 'migration'],
  science: ['research', 'xenoLab'],
  space: ['orbit', 'launches', 'stations', 'moon'],
  swarm: ['swarmIntel', 'hiveTracker', 'bugKnowledge'],
};

/**
 * The map mode each lens switches to when opened (section 12.2: the Economy
 * lens shows the industry map mode…). The Society lens shows the population
 * map mode (F06) and the Economy lens the industry map mode (F07); the other
 * lenses leave the map mode alone until their map modes exist [DEFAULT]:
 * fill these in as the map modes arrive.
 */
export const LENS_MAP_MODE: Readonly<Record<LensId, MapMode | null>> = {
  economy: 'industry',
  politics: null,
  military: null,
  diplomacy: null,
  society: 'population',
  science: null,
  space: null,
  swarm: null,
};

/** The other windows the shell opens: the settings and the message log. */
export type ShellWindow = ScreenId | 'settings' | 'messageLog';

export const TOP_BAR_ITEM_IDS = [
  'treasury',
  'politicalCapital',
  'influence',
  'legitimacy',
  'stability',
  'manpower',
  'pilots',
  'research',
  'food',
  'ammo',
  'fuel',
  'steel',
  'swarmControl',
  'arrival',
] as const;
export type TopBarItemId = (typeof TOP_BAR_ITEM_IDS)[number];

export interface TopBarItemInfo {
  readonly comesWith: ComesWith;
  /** The screen a click opens. */
  readonly screen: ScreenId;
}

/**
 * The key numbers of the top bar (section 12.1), left to right. None of them
 * exists in the sim yet: each shows "—" and says which feature brings it.
 * Which screen each one opens is a [DEFAULT].
 */
export const TOP_BAR_ITEMS: Readonly<Record<TopBarItemId, TopBarItemInfo>> = {
  treasury: { comesWith: at('F09', 'M2'), screen: 'budget' },
  politicalCapital: { comesWith: at('F72', 'M3'), screen: 'government' },
  influence: { comesWith: at('F22', 'M5'), screen: 'publicOpinion' },
  legitimacy: { comesWith: at('F119', 'M3'), screen: 'government' },
  stability: { comesWith: at('F10', 'M2'), screen: 'population' },
  manpower: { comesWith: at('F15', 'M3'), screen: 'armies' },
  pilots: { comesWith: at('F102', 'M8b'), screen: 'unitRoster' },
  research: { comesWith: at('F36', 'M10'), screen: 'research' },
  food: { comesWith: at('F08', 'M2'), screen: 'markets' },
  ammo: { comesWith: at('F14', 'M3'), screen: 'markets' },
  fuel: { comesWith: at('F13', 'M3'), screen: 'markets' },
  steel: { comesWith: at('F13', 'M3'), screen: 'markets' },
  swarmControl: { comesWith: at('F28', 'M7'), screen: 'swarmIntel' },
  arrival: { comesWith: at('F18', 'M3'), screen: 'journal' },
};

/** The outliner's sections (section 12.1), top to bottom. */
export const OUTLINER_SECTIONS = [
  'armies',
  'fronts',
  'operations',
  'fleets',
  'airWings',
  'construction',
  'research',
  'journal',
  'espionage',
  'pinned',
] as const;
export type OutlinerSectionId = (typeof OUTLINER_SECTIONS)[number];

/** The feature that first fills each outliner section. */
export const OUTLINER_COMES_WITH: Readonly<Record<OutlinerSectionId, ComesWith>> = {
  armies: at('F78', 'M8a'),
  fronts: at('F78', 'M8a'),
  operations: at('F50', 'M8b'),
  fleets: at('F44', 'M8b'),
  airWings: at('F116', 'M8b'),
  construction: at('F12', 'M3'),
  research: at('F36', 'M10'),
  journal: at('F96', 'M3'),
  espionage: at('F67', 'M6'),
  pinned: at('F124', 'M5'),
};

/** Translation-key helpers: camelCase ids → `SCREEN_PRODUCTION_CHAINS` and so on. */
const snake = (id: string) => id.replace(/([A-Z])/g, '_$1').toUpperCase();
export const screenNameKey = (id: ScreenId) => `SCREEN_${snake(id)}`;
export const lensNameKey = (id: LensId) => `LENS_${snake(id)}`;
export const topBarNameKey = (id: TopBarItemId) => `TOP_BAR_${snake(id)}`;
export const topBarHintKey = (id: TopBarItemId) => `TOP_BAR_${snake(id)}_HINT`;
export const outlinerSectionKey = (id: OutlinerSectionId) => `OUTLINER_${snake(id)}`;
