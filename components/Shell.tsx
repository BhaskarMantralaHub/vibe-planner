'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { HamburgerMenu } from '@/components/HamburgerMenu';
import { useAuthStore } from '@/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import NotificationBell from '@/app/(tools)/cricket/components/NotificationBell';
import TeamSwitcher from '@/components/TeamSwitcher';
import { ResetPasswordForm } from '@/components/ResetPasswordForm';
import { TopProgressBar } from '@/components/TopProgressBar';
import { Button, Text } from '@/components/ui';
import { toast } from 'sonner';

// Team logo removed — now integrated into the TeamSwitcher pill component

type PlayerMeta = {
  jersey_number?: number;
  player_role?: string;
  batting_style?: string;
  bowling_style?: string;
  shirt_size?: string;
};

type PendingUser = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  player_meta: PlayerMeta | null;
};

const ROLE_LABELS: Record<string, string> = {
  batsman: 'Batsman', bowler: 'Bowler', 'all-rounder': 'All-Rounder', keeper: 'Keeper',
};

/**
 * Admin approval queue. Everything here is server-authoritative:
 *  - the LIST comes from the pending_members(team) RPC, so a TEAM admin sees
 *    their own queue (the old direct profiles read required GLOBAL admin RLS
 *    and silently showed team admins an empty list);
 *  - APPROVE = approve_team_member RPC — atomic, team-scoped, idempotent,
 *    links the roster player and posts the single welcome server-side;
 *  - REJECT = reject_team_member RPC — sets status='rejected' and NEVER
 *    deletes the person's account (the old path deleted auth.users).
 * The old version did five sequential raw writes with no team scoping and no
 * error checks; approving here approved the user into EVERY team.
 */
