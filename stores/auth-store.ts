import { create } from 'zustand';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import {
  sanitizeAuthError,
  validatePassword,
  isRateLimited,
} from '@/lib/auth';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

type AuthMode = 'login' | 'signup' | 'check-email' | 'forgot' | 'reset-sent';

interface AuthState {
  user: User | null;
  loading: boolean;
  authMode: AuthMode;
  authError: string;
  syncing: boolean;
  isCloud: boolean;
  needsPasswordReset: boolean;

  init: () => void;
  updatePassword: (password: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => void;
  setAuthMode: (mode: AuthMode) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  authMode: 'login',
  authError: '',
  syncing: false,
  isCloud: false,
  needsPasswordReset: false,

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

    // Check for reset code in URL — exchange it FIRST before getSession
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    const afterCodeExchange = () => {
      supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
        set({ user: session?.user ?? null, loading: false });
      });

      supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
        set({ user: session?.user ?? null });
      });
    };

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }: { error: Error | null }) => {
        if (!error) {
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname);
          set({ needsPasswordReset: true });
        }
        afterCodeExchange();
      });
    } else {
      afterCodeExchange();
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

    set({ needsPasswordReset: false, authError: '' });
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

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      set({ authError: sanitizeAuthError(error.message), syncing: false });
      return;
    }

    set({ syncing: false });
  },

  signup: async (email: string, password: string, name: string) => {
    set({ authError: '', syncing: true });

    // Check max users
    const maxUsers = parseInt(process.env.NEXT_PUBLIC_MAX_USERS || '10', 10);
    const sb = getSupabaseClient();
    if (sb) {
      const { data: userCount } = await sb.from('vibes').select('user_id').limit(1000);
      const distinctUsers = new Set(userCount?.map((r: { user_id: string }) => r.user_id) || []).size;
      if (distinctUsers >= maxUsers) {
        set({ authError: 'Maximum number of accounts reached.', syncing: false });
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

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name.trim() } },
    });

    if (error) {
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

  logout: () => {
    const supabase = getSupabaseClient();
    supabase?.auth.signOut();
    set({ user: null, authMode: 'login', authError: '' });
  },

  setAuthMode: (mode: AuthMode) => {
    set({ authMode: mode, authError: '' });
  },

  clearError: () => {
    set({ authError: '' });
  },
}));
