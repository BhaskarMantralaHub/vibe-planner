import { create } from 'zustand';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import {
  sanitizeAuthError,
  validatePassword,
  isRateLimited,
} from '@/lib/auth';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

type AuthMode = 'login' | 'signup' | 'check-email' | 'forgot' | 'reset-sent' | 'pending-approval';

export interface PlayerSignupData {
  jersey_number?: number;
  player_role?: string;
  batting_style?: string;
  bowling_style?: string;
  shirt_size?: string;
}

export interface UserTeam {
  team_id: string;
  team_name: string;
  team_slug: string;
  role: string;
  approved: boolean;
  logo_url: string | null;
  primary_color: string | null;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  authMode: AuthMode;
  authError: string;
  syncing: boolean;
  isCloud: boolean;
  needsPasswordReset: boolean;
  userAccess: string[];
  userFeatures: string[];
  userApproved: boolean;
  /**
   * True once the profile row has been fetched for the current user — the
   * ONLY honest signal for "access is known". Callers must never infer it
   * from `userAccess.length`: an empty access array is a legitimate state
   * (e.g. a user rejected from the only team they asked to join), and
   * treating it as "still loading" hangs the UI on a spinner forever.
   */
  profileLoaded: boolean;
  userTeams: UserTeam[];
  currentTeamId: string | null;

  init: () => void;
  updatePassword: (password: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, access?: string, playerData?: PlayerSignupData, teamSlug?: string, inviteToken?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => void;
  setAuthMode: (mode: AuthMode) => void;
  clearError: () => void;
  hasAccess: (role: string) => boolean;
  hasFeature: (feature: string) => boolean;
  /**
   * Can this user administer the team they are looking at?
   *
   * TRUE for an owner/admin on the current team, or a global admin. This is
   * the check the cricket UI should use — the database already gates every
   * team write on is_team_admin(), so keying the buttons on the GLOBAL admin
   * flag hid controls from captains the RLS would happily have accepted, and
   * meant the only way to let a captain manage the roster was to hand them
   * cross-team global admin.
   */
  isTeamAdmin: () => boolean;
  setCurrentTeam: (teamId: string) => void;
  loadUserTeams: (forceRefresh?: boolean) => Promise<void>;
}

export const RESET_FLAG_KEY = 'vibe_needs_password_reset';
const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes

const readResetFlag = (): boolean => {
  if (typeof window === 'undefined') return false;
  const raw = sessionStorage.getItem(RESET_FLAG_KEY);
  if (!raw) return false;
  try {
    const { ts } = JSON.parse(raw);
    if (Date.now() - ts > RESET_TTL_MS) {
      sessionStorage.removeItem(RESET_FLAG_KEY);
      return false;
    }
    return true;
  } catch {
    sessionStorage.removeItem(RESET_FLAG_KEY);
    return false;
  }
};

const setNeedsReset = (value: boolean) => {
  if (value) {
    sessionStorage.setItem(RESET_FLAG_KEY, JSON.stringify({ ts: Date.now() }));
  } else {
    sessionStorage.removeItem(RESET_FLAG_KEY);
  }
  return { needsPasswordReset: value };
};

// One-per-page-load guard for init() — see the comment inside init().
let authInitDone = false;

/** Test-only: clears the one-init-per-page guard so each test can run init(). */
export const __resetAuthInitGuardForTests = () => { authInitDone = false; };

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  authMode: 'login',
  authError: '',
  syncing: false,
  isCloud: false,
  needsPasswordReset: readResetFlag(),
  userTeams: [],
  currentTeamId: typeof window !== 'undefined' ? localStorage.getItem('vibe_current_team') : null,
  userAccess: [],
  userFeatures: [],
  userApproved: true,
  profileLoaded: false,

