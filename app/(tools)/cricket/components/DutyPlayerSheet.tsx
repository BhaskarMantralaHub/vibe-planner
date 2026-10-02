'use client';

import { useMemo } from 'react';
import { Drawer, DrawerHeader, DrawerTitle, DrawerBody, Text, Badge, Button } from '@/components/ui';
import { Clock, MapPin, ChevronRight, Copy, Crown, ShieldCheck } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { toast } from 'sonner';
import PlayerAvatar from './PlayerAvatar';
import { PLAYER_ROLES } from '../lib/constants';
import { buildPlayerMessageText, whatsappShareUrl, addressName } from '@/lib/duty-share';
import { dutyStatFor } from '@/stores/umpiring-store';
import { useCricketStore } from '@/stores/cricket-store';
import { seasonRoster } from '../lib/season-roster';
import type { CricketPlayer, CricketUmpiringDuty } from '@/types/cricket';

/**
 * Everything about ONE player's umpiring, one tap from their tile in the grid.
 *
 * Deliberately NOT `PlayerProfile`. That sheet edits identity — name, email,
 * role, shirt size, photo — and pulls in gallery and fee data. This one answers
 * the two questions the umpiring tab actually raises:
 *
 *   1. "Who is this?" — the grid can only show one short word, so the full
 *      stored name, jersey and role live here. That is the whole reason every
 *      tile is tappable: an ambiguous label with somewhere to go stops being
 *      ambiguous, and there is no way to mis-tap into editing someone's record.
 *   2. "Which matches?" — a tile says "✓ 1" and, before this sheet, there was
 *      nowhere in the app that could tell you WHICH match that was.
 */

const shortTeam = (n: string) => n.replace(/^MTCA\s+/i, '').trim();

