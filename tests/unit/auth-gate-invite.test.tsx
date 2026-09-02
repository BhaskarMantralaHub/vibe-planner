import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * The invite-link failure screen.
 *
 * Every failure reason — unknown token, expired, revoked, consumed, server
 * unreachable — must land on ONE screen with ONE message, leaking neither the
 * token nor any team detail, and writing nothing. A valid token must still
 * fall through to the normal auth UI.
 */

const mockRpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => ({
    rpc: mockRpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
    auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
  }),
  isCloudMode: () => true,
}));

import { AuthGate } from '@/components/AuthGate';
import { useAuthStore } from '@/stores/auth-store';

const TOKEN = '70c4cdda-d342-4c87-ba69-a47f0a8419dd';

function setUrl(search: string) {
  Object.defineProperty(window, 'location', {
    value: {
      search,
      pathname: '/cricket/',
      href: `http://localhost/cricket/${search}`,
      origin: 'http://localhost',
    },
    writable: true,
    configurable: true,
  });
}

describe('AuthGate — invite link failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null, loading: false, isCloud: true, authMode: 'login', authError: '',
      syncing: false, userAccess: [], userFeatures: [], userApproved: true,
      profileLoaded: false, needsPasswordReset: false,
    });
    window.history.replaceState = vi.fn();
  });

  afterEach(() => { setUrl(''); });

  it.each([
    ['unknown token', { data: null, error: null }],
    ['server-side error payload', { data: { error: 'nope' }, error: null }],
  ])('shows one generic screen for %s', async (_label, response) => {
    setUrl(`?join=${TOKEN}`);
    mockRpc.mockResolvedValue(response);

    render(<AuthGate variant="cricket"><div>TEAM CONTENT</div></AuthGate>);

    expect(await screen.findByText('Invite Link Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/no longer valid or may have expired/i)).toBeInTheDocument();
    expect(screen.getByText(/ask your team admin for a new invite link/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to Cricket' })).toBeInTheDocument();
  });

  it('leaks neither the token nor any technical reason', async () => {
    setUrl(`?join=${TOKEN}`);
    mockRpc.mockResolvedValue({ data: null, error: null });

    const { container } = render(<AuthGate variant="cricket"><div>TEAM</div></AuthGate>);
    await screen.findByText('Invite Link Unavailable');

    const text = container.textContent ?? '';
    expect(text).not.toContain(TOKEN);
    for (const word of ['expired token', 'revoked', 'invalid token', 'invite ID', 'uuid']) {
      expect(text.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  it('performs no writes — validation is the only call made', async () => {
    setUrl(`?join=${TOKEN}`);
    mockRpc.mockResolvedValue({ data: null, error: null });

    render(<AuthGate variant="cricket"><div>TEAM</div></AuthGate>);
    await screen.findByText('Invite Link Unavailable');

    const called = mockRpc.mock.calls.map((c) => c[0]);
    expect(called).toEqual(['validate_invite_token']);
    for (const forbidden of ['request_cricket_access', 'accept_invite', 'create_welcome_post', 'approve_team_member']) {
      expect(called).not.toContain(forbidden);
    }
  });

  it('strips the dead token from the URL after validation fails', async () => {
    setUrl(`?join=${TOKEN}`);
    mockRpc.mockResolvedValue({ data: null, error: null });

    render(<AuthGate variant="cricket"><div>TEAM</div></AuthGate>);
    await screen.findByText('Invite Link Unavailable');

    expect(window.history.replaceState).toHaveBeenCalled();
    const url = (window.history.replaceState as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[2] as string;
    expect(url).not.toContain('join=');
  });

  it('does NOT show the failure screen while validation is still pending', async () => {
    setUrl(`?join=${TOKEN}`);
    // A promise that never settles — the "still checking" window.
    mockRpc.mockReturnValue(new Promise(() => {}));

    render(<AuthGate variant="cricket"><div>TEAM CONTENT</div></AuthGate>);

    // No flash of the failure screen, and no login form either.
    expect(screen.queryByText('Invite Link Unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('Invite Link Required')).not.toBeInTheDocument();
  });

  it('a VALID token falls through to the normal auth UI', async () => {
    setUrl(`?join=${TOKEN}`);
    mockRpc.mockResolvedValue({
      data: { team_id: 't1', team_name: 'Sunrisers Manteca', team_slug: 'sunrisers-manteca' },
      error: null,
    });

    render(<AuthGate variant="cricket"><div>TEAM CONTENT</div></AuthGate>);

    await waitFor(() => {
      expect(screen.queryByText('Invite Link Unavailable')).not.toBeInTheDocument();
    });
    // The login form for the branded team, not an error card.
    expect(await screen.findByText(/Welcome to Sunrisers Manteca|Log in to your team/i)).toBeInTheDocument();
  });

  it('no ?join= at all keeps the existing "Invite Link Required" behaviour', async () => {
    setUrl('');
    useAuthStore.setState({ authMode: 'signup' });

    render(<AuthGate variant="cricket"><div>TEAM</div></AuthGate>);

    expect(await screen.findByText('Invite Link Required')).toBeInTheDocument();
    expect(screen.queryByText('Invite Link Unavailable')).not.toBeInTheDocument();
  });
});
