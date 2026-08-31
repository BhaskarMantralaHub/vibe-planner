import { describe, it, expect } from 'vitest';
import { myCricketPlayer } from '@/app/(tools)/cricket/lib/my-player';
import type { CricketPlayer } from '@/types/cricket';

let n = 0;
const player = (over: Partial<CricketPlayer> = {}): CricketPlayer => ({
  id: `p-${++n}`,
  team_id: 'team-1',
  user_id: null,
  name: `Player ${n}`,
  email: null,
  phone: null,
  jersey_number: null,
  photo_url: null,
  is_active: true,
  is_guest: false,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
} as CricketPlayer);

describe('myCricketPlayer', () => {
  it('matches on user_id first', () => {
    const mine = player({ user_id: 'u-1', email: 'old@example.com' });
    const other = player({ email: 'new@example.com' });
    const found = myCricketPlayer([other, mine], { id: 'u-1', email: 'new@example.com' });
    // user_id wins even though the email points at a different row — the id is
    // the exact fact and survives an address change.
    expect(found?.id).toBe(mine.id);
  });

  it('falls back to email when the row has no user_id', () => {
    // ~2 of 18 real players have no user_id, so a user_id-only lookup would
    // lock them out of their own fee card.
    const mine = player({ user_id: null, email: 'Me@Example.com' });
    const found = myCricketPlayer([player(), mine], { id: 'u-9', email: 'me@example.com' });
    expect(found?.id).toBe(mine.id);
  });

  it('compares email case-insensitively and trimmed', () => {
    const mine = player({ email: '  ME@example.COM ' });
    expect(myCricketPlayer([mine], { email: 'me@example.com' })?.id).toBe(mine.id);
  });

  it('ignores deactivated players', () => {
    // A removed player must not get a fee card back.
    const gone = player({ email: 'me@example.com', is_active: false });
    expect(myCricketPlayer([gone], { email: 'me@example.com' })).toBeNull();
  });

  it('returns null for a viewer with no player record', () => {
    // Normal state, not an error: an admin who does not play. The caller just
    // renders no personal card.
    expect(myCricketPlayer([player({ email: 'someone@example.com' })], { email: 'admin@example.com' }))
      .toBeNull();
    expect(myCricketPlayer([player()], null)).toBeNull();
    expect(myCricketPlayer([player()], { id: null, email: null })).toBeNull();
  });
});
