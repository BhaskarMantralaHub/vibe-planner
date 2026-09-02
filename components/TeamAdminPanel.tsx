'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { Text, Button, Drawer, DrawerHandle, DrawerTitle, DrawerBody, Spinner } from '@/components/ui';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Copy, Share2, RefreshCw, X, Check, ChevronRight, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';

type Season = { id: string; name: string; is_active: boolean };
type Invite = { token: string; expiresAt: string };

/**
 * The console for a TEAM admin (captain/vice-captain), as opposed to the
 * platform admin console.
 *
 * They manage one team, so this is deliberately two things and nothing else:
 * which season is current, and the invite link. No user list, no analytics,
 * no other teams — RLS would return them nothing there anyway, and showing
 * empty tabs invites the question "is it broken?".
 */
export default function TeamAdminPanel() {
  const { currentTeamId, userTeams } = useAuthStore();
  const team = userTeams.find((t) => t.team_id === currentTeamId) ?? userTeams[0] ?? null;
  const teamId = team?.team_id ?? null;

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [seasonSheet, setSeasonSheet] = useState(false);
  const [confirm, setConfirm] = useState<'refresh' | 'revoke' | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !teamId) { setLoading(false); return; }

    const [{ data: s }, { data: inv }] = await Promise.all([
      supabase.from('cricket_seasons').select('id, name, is_active')
        .eq('team_id', teamId).order('year', { ascending: false }),
      supabase.from('team_invites').select('token, expires_at')
        .eq('team_id', teamId).eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    setSeasons((s ?? []) as Season[]);
    setInvite(inv ? { token: inv.token, expiresAt: inv.expires_at } : null);
    setLoading(false);
  }, [teamId]);

  useEffect(() => { void load(); }, [load]);

  const activeSeason = seasons.find((s) => s.is_active) ?? null;

  const chooseSeason = async (season: Season) => {
    const supabase = getSupabaseClient();
    if (!supabase || !teamId || busy) return;
    setBusy(true);
    // Scoped to THIS team — a season switch must never reach another team's
    // rows (the platform console's version filters only by id).
    const { error: offErr } = await supabase.from('cricket_seasons')
      .update({ is_active: false }).eq('team_id', teamId).neq('id', season.id);
    const { error: onErr } = await supabase.from('cricket_seasons')
      .update({ is_active: true }).eq('id', season.id).eq('team_id', teamId);
    setBusy(false);
    if (offErr || onErr) { toast.error('Could not change the season'); return; }
    setSeasons((prev) => prev.map((x) => ({ ...x, is_active: x.id === season.id })));
    setSeasonSheet(false);
    toast.success(`${season.name} is now the current season`);
  };

  const generate = async (isRefresh = false) => {
    const supabase = getSupabaseClient();
    if (!supabase || !teamId || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('generate_team_invite', { p_team_id: teamId });
    setBusy(false);
    if (error || data?.error) {
      toast.error(error?.message ?? data?.error ?? 'Could not create the invite link');
      return;
    }
    setInvite({ token: data.token, expiresAt: data.expires_at });
    toast.success(isRefresh ? 'New link created — the old one no longer works' : 'Invite link created, valid 30 days');
  };

  const revoke = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !teamId || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('revoke_team_invite', { p_team_id: teamId });
    setBusy(false);
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
    if (navigator.share) {
      try { await navigator.share({ title: `Join ${team?.team_name ?? 'the team'}`, url: inviteUrl }); return; } catch { /* cancelled */ }
    }
    copyLink();
  };

  // Days left drives both the wording and the tone: an invite quietly a day
  // from death is the thing an admin most needs to notice.
  const daysLeft = invite
    ? Math.max(0, Math.ceil((new Date(invite.expiresAt).getTime() - Date.now()) / 86_400_000))
    : 0;
  const expiringSoon = daysLeft <= 7;

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner size="lg" brand="cricket" /></div>;
  }

  return (
    <div className="px-4 py-5 space-y-6 max-w-lg mx-auto">
      {/* ── Current season ── */}
      <section>
        <Text as="p" size="2xs" weight="bold" uppercase tracking="wider" color="dim" className="mb-2">
          Current season
        </Text>
        <div className="rounded-2xl p-4" style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}>
          {activeSeason ? (
            <>
              <Text as="p" size="md" weight="semibold">{activeSeason.name}</Text>
              <span className="mt-1 inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--green)' }} />
                <Text size="xs" weight="semibold" style={{ color: 'var(--green)' }}>Active</Text>
              </span>
            </>
          ) : (
            <Text as="p" size="sm" color="muted">No active season</Text>
          )}
          {seasons.length > 1 && (
            <button
              onClick={() => setSeasonSheet(true)}
              className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl px-3 -mx-1 cursor-pointer transition-colors active:bg-[var(--hover-bg)]"
            >
              <Text size="sm" weight="medium">Change season</Text>
              <ChevronRight size={16} className="text-[var(--dim)]" />
            </button>
          )}
        </div>
      </section>

      {/* ── Team invite ── */}
      <section>
        <Text as="p" size="2xs" weight="bold" uppercase tracking="wider" color="dim" className="mb-2">
          Team invite
        </Text>
        <div className="rounded-2xl p-4" style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}>
          {invite ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--green)' }} />
                <Text size="xs" weight="semibold" style={{ color: 'var(--green)' }}>Active</Text>
              </span>
              <Text as="p" size="sm" weight="medium" className="mt-1.5">
                Expires {new Date(invite.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
              <Text as="p" size="xs" className="mt-0.5"
                style={{ color: expiringSoon ? 'var(--orange)' : 'var(--muted)' }}>
                {daysLeft === 0
                  ? 'Expires today — refresh it to keep people joining'
                  : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left${expiringSoon ? ' — refresh it soon' : ''}`}
              </Text>

              <Button variant="primary" brand="cricket" size="md" className="mt-3 w-full" onClick={copyLink}>
                <Copy size={15} className="mr-2" /> Copy invite link
              </Button>
              <div className="mt-2 flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={shareLink}>
                  <Share2 size={14} className="mr-1.5" /> Share
                </Button>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm('refresh')}>
                    <RefreshCw size={14} className="mr-1.5" /> Refresh
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm('revoke')}>
                    <X size={14} className="mr-1.5" style={{ color: 'var(--red)' }} />
                    <span style={{ color: 'var(--red)' }}>Revoke</span>
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <Text as="p" size="sm" color="muted" className="mb-3">
                No active invite. Nobody can join the team with a link right now.
              </Text>
              <Button variant="primary" brand="cricket" size="md" className="w-full"
                disabled={busy} onClick={() => generate()}>
                <LinkIcon size={15} className="mr-2" />
                {busy ? 'Creating…' : 'Generate invite link'}
              </Button>
            </>
          )}
        </div>
      </section>

      {/* Season picker */}
      <Drawer open={seasonSheet} onOpenChange={setSeasonSheet}>
        <DrawerHandle />
        <DrawerTitle>Change season</DrawerTitle>
        <DrawerBody className="!px-0 !pt-2">
          <div className="flex flex-col">
            {seasons.map((s) => (
              <button
                key={s.id}
                onClick={() => void chooseSeason(s)}
                disabled={busy}
                className="flex min-h-14 w-full items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-2.5 text-left cursor-pointer transition-colors active:bg-[var(--hover-bg)]"
                style={s.is_active ? { background: 'color-mix(in srgb, var(--cricket) 7%, transparent)' } : undefined}
              >
                <Text size="sm" weight={s.is_active ? 'semibold' : 'normal'}>{s.name}</Text>
                {s.is_active && <Check size={17} style={{ color: 'var(--cricket)' }} />}
              </button>
            ))}
          </div>
        </DrawerBody>
      </Drawer>

      {/* Refresh / revoke both break links already sent out */}
      {confirm && (
        <Dialog open onOpenChange={(o) => { if (!o) setConfirm(null); }}>
          <DialogContent className="max-w-xs" showClose={false}>
            <DialogTitle className="text-[15px]">
              {confirm === 'refresh' ? 'Create a new invite link?' : 'Revoke the invite link?'}
            </DialogTitle>
            <DialogDescription className="text-[13px] mt-1.5">
              {confirm === 'refresh'
                ? 'The current link stops working immediately. Anyone still using it will need the new one.'
                : 'The current link stops working immediately and no new link is created. Nobody can join by link until you generate one.'}
            </DialogDescription>
            <DialogFooter>
              <Button variant="secondary" size="md" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button
                variant={confirm === 'revoke' ? 'danger' : 'primary'}
                brand={confirm === 'refresh' ? 'cricket' : undefined}
                size="md"
                onClick={() => { const a = confirm; setConfirm(null); if (a === 'refresh') void generate(true); else void revoke(); }}
              >
                {confirm === 'refresh' ? 'Create new link' : 'Revoke'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
