import { GameState, createSnapshot, parseGameData } from '@terra-scutum/sim';
import { describe, expect, it } from 'vitest';
import { populationDensityColor, provinceBaseColors } from '../src/render/map/map-colors';
import { formatDensity, formatMoneyShort, formatPeopleShort, formatPercent } from '../src/ui/i18n';
import {
  countryPops,
  countrySummary,
  provincePops,
  provinceSummary,
} from '../src/ui/population/population-view';
import { RAW_GAME_DATA } from '../src/worker/game-data';

// The population (F06) as the game shows it, on the real world's starting data.
const data = parseGameData(RAW_GAME_DATA);
const state = new GameState({ data, seed: 1 });
const world = state.world;
const population = createSnapshot(state).population!;
const province = (id: string) => world.provinceIndex.get(id)!;
const country = (id: string) => world.countryIndex.get(id)!;

describe('reading the population snapshot', () => {
  it('sums up a province: people, workforce, unemployment, needs', () => {
    const bavaria = provinceSummary(population, province('deu_bavaria'));
    expect(bavaria.people / 1e6).toBeCloseTo(13.2, 0);
    expect(bavaria.workforce + bavaria.dependents).toBeCloseTo(bavaria.people, 3);
    expect(bavaria.workforce / bavaria.people).toBeCloseTo(0.5216, 3);
    expect(bavaria.unemployment).toBeCloseTo(0.0371, 3);
    expect(bavaria.standardOfLiving).toBeGreaterThan(80);
    expect(bavaria.needs[0]).toBeCloseTo(1, 6);
    expect(bavaria.needs[2]).toBeLessThan(1);
  });

  it('lists the pops of a province in the pop groups’ order', () => {
    const rows = provincePops(population, province('deu_bavaria'));
    expect(rows.map((row) => data.pops.groups[row.group].id)).toEqual([
      'laborers',
      'skilled_workers',
      'professionals',
      'owners',
      'officials',
      'soldiers',
    ]);
    const [laborers, , professionals, owners] = rows;
    expect(professionals.wagePerYear).toBeCloseTo(2.6 * laborers.wagePerYear, 0);
    expect(owners.unemployment).toBeCloseTo(0, 6);
    expect(laborers.unemployment).toBeGreaterThan(0.03);
    expect(owners.standardOfLiving).toBeGreaterThan(laborers.standardOfLiving);
    // An empty province has rows of zeros, not broken numbers.
    for (const row of provincePops(population, province('bra_brazilian_island')))
      expect(row).toMatchObject({ people: 0, unemployment: 0 });
  });

  it('sums up a country from its pop groups', () => {
    const germany = countrySummary(population, country('DEU'));
    expect(germany.people).toBeCloseTo(83_491_249, 0);
    expect(germany.unemployment).toBeCloseTo(0.0371, 4);
    const rows = countryPops(population, country('DEU'));
    expect(rows.reduce((sum, row) => sum + row.people, 0)).toBeCloseTo(germany.workforce, 3);
    expect(rows[0].needs[0]).toBeCloseTo(1, 6);
    // Richer countries live better.
    const living = (id: string) => countrySummary(population, country(id)).standardOfLiving;
    expect(living('DEU')).toBeGreaterThan(living('IND'));
    expect(living('IND')).toBeGreaterThan(living('BDI'));
  });
});

describe('the population map mode', () => {
  const steps = data.mapView.colors.populationDensity;
  const hex = (color: readonly number[]) =>
    `#${color.map((part) => Math.round(part).toString(16).padStart(2, '0')).join('')}`;

  it('colors a density on the scale of map_view.json', () => {
    expect(hex(populationDensityColor(0, steps))).toBe(steps[0].color);
    expect(hex(populationDensityColor(steps[2].perKm2, steps))).toBe(steps[2].color);
    expect(hex(populationDensityColor(1e6, steps))).toBe(steps[steps.length - 1].color);
    // Between two steps: between their colors (halfway on a logarithmic scale).
    const middle = populationDensityColor(Math.sqrt(steps[1].perKm2 * steps[2].perKm2), steps);
    const low = populationDensityColor(steps[1].perKm2, steps);
    const high = populationDensityColor(steps[2].perKm2, steps);
    middle.forEach((part, i) => expect(part).toBeCloseTo((low[i] + high[i]) / 2, 6));
  });

  it('colors every province by how densely it is peopled', () => {
    const table = provinceBaseColors(
      'population',
      world,
      data.mapView.colors,
      state.provinceOwner,
      population.provincePopulation,
    );
    const colorOf = (id: string) => [...table.subarray(province(id) * 4, province(id) * 4 + 3)];
    const brightness = (id: string) => colorOf(id).reduce((sum, part) => sum + part, 0);
    // Dense places are darker than empty ones on this scale.
    expect(brightness('deu_berlin')).toBeLessThan(brightness('deu_bavaria'));
    expect(brightness('deu_bavaria')).toBeLessThan(brightness('usa_wyoming'));
    expect(hex(colorOf('bra_brazilian_island'))).toBe(steps[0].color);
    // Without the population (before the sim's first answer) the land is plain.
    const plain = provinceBaseColors('population', world, data.mapView.colors, state.provinceOwner);
    expect([...plain]).toEqual([
      ...provinceBaseColors('provinces', world, data.mapView.colors, state.provinceOwner),
    ]);
  });
});

describe('numbers for the population tables', () => {
  it('formats people and money in short form', () => {
    expect(formatPeopleShort(1_463_865_525)).toBe('1.46B');
    expect(formatPeopleShort(83_491_249)).toBe('83.5M');
    expect(formatPeopleShort(365_400)).toBe('365k');
    expect(formatPeopleShort(9_412)).toBe('9,412');
    expect(formatMoneyShort(1_234_567)).toBe('$1.23M');
    expect(formatMoneyShort(64_700)).toBe('$64.7k');
    expect(formatMoneyShort(518.4)).toBe('$518');
  });

  it('formats shares and densities', () => {
    expect(formatPercent(0.0371)).toBe('3.7 %');
    expect(formatPercent(1, 0)).toBe('100 %');
    expect(formatPercent(0.5234, 0)).toBe('52 %');
    expect(formatDensity(4123.4)).toBe('4,123 per km²');
    expect(formatDensity(237.2)).toBe('237 per km²');
    expect(formatDensity(3.44)).toBe('3.4 per km²');
    expect(formatDensity(0.031)).toBe('0.031 per km²');
  });
});
