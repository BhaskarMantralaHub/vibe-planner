'use client';

import { useState, useEffect } from 'react';
import { useAuthStore, RESET_FLAG_KEY } from '@/stores/auth-store';

/* ── Password requirement checks ── */
const requirements = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number', test: (p: string) => /[0-9]/.test(p) },
  { label: 'One special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

/* ── Eye icon SVG ── */
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function ResetPasswordForm() {
  const { updatePassword, authError } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const allRequirementsMet = requirements.every((r) => r.test(password));
  const passwordsMatch = password.length > 0 && confirm.length > 0 && password === confirm;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = allRequirementsMet && passwordsMatch && !saving;

  // After success, auto-transition to the app after 2 seconds
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => {
      useAuthStore.setState({ needsPasswordReset: false });
      sessionStorage.removeItem(RESET_FLAG_KEY);
    }, 2000);
    return () => clearTimeout(timer);
  }, [success]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!allRequirementsMet) {
      setError('Please meet all password requirements.');
      return;
    }
    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    const ok = await updatePassword(password);
    setSaving(false);

    if (ok) {
      setSuccess(true);
    } else {
      setError(authError || 'Failed to update password.');
    }
  }

  if (success) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="animate-slide-in w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-xl">
          <div className="mb-4 text-4xl">✅</div>
          <h2 className="mb-2 text-xl font-bold text-[var(--text)]">Password Updated</h2>
          <p className="text-[15px] text-[var(--muted)]">You&apos;re all set. Your toolkit is loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="animate-slide-in w-full max-w-sm">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-xl">
          <div className="mb-6 text-center">
            <div className="mb-3 text-3xl">🔑</div>
            <h2 className="mb-1 text-[22px] font-bold text-[var(--text)]">Set New Password</h2>
            <p className="text-[14px] text-[var(--muted)]">Choose a strong password for your account</p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/10 px-3 py-2.5 text-[14px] text-[var(--red)]">
              {error}
            </div>
          )}

          {/* New Password */}
          <div className="mb-3">
            <label className="mb-1 block text-[13px] font-medium text-[var(--muted)]">New Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 pr-11 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] focus:border-[var(--purple)] focus:ring-1 focus:ring-[var(--purple)]/30 transition-all"
                placeholder="••••••••" autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[var(--dim)] hover:text-[var(--muted)] transition-colors"
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          {/* Password requirements checklist */}
          {password.length > 0 && (
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--dim)]">Password must have</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                {requirements.map((r) => {
                  const met = r.test(password);
                  return (
                    <div key={r.label} className="flex items-center gap-1.5">
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                        met
                          ? 'bg-[var(--green)] text-white'
                          : 'border border-[var(--border)] text-[var(--dim)]'
                      }`}>
                        {met ? '✓' : ''}
                      </span>
                      <span className={`text-[12px] ${met ? 'text-[var(--text)] font-medium' : 'text-[var(--muted)]'}`}>
                        {r.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Confirm Password */}
          <div className="mb-2">
            <label className="mb-1 block text-[13px] font-medium text-[var(--muted)]">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className={`w-full rounded-xl border bg-[var(--surface)] px-4 py-3 pr-11 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] focus:ring-1 transition-all ${
                  passwordsMismatch
                    ? 'border-[var(--red)] focus:border-[var(--red)] focus:ring-[var(--red)]/30'
                    : 'border-[var(--border)] focus:border-[var(--purple)] focus:ring-[var(--purple)]/30'
                }`}
                placeholder="••••••••" autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[var(--dim)] hover:text-[var(--muted)] transition-colors"
              >
                <EyeIcon open={showConfirmPassword} />
              </button>
            </div>
          </div>

          {/* Match status */}
          <div className="mb-5 h-7">
            {passwordsMismatch && (
              <div className="flex items-center gap-1.5 rounded-lg bg-[var(--red)]/10 px-3 py-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--red)] text-[10px] text-white">✕</span>
                <span className="text-[12px] font-medium text-[var(--red)]">Passwords do not match</span>
              </div>
            )}
            {passwordsMatch && (
              <div className="flex items-center gap-1.5 rounded-lg bg-[var(--green)]/10 px-3 py-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--green)] text-[10px] text-white">✓</span>
                <span className="text-[12px] font-medium text-[var(--green)]">Passwords match</span>
              </div>
            )}
          </div>

          <button
            type="submit" disabled={!canSubmit}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--purple)] to-[var(--indigo)] px-4 py-3 text-[16px] font-semibold text-white shadow-lg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            Update Password
          </button>
        </form>

        <p className="mt-4 text-center text-[13px] text-[var(--muted)]">
          Remember your password?{' '}
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="cursor-pointer font-medium text-[var(--purple)] hover:underline"
          >
            Back to login
          </button>
        </p>

        {showConfirm && (
          <>
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="w-full max-w-xs rounded-2xl px-5 pb-6 pt-5 text-center shadow-2xl animate-slide-in" style={{ background: 'var(--card)' }}>
                <div className="mb-3 text-2xl">&#9888;&#65039;</div>
                <p className="text-[17px] font-bold tracking-tight mb-1.5" style={{ color: 'var(--text)' }}>Leave without resetting?</p>
                <p className="text-[13.5px] leading-relaxed mb-5" style={{ color: 'var(--dim)' }}>Your reset link will no longer work.<br />You&apos;ll need to request a new one.</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowConfirm(false)}
                    className="flex-1 py-3 rounded-xl text-[14px] font-semibold cursor-pointer"
                    style={{ background: 'var(--surface)', color: 'var(--text)' }}
                  >
                    Stay &amp; reset
                  </button>
                  <button
                    type="button"
                    onClick={() => useAuthStore.getState().logout()}
                    className="flex-1 py-3 rounded-xl text-[14px] font-bold text-white cursor-pointer"
                    style={{ background: 'var(--red)' }}
                  >
                    Leave
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
