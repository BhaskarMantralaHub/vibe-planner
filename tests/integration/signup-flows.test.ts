import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ADMIN_USER, PLAYER_USER_1, TOOLKIT_USER, PROFILES } from '../mocks/fixtures';

// ── Configurable mock Supabase client ──────────────────────────────────────

const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({ error: null });
const mockGetSession = vi.fn().mockResolvedValue({ data: { session: null } });
const mockOnAuthStateChange = vi.fn().mockReturnValue({
  data: { subscription: { unsubscribe: vi.fn() } },
});
const mockResetPasswordForEmail = vi.fn();
const mockUpdateUser = vi.fn();

// Chainable query builder that resolves via .single()
function createChainBuilder(resolveData: unknown = null, resolveError: unknown = null) {
  const builder: Record<string, unknown> = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'ilike', 'in', 'is', 'order', 'limit', 'range', 'maybeSingle'];
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }
  builder.single = vi.fn().mockResolvedValue({ data: resolveData, error: resolveError });
  builder.then = vi.fn((resolve: (v: unknown) => void) => {
    resolve({ data: resolveData, error: resolveError });
    return builder;
  });
  return builder;
}

const mockFrom = vi.fn();
const mockRpc = vi.fn();

const mockSupabase = {
  auth: {
    signInWithPassword: mockSignInWithPassword,
    signUp: mockSignUp,
    signOut: mockSignOut,
    getSession: mockGetSession,
    onAuthStateChange: mockOnAuthStateChange,
    resetPasswordForEmail: mockResetPasswordForEmail,
    verifyOtp: vi.fn().mockResolvedValue({ error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
    updateUser: mockUpdateUser,
  },
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => mockSupabase,
  isCloudMode: () => true,
}));

// Prevent rate limiting from affecting integration tests
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

const VALID_PASSWORD = 'Abcdefg1';
const VALID_NAME = 'Test Player';

/** Reset store and all mocks before each test */
function resetAll() {
  useAuthStore.setState({
    user: null,
    loading: false,
    authMode: 'login',
    authError: '',
    syncing: false,
    isCloud: true,
    needsPasswordReset: false,
    userAccess: [],
    userApproved: true,
  });

  vi.clearAllMocks();

  // Default: from() returns empty profile queries
  mockFrom.mockReturnValue(createChainBuilder(null, null));

  // Default: rpc returns null
  mockRpc.mockResolvedValue({ data: null, error: null });

  // Defaults for auth methods
  mockSignOut.mockResolvedValue({ error: null });
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
}

/** Configure mockFrom to return specific data for profiles table queries */
function mockProfileQuery(profileData: unknown) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return createChainBuilder(profileData, null);
    }
    if (table === 'app_settings') {
      return createChainBuilder({ value: '15' }, null);
    }
    if (table === 'cricket_players') {
      return createChainBuilder(null, null);
    }
    return createChainBuilder(null, null);
  });
}

