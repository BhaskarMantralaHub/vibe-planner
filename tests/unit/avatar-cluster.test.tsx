import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AvatarCluster } from '@/components/ui/avatar-cluster';

/**
 * AvatarCluster is a presentational summary of a group (the squad strip on
 * the cricket home). The behaviours worth pinning are the summary rules:
 *
 *  • At most `max` faces render; everyone else collapses into ONE "+N"
 *    disc — never a second row, never one disc per person.
 *  • People without a photo get their initials, matching PlayerAvatar, so
 *    a person looks the same in the cluster as everywhere else.
 *  • An empty group renders nothing at all (call sites shouldn't have to
 *    guard the zero case twice).
 */

afterEach(cleanup);

const people = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `Player ${i + 1}` }));

describe('AvatarCluster', () => {
  it('renders every face and no overflow disc when the group fits', () => {
    render(<AvatarCluster people={people(3)} />);
    expect(screen.getByTitle('Player 1')).toBeTruthy();
    expect(screen.getByTitle('Player 3')).toBeTruthy();
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });

  it('caps the faces at max and folds the rest into a single +N disc', () => {
    render(<AvatarCluster people={people(19)} max={5} />);
    expect(screen.getByTitle('Player 5')).toBeTruthy();
    expect(screen.queryByTitle('Player 6')).toBeNull();
    expect(screen.getByText('+14')).toBeTruthy();
  });

  it('falls back to initials when there is no photo', () => {
    render(<AvatarCluster people={[{ name: 'Bhaskar Mantrala' }]} />);
    expect(screen.getByText('BM')).toBeTruthy();
  });

  it('renders the photo when one is present', () => {
    const { container } = render(
      <AvatarCluster people={[{ name: 'Photo Player', photoUrl: 'https://example.com/p.jpg' }]} />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/p.jpg');
    expect(screen.queryByText('PP')).toBeNull();
  });

  it('renders nothing for an empty group', () => {
    const { container } = render(<AvatarCluster people={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
