'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { PLAYER_ROLES, BATTING_STYLES, BOWLING_STYLES, SHIRT_SIZES } from '@/app/(tools)/cricket/lib/constants';
import { GiCricketBat, GiBaseballGlove, GiTennisBall } from 'react-icons/gi';
import { FaBullseye, FaStar } from 'react-icons/fa';
import { MdSportsCricket } from 'react-icons/md';

import { getSupabaseClient } from '@/lib/supabase/client';
import { validatePassword } from '@/lib/auth';
import { PasswordInput, passwordRequirements, allRequirementsMet, Spinner, Text } from '@/components/ui';

type AuthGateVariant = 'toolkit' | 'cricket';

interface InviteTeamInfo {
  team_name: string;
  team_slug: string;
  team_id: string;
}

/* ── Request Access screen — shown when user is logged in but lacks access for this variant ── */
function RequestAccess({ variant }: { variant: AuthGateVariant }) {
  const { user, logout } = useAuthStore();
  const [requested, setRequested] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [checking, setChecking] = useState(true);

  // Auto-approve if user's email matches a pre-added player record
  useEffect(() => {
    if (!user?.email || variant !== 'cricket') { setChecking(false); return; }
    const supabase = getSupabaseClient();
    if (!supabase) { setChecking(false); return; }

    (async () => {
      // Check if email exists in cricket_players (same as auto-approve logic)
      const { data: isPlayer } = await supabase.rpc('check_cricket_player_email', { check_email: user.email });
      if (isPlayer) {
        // Auto-approve: add cricket access, keep approved=true, link player record
        const { userAccess, userFeatures } = useAuthStore.getState();
        const newAccess = [...new Set([...userAccess, 'cricket'])];
        const newFeatures = [...new Set([...userFeatures, 'cricket'])];
        await supabase.from('profiles').update({ access: newAccess, approved: true, features: newFeatures }).eq('id', user.id);
        // Link player record
        await supabase.from('cricket_players')
          .update({ user_id: user.id })
          .ilike('email', user.email!.trim())
          .eq('is_active', true);
        // Update local state and reload
        useAuthStore.setState({ userAccess: newAccess, userFeatures: newFeatures, userApproved: true });
        // Create welcome post (only reached for genuinely new cricket users —
        // the race condition guard in AuthGate prevents existing users from
        // reaching RequestAccess while profile is still loading)
        await supabase.rpc('create_welcome_post', {
          new_user_id: user.id,
          player_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Player',
        });
        window.location.reload();
        return;
      }
      setChecking(false);
    })();
  }, [user, variant]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRequest = async () => {
    if (!user) return;
    setRequesting(true);
    const supabase = getSupabaseClient();
    if (!supabase) { setRequesting(false); return; }

    // Add the variant to user's access array and set approved=false for admin review
    const { userAccess } = useAuthStore.getState();
    const newAccess = [...new Set([...userAccess, variant])];
    await supabase.from('profiles').update({ access: newAccess, approved: false }).eq('id', user.id);
    setRequested(true);
    setRequesting(false);
  };

  const config = variant === 'cricket' ? {
    title: 'Cricket Team',
    subtitle: 'You need cricket access to view this page.',
    buttonText: 'Request Cricket Access',
    accentColor: 'var(--cricket)',
    gradient: 'from-[var(--cricket)] to-[var(--cricket-accent)]',
  } : {
    title: 'Access Required',
    subtitle: 'You don\'t have access to this tool.',
    buttonText: 'Request Access',
    accentColor: 'var(--toolkit)',
    gradient: 'from-[var(--toolkit)] to-[var(--toolkit-accent)]',
  };

  if (checking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--cricket)] border-t-transparent" />
      </div>
    );
  }

  if (requested) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-xl">
          <div className="mb-4 text-4xl">✅</div>
          <Text as="h2" size="xl" weight="semibold" className="mb-2">Request Sent</Text>
          <Text as="p" size="md" color="muted" className="mb-6 text-[15px]">
            The team admin will review your request. You&apos;ll be able to access once approved.
          </Text>
          <button onClick={logout}
            className="w-full cursor-pointer rounded-xl bg-[var(--surface)] px-4 py-2.5 text-[15px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--border)]">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-xl">
        <div className="mb-4 text-4xl">🏏</div>
        <Text as="h2" size="xl" weight="semibold" className="mb-2">{config.title}</Text>
        <Text as="p" size="md" color="muted" className="mb-2 text-[15px]">{config.subtitle}</Text>
        <Text as="p" size="sm" color="dim" className="mb-6">
          Signed in as <Text weight="medium">{user?.email}</Text>
        </Text>
        <button onClick={handleRequest} disabled={requesting}
          className={`w-full cursor-pointer rounded-xl bg-gradient-to-r ${config.gradient} px-4 py-3 text-[15px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed mb-3`}>
          {requesting ? 'Requesting...' : config.buttonText}
        </button>
        <button onClick={logout}
          className="w-full cursor-pointer rounded-xl bg-[var(--surface)] px-4 py-2.5 text-[13px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--border)]">
          Sign out and use a different account
        </button>
      </div>
    </div>
  );
}

