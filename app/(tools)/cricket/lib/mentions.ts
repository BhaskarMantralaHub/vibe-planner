/* ── Shared mention/tag parsing utilities ── */

import type { CricketPlayer } from '@/types/cricket';

/**
 * Extract @mentions from text and resolve to player IDs.
 * Supports @all / @everyone to tag all active players.
 */
export function extractTaggedIds(text: string, players: CricketPlayer[]): string[] {
  const mentions = text.match(/@[\w\s]+/g);
  if (!mentions) return [];
  const ids: string[] = [];
  for (const mention of mentions) {
    const name = mention.slice(1).trim().toLowerCase();
    if (name === 'all' || name === 'everyone') {
      return players.filter((p) => p.is_active).map((p) => p.id);
    }
    const player = players.find((p) => p.is_active && p.name.toLowerCase() === name);
    if (player && !ids.includes(player.id)) ids.push(player.id);
  }
  return ids;
}
