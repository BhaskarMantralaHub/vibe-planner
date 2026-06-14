import type { JSX } from 'react';

export type PlayerAvatarProps = {
  name: string;
  photoUrl?: string | null;
  size?: 32 | 48 | 64 | 80;
  className?: string;
  ringColor?: string;
};

/* Mirrors hashHue() in app/(tools)/cricket/components/MatchSchedule.tsx so player
   monograms share the same hash-to-hue visual language as opponent team avatars.
   Replicated inline (not imported) to keep this component decoupled. */
function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h) % 360;
}

const SIZE_CLASS: Record<NonNullable<PlayerAvatarProps['size']>, string> = {
  32: 'h-8 w-8',
  48: 'h-12 w-12',
  64: 'h-16 w-16',
  80: 'h-20 w-20',
};

const FONT_PX: Record<NonNullable<PlayerAvatarProps['size']>, number> = {
  32: 11,
  48: 14,
  64: 18,
  80: 22,
};

export default function PlayerAvatar({
  name,
  photoUrl,
  size = 48,
  className,
  ringColor,
}: PlayerAvatarProps): JSX.Element {
  const dim = SIZE_CLASS[size];
  const rootClass = `${dim} rounded-full flex-shrink-0 ${className ?? ''}`.trim();
  const ringStyle = ringColor ? { boxShadow: `0 0 0 2px ${ringColor}` } : undefined;

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        aria-hidden="true"
        className={`${rootClass} object-cover`}
        style={{ background: 'var(--surface)', ...ringStyle }}
      />
    );
  }

  const initials =
    name
      .replace(/^MTCA\s+/i, '')
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  const hue = hashHue(name);

  return (
    <div
      aria-hidden="true"
      className={`${rootClass} flex items-center justify-center font-bold text-white tracking-tight`}
      style={{
        background: `hsl(${hue}, 55%, 42%)`,
        fontSize: `${FONT_PX[size]}px`,
        ...ringStyle,
      }}
    >
      {initials}
    </div>
  );
}
