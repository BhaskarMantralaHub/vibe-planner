'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Text, Button, Badge, Alert, SegmentedControl, EmptyState, Skeleton, CardMenu,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import type { CardMenuItem } from '@/components/ui';
import {
  MapPin, Clock, ChevronDown, ChevronRight, Plus, Copy, UserPlus,
  EllipsisVertical, CircleCheckBig, UserX, RotateCcw, UserMinus, Trash2, CircleCheck, UserCog, Repeat2, Pencil,
} from 'lucide-react';
import UmpireIcon from '@/components/icons/UmpireIcon';
import { FaWhatsapp } from 'react-icons/fa';
import {
  buildAssignedReminderText, buildDutyShareText, buildRosterSummaryText,
  buildDayThanksText, whatsappShareUrl, addressName,
} from '@/lib/duty-share';
import { getTeamName } from '../lib/constants';
import PlayerAvatar from './PlayerAvatar';
import DutyAssignSheet from './DutyAssignSheet';
import DutyPlayerSheet from './DutyPlayerSheet';
import DutySwapSheet from './DutySwapSheet';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import {
  useUmpiringStore, computeDutyStats, isLiveDuty, todayPT, DEFAULT_DUTY_TARGET,
} from '@/stores/umpiring-store';
import type { CricketPlayer, CricketUmpiringDuty } from '@/types/cricket';
import type { DutyPlayerStat } from '@/stores/umpiring-store';
import DutyForm from './DutyForm';
import CricketFab from './CricketFab';

type Tab = 'upcoming' | 'completed' | 'roster';


/* ── Formatting ───────────────────────────────────────────────────────── */

/** Every team in this league is prefixed "MTCA " — pure noise on a phone. */
const shortTeam = (n: string) => n.replace(/^MTCA\s+/i, '').trim();

function dateParts(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    dayName: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    dayNum: d.getDate(),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  };
}

