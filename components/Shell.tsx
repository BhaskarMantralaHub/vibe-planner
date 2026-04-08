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
  const { user, userAccess } = useAuthStore();
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const isAdmin = userAccess.includes('admin');

  useEffect(() => {
    if (!user || !isAdmin) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    supabase
      .from('profiles')
      .select('id, email, full_name, created_at, player_meta, access')
      .eq('approved', false)
      .eq('disabled', false)
      .order('created_at', { ascending: false })
      .then(({ data }: { data: PendingUser[] | null }) => {
        setPending(data ?? []);
      });
  }, [user, isAdmin]);

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
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {/* Badge */}
        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--red)] text-[9px] font-bold text-white">
          {pending.length}
        </span>
      </button>

      {showPopup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPopup(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-[340px] rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl animate-[scaleIn_0.15s]">
            <div className="p-4 border-b border-[var(--border)]">
              <Text as="h3" size="md" weight="semibold">Pending Approvals</Text>
              <Text as="p" size="xs" color="muted">{pending.length} cricket signup{pending.length !== 1 ? 's' : ''} awaiting approval</Text>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {pending.map((p) => {
                const meta = p.player_meta;
                return (
                  <div key={p.id} className="p-3 border-b border-[var(--border)]/50 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full flex items-center justify-center text-[14px] font-bold text-white flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}>
                        {(p.full_name || p.email || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Text as="div" size="sm" weight="medium" truncate>{p.full_name || 'No name'}</Text>
                        <Text as="div" size="2xs" color="muted" truncate>{p.email}</Text>
                      </div>
                    </div>
                    {/* Player meta info */}
                    {meta && (meta.player_role || meta.jersey_number) && (
                      <div className="flex flex-wrap gap-1.5 mt-2 ml-12">
                        {meta.jersey_number != null && (
                          <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: 'color-mix(in srgb, var(--cricket) 12%, transparent)', color: 'var(--cricket-accent)' }}>
                            #{meta.jersey_number}
                          </span>
                        )}
                        {meta.player_role && (
                          <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{ background: 'color-mix(in srgb, var(--cricket) 8%, transparent)', color: 'var(--cricket-accent)' }}>
                            {ROLE_LABELS[meta.player_role] ?? meta.player_role}
                          </span>
                        )}
                        {meta.batting_style && (
                          <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{ background: 'color-mix(in srgb, var(--blue) 15%, transparent)', color: 'var(--blue)' }}>
                            {meta.batting_style === 'right' ? 'Right Hand' : 'Left Hand'}
                          </span>
                        )}
                        {meta.bowling_style && (
                          <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{ background: 'color-mix(in srgb, var(--green) 15%, transparent)', color: 'var(--green)' }}>
                            {meta.bowling_style.charAt(0).toUpperCase() + meta.bowling_style.slice(1)}
                          </span>
                        )}
                        {meta.shirt_size && (
                          <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--surface)', color: 'var(--dim)', border: '1px solid var(--border)' }}>
                            {meta.shirt_size}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2 mt-2 ml-12">
                      <Button
                        onClick={() => handleApprove(p)}
                        loading={approving === p.id}
                        size="sm"
                        className="flex-1 bg-[var(--green)] text-white hover:brightness-110"
                      >
                        Approve
                      </Button>
                      <Button
                        variant="danger-outline"
                        size="sm"
                        onClick={() => handleReject(p)}
                        className="flex-1"
                      >
                        Reject
                      </Button>
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
