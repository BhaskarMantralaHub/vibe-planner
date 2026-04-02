'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import { EmptyState, Text, CardMenu, Button, Badge, Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from '@/components/ui';
import { FaEllipsisV } from 'react-icons/fa';
import { MdEdit, MdDeleteOutline, MdSportsCricket, MdScoreboard, MdRestoreFromTrash, MdDeleteForever, MdEventNote, MdDoneAll, MdLocationOn, MdAccessTime, MdCalendarMonth } from 'react-icons/md';
import { toast } from 'sonner';
import MatchForm from './MatchForm';
import ResultForm from './ResultForm';

/* ── Types ── */
interface Performer {
  rank: number;
  name: string;
  stat: string;
  type: 'batting' | 'bowling' | 'fielding';
}

export interface Match {
  id: string;
  season_id?: string;
  opponent: string;
  match_date: string;
  match_time: string;
  venue: string;
  match_type: 'league' | 'practice';
  overs: number;
  status: 'upcoming' | 'completed';
  notes?: string;
  result?: 'won' | 'lost' | 'draw';
  team_score?: string;
  team_overs?: string;
  opponent_score?: string;
  opponent_overs?: string;
  result_summary?: string;
  performers?: Performer[];
  is_home?: boolean;
  umpire?: string;
  deleted_at?: string | null;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

type ScheduleTab = 'upcoming' | 'completed' | 'deleted';

/* ── Match Type Badge Config ── */
const MATCH_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  league: { label: 'League', color: '#3B82F6' },
  practice: { label: 'Practice', color: '#16A34A' },
};

/* ── Performer Type Config ── */
const PERFORMER_ICONS: Record<string, { emoji: string; color: string }> = {
  batting: { emoji: '\uD83C\uDFCF', color: '#3B82F6' },
  bowling: { emoji: '\uD83E\uDD3E', color: '#EF4444' },
  fielding: { emoji: '\uD83E\uDD1E', color: '#22C55E' },
};

/* ── Helpers ── */
function formatMatchDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatMatchTime(timeStr: string) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function getCountdown(dateStr: string, timeStr: string) {
  const matchDate = new Date(`${dateStr}T${timeStr}:00`);
  const now = new Date();
  const diff = matchDate.getTime() - now.getTime();
  if (diff <= 0) return { text: 'Starting soon', days: 0, hours: 0, mins: 0 };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return { text: `${days}d ${hours}h`, days, hours, mins };
  if (hours > 0) return { text: `${hours}h ${mins}m`, days, hours, mins };
  return { text: `${mins}m`, days, hours, mins };
}

function getCountdownSimple(dateStr: string, timeStr: string) {
  return getCountdown(dateStr, timeStr).text;
}

/* ── Add to Calendar (.ics) ── */
function addToCalendar(match: Match) {
  const [h, m] = match.match_time.split(':').map(Number);
  const start = new Date(`${match.match_date}T${match.match_time}:00`);
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000); // 4 hour duration

  const pad = (n: number) => String(n).padStart(2, '0');
  const toICS = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sunrisers Manteca//Schedule//EN',
    'BEGIN:VEVENT',
    `DTSTART:${toICS(start)}`,
    `DTEND:${toICS(end)}`,
    `SUMMARY:SHM vs ${match.opponent}`,
    `LOCATION:${match.venue}`,
    `DESCRIPTION:${match.overs} overs league match${match.notes ? ' — ' + match.notes : ''}`,
    `UID:${match.id}@sunrisersmanteca`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shm-vs-${match.opponent.toLowerCase().replace(/\s+/g, '-')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('Calendar event downloaded');
}

function formatDeletedAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function parseDateParts(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    dayName: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    dayNum: d.getDate(),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    monthFull: d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase(),
    year: d.getFullYear(),
  };
}

