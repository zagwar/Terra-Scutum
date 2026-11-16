import {
  NEED_TIERS,
  countryNameKey,
  needNameKey,
  needTierNameKey,
  popGroupNameKey,
  provinceNameKey,
} from '@terra-scutum/sim';
import type { AppState } from '../../app-store';
import { Flag } from '../flag';
import { formatDensity, formatMoney, formatPercent, formatPopulation, t, tKey } from '../i18n';
import type { ShellActions } from '../shell/shell-actions';
import { NeedsBars, PopulationFacts, standardOfLivingHint } from './population-parts';
import { countryPops, countrySummary, provinceSummary } from './population-view';

/**
 * The Population screen (Society lens; a first pass in F06, section 8.1):
 * the player's country in numbers, its pop groups with jobs, wages and the
 * needs each can afford, and its provinces. F11 fills it out.
 */
export function PopulationScreen({
  state,
  actions,
}: {
  readonly state: AppState;
  readonly actions: ShellActions;
}) {
  const { world, population, pops, provinceOwner, playerCountry, countryStart, countryScreen } =
    state;
  if (!world || !population || !pops || !provinceOwner || playerCountry === null) return null;
  const country = playerCountry;
  const summary = countrySummary(population, country);
  const rows = countryPops(population, country);
  const provinces = Array.from(provinceOwner, (owner, province) => ({ owner, province }))
    .filter(({ owner }) => owner === country)
    .map(({ province }) => ({
      province,
      name: tKey(provinceNameKey(world.provinceIds[province])),
      summary: provinceSummary(population, province),
    }))
    .sort((a, b) => b.summary.people - a.summary.people);
  const started = countryStart?.population[country] ?? 0;
  const flagCode = countryScreen?.flagCodes[country];

  return (
    <div className="population-screen" data-testid="population-screen">
      <div className="population-head">
        {flagCode && <Flag code={flagCode} color={world.countryMapColor[country]} />}
        <h3 data-testid="population-country">{tKey(countryNameKey(world.countryIds[country]))}</h3>
        {started > 0 && countryStart && (
          <span className="population-change" data-testid="population-change">
            {t('POPULATION_SINCE_START', {
              year: countryStart.year,
              change: formatSigned(summary.people / started - 1),
            })}
          </span>
        )}
      </div>

      <div className="population-top">
        <PopulationFacts summary={summary} pops={pops} testId="population" />
        <div>
          <h4 className="list-title" title={standardOfLivingHint(pops)}>
            {t('POPULATION_NEEDS')}
          </h4>
          <NeedsBars needs={summary.needs} testId="population-needs" />
          <ul className="needs-list">
            {NEED_TIERS.map((tier) => (
              <li key={tier}>
                {t('POPULATION_NEEDS_LIST', {
                  tier: tKey(needTierNameKey(tier)),
                  needs: pops.needs
                    .filter((need) => need.tier === tier)
                    .map((need) => tKey(needNameKey(need.id)))
                    .join(', '),
                })}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <h4 className="list-title">{t('POPULATION_GROUPS')}</h4>
      <div className="table-scroll">
        <table className="pop-table is-full" data-testid="population-pops">
          <thead>
            <tr>
              <th>{t('POPULATION_GROUP')}</th>
              <th>{t('POPULATION_PEOPLE')}</th>
              <th>{t('POPULATION_SHARE')}</th>
              <th>{t('POPULATION_UNEMPLOYED')}</th>
              <th title={t('POPULATION_WAGE_HINT')}>{t('POPULATION_WAGE')}</th>
              <th title={standardOfLivingHint(pops)}>{t('POPULATION_LIVING_SHORT')}</th>
              {NEED_TIERS.map((tier) => (
                <th key={tier}>{tKey(needTierNameKey(tier))}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = pops.groups[row.group].id;
              return (
                <tr key={id} data-testid={`population-pops-${id}`}>
                  <th scope="row">{tKey(popGroupNameKey(id))}</th>
                  <td title={Math.round(row.people).toLocaleString('en')}>
                    {formatPopulation(row.people)}
                  </td>
                  <td>
                    {formatPercent(summary.workforce > 0 ? row.people / summary.workforce : 0)}
                  </td>
                  <td>{formatPercent(row.unemployment)}</td>
                  <td>{formatMoney(row.wagePerYear)}</td>
                  <td>{Math.round(row.standardOfLiving)}</td>
                  {row.needs.map((met, index) => (
                    <td key={index}>{formatPercent(met, 0)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h4 className="list-title">{t('POPULATION_PROVINCES', { count: provinces.length })}</h4>
      <div className="table-scroll">
        <table className="pop-table is-full" data-testid="population-provinces">
          <thead>
            <tr>
              <th>{t('POPULATION_PROVINCE')}</th>
              <th>{t('POPULATION_PEOPLE')}</th>
              <th>{t('POPULATION_DENSITY')}</th>
              <th>{t('POPULATION_UNEMPLOYED')}</th>
              <th title={standardOfLivingHint(pops)}>{t('POPULATION_LIVING_SHORT')}</th>
            </tr>
          </thead>
          <tbody>
            {provinces.map(({ province, name, summary: here }) => (
              <tr key={province}>
                <th scope="row">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      actions.closeWindow();
                      actions.show({ kind: 'province', index: province });
                    }}
                  >
                    {name}
                  </button>
                </th>
                <td>{formatPopulation(here.people)}</td>
                <td>
                  {formatDensity(
                    world.provinceAreaKm2[province] > 0
                      ? here.people / world.provinceAreaKm2[province]
                      : 0,
                  )}
                </td>
                <td>{formatPercent(here.unemployment)}</td>
                <td>{Math.round(here.standardOfLiving)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel-note" data-testid="population-note">
        {t('POPULATION_PLACEHOLDER_NOTE')}
      </p>
    </div>
  );
}

/** A change as a signed percentage: "+1.2 %", "−0.4 %". */
function formatSigned(share: number): string {
  const text = formatPercent(Math.abs(share), 2);
  return share < 0 ? `−${text}` : `+${text}`;
}
