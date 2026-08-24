import { describe, it, expect } from 'vitest';
import {
  extractRunOutFielders,
  compareCatchesRows,
  type CatchesRow,
} from '@/app/(tools)/cricket/league-stats/lib/computeStats';

describe('extractRunOutFielders', () => {
  it('extracts the fielder from a direct run-out', () => {
    expect(extractRunOutFielders('run out (Bhaskar B)')).toEqual(['Bhaskar B']);
  });

  it('extracts BOTH fielders from a combined run-out', () => {
    expect(extractRunOutFielders('run out (Bhaskar B/Sai K)')).toEqual(['Bhaskar B', 'Sai K']);
  });

  it('trims whitespace around the slash', () => {
    expect(extractRunOutFielders('run out (Vivek P / Adi J)')).toEqual(['Vivek P', 'Adi J']);
  });

  it('strips the wicketkeeper dagger marker', () => {
    expect(extractRunOutFielders('run out (†Inique F)')).toEqual(['Inique F']);
  });

  it('handles the older no-parens format', () => {
    expect(extractRunOutFielders('run out Madhu G')).toEqual(['Madhu G']);
  });

  it('is case-insensitive on the run out prefix', () => {
    expect(extractRunOutFielders('Run Out (Fayaz S)')).toEqual(['Fayaz S']);
  });

  it('returns [] for a bare run-out with no fielder named', () => {
    expect(extractRunOutFielders('run out')).toEqual([]);
  });

  it('returns [] for non-run-out dismissals', () => {
    expect(extractRunOutFielders('c Bhaskar B b Sai K')).toEqual([]);
    expect(extractRunOutFielders('b Sai K')).toEqual([]);
    expect(extractRunOutFielders('lbw b Sai K')).toEqual([]);
    expect(extractRunOutFielders('st †Inique F b Sai K')).toEqual([]);
  });

  it('does not misread a caught dismissal whose fielder name contains "run"', () => {
    // "run out" must anchor at the START of the dismissal text.
    expect(extractRunOutFielders('c Arun O b Sai K')).toEqual([]);
  });
});

describe('compareCatchesRows with run-outs', () => {
  const row = (name: string, catches: number, runouts: number): CatchesRow => ({
    player_id: name,
    player_name: name,
    catches,
    runouts,
  });

  it('sorts by catches first', () => {
    expect(compareCatchesRows(row('A', 3, 0), row('B', 5, 4))).toBeGreaterThan(0);
  });

  it('breaks catch ties by run-outs', () => {
    expect(compareCatchesRows(row('A', 3, 2), row('B', 3, 1))).toBeLessThan(0);
  });

  it('falls back to alphabetical when both tie', () => {
    expect(compareCatchesRows(row('A', 3, 1), row('B', 3, 1))).toBeLessThan(0);
  });
});
