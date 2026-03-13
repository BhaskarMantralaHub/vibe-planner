'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, isCloud, authMode, authError, syncing, login, signup, resetPassword, setAuthMode, clearError, init } =
    useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    init();
  }, [init]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--purple)] border-t-transparent" />
      </div>
    );
  }

  if (!isCloud || user) {
    return <>{children}</>;
  }

  // Message screens (check-email, reset-sent)
  if (authMode === 'check-email' || authMode === 'reset-sent') {
    const isReset = authMode === 'reset-sent';
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="animate-slide-in w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-xl">
          <div className="mb-4 text-4xl">{isReset ? '🔑' : '✉️'}</div>
          <h2 className="mb-2 text-xl font-bold text-[var(--text)]">
            {isReset ? 'Check Your Email' : 'Confirm Your Email'}
          </h2>
          <p className="mb-6 text-[15px] text-[var(--muted)]">
            {isReset
              ? 'We sent a password reset link to your email. Click it to set a new password.'
              : 'We sent a confirmation link. Click it, then come back and log in.'}
          </p>
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
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] focus:border-[var(--purple)] focus:ring-1 focus:ring-[var(--purple)]/30 transition-all"
              placeholder="you@example.com" autoComplete="email"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); resetPassword(email); } }}
            />
          </div>

          <button
            onClick={() => resetPassword(email)}
            disabled={syncing}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--purple)] to-[var(--indigo)] px-4 py-3 text-[16px] font-semibold text-white shadow-lg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncing && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            Send Reset Link
          </button>

          <p className="mt-4 text-center text-[13px] text-[var(--muted)]">
            Remember your password?{' '}
            <button
              onClick={() => { setAuthMode('login'); clearError(); setEmail(''); }}
              className="cursor-pointer font-medium text-[var(--purple)] hover:underline"
            >
              Log in
            </button>
          </p>
        </div>
      </div>
    );
  }

  const isLogin = authMode === 'login';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    if (isLogin) {
      await login(email, password);
    } else {
      await signup(email, password, name);
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-52px)] overflow-hidden">
      {/* Gradient orbs background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full opacity-20 blur-[100px]"
          style={{ background: 'radial-gradient(circle, var(--purple), transparent 70%)', animation: 'float 8s ease-in-out infinite' }} />
        <div className="absolute -bottom-32 -right-32 h-[400px] w-[400px] rounded-full opacity-15 blur-[100px]"
          style={{ background: 'radial-gradient(circle, var(--blue), transparent 70%)', animation: 'float 10s ease-in-out infinite reverse' }} />
      </div>

      {/* Centered unified layout */}
      <div className="relative flex items-center justify-center min-h-[calc(100vh-52px)] px-4 py-6 lg:py-8">
        <div className="w-full max-w-5xl animate-fade-in">

          {/* Combined card — stacked on mobile, side-by-side on desktop */}
          <div className="flex flex-col lg:flex-row rounded-3xl border border-[var(--border)] overflow-hidden shadow-2xl"
            style={{ boxShadow: '0 20px 80px rgba(139, 92, 246, 0.15)' }}>

            {/* Left: Hero image + tagline */}
            <div className="flex-1 bg-[var(--surface)] p-4 lg:p-10 flex flex-col justify-center">
              <img
                src="/hero.png"
                alt="Viber's Toolkit"
                className="w-full max-h-[140px] lg:max-h-[320px] object-cover rounded-xl lg:rounded-2xl mb-3 lg:mb-6"
              />
              <h1 className="text-[18px] lg:text-[32px] font-bold text-center bg-gradient-to-r from-[var(--purple)] via-[var(--blue)] to-[var(--indigo)] bg-clip-text text-transparent leading-tight mb-1 lg:mb-2">
                Capture Ideas. Align with Flow.
              </h1>
              <p className="text-[12px] lg:text-[16px] text-[var(--muted)] text-center leading-relaxed hidden lg:block">
                Your personal productivity toolkit to think, plan, and achieve.
              </p>
              {/* Feature pills — desktop only */}
              <div className="hidden lg:flex items-center justify-center gap-2 mt-5">
                {['✦ Capture', '◷ Plan', '✓ Track', '🚀 Achieve'].map((f) => (
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
                  {isLogin ? 'Welcome Back' : 'Get Started'}
                </h2>
                <p className="text-[14px] lg:text-[16px] text-[var(--muted)]">
                  {isLogin ? 'Log in to your toolkit' : 'Create your account'}
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
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] focus:border-[var(--purple)] focus:ring-1 focus:ring-[var(--purple)]/30 transition-all"
                    placeholder="Your name" autoComplete="name"
                  />
                </div>
              )}

              <div className="mb-3">
                <label className="mb-1 block text-[13px] font-medium text-[var(--muted)]">Email</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] focus:border-[var(--purple)] focus:ring-1 focus:ring-[var(--purple)]/30 transition-all"
                  placeholder="you@example.com" autoComplete="email"
                />
              </div>

              <div className="mb-5">
                <label className="mb-1 block text-[13px] font-medium text-[var(--muted)]">Password</label>
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] focus:border-[var(--purple)] focus:ring-1 focus:ring-[var(--purple)]/30 transition-all"
                  placeholder="••••••••" autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
              </div>

              <button
                type="submit" disabled={syncing}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--purple)] to-[var(--indigo)] px-4 py-3 text-[16px] font-semibold text-white shadow-lg transition-all hover:opacity-90 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
              >
                {syncing && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {isLogin ? 'Log In' : 'Sign Up'}
              </button>

              {isLogin && (
                <p className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('forgot'); clearError(); setPassword(''); }}
                    className="cursor-pointer text-[13px] text-[var(--muted)] hover:text-[var(--purple)] transition-colors"
                  >
                    Forgot password?
                  </button>
                </p>
              )}

              <p className="mt-3 text-center text-[13px] text-[var(--muted)]">
                {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
                <button
                  type="button"
                  onClick={() => { setAuthMode(isLogin ? 'signup' : 'login'); clearError(); setEmail(''); setPassword(''); setName(''); }}
                  className="cursor-pointer font-medium text-[var(--purple)] hover:underline"
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