function formatTime(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

interface DutyPlayerSheetProps {
  /** null closes the sheet. */
  player: CricketPlayer | null;
  /** Every duty in the season; narrowed to this player's here. */
  duties: CricketUmpiringDuty[];
  target: number;
  /** Unclaimed spots across the season, for the ask in the message. */
  openSlots: number;
  /** Today in Pacific, YYYY-MM-DD. */
  today: string;
  /** Named in the WhatsApp message so it is clear which season it is about. */
  seasonName?: string | undefined;
  isAdmin: boolean;
  onClose: () => void;
  /** Jump to the Upcoming tab, the only place a duty can be taken. */
  onGoToUpcoming: () => void;
}

/**
 * Shell only. Stays MOUNTED with `open={false}` rather than returning null, so
 * vaul can animate the sheet out — unmounting on close kills the exit
 * animation. The body is a separate component purely so it can take non-null
 * props and be read at a sane indentation.
 */
export default function DutyPlayerSheet({ player, onClose, ...rest }: DutyPlayerSheetProps) {
  return (
    <Drawer open={player !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerHeader>
        <DrawerTitle>Umpiring</DrawerTitle>
      </DrawerHeader>
      <DrawerBody>
        {/* `player` is destructured OUT of `rest` on purpose. Passed via
            {...rest} it would be re-widened to `| null` after the narrowed
            prop, and the body could no longer rely on it. */}
        {player && <SheetBody player={player} onClose={onClose} {...rest} />}
      </DrawerBody>
    </Drawer>
  );
}

function SheetBody({
  player, duties, target, openSlots, today, seasonName, isAdmin, onClose, onGoToUpcoming,
}: Omit<DutyPlayerSheetProps, 'player'> & { player: CricketPlayer }) {
  /**
   * Tallied here rather than taken as a prop. The board's `computeDutyStats`
   * omits deactivated players, but a deactivated player who umpired earlier
   * still shows by name on the duty cards and can be tapped from there — a
   * looked-up stat would be null and the sheet would open blank.
   */
  const stat = useMemo(() => dutyStatFor(player, duties, target), [player, duties, target]);
  const groups = useMemo(() => {
    // Soft-deleted duties are gone for good; cancelled ones are NOT — a swapped
    // duty stays visible everywhere else on this page, so hiding it here would
    // leave "why does the board still list me?" unanswered.
    const mine = duties.filter((d) => d.assigned_player_id === player.id && d.deleted_at === null);
    const byDateAsc = (a: CricketUmpiringDuty, b: CricketUmpiringDuty) =>
      a.match_date.localeCompare(b.match_date) || (a.match_time ?? '').localeCompare(b.match_time ?? '');
    const byDateDesc = (a: CricketUmpiringDuty, b: CricketUmpiringDuty) => byDateAsc(b, a);

    return {
      comingUp: mine.filter((d) => d.status === 'claimed' && d.match_date >= today).sort(byDateAsc),
      // A claim on a match that has already been played and never marked. Its
      // own group because it is the one state an admin can fix from here, and
      // because it silently holds back the "everyone stood once" count.
      unmarked: mine.filter((d) => d.status === 'claimed' && d.match_date < today).sort(byDateDesc),
      stood: mine.filter((d) => d.status === 'completed').sort(byDateDesc),
      missed: mine.filter((d) => d.status === 'no_show').sort(byDateDesc),
      handedOver: mine.filter((d) => d.status === 'cancelled').sort(byDateDesc),
      total: mine.length,
    };
  }, [player, duties, today]);

  const teamPlayers = useCricketStore((st) => st.players);
  const rosterNames = useMemo(
    () => teamPlayers.filter((p) => p.is_active).map((p) => p.name),
    [teamPlayers],
  );

  const message = useMemo(() => {
    return buildPlayerMessageText(
      // First name — "Hi Venkat Gudala (Kittu)" reads like a form letter — but
      // spelled out when another player shares it, since the group sees this.
      addressName(player.name, rosterNames),
      duties.filter((d) => d.assigned_player_id === player.id),
      { today, openSlots, seasonName },
    );
  }, [player, duties, today, openSlots, seasonName, rosterNames]);

  const role = PLAYER_ROLES.find((r) => r.key === player.player_role);
  // The C/VC badge is the SELECTED SEASON's armband — the umpiring board is
  // already scoped by the same season pill.
  const { players, seasonPlayers, selectedSeasonId } = useCricketStore();
  const seasonDesignation = seasonRoster(players, seasonPlayers, selectedSeasonId).designationOf(player.id);
  // Neutral text: the numbers above already say it; colour is for the dots.
  const standing = stat.completed >= target
    ? 'Target met'
    : stat.booked > 0
      ? 'Signed up, not stood yet'
      : 'Yet to umpire this season';

  return (
    <>
      {/* ── Who this is ── */}
      <div className="flex items-center gap-3 py-1">
        <PlayerAvatar player={player} name={player.name} size={56} />
        <div className="min-w-0 flex-1">
          {/* The FULL stored name, nickname and all — the grid could only show
              one word of it, and this is the tap that pays that back. */}
          <Text as="p" size="xl" weight="bold" tracking="tight" className="leading-snug">
            {player.name}
          </Text>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {player.jersey_number !== null && (
              <Badge variant="muted" size="sm">#{player.jersey_number}</Badge>
            )}
            {/* No role emoji — the label says it. All badges neutral. */}
            {role && <Badge variant="muted" size="sm">{role.label}</Badge>}
            {seasonDesignation === 'captain' && (
              <Badge variant="muted" size="sm" className="gap-1">
                <Crown size={10} aria-hidden /> Captain
              </Badge>
            )}
            {seasonDesignation === 'vice-captain' && (
              <Badge variant="muted" size="sm" className="gap-1">
                <ShieldCheck size={10} aria-hidden /> Vice-captain
              </Badge>
            )}
            {player.is_guest && <Badge variant="muted" size="sm">Guest</Badge>}
          </div>
        </div>
      </div>

      {/* ── Where they stand ── */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat n={stat.completed} label="Stood" />
        <Stat n={stat.booked} label="Signed up" />
        <Stat n={target} label="Target" />
      </div>
      <Text as="p" size="xs" color="muted" align="center" className="mt-2">
        {standing}
        {player.is_guest && ' · guests are not counted toward the target'}
      </Text>

      {/* ── Which matches ── */}
      <div className="mt-4 space-y-3">
        {groups.total === 0 ? (
          <Text as="p" size="sm" color="muted" align="center" className="py-6">
            No umpiring duties yet this season.
          </Text>
        ) : (
          <>
            <DutySection title="Coming up" tone="var(--blue)" duties={groups.comingUp} />
            <DutySection
              title="Played — not marked yet"
              tone="var(--orange)"
              duties={groups.unmarked}
              note={isAdmin ? 'Mark these done on the Upcoming tab so they count.' : undefined}
            />
            <DutySection title="Stood" tone="var(--green)" duties={groups.stood} />
            <DutySection title="Missed" tone="var(--red)" duties={groups.missed} />
            <DutySection title="Handed over" tone="var(--muted)" duties={groups.handedOver} dim />
          </>
        )}
      </div>

      {/* ── Admin actions ── */}
      {isAdmin && (
        <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-3">
          {message && (
            <div className="flex items-center gap-2">
              {/* Real <a target="_blank">, not window.open — iOS Safari blocks
                  programmatic opens outside a direct gesture. */}
              <a
                href={whatsappShareUrl(message)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl font-bold text-white active:scale-[0.98]"
                style={{ background: '#25D366' }}
              >
                <FaWhatsapp size={18} />
                <span className="text-sm">Message on WhatsApp</span>
              </a>
              <button
                type="button"
                aria-label="Copy message"
                onClick={() => {
                  navigator.clipboard.writeText(message);
                  toast.success('Copied to clipboard');
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] active:scale-95"
              >
                <Copy size={16} />
              </button>
            </div>
          )}
          {openSlots > 0 && (
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => { onClose(); onGoToUpcoming(); }}
            >
              {openSlots} open {openSlots === 1 ? 'spot' : 'spots'} — assign one
              <ChevronRight size={14} />
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface)] px-2 py-2.5 text-center">
      <span className="block text-[22px] font-bold leading-none tabular-nums text-[var(--text)]">{n}</span>
      <Text as="p" size="xs" color="muted" align="center" className="mt-1">{label}</Text>
    </div>
  );
}

/** Renders nothing at all when the group is empty, so the sheet stays short. */
/** Same header pattern as the Roster tab: a status dot, a plain title, a count. */
function DutySection({ title, tone, duties, note, dim }: {
  title: string;
  tone: string;
  duties: CricketUmpiringDuty[];
  note?: string | undefined;
  dim?: boolean;
}) {
  if (duties.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone }} />
        <Text size="sm" weight="semibold">{title}</Text>
        <Text size="sm" color="muted" className="tabular-nums">{duties.length}</Text>
      </div>
      {note && (
        <Text as="p" size="2xs" color="muted" className="mb-1.5">{note}</Text>
      )}
      <div className="space-y-1.5">
        {duties.map((d) => (
          <div
            key={d.id}
            className="rounded-xl bg-[var(--surface)] p-3"
            style={dim ? { opacity: 0.6 } : undefined}
          >
            <div className="flex items-baseline gap-2">
              <Text size="xs" weight="semibold" className="shrink-0 tabular-nums">
                {formatDate(d.match_date)}
              </Text>
              <Text as="p" size="sm" weight="medium" className="min-w-0 flex-1 truncate">
                {shortTeam(d.team_a)} v {shortTeam(d.team_b)}
              </Text>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
              {d.match_time && (
                <span className="flex items-center gap-1 text-[12px] text-[var(--muted)]">
                  <Clock size={12} aria-hidden /> {formatTime(d.match_time)}
                </span>
              )}
              {d.venue && (
                <span className="flex min-w-0 items-center gap-1 text-[12px] text-[var(--muted)]">
                  <MapPin size={12} aria-hidden className="shrink-0" />
                  <span className="truncate">{d.venue}</span>
                </span>
              )}
              <span className="text-[12px] text-[var(--muted)]">Umpire {d.role_slot}</span>
              {d.status === 'cancelled' && d.swap_team && (
                <span className="text-[12px] text-[var(--muted)]">
                  → {shortTeam(d.swap_team)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
