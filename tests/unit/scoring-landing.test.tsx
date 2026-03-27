import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MatchHistoryItem } from '@/types/scoring';

/* ── Mocks ── */

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock supabase client
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => null,
  isCloudMode: () => true,
}));

// Scoring store mock state
const mockLoadMatchHistory = vi.fn();
const mockDeleteMatch = vi.fn();
const mockResumeMatch = vi.fn();
let mockScoringState: Record<string, unknown> = {};

vi.mock('@/stores/scoring-store', () => ({
  useScoringStore: Object.assign(
    () => mockScoringState,
    { getState: () => mockScoringState },
  ),
}));

// Auth store mock state
let mockAuthState: Record<string, unknown> = {};
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => mockAuthState,
}));

// Cricket store mock
vi.mock('@/stores/cricket-store', () => ({
  useCricketStore: () => ({ players: [], loadAll: vi.fn() }),
}));

// Mock AuthGate and RoleGate to passthrough
vi.mock('@/components/AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/RoleGate', () => ({
  RoleGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/* ── Fixtures ── */

function makeMatch(overrides: Partial<MatchHistoryItem> = {}): MatchHistoryItem {
  return {
    id: 'match-1',
    title: 'Sunrisers vs Tigers',
    match_date: '2026-03-27',
    status: 'completed',
    overs_per_innings: 10,
    team_a_name: 'Sunrisers',
    team_b_name: 'Tigers',
    result_summary: 'Sunrisers won by 5 wickets',
    match_winner: 'team_a',
    scorer_name: 'Bhaskar',
    share_token: 'token-1',
    started_at: '2026-03-27T10:00:00Z',
    completed_at: '2026-03-27T12:00:00Z',
    created_at: '2026-03-27T09:00:00Z',
    first_innings: { batting_team: 'team_a', total_runs: 120, total_wickets: 4, total_overs: 10 },
    second_innings: { batting_team: 'team_b', total_runs: 100, total_wickets: 8, total_overs: 10 },
    ...overrides,
  };
}

const ACTIVE_MATCH = makeMatch({ id: 'active-1', status: 'scoring', result_summary: null, match_winner: null, completed_at: null });
const COMPLETED_MATCH = makeMatch({ id: 'completed-1', status: 'completed' });

/* ── Dynamically import page to pick up mocks ── */

// We need to import the page AFTER mocks are set up.
// The page exports ScoringPage as default, but we need the inner components.
// Since MatchCard and ScoringLanding are not exported, we test via the page.
// However, since the page wraps in AuthGate/RoleGate and uses state to switch views,
// we render the full page and test the landing view.

async function importPage() {
  const mod = await import('@/app/(tools)/cricket/scoring/page');
  return mod.default;
}

/* ── Helpers ── */

function setupDefaults(overrides: {
  matchHistory?: MatchHistoryItem[];
  isAdmin?: boolean;
  match?: unknown;
  innings?: unknown[];
} = {}) {
  mockScoringState = {
    match: overrides.match ?? null,
    innings: overrides.innings ?? [],
    matchHistory: overrides.matchHistory ?? [],
    loadMatchHistory: mockLoadMatchHistory,
    deleteMatch: mockDeleteMatch,
    resumeMatch: mockResumeMatch,
  };
  mockAuthState = {
    user: { id: 'user-1', user_metadata: { full_name: 'Admin User' } },
    userAccess: overrides.isAdmin ? ['cricket', 'admin'] : ['cricket'],
  };
}

/* ── Tests ── */

describe('MatchCard + ScoringLanding', () => {
  let ScoringPage: React.ComponentType;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockResumeMatch.mockResolvedValue(true);
    mockDeleteMatch.mockResolvedValue(true);
    setupDefaults();
    ScoringPage = await importPage();
  });

  // 6. loadMatchHistory is called on component mount
  it('calls loadMatchHistory on mount', () => {
    render(<ScoringPage />);
    expect(mockLoadMatchHistory).toHaveBeenCalledTimes(1);
  });

  // 9. Empty state shows when no matches exist
  it('shows empty state when no matches exist', () => {
    render(<ScoringPage />);
    expect(screen.getByText('No matches yet')).toBeInTheDocument();
    expect(screen.getByText('Start a new match to begin scoring')).toBeInTheDocument();
  });

  // 7. Active matches show in "Active Matches" section
  it('shows active matches under Active Matches heading', () => {
    setupDefaults({ matchHistory: [ACTIVE_MATCH] });
    render(<ScoringPage />);
    expect(screen.getByText('Active Matches')).toBeInTheDocument();
    expect(screen.getByText('Sunrisers vs Tigers')).toBeInTheDocument();
    expect(screen.getByText('Live Match')).toBeInTheDocument();
  });

  // 8. Completed matches show in "Previous Matches" section
  it('shows completed matches under Previous Matches heading', () => {
    setupDefaults({ matchHistory: [COMPLETED_MATCH] });
    render(<ScoringPage />);
    expect(screen.getByText('Previous Matches')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  // Both sections when mixed
  it('separates active and completed matches into correct sections', () => {
    setupDefaults({ matchHistory: [ACTIVE_MATCH, COMPLETED_MATCH] });
    render(<ScoringPage />);
    expect(screen.getByText('Active Matches')).toBeInTheDocument();
    expect(screen.getByText('Previous Matches')).toBeInTheDocument();
  });

  // 1. Tapping the card body calls onTap (triggers resumeMatch)
  it('tapping card body calls resumeMatch', async () => {
    const user = userEvent.setup();
    setupDefaults({ matchHistory: [COMPLETED_MATCH] });
    render(<ScoringPage />);

    const card = screen.getByText('Sunrisers vs Tigers').closest('[class*="rounded-xl"]')!;
    await user.click(card);
    expect(mockResumeMatch).toHaveBeenCalledWith('completed-1');
  });

  // 5. Delete button only shows for admin users
  it('does not show Delete Match for non-admin users', () => {
    setupDefaults({ matchHistory: [COMPLETED_MATCH], isAdmin: false });
    render(<ScoringPage />);
    expect(screen.queryByText('Delete Match')).not.toBeInTheDocument();
  });

  it('shows Delete Match for admin users', () => {
    setupDefaults({ matchHistory: [COMPLETED_MATCH], isAdmin: true });
    render(<ScoringPage />);
    expect(screen.getByText('Delete Match')).toBeInTheDocument();
  });

  // 2. Tapping "Delete Match" opens the Dialog (doesn't navigate)
  it('tapping Delete Match opens confirmation dialog without navigating', async () => {
    const user = userEvent.setup();
    setupDefaults({ matchHistory: [COMPLETED_MATCH], isAdmin: true });
    render(<ScoringPage />);

    await user.click(screen.getByText('Delete Match'));

    // Dialog opens
    expect(screen.getByText('Delete Match?')).toBeInTheDocument();
    // Did NOT trigger resumeMatch (no navigation)
    expect(mockResumeMatch).not.toHaveBeenCalled();
  });

  // 3. Dialog "Cancel" closes without deleting
  it('clicking Cancel in delete dialog closes without deleting', async () => {
    const user = userEvent.setup();
    setupDefaults({ matchHistory: [COMPLETED_MATCH], isAdmin: true });
    render(<ScoringPage />);

    await user.click(screen.getByText('Delete Match'));
    expect(screen.getByText('Delete Match?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Dialog closed — title gone
    expect(screen.queryByText('Delete Match?')).not.toBeInTheDocument();
    // deleteMatch not called
    expect(mockDeleteMatch).not.toHaveBeenCalled();
  });

  // 4. Dialog "Delete" calls onDelete and closes
  it('clicking Delete in dialog calls deleteMatch and closes dialog', async () => {
    const user = userEvent.setup();
    setupDefaults({ matchHistory: [COMPLETED_MATCH], isAdmin: true });
    render(<ScoringPage />);

    await user.click(screen.getByText('Delete Match'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(mockDeleteMatch).toHaveBeenCalledWith('completed-1', 'Admin User');
    expect(screen.queryByText('Delete Match?')).not.toBeInTheDocument();
  });

  // 10. No React key warnings — each MatchCard has unique key
  it('renders multiple matches without key warnings', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const match2 = makeMatch({ id: 'completed-2', team_a_name: 'Lions', team_b_name: 'Hawks', status: 'completed' });
    const match3 = makeMatch({ id: 'active-2', team_a_name: 'Eagles', team_b_name: 'Bears', status: 'scoring' });
    setupDefaults({ matchHistory: [ACTIVE_MATCH, match3, COMPLETED_MATCH, match2], isAdmin: true });
    render(<ScoringPage />);

    // No "key" warning in console.error
    const keyWarnings = consoleSpy.mock.calls.filter((args) =>
      args.some((arg) => typeof arg === 'string' && arg.includes('key')),
    );
    expect(keyWarnings).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  // 11. onResumeMatch async callback handles errors gracefully
  it('does not switch to match view when resumeMatch fails', async () => {
    const user = userEvent.setup();
    mockResumeMatch.mockResolvedValue(false); // simulate failure
    setupDefaults({ matchHistory: [COMPLETED_MATCH] });
    render(<ScoringPage />);

    const card = screen.getByText('Sunrisers vs Tigers').closest('[class*="rounded-xl"]')!;
    await user.click(card);

    expect(mockResumeMatch).toHaveBeenCalledWith('completed-1');
    // Should stay on landing — heading still visible (two "Live Scoring" texts: header + hero)
    expect(screen.getAllByText('Live Scoring')).toHaveLength(2);
  });

  // 12. No hydration issues — no nested buttons
  it('delete button is not nested inside another button', () => {
    setupDefaults({ matchHistory: [COMPLETED_MATCH], isAdmin: true });
    render(<ScoringPage />);

    const deleteBtn = screen.getByText('Delete Match');
    // The delete element is a <button>
    expect(deleteBtn.tagName).toBe('BUTTON');
    // Its parent chain should NOT have another <button> ancestor until the card div
    let el: HTMLElement | null = deleteBtn.parentElement;
    while (el && !el.classList.toString().includes('rounded-xl')) {
      expect(el.tagName).not.toBe('BUTTON');
      el = el.parentElement;
    }
    // The card wrapper is a <div>, not a <button>
    expect(el?.tagName).toBe('DIV');
  });

  // Verify e.stopPropagation on delete — card onClick not called
  it('delete button stopPropagation prevents card navigation', async () => {
    const user = userEvent.setup();
    setupDefaults({ matchHistory: [COMPLETED_MATCH], isAdmin: true });
    render(<ScoringPage />);

    await user.click(screen.getByText('Delete Match'));

    // Dialog opened, but resumeMatch was NOT called
    expect(screen.getByText('Delete Match?')).toBeInTheDocument();
    expect(mockResumeMatch).not.toHaveBeenCalled();
  });
});
