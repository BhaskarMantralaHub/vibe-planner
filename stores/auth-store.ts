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

  init: () => void;
  updatePassword: (password: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, access?: string, playerData?: PlayerSignupData) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => void;
  setAuthMode: (mode: AuthMode) => void;
  clearError: () => void;
  hasAccess: (role: string) => boolean;
  hasFeature: (feature: string) => boolean;
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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  authMode: 'login',
  authError: '',
  syncing: false,
  isCloud: false,
  needsPasswordReset: readResetFlag(),
  userAccess: [],
  userFeatures: [],
  userApproved: true,

  init: () => {
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

    const checkProfileAndSetUser = async (session: Session | null) => {
      if (!session?.user) {
        set({ user: null, loading: false });
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

      if (!approved) {
        await supabase.auth.signOut();
        set({ user: null, loading: false, authMode: 'pending-approval' });
        return;
      }

      // Derive features from access if not yet set (backward compat for pre-migration users)
      let features: string[] = profile?.features ?? [];
      if (features.length === 0) {
        if (access.includes('toolkit')) features = [...features, 'vibe-planner', 'id-tracker'];
        if (access.includes('cricket')) features = [...features, 'cricket'];
      }

      // Player record linking + preference override handled by handle_new_user() DB trigger
      set({ user: session.user, loading: false, userAccess: access, userFeatures: features, userApproved: approved });
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
    // Legacy PKCE code flow — fallback for old emails
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

    // Check profile: disabled, approved, access
    if (data?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('disabled, access, approved')
        .eq('id', data.user.id)
        .single();

      if (profile?.disabled) {
        await supabase.auth.signOut();
        set({ authError: 'Your account has been disabled. Contact the administrator.', syncing: false, user: null });
        return;
      }

      if (profile?.approved === false) {
        await supabase.auth.signOut();
        set({ syncing: false, user: null, authMode: 'pending-approval' });
        return;
      }

      const access: string[] = profile?.access ?? ['toolkit'];
      set({ userAccess: access, userApproved: profile?.approved !== false });

      // Link cricket player record to this user if they signed up with a pre-added email
      if (data?.user?.email && access.includes('cricket')) {
        supabase.from('cricket_players')
          .update({ user_id: data.user.id })
          .ilike('email', data.user.email.trim())
          .eq('is_active', true)
          .is('user_id', null)
          .then(() => {});
      }
    }

    set({ syncing: false });
  },

  signup: async (email: string, password: string, name: string, access?: string, playerData?: PlayerSignupData) => {
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

    // Check if a cricket player record already exists with this email (admin pre-added)
    let autoApprove = role !== 'cricket';
    if (role === 'cricket') {
      const { data: exists } = await supabase.rpc('check_cricket_player_email', { check_email: email.trim() });
      if (exists) {
        autoApprove = true; // Player was pre-added by admin — skip approval
      }
    }

    const metadata: Record<string, unknown> = {
      full_name: name.trim(),
      access: role,
      approved: autoApprove,
    };
    // Include player data in metadata for cricket signups
    if (playerData) {
      if (playerData.jersey_number != null) metadata.jersey_number = playerData.jersey_number;
      if (playerData.player_role) metadata.player_role = playerData.player_role;
      if (playerData.batting_style) metadata.batting_style = playerData.batting_style;
      if (playerData.bowling_style) metadata.bowling_style = playerData.bowling_style;
      if (playerData.shirt_size) metadata.shirt_size = playerData.shirt_size;
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });

    if (error) {
      console.error('[auth] signup raw error:', error.message, error);
      const lower = error.message.toLowerCase();

      // Handle "already registered" for cricket signup — check if player exists
      if (lower.includes('user already registered') && access === 'cricket') {
        const { data: isPlayer } = await supabase.rpc('check_cricket_player_email', { check_email: email });
        if (isPlayer) {
          set({ authError: 'You already have an account and are on the team. Please sign in instead.', syncing: false });
        } else {
          // No player record — auto-request cricket access for admin approval
          await supabase.rpc('request_cricket_access', { check_email: email });
          set({ syncing: false, authMode: 'pending-approval' });
        }
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

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/vibe-planner/` : undefined,
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
    set({ user: null, authMode: 'login', authError: '', ...setNeedsReset(false), userAccess: [], userFeatures: [], userApproved: true });
  },

  hasAccess: (role: string) => {
    const { userAccess } = get();
    return userAccess.includes(role) || userAccess.includes('admin');
  },

  hasFeature: (feature: string) => {
    return get().userFeatures.includes(feature);
  },

  setAuthMode: (mode: AuthMode) => {
    set({ authMode: mode, authError: '' });
  },

  clearError: () => {
    set({ authError: '' });
  },
}));