/** Configure mockFrom for signup flow (app_settings + profiles) */
function mockSignupQueries(profileData?: unknown) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'app_settings') {
      return createChainBuilder({ value: '15' }, null);
    }
    if (table === 'profiles') {
      return createChainBuilder(profileData ?? null, null);
    }
    return createChainBuilder(null, null);
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Signup & Access Flows (Integration)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Advance time to clear any rate-limit state from previous tests
    vi.setSystemTime(Date.now() + 300_000);
    resetAll();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Flow 1: New player (admin pre-added) signs up on cricket
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Flow 1: New player (admin pre-added) signs up on cricket', () => {
    it('sets authMode to check-email when signup succeeds', async () => {
      // Player email exists in cricket_players (pre-added by admin)
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'check_cricket_player_email') return Promise.resolve({ data: true, error: null });
        if (fn === 'get_user_count') return Promise.resolve({ data: 2, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      mockSignupQueries();
      mockSignUp.mockResolvedValue({ data: { user: { id: 'new-1', email: 'newplayer@example.com' } }, error: null });

      await useAuthStore.getState().signup('newplayer@example.com', VALID_PASSWORD, VALID_NAME, 'cricket');

      const state = useAuthStore.getState();
      expect(state.authMode).toBe('check-email');
      expect(state.syncing).toBe(false);
      expect(state.authError).toBe('');
      expect(mockSignUp).toHaveBeenCalledTimes(1);
      // Verify auto-approve was true in metadata
      const signUpCall = mockSignUp.mock.calls[0][0];
      expect(signUpCall.options.data.approved).toBe(true);
    });

    it('sends player metadata in signup options', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'check_cricket_player_email') return Promise.resolve({ data: true, error: null });
        if (fn === 'get_user_count') return Promise.resolve({ data: 1, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      mockSignupQueries();
      mockSignUp.mockResolvedValue({ data: { user: { id: 'new-1' } }, error: null });

      await useAuthStore.getState().signup('player@example.com', VALID_PASSWORD, VALID_NAME, 'cricket', {
        jersey_number: 7,
        player_role: 'batsman',
        batting_style: 'right',
        bowling_style: undefined,
        shirt_size: 'L',
      });

      const signUpCall = mockSignUp.mock.calls[0][0];
      expect(signUpCall.options.data.jersey_number).toBe(7);
      expect(signUpCall.options.data.player_role).toBe('batsman');
      expect(signUpCall.options.data.batting_style).toBe('right');
      expect(signUpCall.options.data.shirt_size).toBe('L');
      expect(signUpCall.options.data.bowling_style).toBeUndefined();
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Flow 2: Player pre-added + already has toolkit account -> signup
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Flow 2: Player pre-added + already has toolkit account -> signup on cricket', () => {
    it('shows "already on the team" error when player exists', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'check_cricket_player_email') return Promise.resolve({ data: true, error: null });
        if (fn === 'get_user_count') return Promise.resolve({ data: 2, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      mockSignupQueries();

      // signUp returns "User already registered"
      mockSignUp.mockResolvedValue({
        data: null,
        error: { message: 'User already registered', status: 400 },
      });

      await useAuthStore.getState().signup('existing@example.com', VALID_PASSWORD, VALID_NAME, 'cricket');

      const state = useAuthStore.getState();
      expect(state.authError).toBe('You already have an account and are on the team. Please sign in instead.');
      expect(state.syncing).toBe(false);
      expect(state.authMode).toBe('login'); // stays on login
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Flow 3: Player pre-added + toolkit account -> signs in on cricket
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Flow 3: Player pre-added + toolkit account -> signs in on cricket', () => {
    it('sets userAccess on successful login (user set via onAuthStateChange listener)', async () => {
      const mockUser = { id: TOOLKIT_USER.id, email: TOOLKIT_USER.email, user_metadata: { full_name: 'Toolkit User' } };

      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: { access_token: 'tok' } },
        error: null,
      });

      // Profile returns toolkit access (cricket not yet added — AuthGate handles auto-approve)
      mockProfileQuery({ disabled: false, access: ['toolkit'], approved: true });

      await useAuthStore.getState().login(TOOLKIT_USER.email, VALID_PASSWORD);

      const state = useAuthStore.getState();
      // Note: login() sets userAccess but does NOT set user directly — user is set via onAuthStateChange in init()
      expect(state.userAccess).toEqual(['toolkit']);
      expect(state.syncing).toBe(false);
      expect(state.authError).toBe('');
      // Verify signInWithPassword was called with correct credentials
      expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: TOOLKIT_USER.email, password: VALID_PASSWORD });
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Flow 4: Toolkit user (not a player) -> signup on cricket
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Flow 4: Toolkit user (not a player) -> signup on cricket', () => {
    it('requests cricket access and sets pending-approval mode', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'check_cricket_player_email') return Promise.resolve({ data: false, error: null });
        if (fn === 'request_cricket_access') return Promise.resolve({ data: null, error: null });
        if (fn === 'get_user_count') return Promise.resolve({ data: 3, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      mockSignupQueries();

      // signUp returns "User already registered" (has toolkit account)
      mockSignUp.mockResolvedValue({
        data: null,
        error: { message: 'User already registered', status: 400 },
      });

      await useAuthStore.getState().signup('toolkituser@example.com', VALID_PASSWORD, VALID_NAME, 'cricket');

      const state = useAuthStore.getState();
      expect(state.authMode).toBe('pending-approval');
      expect(state.syncing).toBe(false);
      expect(state.authError).toBe('');

      // Verify request_cricket_access was called
      expect(mockRpc).toHaveBeenCalledWith('request_cricket_access', { check_email: 'toolkituser@example.com' });
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Flow 5: Random person signs up on cricket (new email, no player record)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Flow 5: Random person signs up on cricket (new email, no player record)', () => {
    it('sets authMode to check-email with approved=false in metadata', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'check_cricket_player_email') return Promise.resolve({ data: false, error: null });
        if (fn === 'get_user_count') return Promise.resolve({ data: 2, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      mockSignupQueries();
      mockSignUp.mockResolvedValue({ data: { user: { id: 'random-1' } }, error: null });

      await useAuthStore.getState().signup('random@example.com', VALID_PASSWORD, 'Random Person', 'cricket');

      const state = useAuthStore.getState();
      expect(state.authMode).toBe('check-email');
      expect(state.syncing).toBe(false);

      // Verify approved=false since no player record
      const signUpCall = mockSignUp.mock.calls[0][0];
      expect(signUpCall.options.data.approved).toBe(false);
      expect(signUpCall.options.data.access).toBe('cricket');
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Flow 6: Login — various scenarios
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Flow 6: Login scenarios', () => {
    it('successful login sets user and syncing=false', async () => {
      const mockUser = { id: PLAYER_USER_1.id, email: PLAYER_USER_1.email, user_metadata: { full_name: 'Bhaskar' } };

      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: { access_token: 'tok' } },
        error: null,
      });

      mockProfileQuery({ disabled: false, access: ['cricket', 'admin'], approved: true });

      await useAuthStore.getState().login(PLAYER_USER_1.email, VALID_PASSWORD);

      const state = useAuthStore.getState();
      expect(state.syncing).toBe(false);
      expect(state.authError).toBe('');
      expect(state.userAccess).toEqual(['cricket', 'admin']);
    });

    it('invalid credentials sets authError', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: null,
        error: { message: 'Invalid login credentials', status: 400 },
      });

      await useAuthStore.getState().login('wrong@example.com', 'WrongPass1');

      const state = useAuthStore.getState();
      expect(state.authError).toBe('Invalid email or password.');
      expect(state.syncing).toBe(false);
      expect(state.user).toBeNull();
    });

    it('disabled account calls signOut and shows error', async () => {
      const mockUser = { id: 'disabled-1', email: 'disabled@example.com' };

      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: { access_token: 'tok' } },
        error: null,
      });

      mockProfileQuery({ disabled: true, access: ['cricket'], approved: true });

      await useAuthStore.getState().login('disabled@example.com', VALID_PASSWORD);

      const state = useAuthStore.getState();
      expect(mockSignOut).toHaveBeenCalled();
      expect(state.authError).toBe('Your account has been disabled. Contact the administrator.');
      expect(state.user).toBeNull();
      expect(state.syncing).toBe(false);
    });

    it('pending approval calls signOut and sets authMode', async () => {
      const mockUser = { id: 'pending-1', email: 'pending@example.com' };

      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: { access_token: 'tok' } },
        error: null,
      });

      mockProfileQuery({ disabled: false, access: ['cricket'], approved: false });

      await useAuthStore.getState().login('pending@example.com', VALID_PASSWORD);

      const state = useAuthStore.getState();
      expect(mockSignOut).toHaveBeenCalled();
      expect(state.authMode).toBe('pending-approval');
      expect(state.user).toBeNull();
      expect(state.syncing).toBe(false);
    });

    it.skip('rate limited prevents calling Supabase', async () => {
      // Exhaust rate limit (5 attempts within 60s window)
      for (let i = 0; i < 5; i++) {
        mockSignInWithPassword.mockResolvedValue({
          data: null,
          error: { message: 'Invalid login credentials' },
        });
        await useAuthStore.getState().login('test@example.com', 'WrongPass1');
        // Clear error for next iteration
        useAuthStore.setState({ authError: '' });
      }

      // Clear call count
      mockSignInWithPassword.mockClear();

      // 6th attempt should be rate limited without calling Supabase
      await useAuthStore.getState().login('test@example.com', 'WrongPass1');

      const state = useAuthStore.getState();
      expect(state.authError).toBe('Too many attempts. Please wait a moment and try again.');
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it('links cricket player record on login when user has cricket access', async () => {
      const mockUser = { id: 'player-1', email: 'player@example.com', user_metadata: {} };

      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: { access_token: 'tok' } },
        error: null,
      });

      const cricketPlayersBuilder = createChainBuilder(null, null);
      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') return createChainBuilder({ disabled: false, access: ['cricket'], approved: true }, null);
        if (table === 'cricket_players') return cricketPlayersBuilder;
        return createChainBuilder(null, null);
      });

      await useAuthStore.getState().login('player@example.com', VALID_PASSWORD);

      // Verify cricket_players update was attempted
      expect(mockFrom).toHaveBeenCalledWith('cricket_players');
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Flow 7: Password flows
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Flow 7: Password flows', () => {
    it('resetPassword calls supabase and sets authMode to reset-sent', async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: null });

      await useAuthStore.getState().resetPassword('user@example.com');

      const state = useAuthStore.getState();
      expect(state.authMode).toBe('reset-sent');
      expect(state.syncing).toBe(false);
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('user@example.com', expect.any(Object));
    });

    it('resetPassword shows error on empty email', async () => {
      await useAuthStore.getState().resetPassword('');

      const state = useAuthStore.getState();
      expect(state.authError).toBe('Please enter your email.');
      expect(state.syncing).toBe(false);
      expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('resetPassword shows error on Supabase failure', async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'rate limit exceeded' } });

      await useAuthStore.getState().resetPassword('user@example.com');

      const state = useAuthStore.getState();
      expect(state.authError).toBe('Too many attempts. Please wait a moment and try again.');
      expect(state.authMode).not.toBe('reset-sent');
    });

    it('validates password: too short', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'get_user_count') return Promise.resolve({ data: 1, error: null });
        return Promise.resolve({ data: null, error: null });
      });
      mockSignupQueries();

      await useAuthStore.getState().signup('test@example.com', 'Short1', 'Test');

      expect(useAuthStore.getState().authError).toBe('Password must be at least 8 characters.');
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('validates password: no uppercase', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'get_user_count') return Promise.resolve({ data: 1, error: null });
        return Promise.resolve({ data: null, error: null });
      });
      mockSignupQueries();

      await useAuthStore.getState().signup('test@example.com', 'abcdefg1', 'Test');

      expect(useAuthStore.getState().authError).toBe('Password must contain at least one uppercase letter.');
    });

    it('validates password: no lowercase', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'get_user_count') return Promise.resolve({ data: 1, error: null });
        return Promise.resolve({ data: null, error: null });
      });
      mockSignupQueries();

      await useAuthStore.getState().signup('test@example.com', 'ABCDEFG1', 'Test');

      expect(useAuthStore.getState().authError).toBe('Password must contain at least one lowercase letter.');
    });

    it('validates password: no number', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'get_user_count') return Promise.resolve({ data: 1, error: null });
        return Promise.resolve({ data: null, error: null });
      });
      mockSignupQueries();

      await useAuthStore.getState().signup('test@example.com', 'Abcdefgh', 'Test');

      expect(useAuthStore.getState().authError).toBe('Password must contain at least one number.');
    });

    it('updatePassword succeeds and clears needsPasswordReset', async () => {
      useAuthStore.setState({ needsPasswordReset: true });
      mockUpdateUser.mockResolvedValue({ data: {}, error: null });

      const result = await useAuthStore.getState().updatePassword('NewPass1!');

      expect(result).toBe(true);
      expect(useAuthStore.getState().needsPasswordReset).toBe(false);
      expect(useAuthStore.getState().authError).toBe('');
    });

    it('updatePassword failure sets authError', async () => {
      useAuthStore.setState({ needsPasswordReset: true });
      mockUpdateUser.mockResolvedValue({ data: null, error: { message: 'Password too weak' } });

      const result = await useAuthStore.getState().updatePassword('weak');

      expect(result).toBe(false);
      expect(useAuthStore.getState().authError).toBe('Password too weak');
      expect(useAuthStore.getState().needsPasswordReset).toBe(true);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Edge Cases
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Edge cases', () => {
    it('empty email/password on login shows validation error', async () => {
      await useAuthStore.getState().login('', '');

      const state = useAuthStore.getState();
      expect(state.authError).toBe('Please enter your email and password.');
      expect(state.syncing).toBe(false);
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it('whitespace-only email/password on login shows validation error', async () => {
      await useAuthStore.getState().login('   ', '   ');

      expect(useAuthStore.getState().authError).toBe('Please enter your email and password.');
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it('empty name on signup shows validation error', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'get_user_count') return Promise.resolve({ data: 1, error: null });
        return Promise.resolve({ data: null, error: null });
      });
      mockSignupQueries();

      await useAuthStore.getState().signup('test@example.com', VALID_PASSWORD, '');

      expect(useAuthStore.getState().authError).toBe('Please enter your name.');
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('empty email on signup shows validation error', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'get_user_count') return Promise.resolve({ data: 1, error: null });
        return Promise.resolve({ data: null, error: null });
      });
      mockSignupQueries();

      await useAuthStore.getState().signup('', VALID_PASSWORD, 'Test Name');

      expect(useAuthStore.getState().authError).toBe('Please enter your email.');
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('network error during signup shows generic error', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'check_cricket_player_email') return Promise.resolve({ data: false, error: null });
        if (fn === 'get_user_count') return Promise.resolve({ data: 1, error: null });
        return Promise.resolve({ data: null, error: null });
      });
      mockSignupQueries();

      mockSignUp.mockResolvedValue({
        data: null,
        error: { message: 'Failed to fetch' },
      });

      await useAuthStore.getState().signup('test@example.com', VALID_PASSWORD, 'Test Name');

      const state = useAuthStore.getState();
      expect(state.authError).toBe('Something went wrong. Please try again.');
      expect(state.syncing).toBe(false);
    });

    it('network error during login shows generic error', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: null,
        error: { message: 'Network request failed' },
      });

      await useAuthStore.getState().login('test@example.com', VALID_PASSWORD);

      expect(useAuthStore.getState().authError).toBe('Something went wrong. Please try again.');
    });

    it('signup with all player metadata fields', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'check_cricket_player_email') return Promise.resolve({ data: true, error: null });
        if (fn === 'get_user_count') return Promise.resolve({ data: 1, error: null });
        return Promise.resolve({ data: null, error: null });
      });
      mockSignupQueries();
      mockSignUp.mockResolvedValue({ data: { user: { id: 'new-1' } }, error: null });

      await useAuthStore.getState().signup('player@example.com', VALID_PASSWORD, 'Full Player', 'cricket', {
        jersey_number: 42,
        player_role: 'all-rounder',
        batting_style: 'left',
        bowling_style: 'spin',
        shirt_size: 'XL',
      });

      const signUpData = mockSignUp.mock.calls[0][0].options.data;
      expect(signUpData.full_name).toBe('Full Player');
      expect(signUpData.access).toBe('cricket');
      expect(signUpData.approved).toBe(true);
      expect(signUpData.jersey_number).toBe(42);
      expect(signUpData.player_role).toBe('all-rounder');
      expect(signUpData.batting_style).toBe('left');
      expect(signUpData.bowling_style).toBe('spin');
      expect(signUpData.shirt_size).toBe('XL');
    });

    it.skip('multiple rapid login attempts trigger rate limiting', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: null,
        error: { message: 'Invalid login credentials' },
      });

      // First 5 attempts go through to Supabase
      for (let i = 0; i < 5; i++) {
        await useAuthStore.getState().login('test@example.com', 'BadPass1');
        useAuthStore.setState({ authError: '' });
      }

      const callCountAfter5 = mockSignInWithPassword.mock.calls.length;
      expect(callCountAfter5).toBe(5);

      // 6th attempt is rate-limited client-side
      await useAuthStore.getState().login('test@example.com', 'BadPass1');

      expect(mockSignInWithPassword.mock.calls.length).toBe(callCountAfter5);
      expect(useAuthStore.getState().authError).toBe('Too many attempts. Please wait a moment and try again.');
    });

    it('max users reached blocks signup', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'get_user_count') return Promise.resolve({ data: 15, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'app_settings') {
          return createChainBuilder({ value: '15' }, null);
        }
        return createChainBuilder(null, null);
      });

      await useAuthStore.getState().signup('new@example.com', VALID_PASSWORD, 'New User');

      expect(useAuthStore.getState().authError).toBe('Maximum number of accounts reached. Contact the administrator.');
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('toolkit signup defaults access to toolkit with auto-approve', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'get_user_count') return Promise.resolve({ data: 1, error: null });
        return Promise.resolve({ data: null, error: null });
      });
      mockSignupQueries();
      mockSignUp.mockResolvedValue({ data: { user: { id: 'tk-1' } }, error: null });

      // No access parameter = defaults to 'toolkit'
      await useAuthStore.getState().signup('toolkit@example.com', VALID_PASSWORD, 'Toolkit User');

      const signUpData = mockSignUp.mock.calls[0][0].options.data;
      expect(signUpData.access).toBe('toolkit');
      expect(signUpData.approved).toBe(true); // toolkit is always auto-approved
      expect(useAuthStore.getState().authMode).toBe('check-email');
    });

    it.skip('signup rate limiting prevents calling Supabase signUp', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'get_user_count') return Promise.resolve({ data: 1, error: null });
        return Promise.resolve({ data: null, error: null });
      });
      mockSignupQueries();
      mockSignUp.mockResolvedValue({ data: { user: { id: 'x' } }, error: null });

      // Exhaust rate limit
      for (let i = 0; i < 5; i++) {
        await useAuthStore.getState().signup(`user${i}@example.com`, VALID_PASSWORD, 'User');
        useAuthStore.setState({ authError: '', authMode: 'login' });
      }

      mockSignUp.mockClear();

      // 6th attempt should be rate limited
      await useAuthStore.getState().signup('blocked@example.com', VALID_PASSWORD, 'Blocked');

      expect(useAuthStore.getState().authError).toBe('Too many attempts. Please wait a moment and try again.');
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('logout resets all auth state', () => {
      useAuthStore.setState({
        user: { id: 'u1', email: 'test@example.com' } as any,
        userAccess: ['toolkit', 'admin'],
        userApproved: true,
        authError: 'some error',
      });

      useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.authMode).toBe('login');
      expect(state.authError).toBe('');
      expect(state.userAccess).toEqual([]);
      expect(state.userApproved).toBe(true);
      expect(mockSignOut).toHaveBeenCalled();
    });

    it('setAuthMode changes mode and clears error', () => {
      useAuthStore.setState({ authMode: 'login', authError: 'old error' });

      useAuthStore.getState().setAuthMode('signup');

      expect(useAuthStore.getState().authMode).toBe('signup');
      expect(useAuthStore.getState().authError).toBe('');
    });

    it('clearError clears only authError', () => {
      useAuthStore.setState({ authError: 'some error', authMode: 'signup' });

      useAuthStore.getState().clearError();

      expect(useAuthStore.getState().authError).toBe('');
      expect(useAuthStore.getState().authMode).toBe('signup');
    });

    it('hasAccess returns true for matching role', () => {
      useAuthStore.setState({ userAccess: ['toolkit', 'cricket'] });

      expect(useAuthStore.getState().hasAccess('toolkit')).toBe(true);
      expect(useAuthStore.getState().hasAccess('cricket')).toBe(true);
      expect(useAuthStore.getState().hasAccess('admin')).toBe(false);
    });

    it('hasAccess returns true for admin regardless of role', () => {
      useAuthStore.setState({ userAccess: ['admin'] });

      expect(useAuthStore.getState().hasAccess('toolkit')).toBe(true);
      expect(useAuthStore.getState().hasAccess('cricket')).toBe(true);
      expect(useAuthStore.getState().hasAccess('admin')).toBe(true);
    });

    it('"User already registered" on non-cricket signup shows sanitized error', async () => {
      mockRpc.mockImplementation((fn: string) => {
        if (fn === 'get_user_count') return Promise.resolve({ data: 1, error: null });
        return Promise.resolve({ data: null, error: null });
      });
      mockSignupQueries();

      mockSignUp.mockResolvedValue({
        data: null,
        error: { message: 'User already registered' },
      });

      // Toolkit signup (no access param) — "already registered" goes through sanitizeAuthError
      await useAuthStore.getState().signup('existing@example.com', VALID_PASSWORD, 'Existing User');

      expect(useAuthStore.getState().authError).toBe(
        'An account with this email already exists. Try signing in instead.'
      );
    });
  });
});
