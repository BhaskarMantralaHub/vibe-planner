'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Text } from '@/components/ui';

type Status = 'pending' | 'active' | 'rejected' | 'removed' | 'none';

/**
 * The waiting room for someone whose join request an admin hasn't decided yet.
 *
 * It POLLS their own team_members row (RLS lets a user read their own
 * membership even while pending) rather than making them retry the login form
 * to discover the outcome. The moment the admin approves, the page reloads
 * itself into the team; a rejection says so plainly instead of leaving them
 * on a hopeful "pending" card forever.
 *
 * Polling, not Realtime: one lightweight row read every 15s for the minutes
 * this screen is open beats opening a websocket subscription, and it needs no
 * additional Supabase configuration.
 */
const POLL_MS = 15_000;

export function PendingApproval() {
  const { user, logout } = useAuthStore();
  const [status, setStatus] = useState<Status>('pending');
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const stopped = useRef(false);

  const check = useCallback(async (manual = false) => {
    const supabase = getSupabaseClient();
    if (!supabase || !user) return;
    if (manual) setChecking(true);

    const { data, error } = await supabase
      .from('team_members')
      .select('status')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false });

    if (manual) setChecking(false);
    setLastChecked(new Date());
    if (error || !data) return;

    const rows = data as { status: Status }[];
    if (rows.some((r) => r.status === 'active')) {
      // Approved — the profile flag has been cleared server-side too, so a
      // reload lands them straight in the team.
      stopped.current = true;
      window.location.reload();
      return;
    }
    if (rows.length === 0) { setStatus('none'); return; }
    if (rows.every((r) => r.status === 'rejected' || r.status === 'removed')) {
      stopped.current = true;
      setStatus('rejected');
      return;
    }
    setStatus('pending');
  }, [user]);

  useEffect(() => {
    void check();
    const id = setInterval(() => { if (!stopped.current) void check(); }, POLL_MS);
    return () => { clearInterval(id); };
  }, [check]);

  const declined = status === 'rejected';

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-xl">
        {/* Team logo — the state lives in the heading, not in an emoji.
            Dimmed when declined so the card reads as closed at a glance. */}
        <img src="/cricket-logo.png" alt="" aria-hidden
          className="mx-auto mb-4 h-14 w-14 rounded-xl object-cover"
          style={{ opacity: declined ? 0.45 : 1 }} />
        <Text as="h2" size="xl" weight="semibold" className="mb-2">
          {declined ? 'Request declined' : 'Waiting for approval'}
        </Text>
        <Text as="p" size="md" color="muted" className="mb-6 text-[15px]">
          {declined
            ? 'The team admin declined this request. Your account still works — talk to them if you think this is a mistake.'
            : 'Your request is with the team admin. This page updates by itself the moment they approve — no need to log in again.'}
        </Text>

        {!declined && (
          <>
            <button
              onClick={() => void check(true)}
              disabled={checking}
              className="mb-3 w-full cursor-pointer rounded-xl px-4 py-3 text-[15px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-60"
              style={{ background: 'var(--cricket)', color: 'var(--cricket-on)' }}
            >
              {checking ? 'Checking…' : 'Check now'}
            </button>
            {lastChecked && (
              <Text as="p" size="2xs" color="dim" className="mb-4">
                Last checked {lastChecked.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
            )}
          </>
        )}

        <button
          onClick={logout}
          className="w-full cursor-pointer rounded-xl bg-[var(--surface)] px-4 py-2.5 text-[13px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--border)]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
