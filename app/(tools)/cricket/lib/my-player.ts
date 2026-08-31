import type { CricketPlayer } from '@/types/cricket';

/**
 * Which player record belongs to the person holding the phone.
 *
 * Resolves by `user_id` OR confirmed email, in that order — the same rule the
 * umpiring RPCs use (see docs/umpiring-schema.sql). Both legs are needed:
 *
 *  • user_id alone locks real players out. Only ~16 of 18 players have one,
 *    because the column is stamped by a trigger on signup and predates several
 *    of the roster rows.
 *  • email alone breaks for anyone who changed their address after joining.
 *
 * The app resolves this question in eight-plus places already, each with its own
 * slightly different predicate — PlayerManager and GalleryUpload match on email
 * only, GalleryPost matches on either. This is the shared version; FeeTracker
 * uses it, and the others can move over one at a time.
 *
 * Email comparison is case-insensitive and trimmed, matching the DB trigger and
 * AuthGate. Returns null rather than throwing: a viewer with no player record is
 * a normal state (an admin who does not play), and the caller should simply not
 * render a personal card.
 */
export function myCricketPlayer(
  players: CricketPlayer[],
  viewer: { id?: string | null; email?: string | null } | null | undefined,
): CricketPlayer | null {
  if (!viewer) return null;

  const active = players.filter((p) => p.is_active);

  // user_id first — it is the exact fact, and immune to an email change.
  if (viewer.id) {
    const byId = active.find((p) => p.user_id === viewer.id);
    if (byId) return byId;
  }

  const email = viewer.email?.toLowerCase().trim();
  if (!email) return null;
  return active.find((p) => p.email?.toLowerCase().trim() === email) ?? null;
}
