import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PLAYER_USER_1, TOOLKIT_USER } from '../mocks/fixtures';

// ── Configurable mock Supabase client ──────────────────────────────────────

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockVerifyOtp = vi.fn();
const mockExchangeCodeForSession = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({ error: null });

const mockQuery: any = {};
['select', 'eq', 'update', 'ilike', 'in'].forEach(m => {
  mockQuery[m] = vi.fn().mockReturnValue(mockQuery);
});
mockQuery.single = vi.fn();

const mockSupabase = {
  auth: {
    getSession: mockGetSession,
    onAuthStateChange: mockOnAuthStateChange,
    verifyOtp: mockVerifyOtp,
    exchangeCodeForSession: mockExchangeCodeForSession,
    signOut: mockSignOut,
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    updateUser: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
  from: vi.fn().mockReturnValue(mockQuery),
  rpc: vi.fn(),
};

let mockIsCloudMode = true;
let mockReturnSupabase: any = mockSupabase;

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => mockReturnSupabase,
  isCloudMode: () => mockIsCloudMode,
}));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    isRateLimited: () => false,
  };
});

// ── Import store after mock is set up ──────────────────────────────────────

import { useAuthStore } from '@/stores/auth-store';

// ── Helpers ────────────────────────────────────────────────────────────────

const originalLocation = window.location;
const originalHistory = window.history;

function resetStore() {
  useAuthStore.setState({
    user: null,
    loading: true,
    authMode: 'login',
    authError: '',
    syncing: false,
    isCloud: false,
    needsPasswordReset: false,
    userAccess: [],
    userApproved: true,
  });
}

function mockLocation(search: string) {
  Object.defineProperty(window, 'location', {
    value: { search, pathname: '/cricket', href: 'http://localhost/cricket' + search },
    writable: true,
  });
}

function restoreLocation() {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
  });
}

