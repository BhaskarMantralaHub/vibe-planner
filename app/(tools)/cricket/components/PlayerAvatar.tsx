'use client';

import { nameToGradient } from '@/lib/avatar';
import type { CricketPlayer } from '@/types/cricket';

/**
 * Player avatar: their photo when we have one, otherwise initials on the
 * deterministic per-name gradient the rest of the app uses, so the same person
 * is the same colour everywhere.
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
  const [from, to] = nameToGradient(name);
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
          className="flex h-full w-full items-center justify-center rounded-full font-extrabold text-white"
          style={{ fontSize: size * 0.34, background: `linear-gradient(135deg, ${from}, ${to})` }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}