/* ── Role icon + color config for signup chip buttons ── */
const signupRoleConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  batsman: { icon: <GiCricketBat size={13} />, color: 'var(--cricket)' },
  bowler: { icon: <FaBullseye size={12} />, color: '#3B82F6' },
  'all-rounder': { icon: <FaStar size={12} />, color: 'var(--cricket-accent)' },
  keeper: { icon: <GiBaseballGlove size={13} />, color: '#16A34A' },
};

const VARIANT_CONFIG = {
  toolkit: {
    heroImage: '/hero.png',
    heroAlt: "Viber's Toolkit",
    tagline: 'Capture Ideas. Align with Flow.',
    subtitle: 'Your personal productivity toolkit to think, plan, and achieve.',
    pills: ['✦ Capture', '◷ Plan', '✓ Track', '🚀 Achieve'],
    loginTitle: 'Welcome Back',
    loginSubtitle: 'Log in to your toolkit',
    signupTitle: 'Get Started',
    signupSubtitle: 'Create your account',
    gradient: 'from-[var(--toolkit)] via-[var(--blue)] to-[var(--toolkit-accent)]',
    buttonGradient: 'from-[var(--toolkit)] to-[var(--toolkit-accent)]',
    focusColor: 'focus:border-[var(--toolkit)] focus:ring-[var(--toolkit)]/30',
    orbColor1: 'var(--toolkit)',
    orbColor2: 'var(--blue)',
    shadowColor: 'var(--toolkit-glow)',
    accentColor: 'var(--toolkit)',
    access: 'toolkit',
  },
  cricket: {
    heroImage: '/cricket-hero.png?v=2',
    heroAlt: 'Cricket Team',
    tagline: 'Cricket Team Management',
    subtitle: 'Team expenses, dues, and more — all in one place.',
    pills: ['🏏 Cricket', '💰 Expenses', '📊 Dues', '🤝 Settle'],
    loginTitle: 'Welcome Back',
    loginSubtitle: 'Log in to your team',
    signupTitle: 'Join the Team',
    signupSubtitle: 'Create your account',
    gradient: 'from-[var(--cricket)] to-[var(--cricket-accent)]',
    buttonGradient: 'from-[var(--cricket)] to-[var(--cricket-accent)]',
    focusColor: 'focus:border-[var(--cricket)] focus:ring-[var(--cricket)]/30',
    orbColor1: 'var(--cricket)',
    orbColor2: 'var(--cricket-accent)',
    shadowColor: 'var(--cricket-glow)',
    accentColor: 'var(--cricket)',
    access: 'cricket',
  },
};

