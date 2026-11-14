import {
  type CountryStartTable,
  type WorldMap,
  countryNameKey,
  governmentTypeNameKey,
  provinceNameKey,
  summarizeCountry,
} from '@terra-scutum/sim';
import { type ReactNode, useMemo, useState } from 'react';
import type { CountryScreenData } from '../worker/protocol';
import { Flag } from './flag';
import { formatArea, formatMoney, formatMoneyMillions, formatPopulation, t, tKey } from './i18n';

export interface CountrySelectionProps {
  readonly world: WorldMap;
  readonly countryStart: CountryStartTable;
  readonly provinceOwner: Uint16Array;
  readonly data: CountryScreenData;
  /** The country shown in the panel (and tinted on the map), or null. */
  readonly candidate: number | null;
  readonly onPick: (country: number) => void;
  readonly onPlay: (country: number) => void;
}

/** How many search results the list shows at most [DEFAULT]. */
const SEARCH_RESULTS = 8;

/** Lower case without accents, so "cote" finds "Côte d'Ivoire". */
const searchable = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * The country selection (F05), HOI4-style (designer decision): the game opens
 * on the world map, and this panel on the left lets the player pick a country
 * by clicking it on the map, searching for it, or from the quick picks
 * (`data/country_screen.json`). It shows the picked country's flag and real
 * starting facts, and "Play as …" starts the game, paused.
 */
export function CountrySelection({
  world,
  countryStart,
  provinceOwner,
  data,
  candidate,
  onPick,
  onPlay,
}: CountrySelectionProps) {
  const [query, setQuery] = useState('');
  const nameOf = (country: number) => tKey(countryNameKey(world.countryIds[country]));
  const flagOf = (country: number, className: string, testId?: string) => (
    <Flag
      code={data.flagCodes[country]}
      color={world.countryMapColor[country]}
      className={className}
      testId={testId}
    />
  );

  const names = useMemo(
    () =>
      world.countryIds.map((id, index) => ({
        index,
        name: tKey(countryNameKey(id)),
        key: searchable(tKey(countryNameKey(id))),
      })),
    [world],
  );
  const matches = useMemo(() => {
    const wanted = searchable(query.trim());
    if (!wanted) return [];
    return names
      .filter((entry) => entry.key.includes(wanted))
      .sort(
        (a, b) =>
          Number(!a.key.startsWith(wanted)) - Number(!b.key.startsWith(wanted)) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, SEARCH_RESULTS);
  }, [names, query]);
  const quickPicks = data.config.countrySelection.quickPicks
    .map((id) => world.countryIndex.get(id))
    .filter((index): index is number => index !== undefined);

  const countryButton = (country: number, testId: string) => (
    <button
      key={country}
      type="button"
      className="selection-country"
      aria-pressed={country === candidate}
      data-testid={testId}
      data-country={world.countryIds[country]}
      onClick={() => onPick(country)}
    >
      {flagOf(country, 'selection-country-flag')}
      <span>{nameOf(country)}</span>
    </button>
  );

  return (
    <section className="panel country-selection" data-testid="country-selection">
      <h2 className="panel-title">{t('COUNTRY_SELECTION_TITLE')}</h2>
      <p className="selection-hint">{t('COUNTRY_SELECTION_HINT')}</p>

      <input
        type="search"
        className="selection-search"
        placeholder={t('COUNTRY_SELECTION_SEARCH')}
        aria-label={t('COUNTRY_SELECTION_SEARCH')}
        data-testid="selection-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          // Enter picks the first match.
          if (event.key === 'Enter' && matches.length > 0) onPick(matches[0].index);
        }}
      />
      {query.trim() !== '' && (
        <div className="selection-list" data-testid="selection-results">
          {matches.length === 0 ? (
            <p className="list-empty">{t('COUNTRY_SELECTION_NO_MATCH')}</p>
          ) : (
            matches.map(({ index }) => countryButton(index, 'selection-result'))
          )}
        </div>
      )}

      <h3 className="list-title">{t('COUNTRY_SELECTION_QUICK_PICKS')}</h3>
      <div className="selection-list selection-quick-picks" data-testid="selection-quick-picks">
        {quickPicks.map((index) => countryButton(index, 'selection-quick-pick'))}
      </div>

      {candidate === null ? (
        <p className="selection-empty" data-testid="selection-empty">
          {t('COUNTRY_SELECTION_NONE')}
        </p>
      ) : (
        <CandidateCard
          world={world}
          countryStart={countryStart}
          provinceOwner={provinceOwner}
          country={candidate}
          flag={flagOf(candidate, 'selection-card-flag', 'selection-flag')}
          name={nameOf(candidate)}
          nameOf={nameOf}
          onPick={onPick}
        />
      )}
      {candidate !== null && (
        <div className="selection-play-row">
          <button
            type="button"
            className="button selection-play"
            data-testid="selection-play"
            onClick={() => onPlay(candidate)}
          >
            {t('COUNTRY_SELECTION_PLAY', { country: nameOf(candidate) })}
          </button>
          <p className="selection-play-note">{t('COUNTRY_SELECTION_PLAY_NOTE')}</p>
        </div>
      )}
    </section>
  );
}

