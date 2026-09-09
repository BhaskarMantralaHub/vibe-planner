'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { Text, Button, Input, Drawer, DrawerHandle, DrawerTitle, DrawerBody, Spinner } from '@/components/ui';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Copy, Share2, RefreshCw, X, Check, ChevronRight, Link as LinkIcon, ExternalLink, HelpCircle, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { haptic } from '@/lib/haptics';
import { useAsyncAction } from '@/hooks/use-async-action';

type Season = { id: string; name: string; is_active: boolean; cricclubs_league_id: number | null };

/** Sync metadata derived from backend (cricclubs_matches, cricket_schedule_matches). */
type SyncInfo = {
  lastSyncedAt: string | null;
  fixtureCount: number;
};

/** Format a relative time string ("Today, 8:42 PM", "Yesterday, 3:15 PM", "Sep 8, 8:42 PM"). */
function formatSyncTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + `, ${time}`;
}

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
  // Season only. The three invite actions carry their own pending state now
  // (see the useAsyncAction block below), so 'invite' would be a value nothing
  // ever sets — and a dead branch in a disabled= expression is how a control
  // ends up permanently enabled by accident.
  const [busy, setBusy] = useState<null | 'season'>(null);
  const [seasonSheet, setSeasonSheet] = useState(false);
  const [confirm, setConfirm] = useState<'refresh' | 'revoke' | null>(null);
  // Share is offered ONLY where the native sheet exists. Everywhere else it
  // would just be a second Copy button wearing a different label.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => { setCanShare(typeof navigator !== 'undefined' && !!navigator.share); }, []);

  // ── CricClubs Sync ──────────────────────────────────────────
  // Sync info keyed by season id: last synced timestamp + fixture count.
  const [syncInfo, setSyncInfo] = useState<Record<string, SyncInfo>>({});
  // Connect sheet state: which season are we connecting, and draft league ID.
  const [connectSheet, setConnectSheet] = useState<{ season: Season; draftId: string } | null>(null);
  // Manage sheet: which season's connection are we viewing.
  const [manageSheet, setManageSheet] = useState<Season | null>(null);
  // Disconnect confirmation dialog.
  const [disconnectConfirm, setDisconnectConfirm] = useState<Season | null>(null);
  // Help sheet: explains where to find the league ID.
  const [showHelp, setShowHelp] = useState(false);
  // Connection action state.
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !teamId) { setLoading(false); return; }

    const [{ data: s }, { data: inv }] = await Promise.all([
      supabase.from('cricket_seasons').select('id, name, is_active, cricclubs_league_id')
        .eq('team_id', teamId).order('year', { ascending: false }),
      // NOT filtered by expiry: an invite that has run out must be shown as
      // Expired, not silently reported as "no invite" — the admin needs to
      // know the link they shared is dead. All rows, so a second one tells us
      // the current link is a REFRESH rather than the first ever issued.
      supabase.from('team_invites').select('token, expires_at, created_by, created_at')
        .eq('team_id', teamId).order('created_at', { ascending: false }),
    ]);

    const seasonList = (s ?? []) as Season[];
    setSeasons(seasonList);

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

    // ── Fetch sync metadata for connected seasons ──────────────
    const connectedSeasons = seasonList.filter((x) => x.cricclubs_league_id != null);
    if (connectedSeasons.length > 0) {
      const infoMap: Record<string, SyncInfo> = {};
      await Promise.all(connectedSeasons.map(async (season) => {
        // Last synced: max parsed_at from cricclubs_matches for this league
        const { data: lastMatch } = await supabase
          .from('cricclubs_matches')
          .select('parsed_at')
          .eq('team_id', teamId)
          .eq('cricclubs_league_id', season.cricclubs_league_id)
          .order('parsed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Fixture count: schedule matches linked to this season with cricclubs_fixture_id
        const { count } = await supabase
          .from('cricket_schedule_matches')
          .select('*', { count: 'exact', head: true })
          .eq('season_id', season.id)
          .not('cricclubs_fixture_id', 'is', null);

        infoMap[season.id] = {
          lastSyncedAt: lastMatch?.parsed_at ?? null,
          fixtureCount: count ?? 0,
        };
      }));
      setSyncInfo(infoMap);
    }

    setLoading(false);
  }, [teamId]);

  useEffect(() => { void load(); }, [load]);

  const activeSeason = seasons.find((s) => s.is_active) ?? null;

  const chooseSeason = async (season: Season) => {
    const supabase = getSupabaseClient();
    if (!supabase || !teamId || busy) return;
    // Re-picking the season that is already current changes nothing, so it
    // gets no feedback — the sheet just closes.
    if (season.is_active) { setSeasonSheet(false); return; }
    haptic('selection');
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
  //
  // These THROW on failure rather than toasting and returning. That is what
  // lets useAsyncAction below tell success from failure: a function that
  // catches its own error returns a resolved promise, and the hook would
  // then light up a success state for an operation that did not happen.
  const generate = async (kind: 'new' | 'refresh') => {
    const supabase = getSupabaseClient();
    if (!supabase || !teamId) throw new Error('Could not create the invite link');
    const { data, error } = await supabase.rpc('generate_team_invite', { p_team_id: teamId });
    if (error || data?.error) {
      throw new Error(error?.message ?? data?.error ?? 'Could not create the invite link');
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
    if (!supabase || !teamId) throw new Error('Could not revoke the invite link');
    const { data, error } = await supabase.rpc('revoke_team_invite', { p_team_id: teamId });
    if (error || data?.error) {
      throw new Error(error?.message ?? data?.error ?? 'Could not revoke the invite link');
    }
    setInvite(null);
    toast.success('Invite link revoked');
  };

  const reportError = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : 'Something went wrong');

  // ── CricClubs connection handlers ──────────────────────────
  const connectSeason = async (season: Season, leagueId: number) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setConnecting(true);
    const { error } = await supabase
      .from('cricket_seasons')
      .update({ cricclubs_league_id: leagueId })
      .eq('id', season.id);
    setConnecting(false);
    if (error) {
      toast.error('Could not connect to CricClubs');
      return;
    }
    haptic('success');
    setSeasons((prev) => prev.map((x) => x.id === season.id ? { ...x, cricclubs_league_id: leagueId } : x));
    setConnectSheet(null);
    toast.success(`${splitSeasonName(season.name)[0]} connected to CricClubs`);
  };

  const disconnectSeason = async (season: Season) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    haptic('medium');
    const { error } = await supabase
      .from('cricket_seasons')
      .update({ cricclubs_league_id: null })
      .eq('id', season.id);
    if (error) {
      toast.error('Could not disconnect from CricClubs');
      return;
    }
    haptic('success');
    setSeasons((prev) => prev.map((x) => x.id === season.id ? { ...x, cricclubs_league_id: null } : x));
    setSyncInfo((prev) => {
      const next = { ...prev };
      delete next[season.id];
      return next;
    });
    setManageSheet(null);
    setDisconnectConfirm(null);
    toast.success(`${splitSeasonName(season.name)[0]} disconnected from CricClubs`);
  };

  const changeLeague = (season: Season) => {
    // Open connect sheet pre-filled with current league ID for editing
    setManageSheet(null);
    setConnectSheet({ season, draftId: String(season.cricclubs_league_id ?? '') });
  };

  /**
   * Three separate actions over two functions, because the haptic weight is
   * part of what the control MEANS.
   *
   * Creating a link is constructive → 'light'. Refreshing and revoking both
   * break a link already sent to the team → 'medium', the weight this system
   * reserves for consequences. Same shape as the confirmation dialogs those
   * two already sit behind.
   */
  const createInvite = useAsyncAction(() => generate('new'), {
    tapHaptic: 'light', onError: reportError,
  });
  const refreshInvite = useAsyncAction(() => generate('refresh'), {
    tapHaptic: 'medium', onError: reportError,
  });
  const revokeInvite = useAsyncAction(revoke, {
    tapHaptic: 'medium', onError: reportError,
  });

  const inviteBusy = createInvite.pending || refreshInvite.pending || revokeInvite.pending;

  const inviteUrl = invite ? `${window.location.origin}/cricket?join=${invite.token}` : '';

  /**
   * `clipboard.writeText` returns a promise and the old code dropped it, so a
   * denied clipboard permission still toasted "copied". Awaiting it is what
   * makes the ✓ state trustworthy.
   *
   * No success haptic: the clipboard resolves inside a frame, so the tap tick
   * and a success tick would land on top of each other and read as a stutter
   * rather than as two events. The icon swap carries the confirmation.
   */
  const copyLink = useAsyncAction(
    async () => {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success('Invite link copied');
    },
    { tapHaptic: 'light', successHaptic: null, onError: () => toast.error("Couldn't copy the link") },
  );

  const shareLink = async () => {
    // Light tap only. The OS share sheet is the feedback from here on, and
    // the user can still cancel it — so there is no success to celebrate.
    haptic('light');
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

      {/* ── CricClubs Sync ── */}
      <section className="mb-6">
        <Text as="p" size="2xs" weight="bold" uppercase tracking="wider" color="dim" className="mb-2 px-1">
          CricClubs Sync
        </Text>
        <div className="rounded-2xl" style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}>
          <div className="px-4 pt-3 pb-2">
            <Text as="p" size="xs" color="muted">
              Sync league fixtures from CricClubs automatically.
            </Text>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {seasons.map((s) => {
              const [name, division] = splitSeasonName(s.name);
              const connected = s.cricclubs_league_id != null;
              const info = syncInfo[s.id];
              return (
                <div key={s.id} className="px-4 py-3">
                  {/* Season header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Text as="p" size="sm" weight="semibold">{name}</Text>
                      {division && <Text as="p" size="xs" color="muted">{division}</Text>}
                    </div>
                  </div>

                  {/* Status line */}
                  <div className="mt-2 flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: connected ? 'var(--green)' : 'var(--dim)' }}
                    />
                    <Text size="xs" weight="medium" style={{ color: connected ? 'var(--green)' : 'var(--dim)' }}>
                      {connected ? 'Connected' : 'Not connected'}
                    </Text>
                  </div>

                  {/* Connected: league info + sync status */}
                  {connected && (
                    <div className="mt-1">
                      <Text as="p" size="xs" color="muted">
                        CricClubs League {s.cricclubs_league_id}
                      </Text>
                      {info?.lastSyncedAt && (
                        <Text as="p" size="xs" color="dim" className="mt-0.5">
                          Last synced: {formatSyncTime(info.lastSyncedAt)}
                          {info.fixtureCount > 0 && ` · ${info.fixtureCount} fixture${info.fixtureCount !== 1 ? 's' : ''}`}
                        </Text>
                      )}
                      {!info?.lastSyncedAt && (
                        <Text as="p" size="xs" color="dim" className="mt-0.5">
                          Never synced
                        </Text>
                      )}
                    </div>
                  )}

                  {/* Not connected: prompt */}
                  {!connected && (
                    <Text as="p" size="xs" color="dim" className="mt-1">
                      Connect this season to sync fixtures.
                    </Text>
                  )}

                  {/* Action */}
                  <button
                    onClick={() => connected ? setManageSheet(s) : setConnectSheet({ season: s, draftId: '' })}
                    className="mt-2.5 -mx-1 flex min-h-11 w-full items-center justify-between rounded-xl px-1 cursor-pointer transition-colors active:bg-[var(--hover-bg)]"
                  >
                    <Text size="sm" weight="medium" style={{ color: connected ? 'var(--text)' : 'var(--cricket)' }}>
                      {connected ? 'Manage connection' : 'Connect CricClubs'}
                    </Text>
                    <ChevronRight size={16} className="text-[var(--dim)]" />
                  </button>
                </div>
              );
            })}
          </div>
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
                disabled={inviteBusy} onClick={() => void createInvite.run()}>
                <LinkIcon size={15} className="mr-2" />
                {inviteBusy ? 'Creating…' : 'Generate invite'}
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
                disabled={inviteBusy} onClick={() => void createInvite.run()}>
                <LinkIcon size={15} className="mr-2" />
                {inviteBusy ? 'Creating…' : 'Generate new invite'}
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

              {/* Copy → ✓ Copied. The label swap is the confirmation, so it
                  waits for the clipboard write to actually resolve. */}
              <Button
                variant="primary" brand="cricket" size="md" className="mt-3 w-full"
                onClick={() => void copyLink.run()}
                aria-live="polite"
              >
                {copyLink.succeeded ? (
                  <>
                    <Check size={15} className="mr-2 animate-tactile-check" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy size={15} className="mr-2" />
                    Copy invite link
                  </>
                )}
              </Button>

              <div className="mt-2 flex items-center justify-between gap-1">
                {canShare && (
                  <Button variant="ghost" size="sm" onClick={shareLink}>
                    <Share2 size={14} className="mr-1.5" /> Share
                  </Button>
                )}
                {/* These two only OPEN a confirmation, so they are silent —
                    the haptic belongs on the button that does the thing. */}
                <Button variant="ghost" size="sm" disabled={inviteBusy} onClick={() => setConfirm('refresh')}>
                  <RefreshCw size={14} className={`mr-1.5 ${refreshInvite.pending ? 'animate-spin' : ''}`} />
                  Refresh invite
                </Button>
                <Button variant="ghost" size="sm" disabled={inviteBusy} onClick={() => setConfirm('revoke')}>
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
                  className="pressable-selection flex min-h-14 w-full items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3 text-left cursor-pointer transition-colors active:bg-[var(--hover-bg)] disabled:opacity-60"
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
                /* The commitment point — this is where 'medium' fires, and
                   where a success haptic follows only if the server agrees. */
                onClick={() => {
                  const action = confirm;
                  setConfirm(null);
                  if (action === 'refresh') void refreshInvite.run(); else void revokeInvite.run();
                }}
              >
                {confirm === 'refresh' ? 'Refresh invite' : 'Revoke invite'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── CricClubs Connect Sheet ── */}
      <Drawer open={!!connectSheet} onOpenChange={(o) => { if (!o) setConnectSheet(null); }}>
        <DrawerHandle />
        <DrawerTitle>Connect CricClubs</DrawerTitle>
        <div className="px-5 pb-2" aria-hidden>
          <Text as="p" size="lg" weight="semibold" tracking="tight">Connect CricClubs</Text>
          {connectSheet && (
            <Text as="p" size="sm" color="muted" className="mt-1">
              {splitSeasonName(connectSheet.season.name)[0]}
            </Text>
          )}
        </div>
        <DrawerBody>
          <Text as="p" size="sm" color="muted" className="mb-4">
            Enter the CricClubs league ID for this season. Fixtures will sync automatically.
          </Text>

          <label className="block">
            <Text as="span" size="xs" weight="semibold" color="dim" className="mb-1.5 block">
              CricClubs League ID
            </Text>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="e.g. 93"
              value={connectSheet?.draftId ?? ''}
              onChange={(e) => setConnectSheet((prev) => prev ? { ...prev, draftId: e.target.value } : null)}
              className="font-mono"
            />
          </label>

          <button
            onClick={() => setShowHelp(true)}
            className="mt-3 flex items-center gap-1.5 text-[13px] cursor-pointer transition-colors"
            style={{ color: 'var(--cricket)' }}
          >
            <HelpCircle size={14} />
            Where do I find this?
          </button>

          <div className="mt-6 flex gap-3">
            <Button
              variant="secondary"
              size="md"
              className="flex-1"
              onClick={() => setConnectSheet(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              brand="cricket"
              size="md"
              className="flex-1"
              disabled={!connectSheet?.draftId || connecting}
              onClick={() => {
                if (!connectSheet?.draftId) return;
                const leagueId = parseInt(connectSheet.draftId, 10);
                if (isNaN(leagueId) || leagueId <= 0) {
                  toast.error('Enter a valid league ID');
                  return;
                }
                void connectSeason(connectSheet.season, leagueId);
              }}
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </Button>
          </div>
        </DrawerBody>
      </Drawer>

      {/* ── CricClubs Manage Connection Sheet ── */}
      <Drawer open={!!manageSheet} onOpenChange={(o) => { if (!o) setManageSheet(null); }}>
        <DrawerHandle />
        <DrawerTitle>CricClubs Connection</DrawerTitle>
        <div className="px-5 pb-2" aria-hidden>
          <Text as="p" size="lg" weight="semibold" tracking="tight">CricClubs Connection</Text>
          {manageSheet && (
            <Text as="p" size="sm" color="muted" className="mt-1">
              {splitSeasonName(manageSheet.name)[0]}
            </Text>
          )}
        </div>
        <DrawerBody>
          {manageSheet && (() => {
            const info = syncInfo[manageSheet.id];
            return (
              <>
                {/* Connection status */}
                <div className="rounded-xl p-4" style={{ background: 'var(--surface)' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: 'var(--green)' }} />
                    <Text size="sm" weight="semibold" style={{ color: 'var(--green)' }}>Connected</Text>
                  </div>
                  <Text as="p" size="sm" color="muted" className="mt-1">
                    League {manageSheet.cricclubs_league_id}
                  </Text>
                  {info?.lastSyncedAt && (
                    <Text as="p" size="xs" color="dim" className="mt-2">
                      Last synced: {formatSyncTime(info.lastSyncedAt)}
                    </Text>
                  )}
                  {info?.fixtureCount != null && info.fixtureCount > 0 && (
                    <Text as="p" size="xs" color="dim">
                      {info.fixtureCount} fixture{info.fixtureCount !== 1 ? 's' : ''} synced
                    </Text>
                  )}
                  {!info?.lastSyncedAt && (
                    <Text as="p" size="xs" color="dim" className="mt-2">
                      Never synced
                    </Text>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 space-y-1">
                  <button
                    onClick={() => changeLeague(manageSheet)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 cursor-pointer transition-colors active:bg-[var(--hover-bg)]"
                  >
                    <RefreshCw size={16} className="text-[var(--muted)]" />
                    <Text size="sm" weight="medium">Change league</Text>
                  </button>
                  <button
                    onClick={() => setDisconnectConfirm(manageSheet)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 cursor-pointer transition-colors active:bg-[var(--hover-bg)]"
                  >
                    <Unlink size={16} style={{ color: 'var(--red)' }} />
                    <Text size="sm" weight="medium" style={{ color: 'var(--red)' }}>Disconnect</Text>
                  </button>
                </div>
              </>
            );
          })()}
        </DrawerBody>
      </Drawer>

      {/* ── CricClubs Help Sheet ── */}
      <Drawer open={showHelp} onOpenChange={setShowHelp}>
        <DrawerHandle />
        <DrawerTitle>Finding the League ID</DrawerTitle>
        <div className="px-5 pb-2" aria-hidden>
          <Text as="p" size="lg" weight="semibold" tracking="tight">Finding the League ID</Text>
        </div>
        <DrawerBody>
          <Text as="p" size="sm" color="muted" className="mb-4">
            The league ID is in the CricClubs URL when viewing your league fixtures.
          </Text>
          <div className="rounded-xl p-4 overflow-x-auto" style={{ background: 'var(--surface)' }}>
            <code className="text-[12px] font-mono whitespace-nowrap text-[var(--text)]">
              cricclubs.com/…/fixtures.do?<span style={{ color: 'var(--cricket)', fontWeight: 600 }}>league=93</span>&teamId=…
            </code>
          </div>
          <Text as="p" size="sm" color="muted" className="mt-4">
            The number after <code className="font-mono px-1 py-0.5 rounded" style={{ background: 'var(--surface)', color: 'var(--cricket)' }}>league=</code> is the league ID.
          </Text>

          <a
            href="https://cricclubs.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center gap-2 text-[14px] font-medium cursor-pointer"
            style={{ color: 'var(--cricket)' }}
          >
            <ExternalLink size={15} />
            Open CricClubs
          </a>

          <Button
            variant="secondary"
            size="md"
            className="mt-6 w-full"
            onClick={() => setShowHelp(false)}
          >
            Got it
          </Button>
        </DrawerBody>
      </Drawer>

      {/* ── CricClubs Disconnect Confirmation ── */}
      {disconnectConfirm && (
        <Dialog open onOpenChange={(o) => { if (!o) setDisconnectConfirm(null); }}>
          <DialogContent className="max-w-xs" showClose={false}>
            <DialogTitle className="text-[15px]">
              Disconnect from CricClubs?
            </DialogTitle>
            <DialogDescription className="text-[13px] mt-1.5">
              <span className="font-medium">{splitSeasonName(disconnectConfirm.name)[0]}</span> will no longer sync fixtures from CricClubs League {disconnectConfirm.cricclubs_league_id}. Existing fixtures will not be deleted.
            </DialogDescription>
            <DialogFooter>
              <Button variant="secondary" size="md" onClick={() => setDisconnectConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={() => void disconnectSeason(disconnectConfirm)}
              >
                Disconnect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