export function AuthGate({ children, variant = 'toolkit' }: { children: React.ReactNode; variant?: AuthGateVariant }) {
  const { user, loading, isCloud, authMode, authError, syncing, login, signup, resetPassword, setAuthMode, clearError, init } =
    useAuthStore();
  const baseConfig = VARIANT_CONFIG[variant];
  const [v, setV] = useState(baseConfig);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // Cricket player fields
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [playerRole, setPlayerRole] = useState('');
  const [battingStyle, setBattingStyle] = useState('');
  const [bowlingStyle, setBowlingStyle] = useState('');
  const [shirtSize, setShirtSize] = useState('');

  const isCricketSignup = variant === 'cricket' && authMode === 'signup';
  const showBatting = ['batsman', 'all-rounder', 'keeper'].includes(playerRole);
  const showBowling = ['bowler', 'all-rounder'].includes(playerRole);

  // Invite token branding — detect ?join= param and fetch team info
  const [inviteTeam, setInviteTeam] = useState<InviteTeamInfo | null>(null);

  useEffect(() => {
    if (variant !== 'cricket' || typeof window === 'undefined') return;
    const joinToken = new URLSearchParams(window.location.search).get('join');
    if (!joinToken) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.rpc('validate_invite_token', { p_token: joinToken })
      .then(({ data }: { data: InviteTeamInfo | null }) => {
        if (data && !('error' in data)) setInviteTeam(data);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  const handleRoleChange = (role: string) => {
    const newRole = playerRole === role ? '' : role;
    setPlayerRole(newRole);
    if (!['batsman', 'all-rounder', 'keeper'].includes(newRole)) setBattingStyle('');
    if (!['bowler', 'all-rounder'].includes(newRole)) setBowlingStyle('');
  };

  useEffect(() => {
    init();
  }, [init]);

  // Override config with invite team branding when available
  useEffect(() => {
    if (inviteTeam?.team_name) {
      const name = inviteTeam.team_name;
      setV(prev => ({
        ...prev,
        tagline: name,
        heroAlt: name,
        loginTitle: `Welcome to ${name}`,
        loginSubtitle: 'Log in to your team',
        signupTitle: `Join ${name}`,
        signupSubtitle: 'Create your account to join the team',
      }));
    }
  }, [inviteTeam]);

  // Set favicon + title for cricket variant
  useEffect(() => {
    if (variant === 'cricket') {
      document.title = inviteTeam?.team_name ?? 'Cricket';
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement
        || document.createElement('link');
      link.rel = 'icon';
      link.href = '/cricket-logo.png';
      document.head.appendChild(link);
    }
  }, [variant]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" brand={variant} />
      </div>
    );
  }

  if (!isCloud) {
    return <>{children}</>;
  }

  // User is logged in but doesn't have the required access for this variant.
  // IMPORTANT: Only gate AFTER userAccess is loaded from the profile (non-empty).
  // Without this guard, a race condition causes RequestAccess to render during
  // the brief window where user exists but profile hasn't loaded yet (userAccess=[]),
  // which re-triggers auto-approve + welcome post for existing users.
  const currentAccess = useAuthStore.getState().userAccess;
  if (user && variant !== 'toolkit' && currentAccess.length > 0 && !currentAccess.includes(variant) && !currentAccess.includes('admin')) {
    return <RequestAccess variant={variant} />;
  }

  // Profile still loading (user exists but access not yet fetched) — show spinner
  if (user && variant !== 'toolkit' && currentAccess.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--cricket)] border-t-transparent" />
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  // Message screens (check-email, reset-sent, pending-approval)
  if (authMode === 'check-email' || authMode === 'reset-sent' || authMode === 'pending-approval') {
    const config = {
      'check-email': { icon: '✉️', title: 'Confirm Your Email', message: 'We sent a confirmation link. Click it, then come back and log in.' },
      'reset-sent': { icon: '🔑', title: 'Check Your Email', message: 'We sent a password reset link to your email. Click it to set a new password.' },
      'pending-approval': { icon: '⏳', title: 'Pending Approval', message: 'Your signup request has been sent to the team admin. You\u0027ll be able to log in once approved.' },
    }[authMode];
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="animate-slide-in w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-xl">
          <div className="mb-4 text-4xl">{config.icon}</div>
          <Text as="h2" size="xl" weight="semibold" className="mb-2">{config.title}</Text>
          <Text as="p" size="md" color="muted" className="mb-6 text-[15px]">{config.message}</Text>
          <button
            onClick={() => setAuthMode('login')}
            className="w-full cursor-pointer rounded-xl bg-[var(--surface)] px-4 py-2.5 text-[15px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--border)]"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // Forgot password screen
  if (authMode === 'forgot') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="animate-slide-in w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-xl">
          <div className="mb-6 text-center">
            <Text as="h2" size="xl" weight="semibold" className="mb-1 text-[22px]">Reset Password</Text>
            <Text as="p" size="md" color="muted">Enter your email and we&apos;ll send a reset link</Text>
          </div>

          {authError && (
            <div className="mb-4 rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/10 px-3 py-2.5">
              <Text size="md" color="danger">{authError}</Text>
            </div>
          )}

          <div className="mb-5">
            <Text as="label" size="sm" weight="medium" color="muted" className="mb-1 block">Email</Text>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className={`w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] ${v.focusColor} transition-all`}
              placeholder="you@example.com" autoComplete="email"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); resetPassword(email); } }}
            />
          </div>

          <button
            onClick={() => resetPassword(email)}
            disabled={syncing}
            className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${v.buttonGradient} px-4 py-3 text-[16px] font-semibold text-white shadow-lg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {syncing && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            Send Reset Link
          </button>

          <Text as="p" size="sm" color="muted" align="center" className="mt-4">
            Remember your password?{' '}
            <button
              onClick={() => { setAuthMode('login'); clearError(); setEmail(''); }}
              className="cursor-pointer font-medium hover:underline"
              style={{ color: v.accentColor }}
            >
              Log in
            </button>
          </Text>
        </div>
      </div>
    );
  }

  const isLogin = authMode === 'login';
  const isInviteRequired = variant === 'cricket' && !inviteTeam && authMode === 'signup';

  const resetPlayerFields = () => {
    setJerseyNumber(''); setPlayerRole(''); setBattingStyle(''); setBowlingStyle(''); setShirtSize('');
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    if (isLogin) {
      await login(email, password);
    } else {
      const playerData = isCricketSignup ? {
        jersey_number: jerseyNumber ? Number(jerseyNumber) : undefined,
        player_role: playerRole || undefined,
        batting_style: showBatting ? battingStyle || undefined : undefined,
        bowling_style: showBowling ? bowlingStyle || undefined : undefined,
        shirt_size: shirtSize || undefined,
      } : undefined;
      await signup(email, password, name, v.access, playerData, inviteTeam?.team_slug);
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-52px)] overflow-hidden">
      {/* Gradient orbs background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full opacity-20 blur-[100px]"
          style={{ background: `radial-gradient(circle, ${v.orbColor1}, transparent 70%)`, animation: 'float 8s ease-in-out infinite' }} />
        <div className="absolute -bottom-32 -right-32 h-[400px] w-[400px] rounded-full opacity-15 blur-[100px]"
          style={{ background: `radial-gradient(circle, ${v.orbColor2}, transparent 70%)`, animation: 'float 10s ease-in-out infinite reverse' }} />
      </div>

      {/* Centered unified layout */}
      <div className="relative flex items-center justify-center min-h-[calc(100vh-52px)] px-4 py-6 lg:py-8">
        <div className="w-full max-w-5xl animate-fade-in">

          {/* Combined card — stacked on mobile, side-by-side on desktop */}
          <div className="flex flex-col lg:flex-row rounded-3xl border border-[var(--border)] overflow-hidden shadow-2xl"
            style={{ boxShadow: `0 20px 80px ${v.shadowColor}` }}>

            {/* Left: Hero image + tagline */}
            <div className="flex-1 bg-[var(--surface)] p-4 lg:p-10 flex flex-col justify-center items-center">
              {/* Hero: team-branded card for invites, default image otherwise */}
              {inviteTeam && inviteTeam.team_slug !== 'sunrisers-manteca' ? (
                <div className="w-full max-w-sm mx-auto mb-4 lg:mb-8">
                  {/* Branded team card */}
                  <div className="rounded-2xl overflow-hidden shadow-lg" style={{ background: 'var(--card)' }}>
                    {/* Color banner */}
                    <div className="h-24 lg:h-32 flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, var(--cricket), var(--cricket-accent))` }}>
                      <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-2xl flex items-center justify-center text-white font-black text-[36px] lg:text-[44px] bg-white/15 backdrop-blur-sm border-2 border-white/20">
                        {inviteTeam.team_name.charAt(0).toUpperCase()}
                      </div>
                    </div>
                    <div className="p-4 text-center">
                      <Text size="xs" color="dim" className="uppercase tracking-widest text-[10px] mb-1">You&apos;re invited to join</Text>
                      <Text size="xl" weight="bold" className="lg:text-[24px]">{inviteTeam.team_name}</Text>
                      <div className="flex items-center justify-center gap-2 mt-3">
                        {['🏏 Cricket', '💰 Expenses', '📊 Stats'].map((f) => (
                          <Text key={f} size="2xs" color="muted" className="px-2.5 py-1 rounded-full border border-[var(--border)]">{f}</Text>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <img
                    src={v.heroImage}
                    alt={v.heroAlt}
                    className="w-full rounded-xl lg:rounded-2xl mb-3 lg:mb-6"
                  />
                  <Text as="h1" size="lg" weight="semibold" align="center" className={`text-[18px] lg:text-[32px] bg-gradient-to-r ${v.gradient} bg-clip-text text-transparent leading-tight mb-1 lg:mb-2`}>
                    {v.tagline}
                  </Text>
                  <Text as="p" size="xs" color="muted" align="center" className="lg:text-[16px] leading-relaxed hidden lg:block">
                    {v.subtitle}
                  </Text>
                  {/* Feature pills — desktop only */}
                  <div className="hidden lg:flex items-center justify-center gap-2 mt-5">
                    {v.pills.map((f) => (
                      <Text key={f} size="sm" color="muted" className="px-4 py-1.5 rounded-full border border-[var(--border)]">
                        {f}
                      </Text>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Right: Login form or invite-required screen */}
            <div className="lg:w-[420px] lg:min-w-[420px] bg-[var(--card)] p-4 lg:p-10 flex items-center justify-center">
              <div className="w-full animate-slide-in">

            {/* Invite-required screen for direct /cricket signup (no invite token) */}
            {isInviteRequired ? (
              <div className="text-center py-4">
                <div className="mb-4 text-4xl">🔗</div>
                <Text as="h2" size="xl" weight="semibold" className="mb-2 text-[20px] lg:text-[24px]">
                  Invite Link Required
                </Text>
                <Text as="p" size="md" color="muted" className="mb-6 text-[15px] leading-relaxed">
                  Ask your team captain or admin for an invite link to join a cricket team.
                </Text>
                <Text as="p" size="sm" color="muted" className="mt-6">
                  Already have an account?{' '}
                  <button
                    onClick={() => { setAuthMode('login'); clearError(); }}
                    className="cursor-pointer font-medium hover:underline"
                    style={{ color: v.accentColor }}
                  >
                    Log in
                  </button>
                </Text>
              </div>
            ) : (

            <form
              onSubmit={handleSubmit}
              className=""
            >
              {/* Invite context banner */}
              {inviteTeam && (
                <div className="mb-4 rounded-xl px-3 py-2.5 text-center"
                  style={{ background: 'color-mix(in srgb, var(--cricket) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--cricket) 20%, transparent)' }}>
                  <Text size="xs" weight="medium" color="muted">
                    {isLogin
                      ? 'Already have an account? Log in below to join the team.'
                      : "New here? Create an account to join the team."}
                  </Text>
                </div>
              )}

              <div className="mb-4 lg:mb-8 text-center">
                <Text as="h2" size="xl" weight="semibold" className="mb-1 text-[20px] lg:text-[26px]">
                  {isLogin ? v.loginTitle : v.signupTitle}
                </Text>
                <Text as="p" size="md" color="muted" className="lg:text-[16px]">
                  {isLogin ? v.loginSubtitle : v.signupSubtitle}
                </Text>
              </div>

              {authError && (
                <div className="mb-4 rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/10 px-3 py-2.5">
                  <Text size="md" color="danger">{authError}</Text>
                </div>
              )}

              {!isLogin && (
                <div className="mb-3">
                  <Text as="label" size="sm" weight="medium" color="muted" className="mb-1 block">Name</Text>
                  <input
                    type="text" value={name} onChange={(e) => setName(e.target.value)}
                    className={`w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] ${v.focusColor} transition-all`}
                    placeholder="Your name" autoComplete="name"
                  />
                </div>
              )}

              <div className="mb-3">
                <Text as="label" size="sm" weight="medium" color="muted" className="mb-1 block">Email</Text>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className={`w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] ${v.focusColor} transition-all`}
                  placeholder="you@example.com" autoComplete="email"
                />
              </div>

              <div className={isCricketSignup ? 'mb-3' : (!isLogin && password.length > 0 ? 'mb-2' : 'mb-5')}>
                <PasswordInput
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  showRequirements={!isLogin}
                  brand={variant}
                />
              </div>

              {/* ── Cricket player fields (signup only) ── */}
              {isCricketSignup && (
                <div className="mb-5 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <Text as="p" size="xs" weight="semibold" color="muted" uppercase tracking="wide">Player Info</Text>

                  {/* Jersey Number */}
                  <div>
                    <Text as="label" size="xs" weight="medium" color="muted" className="mb-1 block">Jersey Number</Text>
                    <input
                      type="number" value={jerseyNumber} onChange={(e) => setJerseyNumber(e.target.value)}
                      className={`w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none ${v.focusColor} transition-all`}
                      placeholder="Optional"
                    />
                  </div>

                  {/* Role (required) */}
                  <div>
                    <Text as="label" size="xs" weight="medium" color="muted" className="mb-1.5 block">Role *</Text>
                    <div className="flex flex-wrap gap-1.5">
                      {PLAYER_ROLES.map((r) => {
                        const rc = signupRoleConfig[r.key];
                        const selected = playerRole === r.key;
                        return (
                          <button key={r.key} type="button" onClick={() => handleRoleChange(r.key)}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium cursor-pointer transition-all border"
                            style={{ backgroundColor: selected ? rc?.color ?? 'var(--cricket)' : 'transparent', borderColor: selected ? rc?.color ?? 'var(--cricket)' : 'var(--border)', color: selected ? 'white' : 'var(--text)' }}>
                            {rc?.icon} {r.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Batting + Bowling (conditional) */}
                  {(showBatting || showBowling) && (
                    <div className={`grid gap-3 ${showBatting && showBowling ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {showBatting && (
                        <div>
                          <Text as="label" size="xs" weight="medium" color="muted" className="mb-1.5 block">Batting *</Text>
                          <div className="flex flex-col gap-1.5">
                            {BATTING_STYLES.map((s) => {
                              const selected = battingStyle === s.key;
                              return (
                                <button key={s.key} type="button" onClick={() => setBattingStyle(selected ? '' : s.key)}
                                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium cursor-pointer transition-all border"
                                  style={{ backgroundColor: selected ? 'var(--blue)' : 'transparent', borderColor: selected ? 'var(--blue)' : 'var(--border)', color: selected ? 'white' : 'var(--text)' }}>
                                  <MdSportsCricket size={14} /> {s.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {showBowling && (
                        <div>
                          <Text as="label" size="xs" weight="medium" color="muted" className="mb-1.5 block">Bowling *</Text>
                          <div className="flex flex-col gap-1.5">
                            {BOWLING_STYLES.map((s) => {
                              const selected = bowlingStyle === s.key;
                              return (
                                <button key={s.key} type="button" onClick={() => setBowlingStyle(selected ? '' : s.key)}
                                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium cursor-pointer transition-all border"
                                  style={{ backgroundColor: selected ? 'var(--green)' : 'transparent', borderColor: selected ? 'var(--green)' : 'var(--border)', color: selected ? 'white' : 'var(--text)' }}>
                                  <GiTennisBall size={13} /> {s.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Shirt Size */}
                  <div>
                    <Text as="label" size="xs" weight="medium" color="muted" className="mb-1.5 block">Shirt Size</Text>
                    <div className="flex flex-wrap gap-1.5">
                      {SHIRT_SIZES.map((s) => {
                        const selected = shirtSize === s.key;
                        return (
                          <button key={s.key} type="button" onClick={() => setShirtSize(selected ? '' : s.key)}
                            className="h-7 w-9 rounded-lg text-[11px] font-medium cursor-pointer transition-all border"
                            style={{ backgroundColor: selected ? s.color : 'transparent', borderColor: selected ? s.color : 'var(--border)', color: selected ? 'white' : 'var(--muted)' }}>
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit" disabled={syncing || (!isLogin && !allRequirementsMet(password))}
                className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${v.buttonGradient} px-4 py-3 text-[16px] font-semibold text-white shadow-lg transition-all hover:opacity-90 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {syncing && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {isLogin ? 'Log In' : 'Sign Up'}
              </button>

              {isLogin && (
                <p className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('forgot'); clearError(); setPassword(''); }}
                    className="cursor-pointer text-[13px] text-[var(--muted)] transition-colors"
                    style={{ '--hover-accent': v.accentColor } as React.CSSProperties}
                    onMouseEnter={(e) => (e.currentTarget.style.color = `${v.accentColor}`)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '')}
                  >
                    Forgot password?
                  </button>
                </p>
              )}

              <Text as="p" size="sm" color="muted" align="center" className="mt-3">
                {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
                <button
                  type="button"
                  onClick={() => { setAuthMode(isLogin ? 'signup' : 'login'); clearError(); setEmail(''); setPassword(''); setName(''); resetPlayerFields(); }}
                  className="cursor-pointer font-medium hover:underline"
                  style={{ color: v.accentColor }}
                >
                  {isLogin ? 'Sign up' : 'Log in'}
                </button>
              </Text>
            </form>
            )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
