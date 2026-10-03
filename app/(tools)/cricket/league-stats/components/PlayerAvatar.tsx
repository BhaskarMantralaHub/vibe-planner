import type { JSX } from 'react';

export type PlayerAvatarProps = {
  name: string;
  photoUrl?: string | null;
  size?: 24 | 32 | 40 | 48 | 64 | 80;
  className?: string;
  ringColor?: string;
};

const SIZE_CLASS: Record<NonNullable<PlayerAvatarProps['size']>, string> = {
  24: 'h-6 w-6',
  32: 'h-8 w-8',
  40: 'h-10 w-10',
  48: 'h-12 w-12',
  64: 'h-16 w-16',
  80: 'h-20 w-20',
};

const FONT_PX: Record<NonNullable<PlayerAvatarProps['size']>, number> = {
  24: 9,
  32: 11,
  40: 13,
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
  // Neutral monogram, like every other avatar in the app — a colour per name
  // read as a rainbow and implied meaning that wasn't there.
  return (
    <div
      aria-hidden="true"
      className={`${rootClass} flex items-center justify-center font-semibold text-[var(--text)] tracking-tight`}
      style={{
        background: 'var(--fill)',
        fontSize: `${FONT_PX[size]}px`,
        ...ringStyle,
      }}
    >
      {initials}
    </div>
  );
}
