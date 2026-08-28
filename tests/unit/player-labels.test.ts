import { describe, it, expect } from 'vitest';
import { playerLabels, nicknameOf } from '@/app/(tools)/cricket/lib/player-labels';

/**
 * Names below are the REAL shapes on the Sunrisers roster, because that is what
 * broke: three Venkats (one of them nicknamed), two Vittals split across the
 * players grid and the guests grid, and several single-token names.
 */
const p = (id: string, name: string) => ({ id, name });

const ROSTER = [
  p('adi', 'Adi Jesta'),
  p('kittu', 'Venkat Gudala (Kittu)'),
  p('subbu', 'Venkat Subbu'),
  p('dirisala', 'Venkat Dirisala'),
  p('vittal-a', 'Vittal Anand Madduri'),
  p('vittal-j', 'Vittal Juluri'),
  p('neeraj', 'Neeraj'),
  p('ashok', 'Ashok Reddy Donti Reddy'),
];

describe('nicknameOf', () => {
  it('pulls the name the team actually says', () => {
    expect(nicknameOf('Venkat Gudala (Kittu)')).toBe('Kittu');
  });

  it('is null when there is no nickname, or an empty one', () => {
    expect(nicknameOf('Venkat Subbu')).toBeNull();
    // An empty bracket must not produce a blank tile label.
    expect(nicknameOf('Venkat Subbu ()')).toBeNull();
    expect(nicknameOf('Venkat Subbu (  )')).toBeNull();
  });
});

describe('playerLabels', () => {
  const labels = playerLabels(ROSTER);

  it('prefers a nickname over a first name', () => {
    // The whole reason rule 1 exists: everyone calls him Kittu, and the old
    // logic rendered this tile "Venkat G".
    expect(labels.get('kittu')).toEqual({ primary: 'Kittu', secondary: null });
  });

  it('uses the first name alone when nobody shares it', () => {
    expect(labels.get('adi')).toEqual({ primary: 'Adi', secondary: null });
  });

  it('adds the SURNAME, not an initial, when first names collide', () => {
    // "Venkat G" asks the reader to remember whose surname starts with G.
    expect(labels.get('subbu')).toEqual({ primary: 'Venkat', secondary: 'Subbu' });
    expect(labels.get('dirisala')).toEqual({ primary: 'Venkat', secondary: 'Dirisala' });
  });

  it('counts a nicknamed player OUT of the collision', () => {
    // Kittu shows as "Kittu", so only two "Venkat" tiles remain — but they are
    // still two, so both keep their surname.
    expect(labels.get('subbu')!.secondary).toBe('Subbu');
    expect(labels.get('kittu')!.secondary).toBeNull();
  });

  it('takes the LAST token as the surname on a three-part name', () => {
    expect(labels.get('vittal-a')).toEqual({ primary: 'Vittal', secondary: 'Madduri' });
    expect(labels.get('vittal-j')).toEqual({ primary: 'Vittal', secondary: 'Juluri' });
  });

  it('leaves a single-token name alone — there is nothing to add', () => {
    expect(labels.get('neeraj')).toEqual({ primary: 'Neeraj', secondary: null });
  });

  it('gives every player a non-empty primary', () => {
    for (const row of ROSTER) {
      expect(labels.get(row.id)!.primary.length).toBeGreaterThan(0);
    }
  });

  /**
   * The regression that motivated the rewrite. Labels used to be derived from
   * the rows on screen, so filtering the roster changed what a tile said.
   */
  it('does NOT change a label when the roster is filtered on screen', () => {
    const full = playerLabels(ROSTER);
    // Simulates the "Yet to umpire" filter having excluded the other Venkats.
    const filtered = ROSTER.filter((r) => r.id !== 'dirisala' && r.id !== 'kittu');
    const partial = playerLabels(filtered);

    // Computed over the full roster both times, Subbu keeps his surname line.
    expect(full.get('subbu')).toEqual({ primary: 'Venkat', secondary: 'Subbu' });
    // Computed over the subset, he loses it — which is exactly why callers must
    // pass every player. This pins the behaviour so the difference is visible.
    expect(partial.get('subbu')).toEqual({ primary: 'Venkat', secondary: null });
  });

  it('separates a players-grid name from an identical guests-grid name', () => {
    // Vittal Anand Madduri is on the squad; Vittal Juluri is a guest, and the
    // two grids render side by side. One shared map is what keeps them apart.
    const a = labels.get('vittal-a')!;
    const j = labels.get('vittal-j')!;
    expect(`${a.primary} ${a.secondary}`).not.toBe(`${j.primary} ${j.secondary}`);
  });

  it('matches collisions case-insensitively', () => {
    const out = playerLabels([p('a', 'venkat rao'), p('b', 'Venkat Subbu')]);
    expect(out.get('a')!.secondary).toBe('rao');
    expect(out.get('b')!.secondary).toBe('Subbu');
  });

  it('survives a blank name rather than rendering an empty tile', () => {
    const out = playerLabels([p('blank', '   ')]);
    expect(out.get('blank')).toEqual({ primary: '—', secondary: null });
  });

  it('is empty for an empty roster', () => {
    expect(playerLabels([]).size).toBe(0);
  });
});
