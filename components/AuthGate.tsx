'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { PLAYER_ROLES, BATTING_STYLES, BOWLING_STYLES, SHIRT_SIZES } from '@/app/(tools)/cricket/lib/constants';
import { GiCricketBat, GiBaseballGlove, GiTennisBall } from 'react-icons/gi';
import { FaBullseye, FaStar } from 'react-icons/fa';
import { MdSportsCricket } from 'react-icons/md';

import { getSupabaseClient } from '@/lib/supabase/client';

type AuthGateVariant = 'toolkit' | 'cricket';

/* ── Request Access screen — shown when user is logged in but lacks access for this variant ── */
function RequestAccess({ variant }: { variant: AuthGateVariant }) {
  const { user, logout } = useAuthStore();
  const [requested, setRequested] = useState(false);
  const [requesting, setRequesting] = useState(false);

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
    title: 'Sunrisers Manteca',
    subtitle: 'You need cricket access to view this page.',
    buttonText: 'Request Cricket Access',
    accentColor: 'var(--orange)',
    gradient: 'from-[var(--orange)] to-[var(--red)]',
  } : {
    title: 'Access Required',
    subtitle: 'You don\'t have access to this tool.',
    buttonText: 'Request Access',
    accentColor: 'var(--purple)',
    gradient: 'from-[var(--purple)] to-[var(--indigo)]',
  };

  if (requested) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-xl">
          <div className="mb-4 text-4xl">✅</div>
          <h2 className="mb-2 text-xl font-bold text-[var(--text)]">Request Sent</h2>
          <p className="mb-6 text-[15px] text-[var(--muted)]">
            The team admin will review your request. You&apos;ll be able to access once approved.
          </p>
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
        <h2 className="mb-2 text-xl font-bold text-[var(--text)]">{config.title}</h2>
        <p className="mb-2 text-[15px] text-[var(--muted)]">{config.subtitle}</p>
        <p className="mb-6 text-[13px] text-[var(--dim)]">
          Signed in as <span className="font-medium text-[var(--text)]">{user?.email}</span>
        </p>
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
  batsman: { icon: <GiCricketBat size={13} />, color: '#F59E0B' },
  bowler: { icon: <FaBullseye size={12} />, color: '#3B82F6' },
  'all-rounder': { icon: <FaStar size={12} />, color: '#D97706' },
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
    gradient: 'from-[var(--purple)] via-[var(--blue)] to-[var(--indigo)]',
    buttonGradient: 'from-[var(--purple)] to-[var(--indigo)]',
    focusColor: 'focus:border-[var(--purple)] focus:ring-[var(--purple)]/30',
    orbColor1: 'var(--purple)',
    orbColor2: 'var(--blue)',
    shadowColor: 'rgba(139, 92, 246, 0.15)',
    accentColor: 'var(--purple)',
    access: 'toolkit',
  },
  cricket: {
    heroImage: '/cricket-hero.png',
    heroAlt: 'Sunrisers Manteca',
    tagline: 'Sunrisers Manteca Cricket',
    subtitle: 'Team expenses, dues, and more — all in one place.',
    pills: ['🏏 Cricket', '💰 Expenses', '📊 Dues', '🤝 Settle'],
    loginTitle: 'Welcome Back',
    loginSubtitle: 'Log in to your team',
    signupTitle: 'Join the Team',
    signupSubtitle: 'Create your account',
    gradient: 'from-[var(--orange)] to-[var(--red)]',
    buttonGradient: 'from-[var(--orange)] to-[var(--red)]',
    focusColor: 'focus:border-[var(--orange)] focus:ring-[var(--orange)]/30',
    orbColor1: 'var(--orange)',
    orbColor2: 'var(--red)',
    shadowColor: 'rgba(251, 191, 36, 0.15)',
    accentColor: 'var(--orange)',
    access: 'cricket',
  },
};

