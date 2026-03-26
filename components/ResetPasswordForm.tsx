'use client';

import { useState, useEffect } from 'react';
import { useAuthStore, RESET_FLAG_KEY } from '@/stores/auth-store';

export function ResetPasswordForm() {
  const { updatePassword, authError } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
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

          <div className="mb-3">
            <label className="mb-1 block text-[13px] font-medium text-[var(--muted)]">New Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] focus:border-[var(--purple)] focus:ring-1 focus:ring-[var(--purple)]/30 transition-all"
              placeholder="••••••••" autoComplete="new-password"
            />
          </div>

          <div className="mb-5">
            <label className="mb-1 block text-[13px] font-medium text-[var(--muted)]">Confirm Password</label>
            <input
              type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] focus:border-[var(--purple)] focus:ring-1 focus:ring-[var(--purple)]/30 transition-all"
              placeholder="••••••••" autoComplete="new-password"
            />
          </div>

          <button
            type="submit" disabled={saving}
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
