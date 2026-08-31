import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SummaryStats } from '@/app/(tools)/cricket/page';

/**
 * The four dashboard stat tiles became navigation. These cover the parts that
 * are easy to get wrong and invisible in a build:
 *
 *  • the accessible name must carry the SETTLED figure, not the animated one —
 *    the counter re-renders ~60 times in 600ms, and a name bound to it would
 *    have a screen reader reading a number mid-count;
 *  • every tile stays a button on every view, because a control that is
 *    sometimes a control is the shifting-target problem that got the bottom nav
 *    rebuilt;
 *  • tapping the tile you are already on must not fire navigation.
 */

const BASE = {
  totalSpent: 500,
  poolBalance: 152,
  playerCount: 19,
  feesPaid: 8,
  feesTotal: 19,
};

const scrollTo = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no scrollTo; the current-tile tap calls it.
  Object.defineProperty(window, 'scrollTo', { value: scrollTo, writable: true });
});

describe('SummaryStats', () => {
  it('renders all four tiles as buttons on every view it appears on', () => {
    // These are the only three views that render this bar. On `sponsors` none
    // of the four tiles is the current one, which is exactly why the
    // "disable the current tile" approach was rejected — the number of live
    // buttons would change as you navigate.
    for (const view of ['players', 'fees', 'sponsors'] as const) {
      const { unmount } = render(
        <SummaryStats {...BASE} activeView={view} onNavigate={vi.fn()} />,
      );
      expect(screen.getAllByRole('button')).toHaveLength(4);
      unmount();
    }
  });

  it('names each tile with its settled value and destination', () => {
    render(<SummaryStats {...BASE} activeView="sponsors" onNavigate={vi.fn()} />);

    // Asserted as exact accessible names, not substrings: a substring match on
    // "Fees Paid" would also pass if the value were missing entirely.
    expect(screen.getByRole('button', { name: 'Total Spent, $500.00. Go to expenses.' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fees Paid, 8 of 19. Go to season fees.' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pool Balance, $152.00. Go to expenses.' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Players, 19. Go to the roster.' })).toBeTruthy();
  });

  it('uses the settled figure in the name even while the counter animates', () => {
    // The visible text starts at 0 and counts up. The name must not.
    render(<SummaryStats {...BASE} activeView="sponsors" onNavigate={vi.fn()} />);
    const tile = screen.getByRole('button', { name: /^Total Spent/ });
    expect(tile.getAttribute('aria-label')).toContain('$500.00');
    // And the animating number is hidden from the tree, so the figure is not
    // announced twice.
    expect(tile.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('navigates to the view behind the number', async () => {
    const onNavigate = vi.fn();
    render(<SummaryStats {...BASE} activeView="players" onNavigate={onNavigate} />);

    await userEvent.click(screen.getByRole('button', { name: /^Total Spent/ }));
    expect(onNavigate).toHaveBeenCalledWith('expenses');

    await userEvent.click(screen.getByRole('button', { name: /^Fees Paid/ }));
    expect(onNavigate).toHaveBeenCalledWith('fees');

    // Pool Balance shares the Expenses destination with Total Spent on purpose:
    // it is the same ledger, and that is where the balance is shown adding up.
    await userEvent.click(screen.getByRole('button', { name: /^Pool Balance/ }));
    expect(onNavigate).toHaveBeenCalledWith('expenses');
  });

  it('marks the current tile and scrolls to top instead of navigating', async () => {
    const onNavigate = vi.fn();
    render(<SummaryStats {...BASE} activeView="fees" onNavigate={onNavigate} />);

    const current = screen.getByRole('button', { name: 'Fees Paid, 8 of 19. Currently showing.' });
    expect(current.getAttribute('aria-current')).toBe('true');

    await userEvent.click(current);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalled();
  });

  it('marks exactly one tile current, and none on a view with no matching tile', () => {
    const { unmount } = render(
      <SummaryStats {...BASE} activeView="players" onNavigate={vi.fn()} />,
    );
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'true'))
      .toHaveLength(1);
    unmount();

    render(<SummaryStats {...BASE} activeView="sponsors" onNavigate={vi.fn()} />);
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'true'))
      .toHaveLength(0);
  });

  it('speaks a negative pool balance as words, not a minus glyph', () => {
    // A leading "-" is read as "hyphen" by some screen readers and dropped
    // entirely by others, either of which turns a deficit into a surplus. The
    // visible tile keeps the glyph; the accessible name says "short".
    render(
      <SummaryStats {...BASE} poolBalance={-152} activeView="sponsors" onNavigate={vi.fn()} />,
    );
    const tile = screen.getByRole('button', { name: /^Pool Balance/ });
    expect(tile.getAttribute('aria-label')).toBe('Pool Balance, $152.00 short. Go to expenses.');
  });

  it('is operable by keyboard', async () => {
    // This is the test that fails if someone ever reverts these to
    // <div onClick>: a div takes no focus and Enter does nothing on it.
    const onNavigate = vi.fn();
    render(<SummaryStats {...BASE} activeView="players" onNavigate={onNavigate} />);

    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Total Spent/ }));

    await user.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledWith('expenses');
  });

  it('uses aria-current="true", not "page"', () => {
    // These switch an in-page view; they do not navigate to a page. Matches
    // SeasonSelector. A change to "page" would be a semantic regression.
    render(<SummaryStats {...BASE} activeView="players" onNavigate={vi.fn()} />);
    const current = screen.getByRole('button', { name: /^Players/ });
    expect(current.getAttribute('aria-current')).toBe('true');
  });
});
