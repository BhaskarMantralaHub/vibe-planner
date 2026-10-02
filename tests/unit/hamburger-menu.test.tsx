import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/* ── Mocks ── */

let mockPathname = '/cricket/umpiring/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

const mockAuthState = {
  userAccess: ['cricket'],
  userFeatures: ['cricket'],
  userTeams: [{ team_id: 't1', team_name: 'Sunrisers Manteca', approved: true, role: 'player' }],
  currentTeamId: 't1',
  user: null,
  isCloud: false,
  logout: vi.fn(),
};
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(() => mockAuthState, { getState: () => mockAuthState }),
}));

vi.mock('@/components/TeamSwitcher', () => ({
  TeamLogo: () => null,
}));

import { HamburgerMenu, resolveCurrent } from '@/components/HamburgerMenu';
import { tools } from '@/lib/nav';

/** Open the menu at a given URL. */
function openAt(pathname: string, url = pathname) {
  mockPathname = pathname;
  window.history.replaceState(null, '', url);
  return render(<HamburgerMenu isOpen onClose={() => {}} />);
}

const section = (name: string) => screen.getByRole('button', { name });
const currentPage = () =>
  screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');

describe('HamburgerMenu — the only navigation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('lists the five main sections first, in order', () => {
    // Step 1: open the menu anywhere
    openAt('/cricket/moments/');
    // Step 2: read the top-level rows of the first list (sections only, not their pages)
    const top = screen.getAllByRole('list')[0]!;
    const names = Array.from(top.children).map((li) => li.firstElementChild?.textContent?.trim());
    expect(names).toEqual(['Roster', 'Finances', 'Matches', 'Umpiring', 'Moments']);
  });

  it('sections with pages are disclosure buttons; the others are plain links', () => {
    // Step 1: open the menu
    openAt('/cricket/moments/');
    // Step 2: Finances, Matches and Umpiring expand; Roster and Moments navigate
    for (const name of ['Finances', 'Matches', 'Umpiring']) {
      expect(section(name).getAttribute('aria-expanded')).toBe('false');
    }
    // (Umpiring › Roster is a second "Roster" link, so look at the top level only.)
    const top = screen.getAllByRole('list')[0]!;
    const leafNames = Array.from(top.children)
      .map((li) => li.firstElementChild)
      .filter((el) => el?.tagName === 'A')
      .map((el) => el!.textContent);
    expect(leafNames).toEqual(['Roster', 'Moments']);
  });

  it('opens with the current section expanded and its current page marked', () => {
    // Step 1: on Umpiring › Roster (static-export trailing slash)
    openAt('/cricket/umpiring/', '/cricket/umpiring/?tab=roster');
    // Step 2: Umpiring is expanded and its Roster page is current
    expect(section('Umpiring').getAttribute('aria-expanded')).toBe('true');
    const [here] = currentPage();
    expect(here?.getAttribute('href')).toBe('/cricket/umpiring?tab=roster');
  });

  it('tapping a section expands it in place and collapses the previous one', async () => {
    // Step 1: open on Umpiring (expanded by default)
    openAt('/cricket/umpiring/');
    // Step 2: tap Finances
    await userEvent.click(section('Finances'));
    // Step 3: Finances is open with its four pages; Umpiring closed
    expect(section('Finances').getAttribute('aria-expanded')).toBe('true');
    expect(section('Umpiring').getAttribute('aria-expanded')).toBe('false');
    const pages = within(document.getElementById('menu-finances')!).getAllByRole('link').map((l) => l.textContent);
    expect(pages).toEqual(['Expenses', 'Fees', 'Splits', 'Sponsors']);
  });

  it('tells Finances from Roster on the shared /cricket route', () => {
    // Step 1: the dashboard showing Fees via its hash
    openAt('/cricket/', '/cricket/#fees');
    // Step 2: Finances expanded, Fees current
    expect(section('Finances').getAttribute('aria-expanded')).toBe('true');
    expect(currentPage()[0]?.getAttribute('href')).toBe('/cricket?view=fees');
  });

  it('defaults the shared /cricket route to Roster', () => {
    // Step 1: the dashboard with no view
    openAt('/cricket/');
    // Step 2: Roster is the current link
    expect(currentPage().map((l) => l.textContent)).toEqual(['Roster']);
  });

  it('lists League Stats under Matches, not again under More', () => {
    // Step 1: on the stats page
    openAt('/cricket/league-stats/');
    // Step 2: Matches is expanded with Stats current
    expect(section('Matches').getAttribute('aria-expanded')).toBe('true');
    expect(currentPage()[0]?.textContent).toBe('Stats');
    // Step 3: there is no separate "League Stats" row
    expect(screen.queryByText('League Stats')).toBeNull();
  });

  it('is unreachable while closed', () => {
    // Step 1: render closed
    const { container } = render(<HamburgerMenu isOpen={false} onClose={() => {}} />);
    // Step 2: inert + hidden so VoiceOver and taps skip it
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.hasAttribute('inert')).toBe(true);
    expect(dialog.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('resolveCurrent', () => {
  it('defaults a section page with no tab to its first page', () => {
    // Step 1: /cricket/schedule with nothing in the URL
    const r = resolveCurrent(tools, '/cricket/schedule/', '', '');
    // Step 2: Matches › Upcoming
    expect(r).toEqual({ section: 'Matches', child: '/cricket/schedule?tab=upcoming' });
  });

  it('prefers the query param over the hash', () => {
    // Step 1: ?tab=completed with a stale #upcoming hash
    const r = resolveCurrent(tools, '/cricket/schedule', '?tab=completed', '#upcoming');
    // Step 2: the query wins
    expect(r.child).toBe('/cricket/schedule?tab=completed');
  });

  it('returns nothing for a route outside the menu', () => {
    // Step 1/2: an unknown page resolves to no section
    expect(resolveCurrent(tools, '/somewhere', '', '')).toEqual({ section: null, child: null });
  });
});