  init: () => {
    // Exactly one initialization per page lifecycle. init() is mounted from
    // both app/page.tsx and AuthGate, and each call used to register another
    // onAuthStateChange listener (never unsubscribed) plus a duplicate
    // getSession → profile fetch. The module-level flag survives client-side
    // navigations and resets on a real page load, which is exactly the
    // listener lifetime we want.
    if (authInitDone) return;
    authInitDone = true;

    const cloud = isCloudMode();
    set({ isCloud: cloud });

    if (!cloud) {
      set({ loading: false });
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      set({ loading: false });
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    const code = params.get('code');
    // ?flow= disambiguates the two PKCE ?code= arrivals. Emails we send from
    // now on carry it (signup → flow=confirm, reset → flow=recovery); a bare
    // legacy ?code= keeps the old recovery treatment so reset links already
    // in inboxes stay usable.
    const flow = params.get('flow');

    const checkProfileAndSetUser = async (session: Session | null) => {
      if (!session?.user) {
        set({ user: null, loading: false, profileLoaded: false });
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('disabled, access, approved, features')
        .eq('id', session.user.id)
        .single();

      if (profile?.disabled) {
        await supabase.auth.signOut();
        set({ user: null, loading: false, authError: 'Your account has been disabled. Contact the administrator.' });
        return;
      }

      const access: string[] = profile?.access ?? ['toolkit'];
      const approved: boolean = profile?.approved !== false;

      // Awaiting a team admin's decision. The session is deliberately KEPT
      // (RLS gates every team table on an ACTIVE membership, so they can see
      // no team data either way) — signing them out left the pending screen
      // with nothing to check, so the only way to discover an admin's
      // decision was to keep guessing at the login form. Staying signed in
      // lets that screen watch their own membership row and let them in the
      // moment it turns active.
      if (!approved) {
        set({ user: session.user, loading: false, userAccess: access, userFeatures: [],
              userApproved: false, profileLoaded: true });
        return;
      }

      // Derive features from access if not yet set (backward compat for pre-migration users)
      let features: string[] = profile?.features ?? [];
      if (features.length === 0) {
        if (access.includes('toolkit')) features = [...features, 'vibe-planner', 'id-tracker'];
        if (access.includes('cricket')) features = [...features, 'cricket'];
      }

      // Player record linking + preference override handled by handle_new_user() DB trigger
      set({ user: session.user, loading: false, userAccess: access, userFeatures: features, userApproved: approved, profileLoaded: true });

      // Track login activity (covers session restore + explicit login; dedup prevents double-count)
      import('@/lib/activity').then(({ trackActivity }) => trackActivity(session.user.id, 'login'))
        .catch((err) => console.warn('[auth] login activity tracking failed:', err));

      // Load user's team memberships (fire-and-forget, non-blocking)
      if (access.includes('cricket')) {
        get().loadUserTeams();
      }
    };

    const setupAuthListener = () => {
      supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
        checkProfileAndSetUser(session);
      });

      supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
        if (event === 'PASSWORD_RECOVERY') {
          set(setNeedsReset(true));
          if (session?.user) {
            checkProfileAndSetUser(session);
          }
          return;
        }
        if (session?.user) {
          checkProfileAndSetUser(session);
        } else {
          set({ user: null });
        }
      });
    };

    const handleResetResult = async (error: Error | null) => {
      window.history.replaceState({}, '', window.location.pathname);
      if (!error) {
        set(setNeedsReset(true));
      } else {
        // Token already consumed but session may still exist from first click
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // User clicked the link before, got a session, but never reset — show reset form
          set(setNeedsReset(true));
        } else {
          console.warn('[auth] password reset verification failed:', error.message);
          set({
            authError:
              'This password reset link is invalid or has expired. Please request a new one using "Forgot password?" below.',
          });
        }
      }
      setupAuthListener();
    };

    // Token hash flow — works across any browser/device (no PKCE needed)
    if (tokenHash && type === 'recovery') {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        .then(({ error }: { error: Error | null }) => handleResetResult(error));
    // EMAIL CONFIRMATION (signup): establish the session and carry on — this
    // must NEVER route into the password-reset form. ?join= is preserved so
    // InviteHandler can finish the invitation right after the session lands;
    // the confirmed player is signed in with no second login.
    } else if (code && flow === 'confirm') {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ error }: { error: Error | null }) => {
          const url = new URL(window.location.href);
          url.searchParams.delete('code');
          url.searchParams.delete('flow');
          window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''));
          if (error) {
            console.warn('[auth] email confirmation exchange failed:', error.message);
            set({ authError: 'This confirmation link is invalid or has expired. Try logging in — your account may already be confirmed.' });
          }
          setupAuthListener();
        });
    // RECOVERY via PKCE — new reset emails carry flow=recovery; a bare legacy
    // ?code= gets the same treatment so old reset links keep working.
    } else if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ error }: { error: Error | null }) => handleResetResult(error));
    } else {
      setupAuthListener();
    }
  },

  updatePassword: async (password: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      set({ authError: error.message });
      return false;
    }

    // Keep needsPasswordReset true — ResetPasswordForm will clear it after showing success
    set({ authError: '' });
    return true;
  },

  login: async (email: string, password: string) => {
    set({ authError: '', syncing: true });

    if (!email.trim() || !password.trim()) {
      set({ authError: 'Please enter your email and password.', syncing: false });
      return;
    }

    if (isRateLimited()) {
      set({
        authError: 'Too many attempts. Please wait a moment and try again.',
        syncing: false,
      });
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      set({ authError: 'Cloud mode is not configured.', syncing: false });
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      set({ authError: sanitizeAuthError(error.message), syncing: false });
      return;
    }

    // Check profile: disabled, approved, access, features
    if (data?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('disabled, access, approved, features')
        .eq('id', data.user.id)
        .single();

      if (profile?.disabled) {
        await supabase.auth.signOut();
        set({ authError: 'Your account has been disabled. Contact the administrator.', syncing: false, user: null });
        return;
      }

      // Pending: keep the session (see checkProfileAndSetUser above). The
      // auth listener commits the user; AuthGate renders the waiting screen.
      if (profile?.approved === false) {
        set({ syncing: false, userApproved: false, profileLoaded: true,
              userAccess: profile?.access ?? [], userFeatures: [] });
        return;
      }

      const access: string[] = profile?.access ?? ['toolkit'];

      // Derive features from access if not yet set (backward compat for pre-migration users)
      let features: string[] = profile?.features ?? [];
      if (features.length === 0) {
        if (access.includes('toolkit')) features = [...features, 'vibe-planner', 'id-tracker'];
        if (access.includes('cricket')) features = [...features, 'cricket'];
      }

      set({ userAccess: access, userFeatures: features, userApproved: profile?.approved !== false, profileLoaded: true });

      // Login activity tracked by checkProfileAndSetUser (called via onAuthStateChange)

      // NOTE: the old "backup" cricket_players linking UPDATE that lived here
      // was a silent no-op for every non-admin (the client cannot pass the
      // cricket_players UPDATE RLS, and an unlinked row is invisible to the
      // self-edit policy's USING). Real linking is server-side only:
      // handle_new_user, accept_invite, approve_team_member — one authority.
    }

    set({ syncing: false });
  },

  signup: async (email: string, password: string, name: string, access?: string, playerData?: PlayerSignupData, teamSlug?: string, inviteToken?: string) => {
    set({ authError: '', syncing: true });

    // Check max users from app_settings (no auth needed)
    const sb = getSupabaseClient();
    if (sb) {
      const [{ data: countData }, { data: settings }] = await Promise.all([
        sb.rpc('get_user_count'),
        sb.from('app_settings').select('value').eq('key', 'max_users').single(),
      ]);
      const maxUsers = parseInt(settings?.value || '15', 10);
      if (typeof countData === 'number' && countData >= maxUsers) {
        set({ authError: 'Maximum number of accounts reached. Contact the administrator.', syncing: false });
        return;
      }
    }

    if (!name.trim()) {
      set({ authError: 'Please enter your name.', syncing: false });
      return;
    }

    if (!email.trim()) {
      set({ authError: 'Please enter your email.', syncing: false });
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      set({ authError: passwordError, syncing: false });
      return;
    }



    if (isRateLimited()) {
      set({
        authError: 'Too many attempts. Please wait a moment and try again.',
        syncing: false,
      });
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      set({ authError: 'Cloud mode is not configured.', syncing: false });
      return;
    }

    const role = access || 'toolkit';

    // NOTE: no `approved` in the metadata — the DB trigger computes approval
    // server-side and always ignored the client value; sending it only
    // suggested a trust that never existed. Same for the pre-signup roster
    // probe that used to run here: it fed that dead field and doubled as an
    // anonymous roster-email oracle.
    const metadata: Record<string, unknown> = {
      full_name: name.trim(),
      access: role,
    };
    // Include player data in metadata for cricket signups (used only when an
    // admin approves an UNKNOWN signup and creates their roster record —
    // pre-added players keep the roster data the admin already entered)
    if (playerData) {
      if (playerData.jersey_number != null) metadata.jersey_number = playerData.jersey_number;
      if (playerData.player_role) metadata.player_role = playerData.player_role;
      if (playerData.batting_style) metadata.batting_style = playerData.batting_style;
      if (playerData.bowling_style) metadata.bowling_style = playerData.bowling_style;
      if (playerData.shirt_size) metadata.shirt_size = playerData.shirt_size;
    }
    // Pass team context for invite-based signups
    if (teamSlug) metadata.team_slug = teamSlug;

    // The confirmation email returns here with ?flow=confirm (+ the invite
    // token, so InviteHandler can finish the join) — init() exchanges the
    // code and the user lands SIGNED IN, no second login. The URL is our own
    // origin/path, never a caller-supplied redirect.
    const confirmUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?flow=confirm${inviteToken ? `&join=${inviteToken}` : ''}`
      : undefined;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata, emailRedirectTo: confirmUrl },
    });

    if (error) {
      const lower = error.message.toLowerCase();

      if (lower.includes('user already registered')) {
        // Deliberately generic — no roster/team detail (enumeration surface).
        // An existing user joins the team by logging in; InviteHandler picks
        // the pending invite up after login.
        set({ authError: 'You already have an account. Please log in instead — the invite will be applied after you sign in.', syncing: false, authMode: 'login' });
        return;
      }

      set({ authError: sanitizeAuthError(error.message), syncing: false });
      return;
    }

    set({ authMode: 'check-email', syncing: false });
  },

  resetPassword: async (email: string) => {
    set({ authError: '', syncing: true });

    if (!email.trim()) {
      set({ authError: 'Please enter your email.', syncing: false });
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      set({ authError: 'Not available in local mode.', syncing: false });
      return;
    }

    // Return to the page the user reset FROM (a cricket-only user must not
    // land on the toolkit route), tagged flow=recovery so init() routes the
    // ?code= into the reset form — and never confuses it with a signup
    // confirmation. Own origin/path only; never a caller-supplied URL.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}?flow=recovery`
        : undefined,
    });

    if (error) {
      set({ authError: sanitizeAuthError(error.message), syncing: false });
      return;
    }

    set({ authMode: 'reset-sent', syncing: false });
  },

  logout: async () => {
    // Sign out FIRST — must complete before state clears, otherwise AuthGate
    // remounts, calls init() → getSession() finds the still-active session → re-authenticates
    const supabase = getSupabaseClient();
    await supabase?.auth.signOut();
    localStorage.removeItem('vibe_current_team');
    // A pending invite saved before login belongs to THIS person's session —
    // it must never survive into whoever logs in next on this tab.
    sessionStorage.removeItem('vibe_pending_invite');
    set({ user: null, authMode: 'login', authError: '', ...setNeedsReset(false), userAccess: [], userFeatures: [], userApproved: true, profileLoaded: false, userTeams: [], currentTeamId: null });
  },

  hasAccess: (role: string) => {
    const { userAccess } = get();
    return userAccess.includes(role) || userAccess.includes('admin');
  },

  isTeamAdmin: () => {
    const { userAccess, userTeams, currentTeamId } = get();
    if (userAccess.includes('admin')) return true;
    return userTeams.some((t) =>
      t.approved
      && (t.role === 'owner' || t.role === 'admin')
      && (!currentTeamId || t.team_id === currentTeamId));
  },

  hasFeature: (feature: string) => {
    return get().userFeatures.includes(feature);
  },

  loadUserTeams: async (forceRefresh = false) => {
    const supabase = getSupabaseClient();
    if (!supabase || !get().user) return;

    // Skip if teams already loaded (prevents duplicate calls from StrictMode / auth events)
    if (!forceRefresh && get().userTeams.length > 0) return;

    const { data, error } = await supabase
      .from('team_members')
      .select('team_id, role, approved, cricket_teams(name, slug, logo_url, primary_color)')
      .eq('user_id', get().user!.id);

    if (error) {
      console.warn('[auth] loadUserTeams failed:', error.message);
      return;
    }
    if (!data) return;

    const teams: UserTeam[] = data.map((row: { team_id: string; role: string; approved: boolean; cricket_teams: { name: string; slug: string; logo_url: string | null; primary_color: string | null } | null }) => ({
      team_id: row.team_id,
      team_name: (row.cricket_teams as { name: string; slug: string } | null)?.name ?? 'Unknown',
      team_slug: (row.cricket_teams as { name: string; slug: string } | null)?.slug ?? '',
      role: row.role,
      approved: row.approved ?? true,
      logo_url: (row.cricket_teams as { logo_url: string | null } | null)?.logo_url ?? null,
      primary_color: (row.cricket_teams as { primary_color: string | null } | null)?.primary_color ?? null,
    }));

    // Only approved teams are valid for selection
    const approvedTeams = teams.filter(t => t.approved);
    const storedTeamId = localStorage.getItem('vibe_current_team');
    const validTeamIds = approvedTeams.map(t => t.team_id);
    const currentTeamId = storedTeamId && validTeamIds.includes(storedTeamId)
      ? storedTeamId
      : validTeamIds[0] ?? null;

    if (currentTeamId) localStorage.setItem('vibe_current_team', currentTeamId);
    set({ userTeams: teams, currentTeamId });
  },

  setCurrentTeam: (teamId: string) => {
    localStorage.setItem('vibe_current_team', teamId);
    set({ currentTeamId: teamId });
  },

  setAuthMode: (mode: AuthMode) => {
    set({ authMode: mode, authError: '' });
  },

  clearError: () => {
    set({ authError: '' });
  },
}));
