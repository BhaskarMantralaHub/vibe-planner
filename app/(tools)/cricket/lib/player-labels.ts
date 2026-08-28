/**
 * Short display labels for a grid of players.
 *
 * A tile in the roster grid has room for roughly one short word, so the label
 * has to be shortened — but a shortened label is only useful if it still points
 * at exactly one person. This module decides how.
 *
 * Three rules, applied in order:
 *
 *  1. A parenthesised nickname WINS outright. The roster stores
 *     "Venkat Gudala (Kittu)" and the team says "Kittu". Rendering that tile as
 *     "Venkat G" throws away the one word everybody recognises and replaces it
 *     with one nobody uses.
 *  2. Otherwise the first name, when nobody else shares it.
 *  3. Otherwise first name PLUS surname, the surname on its own dim line.
 *     "Venkat / Gudala" needs no decoding; "Venkat G" asks the reader to
 *     remember which Venkat has a G in his surname.
 *
 * Collisions are counted over EVERY player handed in, never over whatever
 * subset is currently on screen. That is the part that is easy to get wrong and
 * it caused two real bugs:
 *   • counting per-view made a person's label CHANGE when you switched roster
 *     filters — "Venkat G" under Everyone, plain "Venkat" under Yet to umpire,
 *     because the other Venkat had dropped out of the filtered list;
 *   • the guests grid built its own separate count, so it could render a second
 *     tile reading "Vittal" for a different Vittal on the same screen.
 */

/** Only the fields labelling needs — keeps this pure and trivially testable. */
export interface LabelledPlayer {
  id: string;
  name: string;
}

export interface PlayerLabel {
  /** The word shown large: a nickname, or a first name. Never empty. */
  primary: string;
  /** Surname, shown dim underneath, ONLY when `primary` alone is ambiguous. */
  secondary: string | null;
}

/** "Venkat Gudala (Kittu)" → "Kittu". The name the team actually says out loud. */
export function nicknameOf(name: string): string | null {
  const inner = name.match(/\(([^)]*)\)/)?.[1]?.trim();
  return inner ? inner : null;
}

/** The name with any parenthesised nickname stripped: → "Venkat Gudala". */
function withoutNickname(name: string): string {
  return name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

export function playerLabels(players: LabelledPlayer[]): Map<string, PlayerLabel> {
  const candidates = new Map<string, { primary: string; surname: string | null }>();

  for (const p of players) {
    const parts = withoutNickname(p.name).split(' ').filter(Boolean);
    // Fall back through nickname → first name → the raw string, so a row with a
    // blank or punctuation-only name still gets something renderable.
    const primary = nicknameOf(p.name) ?? parts[0] ?? p.name.trim() ?? '';
    // Last token is the surname. A single-token name ("Neeraj") has no second
    // token to fall back on, so it simply stays ambiguous — better than
    // inventing an initial from the only word we have.
    const surname = parts.length > 1 ? parts[parts.length - 1]! : null;
    candidates.set(p.id, { primary: primary || '—', surname });
  }

  // Case-insensitive: "kittu" and "Kittu" are the same person to a reader.
  const counts = new Map<string, number>();
  for (const c of candidates.values()) {
    const key = c.primary.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const out = new Map<string, PlayerLabel>();
  for (const [id, c] of candidates) {
    // Two people sharing BOTH first name and surname would still collide here.
    // Nothing shorter would separate them either, which is why every tile is
    // tappable — the sheet behind it shows the full stored name.
    const ambiguous = (counts.get(c.primary.toLowerCase()) ?? 0) > 1;
    out.set(id, { primary: c.primary, secondary: ambiguous ? c.surname : null });
  }
  return out;
}