/** The picked country: flag, name, government type and its real 2025 facts. */
function CandidateCard({
  world,
  countryStart,
  provinceOwner,
  country,
  flag,
  name,
  nameOf,
  onPick,
}: {
  readonly world: WorldMap;
  readonly countryStart: CountryStartTable;
  readonly provinceOwner: Uint16Array;
  readonly country: number;
  readonly flag: ReactNode;
  readonly name: string;
  readonly nameOf: (country: number) => string;
  readonly onPick: (country: number) => void;
}) {
  const summary = summarizeCountry(world, provinceOwner, country);
  const population = countryStart.population[country];
  const gdpMillionUsd = countryStart.gdpMillionUsd[country];
  const neighbors = summary.neighbors
    .map((index) => ({ index, name: nameOf(index) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="selection-card" data-testid="selection-card">
      <div className="selection-card-header">
        {flag}
        <div>
          <h3 className="selection-card-name" data-testid="selection-name">
            {name}
          </h3>
          <p className="selection-card-government" data-testid="selection-government">
            {tKey(governmentTypeNameKey(countryStart.governmentType[country]))}
          </p>
        </div>
      </div>
      <dl className="facts">
        <dt>{t('COUNTRY_PANEL_CAPITAL')}</dt>
        <dd data-testid="selection-capital">
          {tKey(provinceNameKey(world.provinceIds[world.countryCapital[country]]))}
        </dd>
        <dt>{t('COUNTRY_PANEL_POPULATION')}</dt>
        <dd data-testid="selection-population">{formatPopulation(population)}</dd>
        <dt title={t('COUNTRY_PANEL_GDP_TOOLTIP')}>{t('COUNTRY_PANEL_GDP')}</dt>
        <dd data-testid="selection-gdp">{formatMoneyMillions(gdpMillionUsd)}</dd>
        <dt>{t('COUNTRY_PANEL_GDP_PER_PERSON')}</dt>
        <dd>{formatMoney((gdpMillionUsd * 1e6) / population)}</dd>
        <dt>{t('COUNTRY_PANEL_PROVINCES')}</dt>
        <dd data-testid="selection-provinces">{summary.provinces.length.toLocaleString('en')}</dd>
        <dt>{t('COUNTRY_PANEL_AREA')}</dt>
        <dd>{formatArea(summary.areaKm2)}</dd>
      </dl>
      <p className="panel-note">{t('COUNTRY_PANEL_SOURCE', { year: countryStart.year })}</p>
      <h4 className="list-title">{t('COUNTRY_PANEL_NEIGHBORS', { count: neighbors.length })}</h4>
      {neighbors.length === 0 ? (
        <p className="list-empty">{t('PANEL_NONE')}</p>
      ) : (
        <ul className="link-list" data-testid="selection-neighbors">
          {neighbors.map((neighbor) => (
            <li key={neighbor.index}>
              <button type="button" className="link-button" onClick={() => onPick(neighbor.index)}>
                {neighbor.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
