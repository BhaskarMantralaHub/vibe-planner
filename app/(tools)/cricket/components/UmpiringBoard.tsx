'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Text, Button, Badge, Alert, SegmentedControl, EmptyState, Skeleton, CardMenu,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import type { CardMenuItem } from '@/components/ui';
import {
  MapPin, Clock, ChevronDown, ChevronRight, Plus, Copy, UserPlus,
  EllipsisVertical, CircleCheckBig, UserX, RotateCcw, UserMinus, Trash2, CircleCheck, UserCog, Repeat2,
} from 'lucide-react';
import UmpireIcon from '@/components/icons/UmpireIcon';
import { FaWhatsapp } from 'react-icons/fa';
import { buildDutyShareText, buildRosterSummaryText, whatsappShareUrl } from '@/lib/duty-share';
import { nameToGradient } from '@/lib/avatar';
import { getTeamName } from '../lib/constants';
import DutyAssignSheet from './DutyAssignSheet';
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

type Tab = 'upcoming' | 'completed' | 'roster';

const TABS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Done' },
  { key: 'roster', label: 'Roster' },
];

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

/* ── Board ────────────────────────────────────────────────────────────── */

export default function UmpiringBoard() {
  const { user, userAccess } = useAuthStore();
  const { players, selectedSeasonId, adminUserIds } = useCricketStore();
  const {
    duties, settings, loading, pendingId,
    loadDuties, claimDuty, releaseDuty,
    markCompleted, markNoShow, reopenDuty, clearAssignment, deleteDuty, restoreDuty, undoSwap,
  } = useUmpiringStore();

  const isAdmin = userAccess.includes('admin') || (user ? adminUserIds.includes(user.id) : false);

  const [tab, setTab] = useState<Tab>('upcoming');
  const [showForm, setShowForm] = useState(false);
  const [showHandedOver, setShowHandedOver] = useState(false);
  const [assignTarget, setAssignTarget] = useState<CricketUmpiringDuty | null>(null);
  const [swapTarget, setSwapTarget] = useState<CricketUmpiringDuty | null>(null);
  const [rosterFilter, setRosterFilter] = useState<'all' | 'open' | 'booked' | 'done'>('all');

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

  const target = settings?.duty_target ?? DEFAULT_DUTY_TARGET;
  const today = todayPT();

  const live = useMemo(() => duties.filter(isLiveDuty), [duties]);
  const handedOver = useMemo(() => duties.filter((d) => d.deleted_at !== null), [duties]);

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

  const adminName = user?.email ?? 'admin';

  const adminMenu = (d: CricketUmpiringDuty): CardMenuItem[] => {
    const items: CardMenuItem[] = [];
    // Always first: correcting who stood is the most common admin action,
    // especially on historical duties where the record was never captured.
    items.push({
      label: d.assigned_player_id ? 'Change umpire' : 'Set umpire',
      icon: <UserCog size={14} />,
      color: 'var(--cricket)',
      onClick: () => setAssignTarget(d),
    });
    if (d.status === 'claimed') {
      items.push({ label: 'Mark as done', icon: <CircleCheckBig size={14} />, color: 'var(--green)', onClick: () => void markCompleted(d.id, adminName) });
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
    items.push({
      label: 'Delete', icon: <Trash2 size={14} />, color: 'var(--red)',
      dividerBefore: true,
      onClick: () => void deleteDuty(d.id, adminName),
    });
    return items;
  };

  const shareText = useMemo(
    () => buildDutyShareText(duties, { teamName: getTeamName(), today }),
    [duties, today],
  );

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
        options={TABS}
        active={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      {/* ── UPCOMING ── */}
      {tab === 'upcoming' && (
        upcomingGroups.length === 0 && handedOver.length === 0 ? (
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

            {/* Headline: the number that matters, and the one tap that fills it. */}
            <div
              className="rounded-3xl p-4"
              style={{
                background: openCount > 0
                  ? 'linear-gradient(135deg, color-mix(in srgb, var(--cricket) 14%, transparent), color-mix(in srgb, var(--cricket-accent) 8%, transparent))'
                  : 'color-mix(in srgb, var(--green) 12%, transparent)',
                border: `1px solid color-mix(in srgb, ${openCount > 0 ? 'var(--cricket)' : 'var(--green)'} 28%, transparent)`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                  style={{ background: openCount > 0 ? 'var(--cricket)' : 'var(--green)' }}
                >
                  {openCount > 0
                    ? <UmpireIcon size={22} color="#ffffff" />
                    : <CircleCheck size={22} color="#ffffff" />}
                </div>
                <div className="min-w-0 flex-1">
                  <Text size="md" weight="bold">
                    {openCount > 0
                      ? `${openCount} ${openCount === 1 ? 'duty needs' : 'duties need'} an umpire`
                      : 'All duties covered'}
                  </Text>
                  <Text as="p" size="2xs" color="muted">
                    {nextDuty
                      ? `Next: ${formatShortDate(nextDuty.match_date)}`
                        + (nextDuty.match_time ? ` · ${formatTime(nextDuty.match_time)}` : '')
                      : 'Nothing scheduled'}
                  </Text>
                </div>
              </div>
              {shareText && (
                <ShareFooter
                  text={shareText}
                  label="Share duties on WhatsApp"
                  caption="Send to the group"
                  onCopy={() => copy(shareText, 'Copied to clipboard')}
                />
              )}
            </div>

            {upcomingGroups.map((g) => (
              <MatchDutyCard
                key={g.key}
                group={g}
                today={today}
                myPlayerId={myPlayer?.id ?? null}
                playersById={playersById}
                isAdmin={isAdmin}
                pendingId={pendingId}
                canClaim={!!myPlayer}
                onClaim={claimDuty}
                onRelease={releaseDuty}
                menuFor={adminMenu}
              />
            ))}

            {handedOver.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowHandedOver((v) => !v)}
                  className="flex min-h-[44px] items-center gap-1.5 text-[var(--muted)]"
                >
                  {showHandedOver ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <Text size="sm" color="muted" weight="medium">
                    Handed to another team ({handedOver.length})
                  </Text>
                </button>
                {showHandedOver && (
                  <div className="space-y-2 pt-1">
                    {handedOver.map((d) => (
                      <div
                        key={d.id}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 opacity-60"
                      >
                        <Text size="sm" weight="medium" className="line-through">
                          {shortTeam(d.team_a)} v {shortTeam(d.team_b)}
                        </Text>
                        <Text as="p" size="2xs" color="dim">
                          {d.match_date}{d.swap_team ? ` · handed to ${d.swap_team}` : ''}
                        </Text>
                        {isAdmin && (
                          <Button variant="link" size="sm" onClick={() => void restoreDuty(d.id)}>
                            Restore
                          </Button>
                        )}
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
            {doneGroups.map((g) => (
              <MatchDutyCard
                key={g.key}
                group={g}
                today={today}
                myPlayerId={myPlayer?.id ?? null}
                playersById={playersById}
                isAdmin={isAdmin}
                pendingId={pendingId}
                canClaim={false}
                onClaim={claimDuty}
                onRelease={releaseDuty}
                menuFor={adminMenu}
              />
            ))}
          </>
        )
      )}

      {/* ── ROSTER ── */}
      {tab === 'roster' && (
        <div className="space-y-3">
          {/* Share lives INSIDE the hero, so the icons belong to the summary
              they send rather than floating between cards. Not admin-gated:
              this is a progress update, not an admin tool. */}
          <RosterHero
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

          {/* Filter instead of three stacked boxes: one grid, one mental model,
              and the counts double as the control. */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            {([
              { key: 'all', label: 'Everyone', n: stats.perPlayer.length, color: 'var(--cricket)' },
              { key: 'open', label: 'Yet to umpire', n: stats.open, color: 'var(--orange)' },
              { key: 'booked', label: 'Signed up', n: stats.booked, color: 'var(--blue)' },
              { key: 'done', label: 'Done', n: stats.done, color: 'var(--green)' },
            ] as const).map((f) => {
              const active = rosterFilter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setRosterFilter(f.key)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 transition-all active:scale-95"
                  style={{
                    background: active ? `color-mix(in srgb, ${f.color} 16%, transparent)` : 'var(--surface)',
                    border: `1.5px solid ${active ? `color-mix(in srgb, ${f.color} 50%, transparent)` : 'var(--border)'}`,
                  }}
                >
                  <span
                    className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-extrabold text-white tabular-nums"
                    style={{ background: f.color }}
                  >
                    {f.n}
                  </span>
                  <Text size="xs" weight={active ? 'bold' : 'medium'}>{f.label}</Text>
                </button>
              );
            })}
          </div>

          {rosterFilter === 'open' && openCount > 0 && (
            <Button variant="primary" brand="cricket" size="md" fullWidth onClick={() => setTab('upcoming')}>
              {openCount} {openCount === 1 ? 'duty' : 'duties'} still need an umpire
            </Button>
          )}

          <PlayerGrid
            rows={
              rosterFilter === 'all'
                ? stats.perPlayer
                : stats.perPlayer.filter((s) => s.state === rosterFilter)
            }
            playersById={playersById}
          />


          {stats.guests.length > 0 && (
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-3">
              <Text size="sm" weight="bold">Guests</Text>
              <Text as="p" size="2xs" color="dim" className="mb-2">
                Not counted toward the target
              </Text>
              <PlayerGrid rows={stats.guests} playersById={playersById} />
            </div>
          )}
        </div>
      )}

      {isAdmin && selectedSeasonId && (
        <>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            aria-label="Add duty"
            className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg active:scale-95"
            style={{
              // Clears the bottom nav pill, which is ~60px tall including its
              // own safe-area padding. Same offset MatchSchedule's FAB uses.
              bottom: 'calc(60px + env(safe-area-inset-bottom) + 16px)',
              background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))',
            }}
          >
            <Plus size={24} />
          </button>
          <DutyForm open={showForm} onClose={() => setShowForm(false)} seasonId={selectedSeasonId} />
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
      <Text size="2xs" color="muted">{caption}</Text>
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
            'border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]',
            'hover:bg-[var(--hover-bg)] hover:text-[var(--text)]',
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
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--muted)] active:scale-95"
      >
        <EllipsisVertical size={15} />
      </button>
      {open && (
        <CardMenu
          anchorRef={anchorRef}
          items={items.map((i) => ({ ...i, onClick: () => { setOpen(false); i.onClick(); } }))}
          onClose={() => setOpen(false)}
          width={180}
        />
      )}
    </>
  );
}

/**
 * Player avatar: their photo when we have one, otherwise initials on the
 * deterministic per-name gradient the rest of the app already uses, so the
 * same person is the same colour everywhere. `ringColor` carries duty status.
 */
function Avatar({ player, name, ringColor, size = 34 }: {
  player?: CricketPlayer;
  name: string;
  ringColor: string;
  size?: number;
}) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const [from, to] = nameToGradient(name);
  return (
    <div
      className="relative shrink-0 rounded-full"
      style={{ height: size, width: size, boxShadow: `0 0 0 2px color-mix(in srgb, ${ringColor} 55%, transparent)` }}
    >
      {player?.photo_url ? (
        <img
          src={player.photo_url}
          alt={name}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-extrabold text-white"
          style={{ fontSize: size * 0.34, background: `linear-gradient(135deg, ${from}, ${to})` }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}

/** Donut progress — reads at a glance in a way a thin bar never does. */
function RosterHero({ stats, target, share }: {
  stats: ReturnType<typeof computeDutyStats>;
  target: number;
  share?: React.ReactNode;
}) {
  const size = 96;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const donePct = stats.eligible ? stats.done / stats.eligible : 0;
  const bookedPct = stats.eligible ? stats.booked / stats.eligible : 0;

  return (
    <div
      className="rounded-3xl p-4"
      style={{
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--cricket) 12%, transparent), color-mix(in srgb, var(--cricket-accent) 6%, transparent))',
        border: '1px solid color-mix(in srgb, var(--cricket) 24%, transparent)',
      }}
    >
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ height: size, width: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke="color-mix(in srgb, var(--muted) 18%, transparent)" strokeWidth={stroke}
            />
            {/* Booked sits behind Done, offset so the two arcs stack. */}
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke="var(--blue)" strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${(donePct + bookedPct) * circumference} ${circumference}`}
              opacity={0.55}
            />
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke="var(--green)" strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${donePct * circumference} ${circumference}`}
              style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.16,1,0.3,1)' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[26px] font-black leading-none tabular-nums text-[var(--text)]">
              {stats.done}
            </span>
            <Text size="2xs" color="muted" weight="semibold">of {stats.eligible}</Text>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <Text size="md" weight="bold" className="leading-snug">
            Everyone stands at least once
          </Text>
          <Text as="p" size="2xs" color="muted" className="mt-0.5">
            {target} {target === 1 ? 'duty' : 'duties'} each this season
          </Text>
          <div className="mt-2 space-y-1">
            <LegendRow color="var(--green)" label="Stood" n={stats.done} icon={<CircleCheck size={10} />} />
            <LegendRow color="var(--blue)" label="Signed up" n={stats.booked} icon={<Clock size={10} />} />
            <LegendRow color="var(--orange)" label="Yet to umpire" n={stats.open} />
          </div>
        </div>
      </div>

      {/* Card footer — the share icons belong to this summary. */}
      {share}
    </div>
  );
}

/** Doubles as the key for the per-player tally symbols in the grid below. */
function LegendRow({ color, label, n, icon }: {
  color: string; label: string; n: number; icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-3 w-3 shrink-0 items-center justify-center" style={{ color }}>
        {icon ?? <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      </span>
      <Text size="2xs" color="muted" className="flex-1">{label}</Text>
      <Text size="2xs" weight="bold" className="tabular-nums">{n}</Text>
    </div>
  );
}

const STATE_STYLE: Record<string, { color: string; icon: React.ReactNode }> = {
  done: { color: 'var(--green)', icon: <CircleCheck size={9} color="#fff" /> },
  booked: { color: 'var(--blue)', icon: <Clock size={9} color="#fff" /> },
  open: { color: 'var(--orange)', icon: <UmpireIcon size={9} color="#fff" /> },
};

/**
 * Shortest label that stays UNAMBIGUOUS within this list.
 *
 * First name alone is ideal, but the roster has two Venkats — showing both
 * tiles as "Venkat" on a fairness board is worse than a longer label, since
 * you cannot tell whose duties are whose. Falls back to "First L." only for
 * the names that actually collide.
 */
function shortLabels(rows: DutyPlayerStat[]): Map<string, string> {
  const firstCounts = new Map<string, number>();
  for (const r of rows) {
    const first = r.name.split(' ')[0] ?? r.name;
    firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1);
  }
  const out = new Map<string, string>();
  for (const r of rows) {
    const parts = r.name.split(' ').filter(Boolean);
    const first = parts[0] ?? r.name;
    if ((firstCounts.get(first) ?? 0) > 1 && parts.length > 1) {
      out.set(r.player_id, `${first} ${parts[1]![0]!.toUpperCase()}`);
    } else {
      out.set(r.player_id, first);
    }
  }
  return out;
}

/** Avatar tiles rather than a list of name pills — faces scan far faster. */
function PlayerGrid({ rows, playersById }: {
  rows: DutyPlayerStat[];
  playersById: Map<string, CricketPlayer>;
}) {
  const labels = useMemo(() => shortLabels(rows), [rows]);

  if (rows.length === 0) {
    return (
      <Text as="p" size="sm" color="muted" align="center" className="py-8">
        Nobody in this group.
      </Text>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-6">
      {rows.map((r) => {
        const st = STATE_STYLE[r.state]!;
        return (
          <div key={r.player_id} className="flex flex-col items-center gap-1">
            <div className="relative">
              <Avatar
                player={playersById.get(r.player_id)}
                name={r.name}
                ringColor={st.color}
                size={46}
              />
              <span
                className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full"
                style={{ background: st.color, border: '2px solid var(--card)' }}
              >
                {st.icon}
              </span>
              {/* Count on the avatar for anyone who has stood more than once —
                  makes over-servers pop out of the grid, which is the whole
                  point of a fairness view. */}
              {r.completed > 1 && (
                <span
                  className="absolute -left-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-0.5 text-[9px] font-extrabold text-white tabular-nums"
                  style={{ background: 'var(--cricket)', border: '2px solid var(--card)' }}
                >
                  {r.completed}
                </span>
              )}
            </div>

            <Text size="2xs" align="center" weight="medium" className="line-clamp-1 leading-tight">
              {labels.get(r.player_id)}
            </Text>

            {/* Always show the tally, not just for repeat umpires — "how many
                times has each person done this" is the question the tab exists
                to answer, and a blank tile forces you to decode the dot. */}
            <DutyTally completed={r.completed} booked={r.booked} />
          </div>
        );
      })}
    </div>
  );
}

/** Compact per-player count: what they have stood, and what is still booked. */
function DutyTally({ completed, booked }: { completed: number; booked: number }) {
  if (completed === 0 && booked === 0) {
    return <Text size="2xs" color="dim" align="center" className="leading-none">not yet</Text>;
  }
  return (
    <div className="flex items-center gap-1 leading-none">
      {completed > 0 && (
        <span className="flex items-center gap-0.5">
          <CircleCheck size={9} style={{ color: 'var(--green)' }} />
          <span className="text-[10px] font-bold tabular-nums" style={{ color: 'var(--green)' }}>
            {completed}
          </span>
        </span>
      )}
      {booked > 0 && (
        <span className="flex items-center gap-0.5">
          <Clock size={9} style={{ color: 'var(--blue)' }} />
          <span className="text-[10px] font-bold tabular-nums" style={{ color: 'var(--blue)' }}>
            {booked}
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * One card per match, listing every umpire slot we owe on it. Left rail carries
 * the date so a column of cards scans as a timeline; the right side carries the
 * match and its umpires.
 */
function MatchDutyCard({
  group, today, myPlayerId, playersById, isAdmin, pendingId, canClaim,
  onClaim, onRelease, menuFor,
}: {
  group: DutyGroup;
  today: string;
  myPlayerId: string | null;
  playersById: Map<string, CricketPlayer>;
  isAdmin: boolean;
  pendingId: string | null;
  canClaim: boolean;
  onClaim: (id: string) => void;
  onRelease: (id: string) => void;
  menuFor: (d: CricketUmpiringDuty) => CardMenuItem[];
}) {
  const { dayName, dayNum, month } = dateParts(group.match_date);
  const time = formatTime(group.match_time);
  const typeLabel = group.match_type ? MATCH_TYPE_LABEL[group.match_type] : null;
  const isToday = group.match_date === today;
  const hasMine = myPlayerId !== null && group.duties.some((d) => d.assigned_player_id === myPlayerId);
  const hasOpen = group.duties.some((d) => d.status === 'open');

  // A card containing my duty gets a cricket-tinted edge; one still needing an
  // umpire gets a dashed edge so open work is visible while scrolling.
  const accent = hasMine ? 'var(--cricket)' : hasOpen ? 'var(--orange)' : 'var(--green)';

  return (
    <div
      className="overflow-hidden rounded-3xl bg-[var(--card)]"
      style={{
        border: '1px solid var(--border)',
        borderLeft: `4px solid color-mix(in srgb, ${accent} 70%, transparent)`,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex gap-3 p-3">
        {/* Date rail */}
        <div className="flex w-[46px] shrink-0 flex-col items-center pt-0.5">
          <Text size="2xs" weight="bold" uppercase tracking="wider" className="text-[9px]" style={{ color: accent }}>
            {dayName}
          </Text>
          <span className="mt-0.5 text-[22px] font-black leading-none tabular-nums text-[var(--text)]">
            {dayNum}
          </span>
          <Text size="2xs" weight="semibold" uppercase tracking="wide" color="muted" className="mt-0.5 text-[9px]">
            {month}
          </Text>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Text as="p" size="sm" weight="bold" className="leading-snug">
                {shortTeam(group.team_a)}
                <span className="text-[var(--muted)]"> v </span>
                {shortTeam(group.team_b)}
              </Text>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                {time && (
                  <span className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
                    <Clock size={11} /> {time}
                  </span>
                )}
                {group.venue && (
                  <span className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
                    <MapPin size={11} /> {group.venue}
                  </span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {isToday && <Badge variant="orange" size="sm">Today</Badge>}
              {typeLabel && <Badge variant="blue" size="sm">{typeLabel}</Badge>}
            </div>
          </div>

          {/* Umpire slots — the whole reason the card is grouped by match. */}
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
              />
            ))}
          </div>

          {group.duties.some((d) => d.notes) && (
            <Text as="p" size="2xs" color="dim" className="mt-2 italic">
              {group.duties.find((d) => d.notes)?.notes}
            </Text>
          )}
        </div>
      </div>
    </div>
  );
}

function DutySlotRow({
  duty, isMine, player, slotCount, isAdmin, pending, canClaim, onClaim, onRelease, menu,
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
}) {
  const name = duty.assigned_player_name;

  const isSwappedAway = duty.status === 'cancelled';

  const statusColor =
    duty.status === 'completed' ? 'var(--green)'
      : duty.status === 'no_show' ? 'var(--orange)'
        : isSwappedAway ? 'var(--muted)'
          : isMine ? 'var(--cricket)'
            : duty.status === 'claimed' ? 'var(--blue)'
              : 'var(--muted)';

  return (
    <div
      className="flex items-center gap-2.5 rounded-2xl px-2 py-1.5"
      style={{
        background: duty.status === 'open'
          ? 'color-mix(in srgb, var(--orange) 8%, transparent)'
          : 'var(--surface)',
        border: duty.status === 'open'
          ? '1px dashed color-mix(in srgb, var(--orange) 45%, transparent)'
          : '1px solid transparent',
        opacity: isSwappedAway ? 0.55 : 1,
      }}
    >
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
            border: '2px dashed color-mix(in srgb, var(--orange) 50%, transparent)',
            color: 'var(--orange)',
          }}
        >
          <UserPlus size={15} />
        </div>
      ) : (
        <Avatar player={player} name={name ?? '?'} ringColor={statusColor} />
      )}

      <div className="min-w-0 flex-1">
        {/* A swapped-away slot said the same thing three times — "Handed to
            another team", "we are not going", and a "Swapped" badge — and the
            badge stole the width that then truncated the text to
            "Handed to ano...". One statement, no badge, nothing clipped. */}
        <Text as="p" size="sm" weight={isMine ? 'bold' : 'medium'} truncate>
          {isSwappedAway
            ? (duty.swap_team ? `Handed to ${shortTeam(duty.swap_team)}` : 'Handed over')
            : duty.status === 'open' ? 'Needs an umpire' : (name ?? 'Unassigned')}
        </Text>
        <Text as="p" size="2xs" color="dim">
          {isSwappedAway
            ? 'Not going'
            : (
              <>
                {/* Only worth labelling the position when there are two. */}
                {slotCount > 1 ? `Umpire ${duty.role_slot}` : 'Umpire'}
                {isMine && ' · you'}
                {duty.mtca_removed_at && ' · MTCA removed this'}
              </>
            )}
        </Text>
      </div>
      {duty.status === 'completed' && <Badge variant="green" size="sm" className="shrink-0">Stood</Badge>}
      {duty.status === 'no_show' && isAdmin && <Badge variant="orange" size="sm" className="shrink-0">No-show</Badge>}

      {duty.status === 'open' && canClaim && !isSwappedAway && (
        <Button
          variant="primary" brand="cricket" size="sm" className="shrink-0"
          loading={pending}
          onClick={() => onClaim(duty.id)}
        >
          I&apos;ll do it
        </Button>
      )}
      {isMine && duty.status === 'claimed' && (
        <Button variant="secondary" size="sm" className="shrink-0" loading={pending} onClick={() => onRelease(duty.id)}>
          Give up
        </Button>
      )}

      {menu && <DutyMenu items={menu} />}
    </div>
  );
}
