'use client';

import { useMemo } from 'react';
import { Drawer, DrawerHeader, DrawerTitle, DrawerBody, Text, Badge, Button } from '@/components/ui';
import { Clock, MapPin, CircleCheck, UserX, ChevronRight, Copy, Crown, ShieldCheck } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { toast } from 'sonner';
import PlayerAvatar from './PlayerAvatar';
import { PLAYER_ROLES } from '../lib/constants';
import { buildPlayerMessageText, whatsappShareUrl } from '@/lib/duty-share';
import { dutyStatFor } from '@/stores/umpiring-store';
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

  const message = useMemo(() => {
    return buildPlayerMessageText(
      // First name only: this is a message TO them, and "Hi Venkat Gudala
      // (Kittu)" reads like a form letter.
      player.name.replace(/\([^)]*\)/g, ' ').trim().split(' ')[0] ?? player.name,
      duties.filter((d) => d.assigned_player_id === player.id),
      { today, openSlots, seasonName },
    );
  }, [player, duties, today, openSlots, seasonName]);

  const role = PLAYER_ROLES.find((r) => r.key === player.player_role);
  const standing = stat.completed >= target
    ? { label: 'Target met', color: 'var(--green)' }
    : stat.booked > 0
      ? { label: 'Signed up — not stood yet', color: 'var(--blue)' }
      : { label: 'Yet to umpire this season', color: 'var(--orange)' };

  return (
    <>
      {/* ── Who this is ── */}
      <div
        className="flex items-center gap-3 rounded-2xl p-3"
        style={{
          background: `color-mix(in srgb, ${standing.color} 8%, transparent)`,
          border: `1px solid color-mix(in srgb, ${standing.color} 25%, transparent)`,
        }}
      >
        <PlayerAvatar player={player} name={player.name} ringColor={standing.color} size={56} />
        <div className="min-w-0 flex-1">
          {/* The FULL stored name, nickname and all — the grid could only show
              one word of it, and this is the tap that pays that back. */}
          <Text as="p" size="md" weight="bold" className="leading-snug">
            {player.name}
          </Text>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {player.jersey_number !== null && (
              <Badge variant="muted" size="sm">#{player.jersey_number}</Badge>
            )}
            {role && <Badge variant="muted" size="sm">{role.icon} {role.label}</Badge>}
            {player.designation === 'captain' && (
              <Badge variant="orange" size="sm" className="gap-1">
                <Crown size={9} /> Captain
              </Badge>
            )}
            {player.designation === 'vice-captain' && (
              <Badge variant="blue" size="sm" className="gap-1">
                <ShieldCheck size={9} /> Vice-captain
              </Badge>
            )}
            {player.is_guest && <Badge variant="purple" size="sm">Guest</Badge>}
          </div>
        </div>
      </div>

      {/* ── Where they stand ── */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat n={stat.completed} label="Stood" color="var(--green)" />
        <Stat n={stat.booked} label="Signed up" color="var(--blue)" />
        <Stat n={target} label="Target" color="var(--muted)" />
      </div>
      <Text as="p" size="2xs" weight="semibold" align="center" className="mt-2"
        style={{ color: standing.color }}
      >
        {standing.label}
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
            <DutySection title="Coming up" tone="var(--blue)" duties={groups.comingUp} icon={<Clock size={11} />} />
            <DutySection
              title="Played — not marked yet"
              tone="var(--orange)"
              duties={groups.unmarked}
              note={isAdmin ? 'Mark these done on the Upcoming tab so they count.' : undefined}
            />
            <DutySection title="Stood" tone="var(--green)" duties={groups.stood} icon={<CircleCheck size={11} />} />
            <DutySection title="Missed" tone="var(--red)" duties={groups.missed} icon={<UserX size={11} />} />
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

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 text-center">
      <span className="block text-[20px] font-black leading-none tabular-nums" style={{ color }}>
        {n}
      </span>
      <Text as="p" size="2xs" color="muted" className="mt-0.5">{label}</Text>
    </div>
  );
}

/** Renders nothing at all when the group is empty, so the sheet stays short. */
function DutySection({ title, tone, duties, icon, note, dim }: {
  title: string;
  tone: string;
  duties: CricketUmpiringDuty[];
  icon?: React.ReactNode;
  note?: string | undefined;
  dim?: boolean;
}) {
  if (duties.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="flex items-center" style={{ color: tone }}>{icon}</span>
        <Text size="2xs" weight="bold" uppercase tracking="wider" style={{ color: tone }}>
          {title} ({duties.length})
        </Text>
      </div>
      {note && (
        <Text as="p" size="2xs" color="muted" className="mb-1.5">{note}</Text>
      )}
      <div className="space-y-1.5">
        {duties.map((d) => (
          <div
            key={d.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5"
            style={dim ? { opacity: 0.6 } : undefined}
          >
            <div className="flex items-baseline gap-2">
              <Text size="2xs" weight="bold" className="shrink-0 tabular-nums" style={{ color: tone }}>
                {formatDate(d.match_date)}
              </Text>
              <Text as="p" size="xs" weight="semibold" className="min-w-0 flex-1 truncate">
                {shortTeam(d.team_a)} v {shortTeam(d.team_b)}
              </Text>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
              {d.match_time && (
                <span className="flex items-center gap-1 text-[10px] text-[var(--muted)]">
                  <Clock size={9} /> {formatTime(d.match_time)}
                </span>
              )}
              {d.venue && (
                <span className="flex min-w-0 items-center gap-1 text-[10px] text-[var(--muted)]">
                  <MapPin size={9} className="shrink-0" />
                  <span className="truncate">{d.venue}</span>
                </span>
              )}
              <span className="text-[10px] text-[var(--dim)]">Umpire {d.role_slot}</span>
              {d.status === 'cancelled' && d.swap_team && (
                <span className="text-[10px] text-[var(--dim)]">
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
