'use client';

import { useState, useEffect } from 'react';
import { useAuthStore, RESET_FLAG_KEY } from '@/stores/auth-store';
import { Button, Alert, Card, Text, PasswordInput, MatchStatus, allRequirementsMet } from '@/components/ui';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui';

export function ResetPasswordForm() {
  const { updatePassword, authError } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const reqMet = allRequirementsMet(password);
  const passwordsMatch = password.length > 0 && confirm.length > 0 && password === confirm;
  const canSubmit = reqMet && passwordsMatch && !saving;

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

    if (!reqMet) {
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
        <Card animate padding="lg" className="w-full max-w-sm text-center">
          <div className="mb-4 text-4xl">✅</div>
          <Text as="h2" size="xl" weight="semibold" className="mb-2">Password Updated</Text>
          <Text as="p" size="md" color="muted" className="text-[15px]">You&apos;re all set. Your toolkit is loading...</Text>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="animate-slide-in w-full max-w-sm">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-xl">
          <div className="mb-6 text-center">
            <div className="mb-3 text-3xl">🔑</div>
            <Text as="h2" size="xl" weight="semibold" className="mb-1 text-[22px]">Set New Password</Text>
            <Text as="p" size="md" color="muted">Choose a strong password for your account</Text>
          </div>

          {error && <Alert variant="error" className="mb-4">{error}</Alert>}

          <div className="mb-3">
            <PasswordInput
              label="New Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              showRequirements
            />
          </div>

          <div className="mb-2">
            <PasswordInput
              label="Confirm Password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              error={confirm.length > 0 && password !== confirm ? ' ' : undefined}
            />
          </div>

          <div className="mb-5">
            <MatchStatus password={password} confirm={confirm} />
          </div>

          <Button type="submit" variant="primary" size="xl" fullWidth disabled={!canSubmit} loading={saving}>
            Update Password
          </Button>
        </form>

        <Text as="p" size="sm" color="muted" align="center" className="mt-4">
          Remember your password?{' '}
          <Button variant="link" size="sm" onClick={() => setShowConfirm(true)} className="text-[13px]">
            Back to login
          </Button>
        </Text>

        {/* Leave confirmation dialog */}
        <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogContent showClose={false} className="max-w-xs text-center">
            <div className="mb-3 text-2xl">&#9888;&#65039;</div>
            <DialogTitle className="text-center">Leave without resetting?</DialogTitle>
            <DialogDescription className="text-center">
              Your reset link will no longer work.<br />You&apos;ll need to request a new one.
            </DialogDescription>
            <DialogFooter className="mt-5">
              <Button variant="secondary" size="lg" fullWidth onClick={() => setShowConfirm(false)}>
                Stay &amp; reset
              </Button>
              <Button variant="danger" size="lg" fullWidth onClick={() => useAuthStore.getState().logout()}>
                Leave
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
