import {
  type CountryStartTable,
  type WorldMap,
  cabinetSeatNameKey,
  countryNameKey,
  diplomaticActionNameKey,
  governmentTypeNameKey,
  lawCategoryNameKey,
  opinionStanceNameKey,
} from '@terra-scutum/sim';
import type { CountryScreenData } from '../../worker/protocol';
import { Flag } from '../flag';
import { t, tKey } from '../i18n';
import { type ShellWindow, screenNameKey } from '../shell/catalog';
import type { PanelNav } from '../shell/panel-header';
import { Tip } from '../shell/tip';
import { comesWithText } from '../shell/top-bar';
import { COUNTRY_SCREEN_COMES_WITH as COMES } from './country-screen-catalog';
import { CountryOverview } from './country-overview';
import { ComesWithNote, EmptyPie, Missing, Portrait, Section } from './parts';

export interface CountryScreenProps {
  readonly world: WorldMap;
  readonly countryStart: CountryStartTable;
  readonly provinceOwner: Uint16Array;
  readonly data: CountryScreenData;
  /** Index of the country to show. */
  readonly country: number;
  /** The country the player leads: it gets the Government view, every other country the Diplomacy view. */
  readonly playerCountry: number | null;
  readonly nav: PanelNav;
  readonly onSelectCountry: (country: number) => void;
  readonly onSelectProvince: (province: number) => void;
  readonly onOpenWindow: (window: ShellWindow) => void;
}

/** The screens the Government view's buttons open (section 12.4.1). */
const GOVERNMENT_LINKS = ['laws', 'government', 'decisions', 'ledger'] as const;

/**
 * The country screen (F138, section 12.4.1), modeled on Hearts of Iron IV: a
 * large panel over the left part of the map (designer decision). The
 * player's own country gets the **Government view**; any other country the
 * **Diplomacy view**. It takes the information panel's place, so ◀ Back and
 * links work as in the other panels. Parts the sim doesn't have yet show a
 * dim "—" or a "Comes with F…" note (`country-screen-catalog.ts`).
 */
export function CountryScreen(props: CountryScreenProps) {
  const { world, countryStart, data, country, playerCountry, nav } = props;
  const isOwn = country === playerCountry;
  const name = tKey(countryNameKey(world.countryIds[country]));
  const governmentType = countryStart.governmentType[country];

  return (
    <section
      className="panel info-panel country-screen"
      data-testid="country-screen"
      data-view={isOwn ? 'government' : 'diplomacy'}
      aria-label={name}
    >
      {nav.canGoBack && (
        <button
          type="button"
          className="panel-back"
          data-testid="panel-back"
          title={t('PANEL_BACK_HINT')}
          onClick={nav.onBack}
        >
          ◀ {t('PANEL_BACK')}
        </button>
      )}
      <header className="cs-header">
        <Flag
          code={data.flagCodes[country]}
          color={world.countryMapColor[country]}
          className="cs-flag"
          testId="country-flag"
        />
        <div className="cs-heading">
          <p className="cs-view-label" data-testid="country-view-label">
            {isOwn
              ? `${t('COUNTRY_SCREEN_GOVERNMENT_VIEW')} · ${t('COUNTRY_SCREEN_YOUR_COUNTRY')}`
              : t('COUNTRY_SCREEN_DIPLOMACY_VIEW')}
          </p>
          <h2 className="cs-name" data-testid="country-name">
            {name}
          </h2>
          <p className="cs-subtitle">
            <span data-testid="country-government">
              {tKey(governmentTypeNameKey(governmentType))}
            </span>
            <span className="cs-dot" aria-hidden="true">
              ·
            </span>
            <span>
              {t('COUNTRY_SCREEN_IDEOLOGY')}{' '}
              <Missing
                label={t('COUNTRY_SCREEN_IDEOLOGY')}
                comesWith={COMES.ideology}
                testId="country-ideology"
                align="start"
              />
            </span>
            {!isOwn && (
              <>
                <span className="cs-dot" aria-hidden="true">
                  ·
                </span>
                <span>
                  {t('COUNTRY_SCREEN_AI_PERSONALITY')}{' '}
                  <Missing
                    label={t('COUNTRY_SCREEN_AI_PERSONALITY')}
                    comesWith={COMES.aiPersonality}
                    testId="country-ai-personality"
                    align="start"
                  />
                </span>
              </>
            )}
          </p>
          {!isOwn && (
            <div className="cs-header-leader" data-testid="country-leader">
              <Portrait size="small" />
              <span className="cs-dim">{t('COUNTRY_SCREEN_HEAD_OF_STATE')}</span>
              <Missing
                label={t('COUNTRY_SCREEN_HEAD_OF_STATE')}
                comesWith={COMES.leader}
                align="start"
              />
            </div>
          )}
        </div>
        <button
          type="button"
          className="icon-button cs-close"
          aria-label={t('PANEL_CLOSE')}
          title={t('PANEL_CLOSE_HINT')}
          data-testid="country-close"
          onClick={nav.onClose}
        >
          ×
        </button>
      </header>

      {isOwn ? (
        <GovernmentView {...props} governmentKind={data.governmentKinds[governmentType]} />
      ) : (
        <DiplomacyView {...props} />
      )}
    </section>
  );
}