function formatTime(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatShortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

const MATCH_TYPE_LABEL: Record<string, string> = { semi_final: 'Semi Final', final: 'Final' };

/* ── Match grouping ───────────────────────────────────────────────────────
 * One card per MATCH, not per slot. When MTCA gives us both umpire positions
 * on the same fixture, those belong on one card — showing them as two separate
 * cards for the identical match reads as duplicated data.
 */
type DutyGroup = {
  key: string;
  match_date: string;
  match_time: string | null;
  venue: string | null;
  team_a: string;
  team_b: string;
  match_type: string | null;
  duties: CricketUmpiringDuty[];
};

function groupByMatch(duties: CricketUmpiringDuty[]): DutyGroup[] {
  const groups = new Map<string, DutyGroup>();
  for (const d of duties) {
    // MTCA duties group by fixture id; hand-added ones fall back to
    // date + the two sides, normalised so entry order can't split a pair.
    const key = d.cricclubs_fixture_id !== null
      ? `f:${d.cricclubs_fixture_id}`
      : `m:${d.match_date}|${[d.team_a, d.team_b].sort().join('|')}`;
    const g = groups.get(key);
    if (g) { g.duties.push(d); continue; }
    groups.set(key, {
      key,
      match_date: d.match_date,
      match_time: d.match_time,
      venue: d.venue,
      team_a: d.team_a,
      team_b: d.team_b,
      match_type: d.match_type,
      duties: [d],
    });
  }
  for (const g of groups.values()) g.duties.sort((a, b) => a.role_slot - b.role_slot);
  return [...groups.values()];
}

/** Consecutive match groups that share a date — one card per DAY. Input must
 *  already be date-sorted (either direction); order is preserved. */
function groupByDay(groups: DutyGroup[]): DutyGroup[][] {
  const days: DutyGroup[][] = [];
  for (const g of groups) {
    const last = days[days.length - 1];
    if (last && last[0]!.match_date === g.match_date) last.push(g);
    else days.push([g]);
  }
  return days;
}

/* ── Board ────────────────────────────────────────────────────────────── */

export default function UmpiringBoard() {
  const { user, userAccess } = useAuthStore();
  const { players, seasons, selectedSeasonId, adminUserIds } = useCricketStore();
  const {
    duties, settings, loading, pendingId,
    loadDuties, claimDuty, releaseDuty,
    markMatchCompleted, markNoShow, reopenDuty, clearAssignment, deleteDuty, restoreDuty, undoSwap,
  } = useUmpiringStore();

  const isAdmin = userAccess.includes('admin') || (user ? adminUserIds.includes(user.id) : false);

  // ?tab= deep link (the menu's Umpiring › Upcoming / Done / Roster). Synced
  // during render when the param changes — a same-page menu tap changes only
  // the query — and written back on every switch so the URL never goes stale.
  const urlTab = useSearchParams().get('tab');
  const linkedTab = (['upcoming', 'completed', 'roster'] as const).find((t) => t === urlTab) ?? null;
  const [tab, setTabState] = useState<Tab>(linkedTab ?? 'upcoming');
  const [seenLinkedTab, setSeenLinkedTab] = useState(linkedTab);
  if (linkedTab !== seenLinkedTab) {
    setSeenLinkedTab(linkedTab);
    if (linkedTab) setTabState(linkedTab);
  }
  const setTab = (t: Tab) => {
    setTabState(t);
    window.history.replaceState(null, '', `?tab=${t}`);
  };
  const [showForm, setShowForm] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [assignTarget, setAssignTarget] = useState<CricketUmpiringDuty | null>(null);
  const [swapTarget, setSwapTarget] = useState<CricketUmpiringDuty | null>(null);
  const [editTarget, setEditTarget] = useState<CricketUmpiringDuty | null>(null);
  // Held as an ID, not the player object, so the sheet re-reads live data after
  // an admin action instead of showing a frozen copy.
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedSeasonId) loadDuties(selectedSeasonId);
  }, [selectedSeasonId, loadDuties]);

  /**
   * Which player row is me — resolved by case-insensitive EMAIL, matching the
   * eight other places in the app. `user_id` is only backfilled
   * opportunistically, so a user_id-only lookup silently excludes real players.
   */
  const myPlayer = useMemo(() => {
    const email = user?.email?.toLowerCase().trim();
    if (!email) return null;
    return players.find((p) => p.is_active && p.email?.toLowerCase().trim() === email) ?? null;
  }, [players, user?.email]);

  const playersById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );
  /** Active players' full names — the scope for spotting shared first names. */
  const rosterNames = useMemo(
    () => players.filter((p) => p.is_active).map((p) => p.name),
    [players],
  );


  const target = settings?.duty_target ?? DEFAULT_DUTY_TARGET;
  const today = todayPT();

  const live = useMemo(() => duties.filter(isLiveDuty), [duties]);
  // Soft-deleted duties. Since swaps now use status='cancelled' and stay
  // visible inline, deleted_at means exactly one thing: an admin removed the
  // slot. The collapsed group is labelled "Removed" to match.
  const removedDuties = useMemo(() => duties.filter((d) => d.deleted_at !== null), [duties]);

  // Cancelled duties are deliberately INCLUDED here. A swapped-away duty must
  // stay on the list: MTCA's own site still names us for that match, so hiding
  // it makes the app look stale rather than informed.
  const upcomingGroups = useMemo(
    () => groupByMatch(
      duties.filter((d) => d.deleted_at === null)
        .filter((d) => d.status === 'open' || d.status === 'claimed' || d.status === 'cancelled'),
    ).sort((a, b) =>
      a.match_date.localeCompare(b.match_date) || (a.match_time ?? '').localeCompare(b.match_time ?? ''),
    ),
    [duties],
  );

  const doneGroups = useMemo(
    () => groupByMatch(
      live.filter((d) => d.status === 'completed' || d.status === 'no_show'),
    ).sort((a, b) => b.match_date.localeCompare(a.match_date)),
    [live],
  );

  const openCount = useMemo(
    () => live.filter((d) => d.status === 'open').length,
    [live],
  );

  /**
   * The soonest match we are ACTUALLY attending.
   *
   * Excludes swapped-away matches: `upcomingGroups` deliberately keeps them so
   * they stay visible (MTCA still lists us), but we are not going, so they must
   * not drive the headline.
   *
   * The subtitle shows this date rather than a match count. "N matches coming
   * up" reads as "we have a game" on a cricket app — but these are other teams'
   * matches we merely officiate. The count also duplicated the workload already
   * stated on the line above, whereas the date is the one thing not visible
   * without scrolling.
   */
  const nextDuty = useMemo(
    () => upcomingGroups.find((g) => g.duties.some((d) => d.status !== 'cancelled')) ?? null,
    [upcomingGroups],
  );

  const stats = useMemo(() => computeDutyStats(duties, players, target), [duties, players, target]);

  /** Each player's soonest claimed duty, for the "Signed up" rows. */
  const nextDutyDate = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of live) {
      if (d.status !== 'claimed' || !d.assigned_player_id) continue;
      const cur = m.get(d.assigned_player_id);
      if (!cur || d.match_date < cur) m.set(d.assigned_player_id, d.match_date);
    }
    return m;
  }, [live]);

  const adminName = user?.email ?? 'admin';

  const adminMenu = (d: CricketUmpiringDuty): CardMenuItem[] => {
    const items: CardMenuItem[] = [];
    // Correcting who stood is the most common admin action, especially on
    // historical duties where the record was never captured — so it goes first.
    //
    // NOT offered on a handed-over duty. We are not attending that match, so
    // there is nobody to name; "Undo swap" below is the step that means "we ARE
    // going after all", and assignment follows from there. Offering it here was
    // a dead end — the write was rejected by chk_umpiring_cancelled_reason and
    // surfaced only as "Could not update the duty".
    if (d.status !== 'cancelled') {
      items.push({
        label: d.assigned_player_id ? 'Change umpire' : 'Set umpire',
        icon: <UserCog size={14} />,
        color: 'var(--cricket)',
        onClick: () => setAssignTarget(d),
      });
    }
    if (d.status === 'claimed') {
      // "Mark done" deliberately lives on the MATCH menu in the card header,
      // not here — if the match was played, everyone who stood is done, and
      // marking them one at a time invites marking one and forgetting the
      // other. What stays here is what is genuinely about ONE person.
      items.push({ label: 'Mark no-show', icon: <UserX size={14} />, color: 'var(--orange)', onClick: () => void markNoShow(d.id, adminName) });
      items.push({ label: 'Clear slot', icon: <UserMinus size={14} />, color: 'var(--muted)', onClick: () => void clearAssignment(d.id) });
    }
    if (d.status === 'completed' || d.status === 'no_show') {
      items.push({ label: 'Undo', icon: <RotateCcw size={14} />, color: 'var(--blue)', onClick: () => void reopenDuty(d.id) });
    }
    if (d.status !== 'cancelled') {
      items.push({
        label: 'Swap / hand over', icon: <Repeat2 size={14} />, color: 'var(--purple)',
        dividerBefore: true,
        onClick: () => setSwapTarget(d),
      });
    }
    if (d.status === 'cancelled') {
      items.push({
        label: 'Undo swap', icon: <RotateCcw size={14} />, color: 'var(--blue)',
        dividerBefore: true,
        onClick: () => void undoSwap(d.id),
      });
    }
    // Remove entirely — for a duty entered by mistake, not for a swap.
    // Distinct from 'Clear slot' above: that unassigns the person and leaves
    // the slot open, this removes the slot itself. Naming both "delete" is how
    // an admin removes a duty when they meant to free it up.
    items.push({
      label: 'Remove this slot', icon: <Trash2 size={14} />, color: 'var(--red)',
      dividerBefore: true,
      onClick: () => void deleteDuty(d.id, adminName),
    });
    return items;
  };

  /**
   * Actions that belong to the MATCH rather than to one umpire. Kept separate
   * from adminMenu so a whole-match edit is never reachable from a single
   * umpire's row — which is what made it natural to patch only that row.
   */
  /**
   * WhatsApp thank-you for a match that has been stood.
   *
   * Named after the fact rather than at claim time: thanking someone for a job
   * they have actually done is worth something, and thanking them in advance is
   * a reminder wearing a nicer hat.
   *
   * Only players who COMPLETED count — a no-show must never appear in a public
   * thank-you, which is exactly the mistake a `completed_at IS NOT NULL` filter
   * would make, since the schema stamps that column for both.
   */
  const thanksFor = (g: DutyGroup): string | null => {
    // The whole DAY, not just this match — see buildDayThanksText.
    const day = doneGroups.filter((x) => x.match_date === g.match_date);
    return buildDayThanksText(
      (day.length > 0 ? day : [g]).map((m) => ({
        names: m.duties
          .filter((d) => d.status === 'completed')
          .map((d) => d.assigned_player_name?.trim())
          .filter((n): n is string => Boolean(n))
          // Two slots can name the same person on a hand-added duty.
          .filter((n, i, all) => all.indexOf(n) === i)
          // "Hi Madhu", not "Hi Madhu Gundapaneni" — unless two players share it.
          .map((n) => addressName(n, rosterNames)),
        date: m.match_date,
        time: m.match_time,
        teamA: m.team_a,
        teamB: m.team_b,
        venue: m.venue,
      })),
      { teamName: getTeamName() },
    );
  };

  const matchMenu = (g: DutyGroup): CardMenuItem[] => {
    const items: CardMenuItem[] = [];

    // Neither thanking nor reminding is an admin privilege.
    const thanks = thanksFor(g);
    if (thanks) {
      items.push({
        label: 'Thank them on WhatsApp',
        icon: <FaWhatsapp size={14} />,
        color: '#25D366',
        onClick: () => { window.open(whatsappShareUrl(thanks), '_blank', 'noopener'); },
      });
      items.push({
        label: 'Copy thank-you',
        icon: <Copy size={14} />,
        color: 'var(--muted)',
        onClick: () => copy(thanks, 'Thank-you copied'),
      });
    }

    // Reminder for just THIS match's umpires — the same builder as the
    // weekend-wide button, handed a single match's duties.
    // Addressed to EVERY umpire on this match's DAY, not just this match: two
    // fixtures on one Sunday are one morning for the group, and one message
    // that lists both beats two near-identical posts.
    const dayDuties = upcomingGroups
      .filter((x) => x.match_date === g.match_date)
      .flatMap((x) => x.duties);
    const remind = buildAssignedReminderText(dayDuties, { today, teamName: getTeamName(), roster: rosterNames });
    if (remind) {
      // De-duplicate on the FULL name, then shorten — shortening first merged
      // two different Venkats into one "Remind Venkat".
      const who = dayDuties
        .filter((d) => d.status === 'claimed' && d.assigned_player_name)
        .map((d) => d.assigned_player_name!.trim())
        .filter((n, i, all) => all.indexOf(n) === i)
        .map((n) => addressName(n, rosterNames));
      items.push({
        label: who.length === 1 ? `Remind ${who[0]}`
          : who.length <= 3 ? `Remind ${who.slice(0, -1).join(', ')} & ${who[who.length - 1]}`
          : `Remind all ${who.length} umpires for ${formatShortDate(g.match_date)}`,
        icon: <FaWhatsapp size={14} />,
        color: '#25D366',
        onClick: () => { window.open(whatsappShareUrl(remind), '_blank', 'noopener'); },
        dividerBefore: items.length > 0,
      });
      // Same pairing as the thank-you: pasting keeps every line break, even
      // where a WhatsApp link drops them.
      items.push({
        label: 'Copy reminder',
        icon: <Copy size={14} />,
        color: 'var(--muted)',
        onClick: () => copy(remind, 'Reminder copied'),
      });
    }

    /**
     * Completion belongs to the MATCH, not to each umpire.
     *
     * If the match was played and our people stood, they all stood — marking
     * two umpires done one at a time is busywork that also invites marking one
     * and forgetting the other, which silently under-counts somebody's duty.
     *
     * The exceptions stay per-umpire on the row menu, because they are
     * genuinely individual: "Mark no-show" applies to one person who did not
     * turn up, and "Clear slot" to one assignment that was wrong.
     */
    const claimed = g.duties.filter((d) => d.status === 'claimed');
    if (isAdmin && claimed.length > 0) {
      items.push({
        label: claimed.length > 1 ? `Mark done (${claimed.length} umpires)` : 'Mark done',
        icon: <CircleCheckBig size={14} />,
        color: 'var(--green)',
        // One write for the whole match — the store handles its own toast and
        // reload, so looping would fire both once per umpire.
        onClick: () => void markMatchCompleted(claimed.map((d) => d.id), adminName),
      });
    }

    if (isAdmin) {
      items.push({
        label: 'Edit date, time, venue',
        icon: <Pencil size={14} />,
        color: 'var(--blue)',
        onClick: () => setEditTarget(g.duties[0]!),
        dividerBefore: items.length > 0,
      });
    }

    return items;
  };

  /** Reminder for everyone with an upcoming duty — one tap, whole weekend. */
  const reminderText = useMemo(
    () => buildAssignedReminderText(duties, { today, teamName: getTeamName(), roster: rosterNames }),
    [duties, today, rosterNames],
  );
  /** How everyone with an upcoming duty is addressed, for the button's label. */
  const assignedNames = useMemo(() => {
    const out: string[] = [];
    for (const d of duties) {
      if (d.deleted_at !== null || d.status !== 'claimed' || d.match_date < today) continue;
      const n = d.assigned_player_name ? addressName(d.assigned_player_name, rosterNames) : null;
      if (n && !out.includes(n)) out.push(n);
    }
    return out;
  }, [duties, today, rosterNames]);

  const shareText = useMemo(
    () => buildDutyShareText(duties, { teamName: getTeamName(), today }),
    [duties, today],
  );

  /**
   * The one share the weekend actually needs, with a label that says so.
   *
   * Open slots → the ask, which already lists who IS covered, so it reminds
   * them in the same breath. Everything covered → the reminder, because the
   * ask would just say "all duties covered" at people who already know.
   */
  const primaryShare = useMemo<{ text: string; label: string } | null>(() => {
    if (openCount > 0 && shareText) {
      return {
        text: shareText,
        label: openCount === 1
          ? 'Ask the group to cover 1 open spot'
          : `Ask the group to cover ${openCount} open spots`,
      };
    }
    if (reminderText && assignedNames.length > 0) {
      const who = assignedNames.length <= 3
        ? assignedNames.slice(0, -1).join(', ')
          + (assignedNames.length > 1 ? ' and ' : '')
          + assignedNames[assignedNames.length - 1]!
        : `${assignedNames.length} umpires`;
      return { text: reminderText, label: `Remind ${who}` };
    }
    return null;
  }, [openCount, shareText, reminderText, assignedNames]);

  const summaryText = useMemo(
    () => buildRosterSummaryText(
      stats.perPlayer.map((p) => ({ name: p.name, completed: p.completed, booked: p.booked })),
      { teamName: getTeamName(), target, openSlots: stats.openSlots },
    ),
    [stats, target],
  );

  const copy = (text: string, ok: string) => {
    navigator.clipboard?.writeText(text)
      .then(() => toast.success(ok))
      .catch(() => toast.error('Could not copy'));
  };

  if (loading && duties.length === 0) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full rounded-2xl" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-3xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SegmentedControl
        ariaLabel="Umpiring view"
        options={[
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'completed', label: 'Done' },
          { key: 'roster', label: 'Roster' },
        ]}
        active={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      {/* ── UPCOMING ── */}
      {tab === 'upcoming' && (
        upcomingGroups.length === 0 && removedDuties.length === 0 ? (
          <EmptyState
            icon={<UmpireIcon size={40} />}
            brand="cricket"
            title="No umpiring duties yet"
            description="Duties appear here once MTCA publishes the fixture list."
            action={isAdmin ? { label: 'Add duty', onClick: () => setShowForm(true) } : undefined}
          />
        ) : (
          <>
            {!myPlayer && (
              <Alert variant="info">
                Your account isn&apos;t linked to a player yet, so you can&apos;t sign up for
                duties. Ask an admin to add your email to the roster.
              </Alert>
            )}

            {/* Headline: the number that matters, and the one tap that fills
                it. Same card as the Roster tab's summary — a plain statement
                in large type, no tinted icon tile. */}
            <div
              className="rounded-2xl p-4"
              style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}
            >
              <Text as="p" size="2xl" weight="bold" tracking="tight" className="tabular-nums">
                {openCount > 0
                  ? `${openCount} ${openCount === 1 ? 'duty needs' : 'duties need'} an umpire`
                  : 'All duties covered'}
              </Text>
              <Text as="p" size="xs" color="muted" className="mt-0.5">
                {nextDuty
                  ? `Next: ${formatShortDate(nextDuty.match_date)}`
                    + (nextDuty.match_time ? ` · ${formatTime(nextDuty.match_time)}` : '')
                  : 'Nothing scheduled'}
              </Text>
              {/* ONE button, and the caption names exactly what it will post.
                  Two stacked share rows were near-identical green icons over
                  captions that described neither message.
                  Which message depends on what the weekend needs: with open
                  slots the ask is the useful post (and it already lists who is
                  covered, so it reminds them too); with everything covered the
                  ask would say "all duties covered" and the reminder is what
                  people actually want. */}
              {primaryShare && (
                <ShareFooter
                  text={primaryShare.text}
                  label={primaryShare.label}
                  caption={primaryShare.label}
                  onCopy={() => copy(primaryShare.text, 'Copied — paste in the group')}
                />
              )}
            </div>

            {groupByDay(upcomingGroups).map((day) => (
              <DayDutyCard
                key={day[0]!.match_date}
                groups={day}
                today={today}
                myPlayerId={myPlayer?.id ?? null}
                playersById={playersById}
                isAdmin={isAdmin}
                pendingId={pendingId}
                canClaim={!!myPlayer}
                onClaim={claimDuty}
                onRelease={releaseDuty}
                menuFor={adminMenu}
                matchMenu={matchMenu}
                onSelectPlayer={setSelectedPlayerId}
              />
            ))}

            {removedDuties.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowRemoved((v) => !v)}
                  className="flex min-h-[44px] items-center gap-1.5 text-[var(--muted)]"
                >
                  {showRemoved ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <Text size="sm" color="muted" weight="medium">
                    Removed ({removedDuties.length})
                  </Text>
                </button>
                {showRemoved && (
                  <div className="space-y-2 pt-1">
                    {removedDuties.map((d) => (
                      <div
                        key={d.id}
                        className="rounded-xl bg-[var(--surface)] p-3 opacity-60"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Text as="p" size="sm" weight="medium" truncate>
                              {shortTeam(d.team_a)} v {shortTeam(d.team_b)}
                            </Text>
                            <Text as="p" size="2xs" color="muted">
                              {formatShortDate(d.match_date)}
                              {d.match_time ? ` · ${formatTime(d.match_time)}` : ''}
                              {` · Umpire ${d.role_slot}`}
                            </Text>
                          </div>
                          {isAdmin && (
                            <Button
                              variant="secondary" size="sm" className="shrink-0"
                              onClick={() => void restoreDuty(d.id)}
                            >
                              <RotateCcw size={13} /> Restore
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )
      )}

      {/* ── DONE ── */}
      {tab === 'completed' && (
        doneGroups.length === 0 ? (
          <EmptyState
            icon={<UmpireIcon size={40} />}
            brand="cricket"
            title="Nothing finished yet"
            description="Duties show up here once an admin marks them done."
          />
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <Text size="xs" color="muted" weight="semibold" uppercase>
                {doneGroups.reduce((n, g) => n + g.duties.length, 0)} duties stood
              </Text>
              <Text size="xs" color="muted">
                {doneGroups.length} {doneGroups.length === 1 ? 'match' : 'matches'}
              </Text>
            </div>
            {groupByDay(doneGroups).map((day) => (
              <DayDutyCard
                key={day[0]!.match_date}
                groups={day}
                today={today}
                myPlayerId={myPlayer?.id ?? null}
                playersById={playersById}
                isAdmin={isAdmin}
                pendingId={pendingId}
                canClaim={false}
                onClaim={claimDuty}
                onRelease={releaseDuty}
                menuFor={adminMenu}
                matchMenu={matchMenu}
                onSelectPlayer={setSelectedPlayerId}
              />
            ))}
          </>
        )
      )}

      {/* ── ROSTER ──
          Answers two questions, in order: "have I done mine?" and "who still
          needs to?". A grouped list, not a face grid: full names, status by
          section instead of by a 9px badge, nothing to decode. */}
      {tab === 'roster' && (() => {
        const mine = myPlayer ? stats.perPlayer.find((r) => r.player_id === myPlayer.id) : undefined;
        const byName = (x: DutyPlayerStat, y: DutyPlayerStat) => x.name.localeCompare(y.name);
        // Signed up reads as a calendar: soonest duty first.
        const byDate = (x: DutyPlayerStat, y: DutyPlayerStat) =>
          (nextDutyDate.get(x.player_id) ?? '9999').localeCompare(nextDutyDate.get(y.player_id) ?? '9999') || byName(x, y);
        const groups: { key: string; title: string; dot: string; rows: DutyPlayerStat[]; note?: string }[] = [
          { key: 'open', title: 'Yet to umpire', dot: 'var(--dim)', rows: stats.perPlayer.filter((r) => r.state === 'open').sort(byName) },
          { key: 'booked', title: 'Signed up', dot: 'var(--blue)', rows: stats.perPlayer.filter((r) => r.state === 'booked').sort(byDate) },
          // Most-served first: the fairness view's whole point is spotting who has carried the load.
          { key: 'done', title: 'Stood', dot: 'var(--green)', rows: stats.perPlayer.filter((r) => r.state === 'done').sort((x, y) => y.completed - x.completed || byName(x, y)) },
          { key: 'guests', title: 'Guests', dot: 'var(--dim)', rows: [...stats.guests].sort(byName), note: 'Not counted toward the target' },
        ];
        return (
          <div className="space-y-5">
            <RosterSummary
              stats={stats}
              target={target}
              share={summaryText ? (
                <ShareFooter
                  text={summaryText}
                  label="Share summary on WhatsApp"
                  caption="Share this summary"
                  onCopy={() => copy(summaryText, 'Copied to clipboard')}
                />
              ) : null}
            />

            {mine && (
              <MyDutyRow
                stat={mine}
                player={myPlayer ?? undefined}
                nextDate={nextDutyDate.get(mine.player_id)}
                openSlots={openCount}
                onOpen={() => setSelectedPlayerId(mine.player_id)}
                onFindDuty={() => setTab('upcoming')}
              />
            )}

            {groups.filter((g) => g.rows.length > 0).map((g) => (
              <section key={g.key} aria-labelledby={`roster-${g.key}`}>
                <div className="mb-2 flex items-end justify-between gap-3 px-1">
                  <div className="min-w-0">
                    <h3 id={`roster-${g.key}`} className="flex items-center gap-2">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.dot }} />
                      <Text size="sm" weight="semibold">{g.title}</Text>
                      <Text size="sm" color="muted" className="tabular-nums">{g.rows.length}</Text>
                    </h3>
                    {g.note && <Text as="p" size="2xs" color="muted" className="mt-0.5 pl-4">{g.note}</Text>}
                  </div>
                  {g.key === 'open' && openCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setTab('upcoming')}
                      className="-my-2 flex min-h-11 shrink-0 items-center gap-0.5 rounded-lg px-1 text-[13px] font-semibold text-[var(--cricket)] cursor-pointer active:opacity-60 transition-opacity"
                    >
                      {openCount} open {openCount === 1 ? 'duty' : 'duties'}
                      <ChevronRight size={15} aria-hidden />
                    </button>
                  )}
                </div>
                <ul className="overflow-hidden rounded-2xl" style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}>
                  {g.rows.map((r, i) => (
                    <RosterRow
                      key={r.player_id}
                      stat={r}
                      player={playersById.get(r.player_id)}
                      isMe={r.player_id === myPlayer?.id}
                      first={i === 0}
                      detail={
                        r.state === 'booked'
                          ? (nextDutyDate.get(r.player_id) ? formatShortDate(nextDutyDate.get(r.player_id)!) : 'Signed up')
                          : r.completed > 1 ? `${r.completed}×`
                          : r.completed === 1 && g.key === 'guests' ? 'Stood'
                          : undefined
                      }
                      onSelect={setSelectedPlayerId}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        );
      })()}

      {isAdmin && selectedSeasonId && (
        <>
          <CricketFab onClick={() => setShowForm(true)} label="Add duty">
            <Plus size={24} />
          </CricketFab>
          <DutyForm open={showForm} onClose={() => setShowForm(false)} seasonId={selectedSeasonId} />
          <DutyForm
            open={editTarget !== null}
            onClose={() => setEditTarget(null)}
            seasonId={selectedSeasonId}
            editing={editTarget}
          />
        </>
      )}

      {isAdmin && (
        <DutySwapSheet
          duty={swapTarget}
          candidates={duties.filter(
            (d) => d.deleted_at === null && (d.status === 'open' || d.status === 'claimed'),
          )}
          adminName={adminName}
          onClose={() => setSwapTarget(null)}
        />
      )}

      {isAdmin && (
        <DutyAssignSheet
          duty={assignTarget}
          players={players}
          adminName={adminName}
          onClose={() => setAssignTarget(null)}
        />
      )}

      {/* Not admin-gated. The grid label is one short word, so "who is this?"
          is a question any signed-in member can have — and the duty history
          behind it is the same information the roster tiles already summarise. */}
      <DutyPlayerSheet
        player={selectedPlayerId ? playersById.get(selectedPlayerId) ?? null : null}
        duties={duties}
        target={target}
        openSlots={openCount}
        today={today}
        seasonName={seasons.find((s) => s.id === selectedSeasonId)?.name}
        isAdmin={isAdmin}
        onClose={() => setSelectedPlayerId(null)}
        onGoToUpcoming={() => setTab('upcoming')}
      />
    </div>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────── */

/** WhatsApp brand green — the whole point of going icon-only is instant
 *  recognition, which depends on the colour as much as the glyph. */
const WHATSAPP_GREEN = '#25D366';

/**
 * Icon-only WhatsApp share with a copy fallback, as a CARD FOOTER.
 *
 * Lives inside the hero card, under a divider, with a caption. As a bare row on
 * the page background the two icons read as orphaned leftovers — no container,
 * no subject, and nothing saying what they would send. The divider ties them to
 * the card whose contents they share, and the caption supplies the subject
 * without putting words back on the buttons.
 *
 * ICON, NOT TEXT: "Share summary on WhatsApp" ate a full-width button to say
 * what the logo says by itself. WhatsApp's mark in its own green is about as
 * universally recognised as an icon gets, so the words were costing space
 * without adding meaning. Each tab has exactly one share action, so there is
 * nothing to disambiguate either.
 *
 * The label survives as `aria-label` + `title`, so screen readers and hover
 * tooltips still get the full description.
 *
 * The share control is a real <a target="_blank">, NOT an onClick calling
 * window.open — iOS Safari blocks programmatic window.open outside a direct
 * user gesture, and a React handler often falls outside that.
 *
 * Hand-written classes rather than `buttonVariants()`: the brand green has to
 * beat the variant's gradient, and fighting `bg-gradient-to-r` with an inline
 * style is more fragile than not opting into it. It also keeps this page clear
 * of Radix Slot, which crashed the whole page once already.
 *
 * Copy stays as a fallback: WhatsApp may not be installed, and the text is
 * sometimes wanted elsewhere (email, SMS, a different group).
 */
function ShareFooter({ text, label, caption, onCopy }: {
  text: string;
  label: string;
  /** Says what the icons will send. Icon-only buttons floating on the page
   *  background read as orphaned controls; a caption gives them a subject. */
  caption: string;
  onCopy: () => void;
}) {
  // h-11/w-11 = 44px, the minimum touch target per the project's mobile rules.
  // The obvious `size="icon"` variant is 40px, so this is sized by hand.
  const iconButton =
    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ' +
    'transition-all duration-150 ease-out active:scale-[0.96] cursor-pointer ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

  return (
    <div
      className="mt-3 flex items-center justify-between gap-3 border-t pt-3"
      style={{ borderColor: 'color-mix(in srgb, var(--border) 65%, transparent)' }}
    >
      {/* This IS the button's label, not a footnote — the icons beside it are
          unlabelled, so if this whispers the control has no name. */}
      <Text as="p" size="xs" weight="semibold" className="min-w-0 flex-1">{caption}</Text>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href={whatsappShareUrl(text)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className={cn(iconButton, 'text-white shadow-md hover:brightness-105')}
          style={{ background: WHATSAPP_GREEN }}
        >
          <FaWhatsapp size={22} />
        </a>
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy to clipboard"
          title="Copy to clipboard"
          className={cn(
            iconButton,
            'bg-[var(--surface)] text-[var(--muted)]',
            'hover:bg-[var(--hover-bg)] hover:text-[var(--text)] active:bg-[var(--hover-bg)]',
          )}
        >
          <Copy size={17} />
        </button>
      </div>
    </div>
  );
}

function DutyMenu({ items }: { items: CardMenuItem[] }) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label="Duty options"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 -my-1.5 -mr-1 shrink-0 items-center justify-center rounded-full text-[var(--muted)] active:scale-95 active:bg-[var(--hover-bg)]"
      >
        <EllipsisVertical size={15} />
      </button>
      {open && (
        <CardMenu
          anchorRef={anchorRef}
          items={items.map((i) => ({ ...i, onClick: () => { setOpen(false); i.onClick(); } }))}
          onClose={() => setOpen(false)}
          width={250}
        />
      )}
    </>
  );
}

/**
 * Season progress, Apple-Activity style: one statement, one bar.
 * Green = stood, blue = signed up, the empty track = still to go. No third
 * colour — "yet to umpire" is the absence of progress, so it is the track.
 */
function RosterSummary({ stats, target, share }: {
  stats: ReturnType<typeof computeDutyStats>;
  target: number;
  share?: React.ReactNode;
}) {
  const pct = (n: number) => (stats.eligible ? (n / stats.eligible) * 100 : 0);
  const headline = stats.eligible === 0
    ? 'No players this season'
    : stats.open === 0 && stats.booked === 0
      ? 'Everyone has stood'
      : stats.open === 0
        ? 'Everyone is signed up'
        : `${stats.open} still to umpire`;

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}>
      <Text as="p" size="2xl" weight="bold" tracking="tight" className="tabular-nums">{headline}</Text>
      <Text as="p" size="xs" color="muted" className="mt-0.5">
        {target} {target === 1 ? 'duty' : 'duties'} each this season · {stats.eligible} players
      </Text>

      <div
        role="img"
        aria-label={`${stats.done} stood, ${stats.booked} signed up, ${stats.open} yet to umpire`}
        className="mt-4 flex h-2 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--fill)' }}
      >
        <span className="h-full" style={{ width: `${pct(stats.done)}%`, background: 'var(--green)', transition: 'width var(--duration-slower) var(--ease-out)' }} />
        <span className="h-full" style={{ width: `${pct(stats.booked)}%`, background: 'var(--blue)', transition: 'width var(--duration-slower) var(--ease-out)' }} />
      </div>

      <div aria-hidden className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        <LegendItem color="var(--green)" label="Stood" n={stats.done} />
        <LegendItem color="var(--blue)" label="Signed up" n={stats.booked} />
        <LegendItem color="transparent" label="Yet to umpire" n={stats.open} />
      </div>

      {share}
    </div>
  );
}

function LegendItem({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {/* "Yet to umpire" is the empty track, so its key is an outline. */}
      <span className="h-2 w-2 rounded-full" style={color === 'transparent' ? { boxShadow: 'inset 0 0 0 1.5px var(--dim)' } : { background: color }} />
      <Text size="xs" color="muted">{label}</Text>
      <Text size="xs" weight="semibold" className="tabular-nums">{n}</Text>
    </span>
  );
}

/** "Have I done mine?" — answered before anyone has to find themselves. */
function MyDutyRow({ stat, player, nextDate, openSlots, onOpen, onFindDuty }: {
  stat: DutyPlayerStat;
  player: CricketPlayer | undefined;
  nextDate: string | undefined;
  openSlots: number;
  onOpen: () => void;
  onFindDuty: () => void;
}) {
  const line = stat.state === 'done'
    ? (stat.completed > 1 ? `You've stood ${stat.completed} times this season` : "You've stood this season")
    : stat.state === 'booked'
      ? (nextDate ? `You're umpiring ${formatShortDate(nextDate)}` : "You're signed up")
      : "You haven't signed up yet";
  return (
    <div className="flex items-center gap-3 rounded-2xl p-3" style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer" aria-label="Your umpiring detail">
        <PlayerAvatar player={player} name={stat.name} size={40} />
        <span className="min-w-0">
          <Text as="span" size="2xs" color="muted" className="block">You</Text>
          <Text as="span" size="sm" weight="semibold" className="block">{line}</Text>
        </span>
      </button>
      {stat.state === 'open' && openSlots > 0 && (
        <Button variant="primary" brand="cricket" size="md" className="h-11 shrink-0" onClick={onFindDuty}>
          Find a duty
        </Button>
      )}
    </div>
  );
}

/** One tappable list row — opens the per-player sheet. */
function RosterRow({ stat, player, isMe, first, detail, onSelect }: {
  stat: DutyPlayerStat;
  player: CricketPlayer | undefined;
  isMe: boolean;
  first: boolean;
  detail?: string;
  onSelect: (playerId: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(stat.player_id)}
        className="flex w-full items-center gap-3 pl-3 text-left cursor-pointer transition-colors active:bg-[var(--hover-bg)]"
      >
        <PlayerAvatar player={player} name={stat.name} size={36} />
        {/* Inset hairline, iOS-style: it starts at the text, not the edge. */}
        <span
          className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2 pr-3"
          style={first ? undefined : { borderTop: '1px solid var(--border)' }}
        >
          <Text size="md" weight={isMe ? 'semibold' : 'medium'} className="min-w-0 flex-1 break-words py-2">
            {stat.name}{isMe && <Text as="span" size="xs" color="muted" weight="normal"> · you</Text>}
          </Text>
          {detail && <Text size="sm" color="muted" className="shrink-0 tabular-nums">{detail}</Text>}
          <ChevronRight size={16} aria-hidden className="shrink-0 text-[var(--dim)]" />
        </span>
      </button>
    </li>
  );
}

/**
 * One card per DAY. The date rail appears once; each match that day stacks
 * inside, under a hairline, with its own header, slots and ⋮ menu. Two
 * fixtures on the same Sunday are one morning for the people umpiring them,
 * and two separate cards both reading "SUN 4 OCT" made it look like two days.
 */
function DayDutyCard({
  groups, today, myPlayerId, playersById, isAdmin, pendingId, canClaim,
  onClaim, onRelease, menuFor, matchMenu, onSelectPlayer,
}: {
  groups: DutyGroup[];
  today: string;
  myPlayerId: string | null;
  playersById: Map<string, CricketPlayer>;
  isAdmin: boolean;
  pendingId: string | null;
  canClaim: boolean;
  onClaim: (id: string) => void;
  onRelease: (id: string) => void;
  menuFor: (d: CricketUmpiringDuty) => CardMenuItem[];
  /** Whole-match actions, shown in each match's header rather than on a slot. */
  matchMenu?: (g: DutyGroup) => CardMenuItem[];
  /** Opens the per-player sheet from a named umpire on a slot. */
  onSelectPlayer: (playerId: string) => void;
}) {
  const first = groups[0]!;
  const { dayName, dayNum, month } = dateParts(first.match_date);
  const isToday = first.match_date === today;

  return (
    <div
      className="overflow-hidden rounded-2xl bg-[var(--card)]"
      style={{ boxShadow: 'var(--card-shadow)' }}
    >
      <div className="flex gap-3 p-3">
        {/* Date rail — once per day */}
        <div className="flex w-[46px] shrink-0 flex-col items-center pt-0.5">
          <Text size="2xs" weight="semibold" uppercase tracking="wider" color="muted">
            {dayName}
          </Text>
          <span className="mt-0.5 text-[22px] font-bold leading-none tabular-nums text-[var(--text)]">
            {dayNum}
          </span>
          <Text size="2xs" weight="semibold" uppercase tracking="wide" color="muted" className="mt-0.5">
            {month}
          </Text>
          {isToday && <Badge variant="muted" size="sm" className="mt-1.5">Today</Badge>}
        </div>

        <div className="min-w-0 flex-1">
          {groups.map((group, i) => {
            const time = formatTime(group.match_time);
            const typeLabel = group.match_type ? MATCH_TYPE_LABEL[group.match_type] : null;
            const menu = matchMenu?.(group);
            return (
              <div
                key={group.key}
                className={i > 0 ? 'mt-3 pt-3' : undefined}
                style={i > 0 ? { borderTop: '1px solid var(--border)' } : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Text as="p" size="sm" weight="bold" className="leading-snug">
                      {shortTeam(group.team_a)}
                      <span className="text-[var(--muted)]"> v </span>
                      {shortTeam(group.team_b)}
                    </Text>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {time && (
                        <span className="flex items-center gap-1 text-[12px] text-[var(--muted)]">
                          <Clock size={12} aria-hidden /> {time}
                        </span>
                      )}
                      {group.venue && (
                        <span className="flex items-center gap-1 text-[12px] text-[var(--muted)]">
                          <MapPin size={12} aria-hidden /> {group.venue}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {typeLabel && <Badge variant="muted" size="sm">{typeLabel}</Badge>}
                    {menu && menu.length > 0 && <DutyMenu items={menu} />}
                  </div>
                </div>

                {/* Umpire slots — the reason a match is grouped at all. */}
                <div className="mt-2.5 space-y-1.5">
                  {group.duties.map((d) => (
                    <DutySlotRow
                      key={d.id}
                      duty={d}
                      isMine={myPlayerId !== null && d.assigned_player_id === myPlayerId}
                      player={d.assigned_player_id ? playersById.get(d.assigned_player_id) : undefined}
                      slotCount={group.duties.length}
                      isAdmin={isAdmin}
                      pending={pendingId === d.id}
                      canClaim={canClaim}
                      onClaim={onClaim}
                      onRelease={onRelease}
                      menu={isAdmin ? menuFor(d) : undefined}
                      onSelectPlayer={onSelectPlayer}
                    />
                  ))}
                </div>

                {group.duties.some((d) => d.notes) && (
                  <Text as="p" size="2xs" color="muted" className="mt-2 italic">
                    {group.duties.find((d) => d.notes)?.notes}
                  </Text>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DutySlotRow({
  duty, isMine, player, slotCount, isAdmin, pending, canClaim, onClaim, onRelease, menu,
  onSelectPlayer,
}: {
  duty: CricketUmpiringDuty;
  isMine: boolean;
  player?: CricketPlayer;
  slotCount: number;
  isAdmin: boolean;
  pending: boolean;
  canClaim: boolean;
  onClaim: (id: string) => void;
  onRelease: (id: string) => void;
  menu?: CardMenuItem[];
  onSelectPlayer: (playerId: string) => void;
}) {
  const name = duty.assigned_player_name;

  const isSwappedAway = duty.status === 'cancelled';

  /**
   * Tappable exactly when a real person's NAME is on screen — which is the same
   * condition that renders their avatar below. An open slot ("Needs an umpire")
   * and a swapped-away one ("Handed to X") show no name, so there is nobody to
   * open; a hard-deleted player leaves only the name snapshot with no id.
   *
   * The row itself stays a <div>: it already contains "I'll do it" / "Give up"
   * and the admin menu, and a button cannot contain buttons.
   */
  const identity = !isSwappedAway && duty.status !== 'open' && player ? player : null;

  const avatarAndName = (
    <>
      {isSwappedAway ? (
        <div
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
          style={{
            border: '2px solid color-mix(in srgb, var(--muted) 40%, transparent)',
            color: 'var(--muted)',
          }}
        >
          <Repeat2 size={15} />
        </div>
      ) : duty.status === 'open' ? (
        <div
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
          style={{
            border: '1.5px dashed var(--dim)',
            color: 'var(--muted)',
          }}
        >
          <UserPlus size={15} />
        </div>
      ) : (
        <PlayerAvatar player={player} name={name ?? '?'} />
      )}

      <div className="min-w-0 flex-1">
        {/* A swapped-away slot said the same thing three times — "Handed to
            another team", "we are not going", and a "Swapped" badge — and the
            badge stole the width that then truncated the text to
            "Handed to ano...". One statement, no badge, nothing clipped. */}
        <Text as="p" size="sm" weight={isMine ? 'bold' : 'medium'} className="break-words">
          {isSwappedAway
            ? (duty.swap_team ? `Handed to ${shortTeam(duty.swap_team)}` : 'Handed over')
            : duty.status === 'open' ? 'Needs an umpire'
              : isMine ? 'You' : (name ?? 'Unassigned')}
        </Text>
        <Text as="p" size="2xs" color="muted">
          {isSwappedAway
            ? 'Not going'
            : (
              <>
                {/* Only worth labelling the position when there are two. */}
                {slotCount > 1 ? `Umpire ${duty.role_slot}` : 'Umpire'}
                {duty.mtca_removed_at && ' · MTCA removed this'}
              </>
            )}
        </Text>
      </div>
    </>
  );

  return (
    // Only an OPEN slot earns a surface (dashed, semantic — it's the screen's
    // call to action). Filled rows sit directly on the card: avatar +
    // typography carry them without another box.
    <div
      className="flex items-center gap-2.5 rounded-xl px-2 py-1.5"
      style={{
        background: duty.status === 'open' ? 'var(--surface)' : 'transparent',
        border: duty.status === 'open'
          ? '1px dashed color-mix(in srgb, var(--dim) 70%, transparent)'
          : '1px solid transparent',
        opacity: isSwappedAway ? 0.55 : 1,
      }}
    >
      {identity ? (
        <button
          type="button"
          onClick={() => onSelectPlayer(identity.id)}
          aria-label={`${identity.name} — umpiring detail`}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left transition-transform active:scale-[0.99]"
        >
          {avatarAndName}
        </button>
      ) : (
        avatarAndName
      )}

      {/* Status as quiet text + small semantic mark, not a filled pill */}
      {duty.status === 'completed' && (
        <span className="flex shrink-0 items-center gap-1" style={{ color: 'var(--green)' }}>
          <CircleCheck size={13} />
          <Text size="2xs" weight="semibold" style={{ color: 'var(--credit-text)' }}>Stood</Text>
        </span>
      )}
      {duty.status === 'no_show' && isAdmin && (
        <span className="flex shrink-0 items-center gap-1" style={{ color: 'var(--danger-text)' }}>
          <UserX size={13} />
          <Text size="2xs" weight="semibold" style={{ color: 'var(--danger-text)' }}>No-show</Text>
        </span>
      )}

      {duty.status === 'open' && canClaim && !isSwappedAway && (
        <Button
          variant="primary" brand="cricket" size="md" className="h-11 shrink-0"
          loading={pending}
          /* Volunteering for a Saturday morning is a real commitment, and
             `loading` already blocks the double-tap while the RPC runs. */
          haptic="light"
          onClick={() => onClaim(duty.id)}
        >
          I&apos;ll do it
        </Button>
      )}
      {isMine && duty.status === 'claimed' && (
        <Button variant="secondary" size="md" className="h-11 shrink-0" loading={pending}
          /* Handing a duty back leaves the slot open for someone else —
             'medium', the weight this system gives a consequence. */
          haptic="medium"
          onClick={() => onRelease(duty.id)}>
          Give up
        </Button>
      )}

      {menu && <DutyMenu items={menu} />}
    </div>
  );
}