export function AuthGate({ children, variant = 'toolkit' }: { children: React.ReactNode; variant?: AuthGateVariant }) {
  const { user, loading, isCloud, authMode, authError, syncing, login, signup, resetPassword, setAuthMode, clearError, init } =
    useAuthStore();
  const v = VARIANT_CONFIG[variant];

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

  const handleRoleChange = (role: string) => {
    const newRole = playerRole === role ? '' : role;
    setPlayerRole(newRole);
    if (!['batsman', 'all-rounder', 'keeper'].includes(newRole)) setBattingStyle('');
    if (!['bowler', 'all-rounder'].includes(newRole)) setBowlingStyle('');
  };

  useEffect(() => {
    init();
  }, [init]);

  // Set favicon + title for cricket variant
  useEffect(() => {
    if (variant === 'cricket') {
      document.title = 'Sunrisers Manteca';
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--purple)] border-t-transparent" />
      </div>
    );
  }

  if (!isCloud) {
    return <>{children}</>;
  }

  // User is logged in but doesn't have the required access for this variant
  if (user && variant !== 'toolkit' && !useAuthStore.getState().userAccess.includes(variant) && !useAuthStore.getState().userAccess.includes('admin')) {
    return <RequestAccess variant={variant} />;
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
          <h2 className="mb-2 text-xl font-bold text-[var(--text)]">{config.title}</h2>
          <p className="mb-6 text-[15px] text-[var(--muted)]">{config.message}</p>
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
            <h2 className="mb-1 text-[22px] font-bold text-[var(--text)]">Reset Password</h2>
            <p className="text-[14px] text-[var(--muted)]">Enter your email and we&apos;ll send a reset link</p>
          </div>

          {authError && (
            <div className="mb-4 rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/10 px-3 py-2.5 text-[14px] text-[var(--red)]">
              {authError}
            </div>
          )}

          <div className="mb-5">
            <label className="mb-1 block text-[13px] font-medium text-[var(--muted)]">Email</label>
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

          <p className="mt-4 text-center text-[13px] text-[var(--muted)]">
            Remember your password?{' '}
            <button
              onClick={() => { setAuthMode('login'); clearError(); setEmail(''); }}
              className="cursor-pointer font-medium hover:underline"
              style={{ color: v.accentColor }}
            >
              Log in
            </button>
          </p>
        </div>
      </div>
    );
  }

  const isLogin = authMode === 'login';

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
      await signup(email, password, name, v.access, playerData);
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
            <div className="flex-1 bg-[var(--surface)] p-4 lg:p-10 flex flex-col justify-center">
              <img
                src={v.heroImage}
                alt={v.heroAlt}
                className="w-full max-h-[140px] lg:max-h-[320px] object-cover rounded-xl lg:rounded-2xl mb-3 lg:mb-6"
              />
              <h1 className={`text-[18px] lg:text-[32px] font-bold text-center bg-gradient-to-r ${v.gradient} bg-clip-text text-transparent leading-tight mb-1 lg:mb-2`}>
                {v.tagline}
              </h1>
              <p className="text-[12px] lg:text-[16px] text-[var(--muted)] text-center leading-relaxed hidden lg:block">
                {v.subtitle}
              </p>
              {/* Feature pills — desktop only */}
              <div className="hidden lg:flex items-center justify-center gap-2 mt-5">
                {v.pills.map((f) => (
                  <span key={f} className="text-[13px] px-4 py-1.5 rounded-full border border-[var(--border)] text-[var(--muted)]">
                    {f}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: Login form */}
            <div className="lg:w-[420px] lg:min-w-[420px] bg-[var(--card)] p-4 lg:p-10 flex items-center justify-center">
              <div className="w-full animate-slide-in">
            <form
              onSubmit={handleSubmit}
              className=""
            >
              <div className="mb-4 lg:mb-8 text-center">
                <h2 className="mb-1 text-[20px] lg:text-[26px] font-bold text-[var(--text)]">
                  {isLogin ? v.loginTitle : v.signupTitle}
                </h2>
                <p className="text-[14px] lg:text-[16px] text-[var(--muted)]">
                  {isLogin ? v.loginSubtitle : v.signupSubtitle}
                </p>
              </div>

              {authError && (
                <div className="mb-4 rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/10 px-3 py-2.5 text-[14px] text-[var(--red)]">
                  {authError}
                </div>
              )}

              {!isLogin && (
                <div className="mb-3">
                  <label className="mb-1 block text-[13px] font-medium text-[var(--muted)]">Name</label>
                  <input
                    type="text" value={name} onChange={(e) => setName(e.target.value)}
                    className={`w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] ${v.focusColor} transition-all`}
                    placeholder="Your name" autoComplete="name"
                  />
                </div>
              )}

              <div className="mb-3">
                <label className="mb-1 block text-[13px] font-medium text-[var(--muted)]">Email</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className={`w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] ${v.focusColor} transition-all`}
                  placeholder="you@example.com" autoComplete="email"
                />
              </div>

              <div className={isCricketSignup ? 'mb-3' : 'mb-5'}>
                <label className="mb-1 block text-[13px] font-medium text-[var(--muted)]">Password</label>
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className={`w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] ${v.focusColor} transition-all`}
                  placeholder="••••••••" autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
              </div>

              {/* ── Cricket player fields (signup only) ── */}
              {isCricketSignup && (
                <div className="mb-5 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">Player Info</p>

                  {/* Jersey Number */}
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-[var(--muted)]">Jersey Number</label>
                    <input
                      type="number" value={jerseyNumber} onChange={(e) => setJerseyNumber(e.target.value)}
                      className={`w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none ${v.focusColor} transition-all`}
                      placeholder="Optional"
                    />
                  </div>

                  {/* Role (required) */}
                  <div>
                    <label className="mb-1.5 block text-[12px] font-medium text-[var(--muted)]">Role *</label>
                    <div className="flex flex-wrap gap-1.5">
                      {PLAYER_ROLES.map((r) => {
                        const rc = signupRoleConfig[r.key];
                        const selected = playerRole === r.key;
                        return (
                          <button key={r.key} type="button" onClick={() => handleRoleChange(r.key)}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium cursor-pointer transition-all border"
                            style={{ backgroundColor: selected ? rc?.color ?? 'var(--orange)' : 'transparent', borderColor: selected ? rc?.color ?? 'var(--orange)' : 'var(--border)', color: selected ? 'white' : 'var(--text)' }}>
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
                          <label className="mb-1.5 block text-[12px] font-medium text-[var(--muted)]">Batting *</label>
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
                          <label className="mb-1.5 block text-[12px] font-medium text-[var(--muted)]">Bowling *</label>
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
                    <label className="mb-1.5 block text-[12px] font-medium text-[var(--muted)]">Shirt Size</label>
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
                type="submit" disabled={syncing}
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

              <p className="mt-3 text-center text-[13px] text-[var(--muted)]">
                {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
                <button
                  type="button"
                  onClick={() => { setAuthMode(isLogin ? 'signup' : 'login'); clearError(); setEmail(''); setPassword(''); setName(''); resetPlayerFields(); }}
                  className="cursor-pointer font-medium hover:underline"
                  style={{ color: v.accentColor }}
                >
                  {isLogin ? 'Sign up' : 'Log in'}
                </button>
              </p>
            </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