function PendingApprovals() {
  const { user, userAccess, currentTeamId } = useAuthStore();
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const isAdmin = userAccess.includes('admin');

  useEffect(() => {
    // Team context required — the queue is per-team by design.
    if (!user || !isAdmin || !currentTeamId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('pending_members', { p_team_id: currentTeamId });
      if (cancelled) return;
      if (error) { console.warn('[approvals] pending_members failed:', error.message); return; }
      type Row = { user_id: string; email: string; full_name: string; requested_at: string; player_meta: PlayerMeta | null };
      setPending(((data ?? []) as Row[]).map((r) => ({
        id: r.user_id,
        email: r.email,
        full_name: r.full_name,
        created_at: r.requested_at,
        player_meta: r.player_meta,
      })));
    })();
    return () => { cancelled = true; };
  }, [user, isAdmin, currentTeamId]);

  const handleApprove = async (p: PendingUser) => {
    const supabase = getSupabaseClient();
    if (!supabase || !currentTeamId || approving) return;
    setApproving(p.id);
    try {
      const { data, error } = await supabase.rpc('approve_team_member', {
        p_team_id: currentTeamId,
        p_user_id: p.id,
      });
      if (error || data?.error) {
        toast.error(`Couldn't approve ${p.full_name || 'the user'}: ${error?.message ?? data?.error}`);
        return;
      }
      setPending((prev) => prev.filter((u) => u.id !== p.id));
      toast.success(`${p.full_name || 'User'} approved`);
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (p: PendingUser) => {
    const supabase = getSupabaseClient();
    if (!supabase || !currentTeamId || approving) return;
    setApproving(p.id);
    try {
      const { data, error } = await supabase.rpc('reject_team_member', {
        p_team_id: currentTeamId,
        p_user_id: p.id,
      });
      if (error || data?.error) {
        toast.error(`Couldn't reject the request: ${error?.message ?? data?.error}`);
        return;
      }
      setPending((prev) => prev.filter((u) => u.id !== p.id));
      toast('Request rejected. Their account stays usable.');
    } finally {
      setApproving(null);
    }
  };

  if (!isAdmin || pending.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setShowPopup(!showPopup)}
        className="relative cursor-pointer rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
        {/* Badge */}
        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--red)] text-[9px] font-bold text-white">
          {pending.length}
        </span>
      </button>

      {showPopup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPopup(false)} />
          <div
            className="absolute right-0 top-full mt-2 z-50 w-[360px] rounded-2xl overflow-hidden"
            style={{
              background: 'var(--card)',
              border: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.1)',
            }}
          >
            {/* Header with accent gradient stripe */}
            <div
              className="relative px-4 pt-4 pb-3"
              style={{ background: 'color-mix(in srgb, var(--orange) 6%, var(--card))' }}
            >
              <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, var(--orange), var(--cricket))' }} />
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'color-mix(in srgb, var(--orange) 15%, transparent)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                  </svg>
                </div>
                <div>
                  <Text as="h3" size="sm" weight="bold">New Signups</Text>
                  <Text as="p" size="2xs" color="muted">{pending.length} awaiting your approval</Text>
                </div>
              </div>
            </div>

            {/* Pending list */}
            <div className="max-h-[420px] overflow-y-auto">
              {pending.map((p, i) => {
                const meta = p.player_meta;
                const isProcessing = approving === p.id;
                return (
                  <div
                    key={p.id}
                    className="px-4 py-3.5 transition-colors"
                    style={{
                      background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--surface) 50%, transparent)',
                      borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)',
                    }}
                  >
                    <div className="flex gap-3">
                      {/* Avatar */}
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center text-[15px] font-bold text-white flex-shrink-0 shadow-sm mt-0.5"
                        style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}
                      >
                        {(p.full_name || p.email || '?')[0].toUpperCase()}
                      </div>
                      {/* Content — name, badges, buttons all aligned */}
                      <div className="flex-1 min-w-0">
                        <Text as="div" size="sm" weight="semibold" truncate>{p.full_name || 'No name'}</Text>
                        <Text as="div" size="2xs" color="dim" truncate>{p.email}</Text>

                        {meta && (meta.player_role || meta.jersey_number) && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {meta.jersey_number != null && (
                              <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md"
                                style={{ background: 'color-mix(in srgb, var(--cricket) 15%, transparent)', color: 'var(--cricket)' }}>
                                #{meta.jersey_number}
                              </span>
                            )}
                            {meta.player_role && (
                              <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md"
                                style={{ background: 'color-mix(in srgb, var(--cricket) 10%, transparent)', color: 'var(--cricket)' }}>
                                {ROLE_LABELS[meta.player_role] ?? meta.player_role}
                              </span>
                            )}
                            {meta.batting_style && (
                              <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-md"
                                style={{ background: 'color-mix(in srgb, var(--blue) 12%, transparent)', color: 'var(--blue)' }}>
                                {meta.batting_style === 'right' ? 'Right Hand' : 'Left Hand'}
                              </span>
                            )}
                            {meta.bowling_style && (
                              <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-md"
                                style={{ background: 'color-mix(in srgb, var(--green) 12%, transparent)', color: 'var(--green)' }}>
                                {meta.bowling_style.charAt(0).toUpperCase() + meta.bowling_style.slice(1)}
                              </span>
                            )}
                            {meta.shirt_size && (
                              <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-md"
                                style={{ background: 'var(--surface)', color: 'var(--dim)', border: '1px solid var(--border)' }}>
                                {meta.shirt_size.toUpperCase()}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleApprove(p)}
                            disabled={isProcessing}
                            className="flex-1 flex items-center justify-center text-center h-9 rounded-xl text-[13px] font-semibold text-white cursor-pointer transition-all active:scale-[0.97] disabled:opacity-50 shadow-sm"
                            style={{ background: 'linear-gradient(135deg, var(--green), color-mix(in srgb, var(--green) 80%, #000))' }}
                          >
                            {isProcessing ? '...' : '✓ Approve'}
                          </button>
                          <button
                            onClick={() => handleReject(p)}
                            disabled={isProcessing}
                            className="flex-1 flex items-center justify-center text-center h-9 rounded-xl text-[13px] font-semibold cursor-pointer transition-all active:scale-[0.97] disabled:opacity-50"
                            style={{ background: 'color-mix(in srgb, var(--red) 10%, transparent)', color: 'var(--red)', border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)' }}
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, isCloud, userAccess, needsPasswordReset } = useAuthStore();
  const pathname = usePathname();

  // Track page views (debounced — only fires if user stays on page for 1s)
  useEffect(() => {
    if (!user?.id || !isCloud) return;
    const timer = setTimeout(() => {
      import('@/lib/activity').then(({ trackActivity }) => trackActivity(user.id, 'page_view', pathname)).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [pathname, user?.id, isCloud]);


  const showNav = (!isCloud || !!user) && !needsPasswordReset;

  // NOTE: the runtime `--cricket` override from cricket_teams.primary_color
  // was removed (2026-08-31, per user decision): the Sunrisers orange lives in
  // the theme tokens (globals.css) as the single source of truth, and a DB
  // color could not supply the paired --cricket-accent/-hover/-glow/-on
  // values, so an override desynced fills from their text/glow companions.

  return (
    <>
      <TopProgressBar />
      {/* safe-area-inset-top is 0 in browser Safari portrait; it only bites in
          the installed (black-translucent) PWA, where the header would
          otherwise sit under the status-bar clock. */}
      <header
        className="sticky top-0 z-40 border-b border-[var(--border)]/50 bg-[var(--surface)]/85 backdrop-blur-md"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          {showNav ? (
            <button
              onClick={() => setMenuOpen(true)}
              className="cursor-pointer rounded-lg p-2.5 -m-1 min-h-11 min-w-11 text-lg text-[var(--muted)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text)] active:bg-[var(--hover-bg)]"
              aria-label="Open menu"
            >
              &#9776;
            </button>
          ) : (
            <div className="w-8" />
          )}

          {/* Always the team identity. The blue "Viber's Toolkit" wordmark
              belonged to the personal tools retired 2026-09-02 — with those
              gone every page, /admin included, is the cricket product, and a
              second brand in the header was just confusing. */}
          <TeamSwitcher />

          <div className="flex items-center gap-1">
            <NotificationBell />
            <PendingApprovals />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {showNav && <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />}

      <main className="overflow-x-hidden">
        <div className="mx-auto w-full max-w-6xl lg:px-8">
          {needsPasswordReset ? <ResetPasswordForm /> : children}
        </div>
      </main>
    </>
  );
}
