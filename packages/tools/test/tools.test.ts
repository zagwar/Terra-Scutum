import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataValidationError, formatDataIssue } from '@terra-scutum/sim';
import { afterEach, describe, expect, it } from 'vitest';
import { DATA_DIR, checkLocale, loadGameDataFromDisk } from '../src';

describe('loading game data from disk', () => {
  const tempDirs: string[] = [];
  const tempDataDir = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), 'terra-scutum-data-'));
    tempDirs.push(dir);
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    return dir;
  };
  const issuesOf = (dir: string) => {
    try {
      loadGameDataFromDisk(dir);
    } catch (error) {
      if (error instanceof DataValidationError) return error.issues.map(formatDataIssue);
      throw error;
    }
    throw new Error('expected a DataValidationError');
  };
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('the real data/ folder is valid', () => {
    expect(loadGameDataFromDisk().gameConfig.startDate).toEqual({ year: 2025, month: 1, day: 1 });
  });

  it('reports missing files, broken JSON and files the game does not know', () => {
    expect(issuesOf(tempDataDir({}))).toEqual([
      'data/game_config.json: file is missing',
      'data/countries.json: file is missing',
      'data/provinces.json: file is missing',
      'data/regions.json: file is missing',
      'data/sea_zones.json: file is missing',
      'data/map_view.json: file is missing',
    ]);
    const realCopy = (extra: Record<string, string>) => {
      const dir = tempDataDir(extra);
      for (const file of readdirSync(DATA_DIR)) {
        if (file.endsWith('.json') && !(file in extra))
          copyFileSync(join(DATA_DIR, file), join(dir, file));
      }
      return dir;
    };
    expect(issuesOf(realCopy({ 'game_config.json': '{ "startDate": ' }))[0]).toContain(
      'data/game_config.json: not valid JSON',
    );
    const stray = issuesOf(realCopy({ 'provinces_old.json': '[]' }));
    expect(stray).toHaveLength(1);
    expect(stray[0]).toContain('data/provinces_old.json');
  });
});

describe('locale check', () => {
  it('accepts a flat list of KEY: text pairs with {placeholders}', () => {
    expect(
      checkLocale({ GAME_TITLE: 'Terra Scutum', DATE_FORMAT: '{day} {month} {year}' }),
    ).toEqual([]);
  });

  it('reports bad keys, empty or non-text values and broken placeholders', () => {
    expect(checkLocale(['a'])).toHaveLength(1);
    const problems = checkLocale({
      gameTitle: 'x',
      EMPTY: ' ',
      NUMBER: 3,
      BROKEN: 'Day {day of {month}',
      NESTED: { A: 'b' },
    });
    expect(problems).toHaveLength(5);
  });
});