/** Your own country: leader, politics, national modifiers, laws, cabinet, public opinion, overview. */
function GovernmentView(
  props: CountryScreenProps & { readonly governmentKind: string | undefined },
) {
  const { data, governmentKind, onOpenWindow } = props;
  const { laws, cabinetSeats, publicOpinion } = data.config;
  return (
    <div className="cs-body">
      <div className="cs-columns">
        <Section title={t('COUNTRY_SCREEN_LEADER')} testId="country-leader" className="cs-leader">
          <Portrait size="large" />
          <p className="cs-leader-role">{t('COUNTRY_SCREEN_HEAD_OF_STATE')}</p>
          <dl className="facts">
            <dt>{t('COUNTRY_SCREEN_TRAITS')}</dt>
            <dd>
              <Missing label={t('COUNTRY_SCREEN_TRAITS')} comesWith={COMES.leader} />
            </dd>
          </dl>
          <ComesWithNote comesWith={COMES.leader} />
        </Section>

        <Section title={t('COUNTRY_SCREEN_POLITICS')} testId="country-politics">
          <dl className="facts">
            <dt>{t('COUNTRY_SCREEN_POLITICAL_CAPITAL')}</dt>
            <dd>
              <Missing
                label={t('COUNTRY_SCREEN_POLITICAL_CAPITAL')}
                comesWith={COMES.politicalCapital}
                testId="country-political-capital"
              />
            </dd>
            <dt>{t('COUNTRY_SCREEN_POLITICAL_CAPITAL_GAIN')}</dt>
            <dd>
              <Missing
                label={t('COUNTRY_SCREEN_POLITICAL_CAPITAL_GAIN')}
                comesWith={COMES.politicalCapital}
              />
            </dd>
            <dt>{t('COUNTRY_SCREEN_LEGITIMACY')}</dt>
            <dd>
              <Missing label={t('COUNTRY_SCREEN_LEGITIMACY')} comesWith={COMES.legitimacy} />
            </dd>
            <dt>{t('COUNTRY_SCREEN_STABILITY')}</dt>
            <dd>
              <Missing label={t('COUNTRY_SCREEN_STABILITY')} comesWith={COMES.stability} />
            </dd>
            {governmentKind === 'democracy' && (
              <>
                <dt>{t('COUNTRY_SCREEN_NEXT_ELECTION')}</dt>
                <dd>
                  <Missing
                    label={t('COUNTRY_SCREEN_NEXT_ELECTION')}
                    comesWith={COMES.nextElection}
                    testId="country-next-election"
                  />
                </dd>
              </>
            )}
          </dl>
          <div className="cs-pie-row" data-testid="country-interest-groups">
            <EmptyPie />
            <div>
              <h4 className="list-title" title={t('COUNTRY_SCREEN_INTEREST_GROUPS_HINT')}>
                {t('COUNTRY_SCREEN_INTEREST_GROUPS')}
              </h4>
              <ComesWithNote comesWith={COMES.interestGroups} />
            </div>
          </div>
        </Section>
      </div>

      <Section title={t('COUNTRY_SCREEN_NATIONAL_MODIFIERS')} testId="country-modifiers">
        <p className="cs-empty">{t('COUNTRY_SCREEN_NATIONAL_MODIFIERS_NONE')}</p>
      </Section>

      <Section
        title={t('COUNTRY_SCREEN_LAWS')}
        hint={t('COUNTRY_SCREEN_LAWS_HINT')}
        testId="country-laws"
      >
        <div className="cs-tiles">
          {laws.map((law) => (
            <button
              key={law.id}
              type="button"
              className="cs-tile has-tip"
              data-testid={`country-law-${law.id}`}
              onClick={() => onOpenWindow('laws')}
            >
              <span className="cs-tile-name">{tKey(lawCategoryNameKey(law.id))}</span>
              <span className="cs-tile-value">{t('SHELL_NO_VALUE')}</span>
              <Tip
                title={tKey(lawCategoryNameKey(law.id))}
                lines={[t('COUNTRY_SCREEN_LAWS_HINT'), comesWithText(law)]}
              />
            </button>
          ))}
        </div>
      </Section>

      <Section
        title={t('COUNTRY_SCREEN_CABINET')}
        hint={t('COUNTRY_SCREEN_CABINET_HINT')}
        testId="country-cabinet"
      >
        <div className="cs-tiles cs-cabinet">
          {cabinetSeats.map((seat) => (
            <button
              key={seat.id}
              type="button"
              className="cs-tile cs-seat has-tip"
              data-testid={`country-seat-${seat.id}`}
              onClick={() => onOpenWindow('characters')}
            >
              <Portrait size="small" />
              <span className="cs-seat-text">
                <span className="cs-tile-name">{tKey(cabinetSeatNameKey(seat.id))}</span>
                <span className="cs-tile-value">{t('COUNTRY_SCREEN_EMPTY_SEAT')}</span>
              </span>
              <Tip
                title={tKey(cabinetSeatNameKey(seat.id))}
                lines={[t('COUNTRY_SCREEN_CABINET_HINT'), comesWithText(seat)]}
              />
            </button>
          ))}
        </div>
      </Section>

      <Section
        title={t('COUNTRY_SCREEN_PUBLIC_OPINION')}
        hint={t('COUNTRY_SCREEN_PUBLIC_OPINION_HINT')}
        testId="country-public-opinion"
      >
        <div className="cs-opinion-bar">
          {publicOpinion.stances.map((stance) => (
            <span key={stance} className="cs-opinion-segment">
              {tKey(opinionStanceNameKey(stance))}
            </span>
          ))}
        </div>
        <ComesWithNote comesWith={publicOpinion} />
      </Section>

      <CountryOverview {...props} />

      <div className="cs-buttons" data-testid="country-screen-links">
        {GOVERNMENT_LINKS.map((screen) => (
          <button
            key={screen}
            type="button"
            className="cs-link-button"
            data-testid={`country-open-${screen}`}
            onClick={() => onOpenWindow(screen)}
          >
            {tKey(screenNameKey(screen))}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Another country: relations, diplomatic actions, intelligence, overview. */
function DiplomacyView(props: CountryScreenProps) {
  const { data } = props;
  const relations = [
    ['COUNTRY_SCREEN_OPINION_OF_US', COMES.opinionOfUs, 'country-opinion-of-us'],
    ['COUNTRY_SCREEN_ALLIANCE', COMES.alliance, undefined],
    ['COUNTRY_SCREEN_TREATIES', COMES.treaties, undefined],
    ['COUNTRY_SCREEN_GUARANTEES', COMES.guarantees, undefined],
    ['COUNTRY_SCREEN_WAR', COMES.war, undefined],
    ['COUNTRY_SCREEN_UN_STATUS', COMES.unStatus, undefined],
  ] as const;
  return (
    <div className="cs-body">
      <div className="cs-columns">
        <div className="cs-stack">
          <Section title={t('COUNTRY_SCREEN_RELATIONS')} testId="country-relations">
            <dl className="facts">
              {relations.map(([key, comesWith, testId]) => (
                <div key={key} className="cs-fact">
                  <dt>{t(key)}</dt>
                  <dd>
                    <Missing label={t(key)} comesWith={comesWith} testId={testId} />
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
          <Section title={t('COUNTRY_SCREEN_INTELLIGENCE')} testId="country-intelligence">
            <dl className="facts">
              <dt>{t('COUNTRY_SCREEN_INTEL_LEVEL')}</dt>
              <dd>
                <Missing
                  label={t('COUNTRY_SCREEN_INTEL_LEVEL')}
                  comesWith={COMES.intelLevel}
                  testId="country-intel-level"
                />
              </dd>
            </dl>
            <p className="panel-note">{t('COUNTRY_SCREEN_INTEL_NOTE')}</p>
          </Section>
        </div>

        <Section title={t('COUNTRY_SCREEN_DIPLOMATIC_ACTIONS')} testId="country-actions">
          <ul className="cs-actions">
            {data.config.diplomaticActions.map((action) => (
              <li key={action.id}>
                <button
                  type="button"
                  className="cs-action"
                  aria-disabled="true"
                  data-testid={`country-action-${action.id}`}
                >
                  <span className="cs-action-name">{tKey(diplomaticActionNameKey(action.id))}</span>
                  <span className="cs-action-reason">{comesWithText(action)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <CountryOverview {...props} />
    </div>
  );
}
