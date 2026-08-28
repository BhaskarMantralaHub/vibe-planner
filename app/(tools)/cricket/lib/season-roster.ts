import type { CricketPlayer, CricketSeasonPlayer } from '@/types/cricket';

/**
 * Who counts as being on a season's roster.
 *
 * ONE function, used by every screen that asks the question, because the
 * alternative is each screen inventing its own filter and the dues page
 * disagreeing with the umpiring board on the same screen-load. That is the
 * worst failure mode available here: not a wrong number, but two numbers.
 *
 * ── The fallback is load-bearing ────────────────────────────────────────────
 * When a season has NO roster rows at all, this returns the team-wide list
 * instead of an empty one. Three reasons:
 *
 *  1. It makes the migration reversible screen by screen. A season nobody has
 *     seeded yet renders exactly today's numbers rather than going blank, so
 *     each commit can land on its own.
 *  2. Local (non-cloud) mode has no roster at all — `LocalData` carries only
 *     players/seasons/expenses/splits/settlements.
 *  3. A brand-new season created through `addSeason` starts with zero roster
 *     rows, and showing an admin a blank dues page with no explanation is
 *     worse than showing them everyone.
 *
 * The trade-off is deliberate and worth stating plainly: an un-seeded season
 * silently bills the whole team. That is the SAME behaviour as today, so it
 * cannot be a regression — but it is why `PlayerManager` must be able to seed a
 * roster before any of this is relied on for money.
 */

/** Season-level guest info the caller needs, keyed by player id. */
export interface SeasonRoster {
  players: CricketPlayer[];
  /** Season-level guest flag — NOT `CricketPlayer.is_guest`, which is the
   *  record-level "walk-in stub" fact. A person can guest one season and be a
   *  regular the next. */
  isGuest: (playerId: string) => boolean;
  /** True when this came from the team-wide fallback rather than a real roster. */
  isFallback: boolean;
}

export function seasonRoster(
  players: CricketPlayer[],
  seasonPlayers: CricketSeasonPlayer[],
  seasonId: string | null,
): SeasonRoster {
  const rows = seasonId
    // `left_at` set means they departed partway through: they keep their place
    // in the season's history (fees paid, duties stood) but drop out of the
    // current roster, so they are excluded here.
    ? seasonPlayers.filter((sp) => sp.season_id === seasonId && sp.left_at === null)
    : [];

  if (rows.length === 0) {
    const teamWide = players.filter((p) => p.is_active);
    return {
      players: teamWide,
      isGuest: (id) => teamWide.find((p) => p.id === id)?.is_guest ?? false,
      isFallback: true,
    };
  }

  const guestById = new Map(rows.map((sp) => [sp.player_id, sp.is_guest]));
  const byId = new Map(players.map((p) => [p.id, p]));
  const rostered = rows
    .map((sp) => byId.get(sp.player_id))
    // A roster row whose player row is missing (mid-load, or a player removed
    // from another device) is skipped rather than rendered as a blank.
    .filter((p): p is CricketPlayer => p !== undefined)
    // is_active still applies: it means "associated with the club at all", so a
    // deactivated player is off every current roster even where a row survives.
    .filter((p) => p.is_active);

  return {
    players: rostered,
    isGuest: (id) => guestById.get(id) ?? false,
    isFallback: false,
  };
}

/**
 * The subset that counts toward money and duty targets: on the roster, and not
 * a guest of THIS season. Guests play but are not billed a season fee and are
 * not required to stand as umpire.
 */
export function billableRoster(roster: SeasonRoster): CricketPlayer[] {
  return roster.players.filter((p) => !roster.isGuest(p.id));
}