/** Flush all pending microtasks/promises */
const flushPromises = () => new Promise<void>(resolve => setTimeout(resolve, 0));

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Auth Store — init() and checkProfileAndSetUser', () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetStore();
    mockIsCloudMode = true;
    mockReturnSupabase = mockSupabase;

    // Default: no URL params
    mockLocation('');

    // Default: onAuthStateChange returns subscription
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    // Default: getSession returns null session
    mockGetSession.mockResolvedValue({ data: { session: null } });

    // Default: profile query returns null
    mockQuery.single.mockResolvedValue({ data: null, error: null });

    replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreLocation();
    replaceStateSpy.mockRestore();
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // init() — no cloud mode
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('init() — no cloud mode', () => {
    it('sets loading=false and isCloud=false when isCloudMode returns false', () => {
      mockIsCloudMode = false;

      useAuthStore.getState().init();

      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.isCloud).toBe(false);
    });

    it('sets loading=false when getSupabaseClient returns null', () => {
      mockIsCloudMode = true;
      mockReturnSupabase = null;

      useAuthStore.getState().init();

      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.isCloud).toBe(true);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // init() — normal flow (no token/code in URL)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('init() — normal flow (no token/code)', () => {
    it('calls getSession and sets up onAuthStateChange listener', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      expect(mockGetSession).toHaveBeenCalledTimes(1);
      expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
    });

    it('sets user=null and loading=false when session is null', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
    });

    it('calls checkProfileAndSetUser when session has a user', async () => {
      const mockUser = { id: PLAYER_USER_1.id, email: PLAYER_USER_1.email };
      const mockSession = { user: mockUser, access_token: 'tok' };

      mockGetSession.mockResolvedValue({ data: { session: mockSession } });
      mockQuery.single.mockResolvedValue({
        data: { disabled: false, access: ['cricket', 'admin'], approved: true },
        error: null,
      });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.loading).toBe(false);
      expect(state.userAccess).toEqual(['cricket', 'admin']);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // checkProfileAndSetUser — all branches
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('checkProfileAndSetUser', () => {
    it('session null -> sets user=null, loading=false', async () => {
      // getSession returns null session, triggering checkProfileAndSetUser(null)
      mockGetSession.mockResolvedValue({ data: { session: null } });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
    });

    it('profile disabled -> signOut called, error set', async () => {
      const mockUser = { id: 'disabled-1', email: 'disabled@example.com' };
      const mockSession = { user: mockUser, access_token: 'tok' };

      mockGetSession.mockResolvedValue({ data: { session: mockSession } });
      mockQuery.single.mockResolvedValue({
        data: { disabled: true, access: ['cricket'], approved: true },
        error: null,
      });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      const state = useAuthStore.getState();
      expect(mockSignOut).toHaveBeenCalled();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.authError).toBe('Your account has been disabled. Contact the administrator.');
    });

    it('profile not approved -> signOut called, authMode=pending-approval', async () => {
      const mockUser = { id: 'pending-1', email: 'pending@example.com' };
      const mockSession = { user: mockUser, access_token: 'tok' };

      mockGetSession.mockResolvedValue({ data: { session: mockSession } });
      mockQuery.single.mockResolvedValue({
        data: { disabled: false, access: ['cricket'], approved: false },
        error: null,
      });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      const state = useAuthStore.getState();
      expect(mockSignOut).toHaveBeenCalled();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.authMode).toBe('pending-approval');
    });

    it('profile approved with access=[cricket] -> user set, userAccess=[cricket]', async () => {
      const mockUser = { id: 'cricket-1', email: 'cricket@example.com' };
      const mockSession = { user: mockUser, access_token: 'tok' };

      mockGetSession.mockResolvedValue({ data: { session: mockSession } });
      mockQuery.single.mockResolvedValue({
        data: { disabled: false, access: ['cricket'], approved: true },
        error: null,
      });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.userAccess).toEqual(['cricket']);
      expect(state.userApproved).toBe(true);
      expect(state.loading).toBe(false);
    });

    it('profile access null -> defaults to [toolkit]', async () => {
      const mockUser = { id: 'null-access-1', email: 'noaccess@example.com' };
      const mockSession = { user: mockUser, access_token: 'tok' };

      mockGetSession.mockResolvedValue({ data: { session: mockSession } });
      mockQuery.single.mockResolvedValue({
        data: { disabled: false, access: null, approved: true },
        error: null,
      });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.userAccess).toEqual(['toolkit']);
      expect(state.loading).toBe(false);
    });

    it('profile query returns null (no profile row) -> defaults to [toolkit]', async () => {
      const mockUser = { id: 'no-profile-1', email: 'noprofile@example.com' };
      const mockSession = { user: mockUser, access_token: 'tok' };

      mockGetSession.mockResolvedValue({ data: { session: mockSession } });
      mockQuery.single.mockResolvedValue({ data: null, error: null });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.userAccess).toEqual(['toolkit']);
      expect(state.loading).toBe(false);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // init() — token_hash recovery flow
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('init() — token_hash recovery flow', () => {
    it('calls verifyOtp with token_hash and type=recovery', async () => {
      mockLocation('?token_hash=abc123&type=recovery');
      mockVerifyOtp.mockResolvedValue({ error: null });
      mockGetSession.mockResolvedValue({ data: { session: null } });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      expect(mockVerifyOtp).toHaveBeenCalledWith({
        token_hash: 'abc123',
        type: 'recovery',
      });
    });

    it('on success -> sets needsPasswordReset=true and cleans URL', async () => {
      mockLocation('?token_hash=abc123&type=recovery');
      mockVerifyOtp.mockResolvedValue({ error: null });
      mockGetSession.mockResolvedValue({ data: { session: null } });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      const state = useAuthStore.getState();
      expect(state.needsPasswordReset).toBe(true);
      expect(state.authError).toBe('');
      expect(replaceStateSpy).toHaveBeenCalledWith({}, '', '/cricket');
    });

    it('on failure -> sets authError with expired link message', async () => {
      mockLocation('?token_hash=expired123&type=recovery');
      mockVerifyOtp.mockResolvedValue({ error: { message: 'Token has expired' } });
      mockGetSession.mockResolvedValue({ data: { session: null } });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      const state = useAuthStore.getState();
      expect(state.needsPasswordReset).toBe(false);
      expect(state.authError).toBe(
        'This password reset link is invalid or has expired. Please request a new one using "Forgot password?" below.'
      );
      expect(replaceStateSpy).toHaveBeenCalled();
    });

    it('sets up auth listener after verifyOtp completes', async () => {
      mockLocation('?token_hash=abc123&type=recovery');
      mockVerifyOtp.mockResolvedValue({ error: null });
      mockGetSession.mockResolvedValue({ data: { session: null } });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      // After verifyOtp, setupAuthListener is called which calls getSession and onAuthStateChange
      expect(mockGetSession).toHaveBeenCalled();
      expect(mockOnAuthStateChange).toHaveBeenCalled();
    });

    it('does NOT call verifyOtp when type is not recovery', async () => {
      mockLocation('?token_hash=abc123&type=signup');
      mockGetSession.mockResolvedValue({ data: { session: null } });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      expect(mockVerifyOtp).not.toHaveBeenCalled();
      // Falls through to normal setupAuthListener flow
      expect(mockGetSession).toHaveBeenCalled();
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // init() — code exchange flow (PKCE)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('init() — code exchange flow (PKCE)', () => {
    it('calls exchangeCodeForSession when URL has code param', async () => {
      mockLocation('?code=pkce-code-123');
      mockExchangeCodeForSession.mockResolvedValue({ error: null });
      mockGetSession.mockResolvedValue({ data: { session: null } });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('pkce-code-123');
    });

    it('on success -> sets needsPasswordReset=true and cleans URL', async () => {
      mockLocation('?code=pkce-code-123');
      mockExchangeCodeForSession.mockResolvedValue({ error: null });
      mockGetSession.mockResolvedValue({ data: { session: null } });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      const state = useAuthStore.getState();
      expect(state.needsPasswordReset).toBe(true);
      expect(state.authError).toBe('');
      expect(replaceStateSpy).toHaveBeenCalledWith({}, '', '/cricket');
    });

    it('on failure -> sets authError', async () => {
      mockLocation('?code=bad-code');
      mockExchangeCodeForSession.mockResolvedValue({ error: { message: 'Invalid code' } });
      mockGetSession.mockResolvedValue({ data: { session: null } });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      const state = useAuthStore.getState();
      expect(state.needsPasswordReset).toBe(false);
      expect(state.authError).toBe(
        'This password reset link is invalid or has expired. Please request a new one using "Forgot password?" below.'
      );
    });

    it('sets up auth listener after code exchange completes', async () => {
      mockLocation('?code=pkce-code-123');
      mockExchangeCodeForSession.mockResolvedValue({ error: null });
      mockGetSession.mockResolvedValue({ data: { session: null } });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      expect(mockGetSession).toHaveBeenCalled();
      expect(mockOnAuthStateChange).toHaveBeenCalled();
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // init() — token_hash takes priority over code
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('init() — token_hash takes priority over code', () => {
    it('uses verifyOtp when both token_hash and code are present', async () => {
      mockLocation('?token_hash=abc&type=recovery&code=xyz');
      mockVerifyOtp.mockResolvedValue({ error: null });
      mockGetSession.mockResolvedValue({ data: { session: null } });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      expect(mockVerifyOtp).toHaveBeenCalled();
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // onAuthStateChange callback
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('onAuthStateChange callback', () => {
    it('when session changes to user -> calls checkProfileAndSetUser', async () => {
      const mockUser = { id: TOOLKIT_USER.id, email: TOOLKIT_USER.email };
      const newSession = { user: mockUser, access_token: 'new-tok' };

      mockGetSession.mockResolvedValue({ data: { session: null } });

      // Capture the onAuthStateChange callback
      let authChangeCallback: (event: string, session: any) => void = () => {};
      mockOnAuthStateChange.mockImplementation((cb: any) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      // Verify initial state is no user
      expect(useAuthStore.getState().user).toBeNull();

      // Now simulate auth state change with a new session
      mockQuery.single.mockResolvedValue({
        data: { disabled: false, access: ['toolkit'], approved: true },
        error: null,
      });

      authChangeCallback('SIGNED_IN', newSession);
      await vi.advanceTimersByTimeAsync(10);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.userAccess).toEqual(['toolkit']);
    });

    it('when session changes to null -> sets user=null', async () => {
      const mockUser = { id: TOOLKIT_USER.id, email: TOOLKIT_USER.email };
      const initialSession = { user: mockUser, access_token: 'tok' };

      mockGetSession.mockResolvedValue({ data: { session: initialSession } });
      mockQuery.single.mockResolvedValue({
        data: { disabled: false, access: ['toolkit'], approved: true },
        error: null,
      });

      // Capture the onAuthStateChange callback
      let authChangeCallback: (event: string, session: any) => void = () => {};
      mockOnAuthStateChange.mockImplementation((cb: any) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      // User should be set from initial session
      expect(useAuthStore.getState().user).toEqual(mockUser);

      // Now simulate sign out via auth state change
      authChangeCallback('SIGNED_OUT', null);
      await vi.advanceTimersByTimeAsync(10);

      expect(useAuthStore.getState().user).toBeNull();
    });

    it('disabled user detected via onAuthStateChange -> signOut and error', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      let authChangeCallback: (event: string, session: any) => void = () => {};
      mockOnAuthStateChange.mockImplementation((cb: any) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      // Simulate a disabled user signing in
      const disabledUser = { id: 'disabled-1', email: 'disabled@example.com' };
      mockQuery.single.mockResolvedValue({
        data: { disabled: true, access: ['cricket'], approved: true },
        error: null,
      });

      authChangeCallback('SIGNED_IN', { user: disabledUser, access_token: 'tok' });
      await vi.advanceTimersByTimeAsync(10);

      const state = useAuthStore.getState();
      expect(mockSignOut).toHaveBeenCalled();
      expect(state.user).toBeNull();
      expect(state.authError).toBe('Your account has been disabled. Contact the administrator.');
    });

    it('unapproved user detected via onAuthStateChange -> signOut and pending-approval', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      let authChangeCallback: (event: string, session: any) => void = () => {};
      mockOnAuthStateChange.mockImplementation((cb: any) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      useAuthStore.getState().init();
      await vi.advanceTimersByTimeAsync(10);

      // Simulate an unapproved user signing in
      const pendingUser = { id: 'pending-1', email: 'pending@example.com' };
      mockQuery.single.mockResolvedValue({
        data: { disabled: false, access: ['cricket'], approved: false },
        error: null,
      });

      authChangeCallback('SIGNED_IN', { user: pendingUser, access_token: 'tok' });
      await vi.advanceTimersByTimeAsync(10);

      const state = useAuthStore.getState();
      expect(mockSignOut).toHaveBeenCalled();
      expect(state.user).toBeNull();
      expect(state.authMode).toBe('pending-approval');
    });
  });
});
