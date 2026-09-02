'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { Text, Button, Drawer, DrawerHandle, DrawerTitle, DrawerBody, Spinner } from '@/components/ui';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Copy, Share2, RefreshCw, X, Check, ChevronRight, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';

type Season = { id: string; name: string; is_active: boolean };
type Invite = {
  token: string;
  expiresAt: string;
  /** Who last generated it, and when — every refresh is a manual admin act,
   *  so the card can say who to ask about the current link. */
  byName: string | null;
  at: string;
  isRefresh: boolean;
};

/** Season names are stored as "2026 MTCA Spring League · Division D" — the
 *  part after the separator is a subtitle, not part of the name. */
function splitSeasonName(name: string): [string, string | null] {
  const i = name.indexOf('·');
  return i === -1 ? [name, null] : [name.slice(0, i).trim(), name.slice(i + 1).trim() || null];
}

/** An invite is worth a countdown only when the countdown is actionable. */
const EXPIRY_WARN_DAYS = 7;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Team Admin — the console for a team admin (captain), as opposed to the
 * platform admin console.
 *
 * Deliberately TWO things: which season is current, and the invite link.
 * Pending join requests live in the notification bell and are not duplicated
 * here — this page is persistent configuration, the bell is things needing
 * attention. Rendering it is strictly read-only: invites are created only by
 * an explicit Generate/Refresh, which is how a permanent token came to exist
 * in the first place.
 */
