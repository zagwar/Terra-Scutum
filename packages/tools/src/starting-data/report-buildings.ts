import { writeFileSync } from 'node:fs';
import type { StartingBuildingsResult } from './build-starting-buildings';

/** Real world output in 2024, for the report's comparison (approximate, million tonnes or TWh a year). */
const REAL_WORLD: Readonly<Record<string, [number, string]>> = {
  grain: [3100, 'cereals, FAO'],
  livestock_fish: [1300 + 230, 'meat, milk, eggs and fish'],
  iron_ore: [2500, 'USGS'],
  coal: [8800, 'Energy Institute'],
  crude_oil: [4500, 'Energy Institute'],
  natural_gas: [3000, 'Energy Institute (as tonnes of LNG)'],
  copper_ore: [92, 'copper content × 4'],
  bauxite: [440, 'USGS'],
  steel: [1880, 'worldsteel'],
  copper: [27, 'refined, USGS'],
  aluminum: [72, 'primary, USGS'],
  silicon: [9, 'USGS'],
  electricity: [30000, 'TWh, Ember'],
};

const millions = (n: number) => (n / 1e6).toLocaleString('en', { maximumFractionDigits: 1 });
const percent = (part: number, whole: number) =>
  whole > 0 ? `${((100 * part) / whole).toFixed(0)} %` : '–';

/** `packages/tools/starting-data/buildings-report.md`: what the import made, to read after every change. */
export function writeBuildingsReport(
  path: string,
  result: StartingBuildingsResult,
  name: (id: string) => string,
): void {
  const rows = [...result.rows].sort((a, b) => b.employed - a.employed);
  const total = (f: (row: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + f(r), 0);
  const employed = total((r) => r.employed);
  const agriculture = total((r) => r.agricultureJobs);
  const industry = total((r) => r.industryJobs);
  const buildingAgriculture = total((r) => r.buildingAgricultureJobs);
  const buildingIndustry = total((r) => r.buildingIndustryJobs);
  const levels = total((r) => Object.values(r.levels).reduce((a, b) => a + b, 0));
  const buildings = result.file.provinces.reduce((t, p) => t + p.buildings.length, 0);

  const lines: string[] = [
    '# Starting buildings: import report (F85)',
    '',
    'Written by `npm run import:starting-data`; do not edit. The rules are in `README.md` ("Starting buildings").',
    '',
    `**${buildings.toLocaleString('en')} buildings** with ${levels.toLocaleString('en')} levels in ${result.file.provinces.length} provinces.`,
    '',
    '## Jobs',
    '',
    `| | People (millions) | Share of the employed |`,
    `|---|---|---|`,
    `| Employed (all countries) | ${millions(employed)} | 100 % |`,
    `| Real jobs in farming / in industry | ${millions(agriculture)} / ${millions(industry)} | ${percent(agriculture, employed)} / ${percent(industry, employed)} |`,
    `| Building jobs: farms, ranches, fisheries | ${millions(buildingAgriculture)} | ${percent(buildingAgriculture, employed)} |`,
    `| Building jobs: mines, power plants, factories | ${millions(buildingIndustry)} | ${percent(buildingIndustry, employed)} |`,
    `| **All building jobs** | **${millions(buildingAgriculture + buildingIndustry)}** | **${percent(buildingAgriculture + buildingIndustry, employed)}** |`,
    '',
    '## What the world makes at full output (a year)',
    '',
    '| Good | Starting buildings | Real (2024) |',
    '|---|---|---|',
    ...Object.entries(result.worldMade)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([good, amount]) => {
        const real = REAL_WORLD[good];
        const unit = good === 'electricity' ? 'TWh' : 'Mt';
        return `| ${good} | ${millions(amount)} ${unit} | ${real ? `${real[0].toLocaleString('en')} ${unit} (${real[1]})` : '–'} |`;
      }),
    '',
    '## Countries',
    '',
    'Productivity: how many workers a level needs compared with the reference country (×1). Jobs in millions.',
    '',
    '| Country | Employed | Farm jobs: real / buildings | Industry jobs: real / buildings | Productivity (farming, industry, light industry) |',
    '|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${name(r.id)} (${r.id}) | ${millions(r.employed)} | ${millions(r.agricultureJobs)} / ${millions(r.buildingAgricultureJobs)} | ${millions(r.industryJobs)} / ${millions(r.buildingIndustryJobs)} | ×${r.agricultureFactor.toFixed(1)}, ×${r.industryFactor.toFixed(1)}, ×${r.lightIndustryFactor.toFixed(1)} |`,
    ),
    '',
  ];
  if (result.warnings.length > 0) {
    lines.push('## Warnings', '', ...result.warnings.map((w) => `- ${w}`), '');
  }
  writeFileSync(path, lines.join('\n'));
}
