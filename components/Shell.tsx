'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { HamburgerMenu } from '@/components/HamburgerMenu';
import { useAuthStore } from '@/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import NotificationBell from '@/app/(tools)/cricket/components/NotificationBell';
import TeamSwitcher from '@/components/TeamSwitcher';
import { ResetPasswordForm } from '@/components/ResetPasswordForm';
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
  access: string[];
};

const ROLE_LABELS: Record<string, string> = {
  batsman: 'Batsman', bowler: 'Bowler', 'all-rounder': 'All-Rounder', keeper: 'Keeper',
};

function PendingApprovals() {
  const { user, userAccess, currentTeamId } = useAuthStore();
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const isAdmin = userAccess.includes('admin');

  useEffect(() => {
    if (!user || !isAdmin) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    (async () => {
      // Get pending team_members for the current team
      const teamFilter = currentTeamId
        ? supabase.from('team_members').select('user_id').eq('team_id', currentTeamId).eq('approved', false)
        : supabase.from('team_members').select('user_id').eq('approved', false);

      const { data: pendingMembers } = await teamFilter;
      const pendingUserIds = (pendingMembers ?? []).map((m: { user_id: string }) => m.user_id);
      if (pendingUserIds.length === 0) { setPending([]); return; }

      const { data } = await supabase
        .from('profiles')
        .select('id, email, full_name, created_at, player_meta, access')
        .in('id', pendingUserIds)
        .eq('disabled', false)
        .order('created_at', { ascending: false });

      setPending((data ?? []) as PendingUser[]);
    })();
  }, [user, isAdmin, currentTeamId]);

  const handleApprove = async (p: PendingUser) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setApproving(p.id);

    try {
      // If user has cricket access, link or create cricket_players record
      const access: string[] = p.access ?? [];
      if (access.includes('cricket')) {
        // Check if a player record already exists with this email (admin pre-added)
        const { data: existing } = await supabase
          .from('cricket_players')
          .select('id')
          .ilike('email', p.email.trim())
          .limit(1)
          .maybeSingle();

        if (existing) {
          // Link existing player record and merge signup preferences
          const updates: Record<string, unknown> = { user_id: p.id, is_active: true };
          if (p.full_name) updates.name = p.full_name;
          if (p.player_meta) {
            const meta = p.player_meta;
            if (meta.jersey_number != null) updates.jersey_number = meta.jersey_number;
            if (meta.player_role) updates.player_role = meta.player_role;
            if (meta.batting_style) updates.batting_style = meta.batting_style;
            if (meta.bowling_style) updates.bowling_style = meta.bowling_style;
            if (meta.shirt_size) updates.shirt_size = meta.shirt_size;
          }
          await supabase.from('cricket_players')
            .update(updates)
            .eq('id', existing.id);
        } else if (p.player_meta) {
          // No existing record — create a new one from signup metadata
          const meta = p.player_meta;
          await supabase.from('cricket_players').insert({
            user_id: p.id,
            name: p.full_name || p.email,
            jersey_number: meta.jersey_number ?? null,
            player_role: meta.player_role ?? null,
            batting_style: meta.batting_style ?? null,
            bowling_style: meta.bowling_style ?? null,
            shirt_size: meta.shirt_size ?? null,
            email: p.email,
            is_active: true,
          });
        }
      }

      // Set default features for approved user based on their access
      const defaultFeatures: string[] = [];
      if (access.includes('toolkit')) defaultFeatures.push('vibe-planner', 'id-tracker');
      if (access.includes('cricket')) defaultFeatures.push('cricket');
      await supabase.from('profiles').update({ approved: true, features: defaultFeatures }).eq('id', p.id);
      // Also approve team membership (per-team approval)
      await supabase.from('team_members').update({ approved: true }).eq('user_id', p.id).eq('approved', false);
      setPending((prev) => prev.filter((u) => u.id !== p.id));

      // Auto-post welcome message in Moments via DB function
      if (access.includes('cricket')) {
        const playerName = p.full_name || p.email.split('@')[0];
        await supabase.rpc('create_welcome_post', {
          new_user_id: p.id,
          player_name: playerName,
        });
      }
      toast.success(`${p.full_name || 'User'} approved`);
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (p: PendingUser) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const access: string[] = p.access ?? [];
    const hasOtherAccess = access.some((a) => a !== 'cricket');

    // Clean up team membership first
    await supabase.from('team_members').delete().eq('user_id', p.id).eq('approved', false);
    if (hasOtherAccess) {
      // Existing user (e.g., toolkit) requested cricket — just remove cricket access, restore approved
      const newAccess = access.filter((a) => a !== 'cricket');
      await supabase.from('profiles').update({ access: newAccess, approved: true }).eq('id', p.id);
    } else {
      // Pure cricket signup with no other access — fully delete so they can re-signup
      await supabase.rpc('reject_user', { target_user_id: p.id });
    }
    setPending((prev) => prev.filter((u) => u.id !== p.id));
    toast('Signup rejected');
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

  const isCricketContext = pathname.startsWith('/cricket')
    || (userAccess.includes('cricket') && !userAccess.includes('toolkit') && !userAccess.includes('admin'));

  const showNav = (!isCloud || !!user) && !needsPasswordReset;

  // Apply team color as CSS variable override
  const { userTeams, currentTeamId } = useAuthStore();
  const currentTeam = userTeams.find(t => t.team_id === currentTeamId);
  useEffect(() => {
    if (isCricketContext && currentTeam?.primary_color) {
      document.documentElement.style.setProperty('--cricket', currentTeam.primary_color);
    }
    return () => {
      document.documentElement.style.removeProperty('--cricket');
    };
  }, [isCricketContext, currentTeam?.primary_color]);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/80 px-4 py-3 backdrop-blur-md">
        {showNav ? (
          <button
            onClick={() => setMenuOpen(true)}
            className="cursor-pointer rounded-lg p-1.5 text-lg text-[var(--muted)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text)]"
            aria-label="Open menu"
          >
            &#9776;
          </button>
        ) : (
          <div className="w-8" />
        )}

        {isCricketContext ? (
          <TeamSwitcher />
        ) : (
          <Link href="/" className="group flex items-center gap-2">
            <Text as="h1" size="lg" weight="semibold" tracking="tight" className="bg-gradient-to-r from-[var(--toolkit)] via-[var(--blue)] to-[var(--toolkit-accent)] bg-clip-text text-transparent transition-opacity group-hover:opacity-80">
              Viber&apos;s Toolkit
            </Text>
          </Link>
        )}

        <div className="flex items-center gap-1">
          {isCricketContext && <NotificationBell />}
          <PendingApprovals />
          <ThemeToggle />
        </div>
      </header>

      {showNav && <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />}

      <main className="overflow-x-hidden">{needsPasswordReset ? <ResetPasswordForm /> : children}</main>
    </>
  );
}
