'use client';

import type { CSSProperties } from 'react';

/**
 * AvatarCluster — a row of overlapping face discs with a "+N" overflow
 * disc, for showing a group of people at a glance (a season squad, the
 * participants on a split) where a full list would take a row each.
 *
 * Faces follow the app's one avatar treatment (see PlayerAvatar): the
 * person's photo when there is one, otherwise initials on a neutral
 * var(--fill) disc. No per-name colours — colour in this app is reserved
 * for actions and status. Each disc carries a ring in the surface colour
 * behind the cluster so overlaps read as separate people, not a smear.
 *
 * Purely presentational: wrap it in a button/link at the call site when
 * the group should be tappable, and give that wrapper the aria-label —
 * the cluster itself stays out of the accessibility tree's way.
 */

export interface AvatarClusterPerson {
  name: string;
  photoUrl?: string | null;
}

export interface AvatarClusterProps {
  people: AvatarClusterPerson[];
  /** Faces shown before the overflow disc. Default 5. */
  max?: number;
  /** Disc diameter in px. Default 28. */
  size?: number;
  /** Ring colour separating the discs — match the surface behind the cluster. Default var(--bg). */
  ringColor?: string;
  className?: string;
  style?: CSSProperties;
}

function initialsOf(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export function AvatarCluster({
  people,
  max = 5,
  size = 28,
  ringColor = 'var(--bg)',
  className,
  style,
}: AvatarClusterProps) {
  if (people.length === 0) return null;

  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;
  // Overlap only the discs' edges (~20%): enough for the stacked look, but
  // the covered strip stays inside the initials' side margins, so a
  // two-letter monogram is never clipped by the next disc.
  const overlap = Math.max(4, Math.round(size * 0.2));

  const discStyle = (index: number): CSSProperties => ({
    height: size,
    width: size,
    marginLeft: index === 0 ? 0 : -overlap,
    zIndex: shown.length - index,
    boxShadow: `0 0 0 2px ${ringColor}`,
    flexShrink: 0,
  });

  return (
    <div className={`flex items-center ${className ?? ''}`} style={style} aria-hidden="true">
      {shown.map((person, i) => (
        <div key={`${person.name}-${i}`} className="relative rounded-full" style={discStyle(i)} title={person.name}>
          {person.photoUrl ? (
            <img
              src={person.photoUrl}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center rounded-full font-semibold text-[var(--text)]"
              style={{ fontSize: size * 0.36, background: 'var(--fill)' }}
            >
              {initialsOf(person.name)}
            </div>
          )}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="relative rounded-full"
          style={{ ...discStyle(shown.length), zIndex: 0 }}
          title={people.slice(max).map((p) => p.name).join(', ')}
        >
          <div
            className="flex h-full w-full items-center justify-center rounded-full font-semibold"
            style={{ fontSize: size * 0.34, background: 'var(--fill)', color: 'var(--muted)' }}
          >
            +{overflow}
          </div>
        </div>
      )}
    </div>
  );
}
