import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
const mockLoadDeletedMatches = vi.fn();
const mockDeleteMatch = vi.fn();
const mockResumeMatch = vi.fn();
const mockViewScorecard = vi.fn();
const mockRestoreMatch = vi.fn();
const mockPermanentDeleteMatch = vi.fn();
const mockRevertMatch = vi.fn();
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
    deletedMatches: [],
    historyLoading: false,
    dbMatchId: null,
    loadMatchHistory: mockLoadMatchHistory,
    loadDeletedMatches: mockLoadDeletedMatches,
    deleteMatch: mockDeleteMatch,
    restoreMatch: mockRestoreMatch,
    permanentDeleteMatch: mockPermanentDeleteMatch,
    revertMatch: mockRevertMatch,
    resumeMatch: mockResumeMatch,
    viewScorecard: mockViewScorecard,
  };
  mockAuthState = {
    user: { id: 'user-1', user_metadata: { full_name: 'Admin User' } },
    userAccess: overrides.isAdmin ? ['cricket', 'admin'] : ['cricket'],
    userFeatures: ['cricket'],
  };
}

/* ── Tests ── */

describe('MatchCard + ScoringLanding', () => {
  let ScoringPage: React.ComponentType;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockResumeMatch.mockResolvedValue(true);
    mockViewScorecard.mockResolvedValue(true);
    mockDeleteMatch.mockResolvedValue(true);
    setupDefaults();
    ScoringPage = await importPage();
  });

  it('calls loadMatchHistory on mount', () => {
    render(<ScoringPage />);
    expect(mockLoadMatchHistory).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when no matches exist', () => {
    render(<ScoringPage />);
    expect(screen.getByText('No matches yet')).toBeInTheDocument();
    expect(screen.getByText('Start a new match to begin scoring')).toBeInTheDocument();
  });

  it('shows active matches under Active Matches heading', () => {
    setupDefaults({ matchHistory: [ACTIVE_MATCH] });
    render(<ScoringPage />);
    expect(screen.getByText('Active Matches')).toBeInTheDocument();
    // Team names render as separate elements in the card header
    expect(screen.getByText('Sunrisers')).toBeInTheDocument();
  });

  it('shows completed matches under Previous Matches heading', () => {
    setupDefaults({ matchHistory: [COMPLETED_MATCH] });
    render(<ScoringPage />);
    expect(screen.getByText('Previous Matches')).toBeInTheDocument();
    expect(screen.getByText('Sunrisers won by 5 wickets')).toBeInTheDocument();
  });

  it('separates active and completed matches into correct sections', () => {
    setupDefaults({ matchHistory: [ACTIVE_MATCH, COMPLETED_MATCH] });
    render(<ScoringPage />);
    expect(screen.getByText('Active Matches')).toBeInTheDocument();
    expect(screen.getByText('Previous Matches')).toBeInTheDocument();
  });

  // Tapping completed card body calls viewScorecard
  it('tapping completed card body calls viewScorecard', async () => {
    const user = userEvent.setup();
    setupDefaults({ matchHistory: [COMPLETED_MATCH] });
    render(<ScoringPage />);

    // Find the card by its result text and navigate up to the clickable card div
    const resultText = screen.getByText('Sunrisers won by 5 wickets');
    const card = resultText.closest('[class*="rounded-2xl"]')!;
    await user.click(card);
    expect(mockViewScorecard).toHaveBeenCalledWith('completed-1');
  });

  // Three-dot menu renders with correct items for admin
  it('three-dot menu shows Delete option for admin users', async () => {
    const user = userEvent.setup();
    setupDefaults({ matchHistory: [COMPLETED_MATCH], isAdmin: true });
    render(<ScoringPage />);

    // Click the three-dot menu button
    const menuBtn = screen.getByTitle('Options');
    await user.click(menuBtn);

    // CardMenu should render with Delete option
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('View Scorecard')).toBeInTheDocument();
  });

  it('does not show three-dot menu for non-admin on completed matches', () => {
    setupDefaults({ matchHistory: [COMPLETED_MATCH], isAdmin: false });
    render(<ScoringPage />);
    expect(screen.queryByTitle('Options')).not.toBeInTheDocument();
  });

  // Delete flow: menu → delete → dialog → confirm
  it('delete flow from three-dot menu opens dialog and deletes', async () => {
    const user = userEvent.setup();
    setupDefaults({ matchHistory: [COMPLETED_MATCH], isAdmin: true });
    render(<ScoringPage />);

    // Open menu
    await user.click(screen.getByTitle('Options'));
    // Click Delete
    await user.click(screen.getByText('Delete'));

    // Dialog opens
    expect(screen.getByText('Delete Match?')).toBeInTheDocument();

    // Confirm delete
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mockDeleteMatch).toHaveBeenCalledWith('completed-1', 'Admin User');
    expect(screen.queryByText('Delete Match?')).not.toBeInTheDocument();
  });

  it('cancel in delete dialog does not call deleteMatch', async () => {
    const user = userEvent.setup();
    setupDefaults({ matchHistory: [COMPLETED_MATCH], isAdmin: true });
    render(<ScoringPage />);

    await user.click(screen.getByTitle('Options'));
    await user.click(screen.getByText('Delete'));
    expect(screen.getByText('Delete Match?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete Match?')).not.toBeInTheDocument();
    expect(mockDeleteMatch).not.toHaveBeenCalled();
  });

  it('renders multiple matches without key warnings', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const match2 = makeMatch({ id: 'completed-2', team_a_name: 'Lions', team_b_name: 'Hawks', status: 'completed' });
    const match3 = makeMatch({ id: 'active-2', team_a_name: 'Eagles', team_b_name: 'Bears', status: 'scoring' });
    setupDefaults({ matchHistory: [ACTIVE_MATCH, match3, COMPLETED_MATCH, match2], isAdmin: true });
    render(<ScoringPage />);

    const keyWarnings = consoleSpy.mock.calls.filter((args) =>
      args.some((arg) => typeof arg === 'string' && arg.includes('key')),
    );
    expect(keyWarnings).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  it('does not switch to match view when viewScorecard fails', async () => {
    const user = userEvent.setup();
    mockViewScorecard.mockResolvedValue(false);
    setupDefaults({ matchHistory: [COMPLETED_MATCH] });
    render(<ScoringPage />);

    const resultText = screen.getByText('Sunrisers won by 5 wickets');
    const card = resultText.closest('[class*="rounded-2xl"]')!;
    await user.click(card);

    expect(mockViewScorecard).toHaveBeenCalledWith('completed-1');
    // Should stay on landing — heading still visible
    expect(screen.getByText('Live Scoring')).toBeInTheDocument();
    expect(screen.getByText('Previous Matches')).toBeInTheDocument();
  });

  // Card wrapper is a div, not a button (no hydration nesting issues)
  it('card wrapper is a div not a nested button', () => {
    setupDefaults({ matchHistory: [COMPLETED_MATCH], isAdmin: true });
    render(<ScoringPage />);

    const resultText = screen.getByText('Sunrisers won by 5 wickets');
    const card = resultText.closest('[class*="rounded-2xl"]');
    expect(card?.tagName).toBe('DIV');
  });

  // Three-dot menu click doesn't trigger card navigation
  it('three-dot menu click does not trigger card navigation', async () => {
    const user = userEvent.setup();
    setupDefaults({ matchHistory: [COMPLETED_MATCH], isAdmin: true });
    render(<ScoringPage />);

    await user.click(screen.getByTitle('Options'));

    // Menu opened, but viewScorecard was NOT called
    expect(screen.getByText('View Scorecard')).toBeInTheDocument();
    expect(mockViewScorecard).not.toHaveBeenCalled();
  });
});