function groupByMonth(matches: Match[]): { label: string; matches: Match[] }[] {
  const groups: Record<string, Match[]> = {};
  for (const m of matches) {
    const { monthFull, year } = parseDateParts(m.match_date);
    const key = `${monthFull} ${year}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  }
  return Object.entries(groups).map(([label, matches]) => ({ label, matches }));
}

/* ── Season Record Summary ── */
function SeasonRecord({ completed }: { completed: Match[] }) {
  const wins = completed.filter((m) => m.result === 'won').length;
  const losses = completed.filter((m) => m.result === 'lost').length;
  const draws = completed.filter((m) => m.result === 'draw').length;
  const noResult = completed.filter((m) => !m.result).length;

  if (completed.length === 0) return null;

  return (
    <div className="flex items-center gap-3 px-1">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[13px] font-bold"
          style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--green)' }}
        >
          {wins}
        </span>
        <Text size="2xs" color="muted" weight="semibold" uppercase>W</Text>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[13px] font-bold"
          style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--red)' }}
        >
          {losses}
        </span>
        <Text size="2xs" color="muted" weight="semibold" uppercase>L</Text>
      </div>
      {draws > 0 && (
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[13px] font-bold"
            style={{ background: 'rgba(156,163,175,0.15)', color: 'var(--muted)' }}
          >
            {draws}
          </span>
          <Text size="2xs" color="muted" weight="semibold" uppercase>D</Text>
        </div>
      )}
      {noResult > 0 && (
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[13px] font-bold"
            style={{ background: 'rgba(156,163,175,0.08)', color: 'var(--dim)' }}
          >
            {noResult}
          </span>
          <Text size="2xs" color="dim" weight="semibold" uppercase>NR</Text>
        </div>
      )}
      <span className="ml-auto">
        <Text size="2xs" color="dim">{completed.length} played</Text>
      </span>
    </div>
  );
}

/* ── Countdown Block for Hero ── */
function CountdownBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="text-[28px] sm:text-[32px] font-black leading-none tabular-nums"
        style={{ color: 'white', textShadow: '0 0 20px rgba(255,255,255,0.3)' }}
      >
        {value}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-[0.15em] mt-1 text-white/50">
        {label}
      </span>
    </div>
  );
}

/* ── Next Match Hero Card (redesigned) ── */
function NextMatchHero({ match, isAdmin, onMenuOpen, openMenuId, menuBtnRef }: {
  match: Match;
  isAdmin: boolean;
  onMenuOpen: (id: string | null) => void;
  openMenuId: string | null;
  menuBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const typeConfig = MATCH_TYPE_CONFIG[match.match_type];
  const { dayName, dayNum, month } = parseDateParts(match.match_date);
  const countdown = getCountdown(match.match_date, match.match_time);

  // Live countdown tick
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const freshCountdown = getCountdown(match.match_date, match.match_time);

  return (
    <div
      className="rounded-2xl overflow-hidden relative"
      style={{
        background: `linear-gradient(145deg, var(--cricket-deep) 0%, color-mix(in srgb, var(--cricket-deep) 70%, var(--cricket)) 50%, var(--cricket-deep) 100%)`,
      }}
    >
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-[0.07]"
          style={{ background: 'white' }} />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full opacity-[0.04]"
          style={{ background: 'white' }} />
        {/* Subtle cricket stump lines */}
        <div className="absolute right-8 top-0 bottom-0 flex gap-1.5 opacity-[0.04]">
          <div className="w-0.5 h-full bg-white" />
          <div className="w-0.5 h-full bg-white" />
          <div className="w-0.5 h-full bg-white" />
        </div>
      </div>

      {isAdmin && (
        <button
          ref={openMenuId === match.id ? menuBtnRef : null}
          onClick={() => onMenuOpen(openMenuId === match.id ? null : match.id)}
          className="absolute top-3 right-3 h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg cursor-pointer text-white/40 hover:text-white hover:bg-white/10 transition-colors z-20"
        >
          <FaEllipsisV size={12} />
        </button>
      )}

      <div className="relative z-10 p-4 sm:p-5">
        {/* Top: label + pulsing live dot */}
        <div className="flex items-center gap-2 mb-4">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
          </span>
          <Text size="2xs" weight="bold" uppercase tracking="wider" className="text-white/60">Next Match</Text>
          <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
            style={{ background: `${typeConfig.color}30`, color: 'white' }}>
            {typeConfig.label} · {match.overs}ov
          </span>
        </div>

        {/* Countdown blocks */}
        <div className="flex items-center justify-center gap-5 mb-4">
          {freshCountdown.days > 0 && (
            <>
              <CountdownBlock label="Days" value={freshCountdown.days} />
              <span className="text-white/20 text-[24px] font-light mt-[-8px]">:</span>
            </>
          )}
          <CountdownBlock label="Hours" value={freshCountdown.hours} />
          <span className="text-white/20 text-[24px] font-light mt-[-8px]">:</span>
          <CountdownBlock label="Mins" value={freshCountdown.mins} />
        </div>

        {/* Opponent */}
        <div className="text-center mb-3">
          <Text size="2xs" weight="semibold" uppercase tracking="wider" className="text-white/40 mb-0.5">
            Sunrisers Manteca vs
          </Text>
          <Text as="h2" size="xl" weight="bold" color="white" tracking="tight" className="sm:text-[24px] leading-tight">
            {match.opponent}
          </Text>
        </div>

        {/* Date / Time / Venue — pill row */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white', backdropFilter: 'blur(4px)' }}
          >
            <MdAccessTime size={13} className="opacity-60" />
            {dayName} {dayNum} {month} · {formatMatchTime(match.match_time)}
          </span>
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white', backdropFilter: 'blur(4px)' }}
          >
            <MdLocationOn size={13} className="opacity-60" />
            {match.venue}
          </span>
        </div>

        {match.notes && (
          <Text size="2xs" color="white" className="text-center mt-2 opacity-50">{match.notes}</Text>
        )}
      </div>
    </div>
  );
}

/* ── Timeline Date Block (left side of match card) ── */
function DateBlock({ dateStr, isFirst }: { dateStr: string; isFirst?: boolean }) {
  const { dayName, dayNum, month } = parseDateParts(dateStr);
  return (
    <div className="flex flex-col items-center w-[52px] flex-shrink-0">
      <Text size="2xs" weight="bold" uppercase tracking="wider" className="text-[9px]" style={{ color: 'var(--cricket)' }}>
        {dayName}
      </Text>
      <span
        className="text-[22px] font-black leading-none mt-0.5 tabular-nums"
        style={{ color: 'var(--text)' }}
      >
        {dayNum}
      </span>
      <Text size="2xs" weight="semibold" uppercase tracking="wide" color="muted" className="text-[9px] mt-0.5">
        {month}
      </Text>
    </div>
  );
}

/* ── Match Card (timeline layout — upcoming) ── */
function TimelineMatchCard({ match, isAdmin, onMenuOpen, openMenuId, menuBtnRef }: {
  match: Match;
  isAdmin: boolean;
  onMenuOpen: (id: string | null) => void;
  openMenuId: string | null;
  menuBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const typeConfig = MATCH_TYPE_CONFIG[match.match_type];

  return (
    <div className="flex gap-3">
      {/* Date block + dot */}
      <div className="flex flex-col items-center flex-shrink-0 pt-3">
        <DateBlock dateStr={match.match_date} />
      </div>

      {/* Card content */}
      <div
        className="flex-1 rounded-xl border border-[var(--border)] p-3 relative overflow-hidden min-w-0"
        style={{ background: 'var(--card)' }}
      >

        {isAdmin && (
          <button
            ref={openMenuId === match.id ? menuBtnRef : null}
            onClick={() => onMenuOpen(openMenuId === match.id ? null : match.id)}
            className="absolute top-2 right-2 h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
          >
            <FaEllipsisV size={11} />
          </button>
        )}

        <div className="pr-8">
          <Text as="p" size="md" weight="bold" className="sm:text-[15px] mb-1">
            vs {match.opponent}
          </Text>

          <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--muted)' }}>
            <MdAccessTime size={13} style={{ color: 'var(--dim)', flexShrink: 0 }} />
            <span>{formatMatchTime(match.match_time)}</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <MdLocationOn size={13} style={{ color: 'var(--dim)', flexShrink: 0 }} />
            <span>{match.venue}</span>
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {match.is_home != null && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
                style={match.is_home
                  ? { background: 'color-mix(in srgb, var(--green) 15%, transparent)', color: 'var(--green)' }
                  : { background: 'color-mix(in srgb, var(--blue) 15%, transparent)', color: 'var(--blue)' }
                }>
                {match.is_home ? 'Home' : 'Away'}
              </span>
            )}
            <span className="text-[11px] font-semibold" style={{ color: 'var(--cricket)' }}>
              {getCountdownSimple(match.match_date, match.match_time)}
            </span>
          </div>

          {match.umpire && (
            <Text as="p" size="2xs" color="dim" className="mt-1.5">Umpires: {match.umpire}</Text>
          )}
          {match.notes && (
            <Text as="p" size="2xs" color="dim" className="mt-1">{match.notes}</Text>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Completed Match Card ── */
function CompletedMatchCard({ match, isAdmin, onMenuOpen, openMenuId, menuBtnRef }: {
  match: Match;
  isAdmin: boolean;
  onMenuOpen: (id: string | null) => void;
  openMenuId: string | null;
  menuBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const typeConfig = MATCH_TYPE_CONFIG[match.match_type];
  const resultColor = match.result === 'won' ? 'var(--green)' : match.result === 'lost' ? 'var(--red)' : 'var(--muted)';
  const resultBg = match.result === 'won' ? 'rgba(74,222,128,0.1)' : match.result === 'lost' ? 'rgba(248,113,113,0.1)' : 'rgba(156,163,175,0.1)';
  const resultLabel = match.result === 'won' ? 'Won' : match.result === 'lost' ? 'Lost' : (match.result === 'draw' || match.result === 'tied') ? 'Draw' : 'No Result';

  return (
    <div
      className="rounded-xl border overflow-hidden relative"
      style={{
        background: 'var(--card)',
        borderColor: 'var(--border)',
        borderLeftWidth: '3px',
        borderLeftColor: resultColor,
      }}
    >
      {isAdmin && (
        <button
          ref={openMenuId === match.id ? menuBtnRef : null}
          onClick={() => onMenuOpen(openMenuId === match.id ? null : match.id)}
          className="absolute top-2 right-2 h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors z-10"
        >
          <FaEllipsisV size={11} />
        </button>
      )}

      <div className="p-3 pr-10">
        {/* Top row: opponent + result */}
        <div className="flex items-center gap-2 mb-1">
          <Text as="p" size="md" weight="bold" className="sm:text-[15px] flex-1">
            vs {match.opponent}
          </Text>
          <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
            style={{ background: resultBg, color: resultColor }}>
            {resultLabel}
          </span>
        </div>

        {/* Date + venue */}
        <Text as="p" size="xs" color="muted">
          {formatMatchDate(match.match_date)} · {match.venue}
        </Text>
      </div>

      {/* Scoreboard (if scores exist) */}
      {match.team_score && match.opponent_score && (
        <div className="mx-3 mb-3 rounded-lg p-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Text size="xs" weight="bold" color="cricket" uppercase tracking="wide">SHM</Text>
              <div className="flex items-baseline gap-1.5">
                <Text size="lg" weight="bold" tabular>{match.team_score}</Text>
                <Text size="2xs" color="muted">({match.team_overs} ov)</Text>
              </div>
            </div>
            <div className="h-px" style={{ background: 'var(--border)' }} />
            <div className="flex items-center justify-between">
              <Text size="xs" weight="bold" color="muted" uppercase tracking="wide">
                {match.opponent.split(' ').map(w => w[0]).join('').slice(0, 3)}
              </Text>
              <div className="flex items-baseline gap-1.5">
                <Text size="lg" weight="bold" tabular>{match.opponent_score}</Text>
                <Text size="2xs" color="muted">({match.opponent_overs} ov)</Text>
              </div>
            </div>
          </div>
          {match.result_summary && (
            <p className="text-[12px] font-semibold mt-2 pt-2 border-t border-[var(--border)]" style={{ color: resultColor }}>
              {match.result_summary}
            </p>
          )}
        </div>
      )}

      {/* Performers */}
      {match.performers && match.performers.length > 0 && (
        <div className="px-3 pb-3 space-y-1.5">
          <Text as="p" size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="text-[10px] mb-1">Top Performers</Text>
          {match.performers.map((p) => {
            const pConfig = PERFORMER_ICONS[p.type];
            return (
              <div key={p.rank} className="flex items-center gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{ background: `${pConfig.color}15`, color: pConfig.color }}>
                  {p.rank}
                </span>
                <Text size="xs">{pConfig.emoji}</Text>
                <Text size="xs" weight="semibold">{p.name}</Text>
                <Text size="2xs" color="muted" tabular className="ml-auto">{p.stat}</Text>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Deleted Match Card (compact) ── */
function DeletedMatchCard({ match, isAdmin, onMenuOpen, openMenuId, menuBtnRef }: {
  match: Match;
  isAdmin: boolean;
  onMenuOpen: (id: string | null) => void;
  openMenuId: string | null;
  menuBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div
      className="rounded-xl border border-[var(--border)] p-3 overflow-hidden relative opacity-60"
      style={{ background: 'var(--surface)' }}
    >
      {isAdmin && (
        <button
          ref={openMenuId === match.id ? menuBtnRef : null}
          onClick={() => onMenuOpen(openMenuId === match.id ? null : match.id)}
          className="absolute top-2 right-2 h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
        >
          <FaEllipsisV size={11} />
        </button>
      )}

      <div className="flex items-center gap-3 pr-8">
        <MdDeleteOutline size={18} style={{ color: 'var(--dim)', flexShrink: 0 }} />
        <div className="min-w-0">
          <Text as="p" size="sm" weight="semibold" className="line-through">
            vs {match.opponent}
          </Text>
          <Text as="p" size="2xs" color="dim">
            {formatMatchDate(match.match_date)} · Deleted {match.deleted_at ? formatDeletedAgo(match.deleted_at) : ''}
          </Text>
        </div>
      </div>
    </div>
  );
}

/* ── Month Group Header ── */
function MonthHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-4 pb-1 first:pt-0">
      <Text size="2xs" weight="bold" uppercase tracking="wider" className="text-[10px]" style={{ color: 'var(--cricket)' }}>
        {label}
      </Text>
      <div className="flex-1 h-px" style={{ background: 'color-mix(in srgb, var(--cricket) 20%, transparent)' }} />
    </div>
  );
}

/* ── Local persistence (fallback for non-cloud mode) ── */
const STORAGE_KEY = 'cricket_schedule_matches';

function localLoadMatches(): Match[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Match[] : [];
  } catch {
    return [];
  }
}

function localSaveMatches(matches: Match[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
  } catch { /* storage full */ }
}

/* ── Main Component ── */
export default function MatchSchedule() {
  const { userAccess } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const { selectedSeasonId } = useCricketStore();

  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ScheduleTab>('upcoming');
  const [showForm, setShowForm] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deletingMatch, setDeletingMatch] = useState<{ id: string; opponent: string } | null>(null);
  const [permanentDeleting, setPermanentDeleting] = useState<{ id: string; opponent: string } | null>(null);
  const [recordingMatch, setRecordingMatch] = useState<Match | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  /* ── Load matches from Supabase or localStorage ── */
  const loadMatches = useCallback(async () => {
    if (!isCloudMode()) {
      setMatches(localLoadMatches());
      setLoading(false);
      return;
    }
    if (!selectedSeasonId) { setLoading(false); return; }

    const supabase = getSupabaseClient();
    if (!supabase) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('cricket_schedule_matches')
      .select('*')
      .eq('season_id', selectedSeasonId)
      .order('match_date', { ascending: true });

    if (error) {
      console.error('[schedule] load failed:', error);
      setMatches(localLoadMatches());
    } else {
      setMatches((data ?? []) as Match[]);
    }
    setLoading(false);
  }, [selectedSeasonId]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const active = matches.filter((m) => !m.deleted_at);
  const trashed = matches.filter((m) => m.deleted_at)
    .sort((a, b) => new Date(b.deleted_at!).getTime() - new Date(a.deleted_at!).getTime());

  // Use local date (not UTC) to avoid timezone mismatch
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const upcoming = active
    .filter((m) => m.status === 'upcoming' && m.match_date >= today)
    .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());

  const completed = active
    .filter((m) => m.status === 'completed' || (m.status === 'upcoming' && m.match_date < today))
    .sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime());

  const nextMatch = upcoming[0];
  const restUpcoming = upcoming.slice(1);
  const monthGroups = groupByMonth(restUpcoming);

  /* ── Bottom tab config ── */
  const tabs: { key: ScheduleTab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'upcoming', label: 'Upcoming', icon: <MdEventNote size={18} />, count: upcoming.length },
    { key: 'completed', label: 'Completed', icon: <MdDoneAll size={18} />, count: completed.length },
    { key: 'deleted', label: 'Deleted', icon: <MdDeleteOutline size={18} />, count: trashed.length },
  ];

  /* ── Handlers (Supabase + localStorage fallback) ── */
  const handleAdd = async (data: Omit<Match, 'id' | 'status'>, keepOpen?: boolean) => {
    if (isCloudMode() && !selectedSeasonId) {
      toast.error('No season selected');
      return;
    }
    if (isCloudMode() && selectedSeasonId) {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data: row, error } = await supabase
        .from('cricket_schedule_matches')
        .insert({ season_id: selectedSeasonId, ...data, status: 'upcoming' })
        .select()
        .single();

      if (error) {
        toast.error('Failed to save match');
        console.error('[schedule] insert error:', error);
        return;
      }
      setMatches((prev) => [...prev, row as Match]);
    } else {
      const newMatch: Match = { ...data, id: Date.now().toString(), status: 'upcoming', deleted_at: null };
      setMatches((prev) => {
        const next = [...prev, newMatch];
        localSaveMatches(next);
        return next;
      });
    }

    if (!keepOpen) {
      setShowForm(false);
      setActiveTab('upcoming');
    }
    toast.success(`Match vs ${data.opponent} scheduled`);
  };

  const handleEdit = async (data: Omit<Match, 'id' | 'status'>) => {
    if (!editingMatch) return;

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const { error } = await supabase
        .from('cricket_schedule_matches')
        .update(data)
        .eq('id', editingMatch.id);
      if (error) { toast.error('Failed to update'); return; }
    }

    setMatches((prev) => {
      const next = prev.map((m) => m.id === editingMatch.id ? { ...m, ...data } : m);
      if (!isCloudMode()) localSaveMatches(next);
      return next;
    });
    setEditingMatch(null);
    setShowForm(false);
    toast.success('Match updated');
  };

  const handleDelete = async (id: string) => {
    const now = new Date().toISOString();
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const { error } = await supabase
        .from('cricket_schedule_matches')
        .update({ deleted_at: now })
        .eq('id', id);
      if (error) { toast.error('Failed to delete'); return; }
    }

    setMatches((prev) => {
      const next = prev.map((m) => m.id === id ? { ...m, deleted_at: now } : m);
      if (!isCloudMode()) localSaveMatches(next);
      return next;
    });
    setDeletingMatch(null);
    toast.success('Match moved to trash');
  };

  const handleRestore = async (id: string) => {
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const { error } = await supabase
        .from('cricket_schedule_matches')
        .update({ deleted_at: null })
        .eq('id', id);
      if (error) { toast.error('Failed to restore'); return; }
    }

    setMatches((prev) => {
      const next = prev.map((m) => m.id === id ? { ...m, deleted_at: null } : m);
      if (!isCloudMode()) localSaveMatches(next);
      return next;
    });
    toast.success('Match restored');
  };

  const handlePermanentDelete = async (id: string) => {
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const { error } = await supabase
        .from('cricket_schedule_matches')
        .delete()
        .eq('id', id);
      if (error) { toast.error('Failed to delete permanently'); return; }
    }

    setMatches((prev) => {
      const next = prev.filter((m) => m.id !== id);
      if (!isCloudMode()) localSaveMatches(next);
      return next;
    });
    setPermanentDeleting(null);
    toast.success('Match permanently deleted');
  };

  const handleEmptyTrash = async () => {
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        const trashedIds = trashed.map((m) => m.id);
        if (trashedIds.length > 0) {
          const { error } = await supabase.from('cricket_schedule_matches').delete().in('id', trashedIds);
          if (error) { toast.error('Failed to empty trash'); return; }
        }
      }
    }

    setMatches((prev) => {
      const next = prev.filter((m) => !m.deleted_at);
      if (!isCloudMode()) localSaveMatches(next);
      return next;
    });
    setActiveTab('upcoming');
    toast.success('Trash emptied');
  };

  const handleRecordResult = async (matchId: string, data: { result: 'won' | 'lost' | 'draw' }) => {
    const updates = { ...data, status: 'completed' as const };

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const { error } = await supabase
        .from('cricket_schedule_matches')
        .update(updates)
        .eq('id', matchId);
      if (error) { toast.error('Failed to save result'); return; }
    }

    setMatches((prev) => {
      const next = prev.map((m) => m.id === matchId ? { ...m, ...updates } : m);
      if (!isCloudMode()) localSaveMatches(next);
      return next;
    });
    setRecordingMatch(null);
    setActiveTab('completed');
    toast.success('Result recorded');
  };

  /* ── CardMenu items builder ── */
  const getMenuItems = (matchId: string) => {
    const m = matches.find((m) => m.id === matchId);
    if (!m) return [];
    const isDeleted = !!m.deleted_at;

    if (isDeleted) {
      return [
        { label: 'Restore', icon: <MdRestoreFromTrash size={15} />, color: 'var(--cricket)', onClick: () => handleRestore(m.id) },
        { label: 'Delete Forever', icon: <MdDeleteForever size={15} />, color: 'var(--red)', onClick: () => setPermanentDeleting({ id: m.id, opponent: m.opponent }), dividerBefore: true },
      ];
    }

    return [
      { label: 'Add to Calendar', icon: <MdCalendarMonth size={15} />, color: 'var(--text)', onClick: () => addToCalendar(m) },
      { label: 'Record Result', icon: <MdScoreboard size={15} />, color: 'var(--cricket)', onClick: () => setRecordingMatch(m) },
      { label: 'Edit', icon: <MdEdit size={15} />, color: 'var(--text)', onClick: () => { setEditingMatch(m); setShowForm(true); } },
      { label: 'Delete', icon: <MdDeleteOutline size={15} />, color: 'var(--red)', onClick: () => setDeletingMatch({ id: m.id, opponent: m.opponent }), dividerBefore: true },
    ];
  };

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--dim)] border-t-transparent" />
      </div>
    );
  }

  /* ── Empty state (no matches at all) ── */
  if (matches.length === 0) {
    return (
      <div>
        <EmptyState
          icon={<MdSportsCricket size={40} style={{ color: 'var(--cricket)' }} />}
          title="No matches scheduled"
          description="Schedule your first match to keep the team updated"
          brand="cricket"
          action={isAdmin ? { label: '+ Schedule Match', onClick: () => setShowForm(true) } : undefined}
        />
        <MatchForm
          open={showForm}
          onClose={() => { setShowForm(false); setEditingMatch(null); }}
          onSubmit={handleAdd}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Season record summary — visible on completed tab */}
      {activeTab === 'completed' && completed.length > 0 && (
        <SeasonRecord completed={completed} />
      )}

      {/* Next Match Hero — always visible when on upcoming tab */}
      {activeTab === 'upcoming' && nextMatch && (
        <NextMatchHero
          match={nextMatch}
          isAdmin={isAdmin}
          onMenuOpen={setOpenMenu}
          openMenuId={openMenu}
          menuBtnRef={menuBtnRef}
        />
      )}

      {/* Upcoming: match count + season record teaser */}
      {activeTab === 'upcoming' && upcoming.length > 0 && completed.length > 0 && (
        <div className="flex items-center justify-between px-1 pt-1">
          <SeasonRecord completed={completed} />
        </div>
      )}

      {/* Bottom tab bar — iOS-style with pill active state */}
      <div
        className="fixed left-0 right-0 z-40"
        style={{
          bottom: 0,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: 'color-mix(in srgb, var(--card) 85%, transparent)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderTop: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
          boxShadow: '0 -1px 0 0 color-mix(in srgb, var(--border) 40%, transparent), 0 -8px 32px rgba(0,0,0,0.12)',
        }}
      >
        <div className="flex items-center justify-around px-2 pt-1.5 pb-2">
          {tabs.map((t) => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => { setActiveTab(t.key); setOpenMenu(null); }}
                className="relative flex flex-col items-center gap-1 cursor-pointer transition-all duration-200 active:scale-90 min-w-[80px] py-1.5 px-3"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {isActive && (
                  <span
                    className="absolute inset-0 rounded-2xl"
                    style={{
                      background: 'color-mix(in srgb, var(--cricket) 15%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--cricket) 25%, transparent)',
                    }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">
                  <span
                    className="transition-all duration-200"
                    style={{
                      color: isActive ? 'var(--cricket)' : 'var(--muted)',
                      filter: isActive ? 'drop-shadow(0 0 6px color-mix(in srgb, var(--cricket) 60%, transparent))' : 'none',
                      transform: isActive ? 'scale(1.15) translateY(-1px)' : 'scale(1)',
                      display: 'flex',
                    }}
                  >
                    {t.icon}
                  </span>
                  {t.count > 0 && (
                    <span
                      className="min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-bold px-1"
                      style={{
                        background: isActive ? 'var(--cricket)' : 'var(--dim)',
                        color: 'white',
                      }}
                    >
                      {t.count}
                    </span>
                  )}
                </span>
                <span
                  className="relative z-10 text-[10px] transition-all duration-200"
                  style={{
                    color: isActive ? 'var(--cricket)' : 'var(--muted)',
                    fontWeight: isActive ? 700 : 500,
                    letterSpacing: isActive ? '0.03em' : '0.02em',
                  }}
                >
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-[200px]">
        {activeTab === 'upcoming' && (
          <>
            {restUpcoming.length > 0 ? (
              <div className="space-y-0">
                {monthGroups.map((group) => (
                  <div key={group.label}>
                    <MonthHeader label={group.label} />
                    <div className="space-y-0">
                      {group.matches.map((m) => (
                        <TimelineMatchCard
                          key={m.id}
                          match={m}
                          isAdmin={isAdmin}
                          onMenuOpen={setOpenMenu}
                          openMenuId={openMenu}
                          menuBtnRef={menuBtnRef}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon={<MdSportsCricket size={36} style={{ color: 'var(--dim)' }} />}
                title="No upcoming matches"
                description={isAdmin ? 'Tap + to schedule a match' : 'Check back soon for new fixtures'}
              />
            ) : null}
          </>
        )}

        {activeTab === 'completed' && (
          <>
            {completed.length > 0 ? (
              <div className="space-y-2">
                {completed.map((m) => (
                  <CompletedMatchCard
                    key={m.id}
                    match={m}
                    isAdmin={isAdmin}
                    onMenuOpen={setOpenMenu}
                    openMenuId={openMenu}
                    menuBtnRef={menuBtnRef}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<MdSportsCricket size={36} style={{ color: 'var(--dim)' }} />}
                title="No completed matches"
                description="Completed matches will appear here"
              />
            )}
          </>
        )}

        {activeTab === 'deleted' && (
          <>
            {!isAdmin ? (
              <EmptyState
                icon={<MdDeleteOutline size={36} style={{ color: 'var(--dim)' }} />}
                title="Admin only"
                description="Only admins can view and manage deleted matches"
              />
            ) : trashed.length > 0 ? (
              <div className="space-y-2">
                {trashed.map((m) => (
                  <DeletedMatchCard
                    key={m.id}
                    match={m}
                    isAdmin={isAdmin}
                    onMenuOpen={setOpenMenu}
                    openMenuId={openMenu}
                    menuBtnRef={menuBtnRef}
                  />
                ))}
                {trashed.length > 1 && (
                  <Button
                    variant="danger-outline"
                    size="sm"
                    className="mt-2"
                    onClick={handleEmptyTrash}
                  >
                    Empty Trash
                  </Button>
                )}
              </div>
            ) : (
              <EmptyState
                icon={<MdRestoreFromTrash size={36} style={{ color: 'var(--dim)' }} />}
                title="Trash is empty"
                description="Deleted matches will appear here"
              />
            )}
          </>
        )}
      </div>

      {/* CardMenu (context menu for any card) */}
      {openMenu && (
        <CardMenu
          anchorRef={menuBtnRef}
          onClose={() => setOpenMenu(null)}
          width={180}
          items={getMenuItems(openMenu)}
        />
      )}

      {/* Soft-delete confirmation dialog */}
      <Dialog open={!!deletingMatch} onOpenChange={(open) => { if (!open) setDeletingMatch(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Match?</DialogTitle>
            <DialogDescription>
              Match vs {deletingMatch?.opponent} will be moved to Recently Deleted. You can restore it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeletingMatch(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (deletingMatch) handleDelete(deletingMatch.id); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent delete confirmation dialog */}
      <Dialog open={!!permanentDeleting} onOpenChange={(open) => { if (!open) setPermanentDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently Delete?</DialogTitle>
            <DialogDescription>
              Match vs {permanentDeleting?.opponent} will be permanently removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPermanentDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (permanentDeleting) handlePermanentDelete(permanentDeleting.id); }}>Delete Forever</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FAB for admin — positioned above bottom tab bar */}
      {isAdmin && (
        <button
          onClick={() => { setEditingMatch(null); setShowForm(true); }}
          className="fixed right-5 z-40 h-14 w-14 flex items-center justify-center rounded-full text-white cursor-pointer active:scale-95 transition-transform"
          style={{
            bottom: 'calc(60px + env(safe-area-inset-bottom, 0px) + 16px)',
            background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))',
            boxShadow: '0 4px 20px var(--cricket-glow)',
          }}>
          <span className="text-[24px] font-light leading-none">+</span>
        </button>
      )}

      {/* Match Form Drawer */}
      <MatchForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditingMatch(null); }}
        onSubmit={editingMatch ? handleEdit : handleAdd}
        initialData={editingMatch || undefined}
      />

      {/* Result Form Drawer */}
      <ResultForm
        open={!!recordingMatch}
        match={recordingMatch}
        onClose={() => setRecordingMatch(null)}
        onSubmit={handleRecordResult}
      />

      {/* Spacer for fixed bottom tab bar */}
      <div className="h-24" />
    </div>
  );
}