export default function TeamAdminPanel() {
  const { currentTeamId, userTeams } = useAuthStore();
  const team = userTeams.find((t) => t.team_id === currentTeamId) ?? userTeams[0] ?? null;
  const teamId = team?.team_id ?? null;

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | 'season' | 'invite'>(null);
  const [seasonSheet, setSeasonSheet] = useState(false);
  const [confirm, setConfirm] = useState<'refresh' | 'revoke' | null>(null);
  // Share is offered ONLY where the native sheet exists. Everywhere else it
  // would just be a second Copy button wearing a different label.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => { setCanShare(typeof navigator !== 'undefined' && !!navigator.share); }, []);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !teamId) { setLoading(false); return; }

    const [{ data: s }, { data: inv }] = await Promise.all([
      supabase.from('cricket_seasons').select('id, name, is_active')
        .eq('team_id', teamId).order('year', { ascending: false }),
      // NOT filtered by expiry: an invite that has run out must be shown as
      // Expired, not silently reported as "no invite" — the admin needs to
      // know the link they shared is dead. All rows, so a second one tells us
      // the current link is a REFRESH rather than the first ever issued.
      supabase.from('team_invites').select('token, expires_at, created_by, created_at')
        .eq('team_id', teamId).order('created_at', { ascending: false }),
    ]);

    setSeasons((s ?? []) as Season[]);

    type Row = { token: string; expires_at: string; created_by: string; created_at: string };
    const rows = (inv ?? []) as Row[];
    const current = rows[0] ?? null;

    if (current) {
      // Name via cricket_players (readable by any team member); profiles is
      // global-admin-only, so it would come back empty for a team admin.
      let byName: string | null = null;
      if (current.created_by === useAuthStore.getState().user?.id) {
        byName = 'you';
      } else {
        const { data: p } = await supabase.from('cricket_players')
          .select('name').eq('user_id', current.created_by).eq('team_id', teamId)
          .limit(1).maybeSingle();
        byName = p?.name ?? null;
      }
      setInvite({
        token: current.token,
        expiresAt: current.expires_at,
        byName,
        at: current.created_at,
        isRefresh: rows.length > 1,
      });
    } else {
      setInvite(null);
    }
    setLoading(false);
  }, [teamId]);

  useEffect(() => { void load(); }, [load]);

  const activeSeason = seasons.find((s) => s.is_active) ?? null;

  const chooseSeason = async (season: Season) => {
    const supabase = getSupabaseClient();
    if (!supabase || !teamId || busy) return;
    setBusy('season');
    // Scoped to THIS team. Switching only moves which season is current —
    // no historical match, expense, fee or player row is touched.
    const { error: offErr } = await supabase.from('cricket_seasons')
      .update({ is_active: false }).eq('team_id', teamId).neq('id', season.id);
    const { error: onErr } = await supabase.from('cricket_seasons')
      .update({ is_active: true }).eq('id', season.id).eq('team_id', teamId);
    setBusy(null);
    if (offErr || onErr) { toast.error('Could not change the season'); return; }
    setSeasons((prev) => prev.map((x) => ({ ...x, is_active: x.id === season.id })));
    setSeasonSheet(false);
    toast.success(`${splitSeasonName(season.name)[0]} is now the current season`);
  };

  // Server-authoritative: the RPCs verify team admin and own the 30-day TTL.
  // State is set only from what the server returns — never optimistically.
  const generate = async (kind: 'new' | 'refresh') => {
    const supabase = getSupabaseClient();
    if (!supabase || !teamId || busy) return;
    setBusy('invite');
    const { data, error } = await supabase.rpc('generate_team_invite', { p_team_id: teamId });
    setBusy(null);
    if (error || data?.error) {
      toast.error(error?.message ?? data?.error ?? 'Could not create the invite link');
      return;
    }
    // Re-read rather than construct the row locally: the attribution line
    // ("Refreshed by …") comes from the server's own record.
    await load();
    toast.success(kind === 'refresh'
      ? 'New invite link created — the old one no longer works'
      : 'Invite link created');
  };

  const revoke = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !teamId || busy) return;
    setBusy('invite');
    const { data, error } = await supabase.rpc('revoke_team_invite', { p_team_id: teamId });
    setBusy(null);
    if (error || data?.error) {
      toast.error(error?.message ?? data?.error ?? 'Could not revoke the invite link');
      return;
    }
    setInvite(null);
    toast.success('Invite link revoked');
  };

  const inviteUrl = invite ? `${window.location.origin}/cricket?join=${invite.token}` : '';
  const copyLink = () => { navigator.clipboard.writeText(inviteUrl); toast.success('Invite link copied'); };
  const shareLink = async () => {
    try { await navigator.share({ title: `Join ${team?.team_name ?? 'the team'}`, url: inviteUrl }); }
    catch { /* cancelled — nothing to report */ }
  };

  // Expiry wording is state-dependent on purpose. A date alone is right for a
  // link with weeks left; "26784 days left" is noise. A countdown only earns
  // its place in the final week, when it is something to act on.
  const msLeft = invite ? new Date(invite.expiresAt).getTime() - Date.now() : 0;
  const expired = !!invite && msLeft <= 0;
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));
  const expiringSoon = !!invite && !expired && daysLeft <= EXPIRY_WARN_DAYS;
  const usable = !!invite && !expired;

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner size="lg" brand="cricket" /></div>;
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-5">
      <Text as="h1" size="xl" weight="bold" tracking="tight" className="mb-5">Team Admin</Text>

      {/* ── Season ── */}
      <section className="mb-6">
        <Text as="p" size="2xs" weight="bold" uppercase tracking="wider" color="dim" className="mb-2 px-1">
          Season
        </Text>
        <div className="rounded-2xl p-4" style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}>
          {activeSeason ? (
            <>
              <Text as="p" size="md" weight="semibold">{splitSeasonName(activeSeason.name)[0]}</Text>
              {splitSeasonName(activeSeason.name)[1] && (
                <Text as="p" size="xs" color="muted">{splitSeasonName(activeSeason.name)[1]}</Text>
              )}
              <span className="mt-1 inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--green)' }} />
                <Text size="xs" weight="semibold" style={{ color: 'var(--green)' }}>Current</Text>
              </span>
            </>
          ) : (
            <Text as="p" size="sm" color="muted">No current season</Text>
          )}
          {seasons.length > 1 && (
            <button
              onClick={() => setSeasonSheet(true)}
              disabled={busy === 'season'}
              className="mt-3 -mx-1 flex min-h-11 w-full items-center justify-between rounded-xl px-1 cursor-pointer transition-colors active:bg-[var(--hover-bg)] disabled:opacity-60"
            >
              <Text size="sm" weight="medium">Change season</Text>
              <ChevronRight size={16} className="text-[var(--dim)]" />
            </button>
          )}
        </div>
      </section>

      {/* ── Team invite ── */}
      <section>
        <Text as="p" size="2xs" weight="bold" uppercase tracking="wider" color="dim" className="mb-2 px-1">
          Team invite
        </Text>
        <div className="rounded-2xl p-4" style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}>
          {!invite && (
            <>
              <Text as="p" size="sm" weight="semibold" className="mb-1">No active invite</Text>
              <Text as="p" size="xs" color="muted" className="mb-3">
                Generate an invite link for players to join your team.
              </Text>
              <Button variant="primary" brand="cricket" size="md" className="w-full"
                disabled={busy === 'invite'} onClick={() => void generate('new')}>
                <LinkIcon size={15} className="mr-2" />
                {busy === 'invite' ? 'Creating…' : 'Generate invite'}
              </Button>
            </>
          )}

          {invite && expired && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--red)' }} />
                <Text size="xs" weight="semibold" style={{ color: 'var(--red)' }}>Expired</Text>
              </span>
              <Text as="p" size="sm" weight="medium" className="mt-1.5">{fmtDate(invite.expiresAt)}</Text>
              {invite.byName && (
                <Text as="p" size="2xs" color="dim" className="mt-0.5">
                  {invite.isRefresh ? 'Refreshed' : 'Created'} by {invite.byName} on {fmtDate(invite.at)}
                </Text>
              )}
              <div className="mb-3" />
              {/* No Copy or Share — the link does not work. */}
              <Button variant="primary" brand="cricket" size="md" className="w-full"
                disabled={busy === 'invite'} onClick={() => void generate('new')}>
                <LinkIcon size={15} className="mr-2" />
                {busy === 'invite' ? 'Creating…' : 'Generate new invite'}
              </Button>
            </>
          )}

          {usable && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--green)' }} />
                <Text size="xs" weight="semibold" style={{ color: 'var(--green)' }}>Active</Text>
              </span>
              {expiringSoon ? (
                <>
                  <Text as="p" size="sm" weight="semibold" className="mt-1.5" style={{ color: 'var(--orange)' }}>
                    {daysLeft <= 1 ? 'Expires today' : `Expires in ${daysLeft} days`}
                  </Text>
                  <Text as="p" size="xs" color="muted">{fmtDate(invite.expiresAt)}</Text>
                </>
              ) : (
                <Text as="p" size="sm" weight="medium" className="mt-1.5">
                  Expires {fmtDate(invite.expiresAt)}
                </Text>
              )}
              {invite.byName && (
                <Text as="p" size="2xs" color="dim" className="mt-0.5">
                  {invite.isRefresh ? 'Refreshed' : 'Created'} by {invite.byName} on {fmtDate(invite.at)}
                </Text>
              )}

              <Button variant="primary" brand="cricket" size="md" className="mt-3 w-full" onClick={copyLink}>
                <Copy size={15} className="mr-2" /> Copy invite link
              </Button>

              <div className="mt-2 flex items-center justify-between gap-1">
                {canShare && (
                  <Button variant="ghost" size="sm" onClick={shareLink}>
                    <Share2 size={14} className="mr-1.5" /> Share
                  </Button>
                )}
                <Button variant="ghost" size="sm" disabled={busy === 'invite'} onClick={() => setConfirm('refresh')}>
                  <RefreshCw size={14} className="mr-1.5" /> Refresh invite
                </Button>
                <Button variant="ghost" size="sm" disabled={busy === 'invite'} onClick={() => setConfirm('revoke')}>
                  <X size={14} className="mr-1.5" style={{ color: 'var(--red)' }} />
                  <span style={{ color: 'var(--red)' }}>Revoke</span>
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Season picker */}
      <Drawer open={seasonSheet} onOpenChange={setSeasonSheet}>
        <DrawerHandle />
        {/* DrawerTitle is sr-only by design, so the sheet needs a VISIBLE
            heading too — without one the first season row reads as the title. */}
        <DrawerTitle>Change current season</DrawerTitle>
        <div className="px-5 pb-3" aria-hidden>
          <Text as="p" size="lg" weight="semibold" tracking="tight">Change current season</Text>
        </div>
        <DrawerBody className="!px-0 !pt-0">
          <div className="flex flex-col">
            {seasons.map((s) => {
              const [name, division] = splitSeasonName(s.name);
              return (
                <button
                  key={s.id}
                  onClick={() => void chooseSeason(s)}
                  disabled={busy === 'season'}
                  aria-current={s.is_active ? 'true' : undefined}
                  className="flex min-h-14 w-full items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3 text-left cursor-pointer transition-colors active:bg-[var(--hover-bg)] disabled:opacity-60"
                  style={s.is_active ? { background: 'color-mix(in srgb, var(--cricket) 7%, transparent)' } : undefined}
                >
                  <span className="flex min-w-0 flex-col">
                    <Text size="sm" weight={s.is_active ? 'semibold' : 'normal'}>{name}</Text>
                    {division && <Text as="span" size="xs" color="muted">{division}</Text>}
                  </span>
                  {s.is_active && <Check size={17} className="flex-shrink-0" style={{ color: 'var(--cricket)' }} />}
                </button>
              );
            })}
          </div>
        </DrawerBody>
      </Drawer>

      {/* Both actions break links already sent out, so both say what happens */}
      {confirm && (
        <Dialog open onOpenChange={(o) => { if (!o) setConfirm(null); }}>
          <DialogContent className="max-w-xs" showClose={false}>
            <DialogTitle className="text-[15px]">
              {confirm === 'refresh' ? 'Refresh team invite?' : 'Revoke team invite?'}
            </DialogTitle>
            <DialogDescription className="text-[13px] mt-1.5">
              {confirm === 'refresh'
                ? 'The current invite link will stop working. A new invite link will be generated and expire in 30 days.'
                : 'This invite link will stop working immediately. Existing team members will not be affected.'}
            </DialogDescription>
            <DialogFooter>
              <Button variant="secondary" size="md" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button
                variant={confirm === 'revoke' ? 'danger' : 'primary'}
                brand={confirm === 'refresh' ? 'cricket' : undefined}
                size="md"
                onClick={() => {
                  const action = confirm;
                  setConfirm(null);
                  if (action === 'refresh') void generate('refresh'); else void revoke();
                }}
              >
                {confirm === 'refresh' ? 'Refresh invite' : 'Revoke invite'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
