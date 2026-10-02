'use client';

import type { CricketPlayer } from '@/types/cricket';

/**
 * Player avatar: their photo when we have one, otherwise initials on a neutral
 * gray disc — the same treatment as the Roster, so a person looks the same on
 * every tab. (Per-name rainbow gradients were dropped 2026-10: colour in this
 * app is reserved for actions and status, and a wall of pink/green/purple
 * bubbles read as decoration.)
 *
 * Shared between the umpiring roster grid and the per-player duty sheet, which
 * sit one tap apart — the same person MUST look identical across that tap or
 * the sheet reads as being about somebody else.
 *
 * `ringColor` is optional and carries duty status when there is one to carry.
 */
export default function PlayerAvatar({
  player, name, ringColor, size = 34,
}: {
  player?: CricketPlayer | undefined;
  name: string;
  ringColor?: string;
  size?: number;
}) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className="relative shrink-0 rounded-full"
      style={{
        height: size,
        width: size,
        ...(ringColor
          ? { boxShadow: `0 0 0 2px color-mix(in srgb, ${ringColor} 55%, transparent)` }
          : {}),
      }}
    >
      {player?.photo_url ? (
        <img
          src={player.photo_url}
          alt={name}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-[var(--text)]"
          style={{ fontSize: size * 0.36, background: 'var(--fill)' }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}
