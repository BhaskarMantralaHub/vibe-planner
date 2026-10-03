'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import { EmptyState, Text, ActionSheet, Button, Badge, Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from '@/components/ui';
import { EllipsisVertical, Pencil, Trash2, ArchiveRestore, MapPin, Clock, Calendar, CalendarPlus, Share, ExternalLink, Plus } from 'lucide-react';
import { MdSportsCricket, MdScoreboard } from 'react-icons/md';
import UmpireIcon from '@/components/icons/UmpireIcon';
import { toast } from 'sonner';
import MatchForm from './MatchForm';
import ResultForm from './ResultForm';
import CricketFab from './CricketFab';
import { MATCH_TABS } from '../lib/match-tabs';
import { getTeamName, getTeamCode, getTeamLogoUrl } from '../lib/constants';
import { useRouter, useSearchParams } from 'next/navigation';
import { SegmentedControl } from '@/components/ui/segmented-control';

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
  match_date: string | null;  // null = TBD (date not yet confirmed)
  match_time: string;
  venue: string;
  match_type: 'league' | 'practice' | 'semi_final' | 'final';
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

// Per-match metadata pulled from cricclubs_matches and keyed by (match_date,
// normalized opponent name). Carries the scorecard URL and the toss outcome,
// both nullable since the sync may not have populated them yet (or the toss
// line is missing from older cricclubs scorecards).
type CricclubsMeta = {
  scorecard_url: string;
  toss_winner: string | null;
  toss_decision: 'bat' | 'bowl' | null;
};

/* ── Match Type Badge Config ── */
const MATCH_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  league: { label: 'League', color: '#3B82F6' },
  practice: { label: 'Practice', color: '#16A34A' },
  // Playoffs get their own colours so a knockout never reads as a league game.
  semi_final: { label: 'Semi Final', color: '#8B5CF6' },
  final: { label: 'Final', color: '#F59E0B' },
};

/* ── Helpers ── */
function formatMatchDate(dateStr: string | null) {
  if (!dateStr) return 'Date TBD';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatMatchTime(timeStr: string) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function getCountdown(dateStr: string | null, timeStr: string) {
  if (!dateStr) return { text: 'Date TBD', days: 0, hours: 0, mins: 0, isTbd: true };
  const matchDate = new Date(`${dateStr}T${timeStr}:00`);
  const now = new Date();
  const diff = matchDate.getTime() - now.getTime();
  if (diff <= 0) return { text: 'Starting soon', days: 0, hours: 0, mins: 0, isTbd: false };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return { text: `${days}d ${hours}h`, days, hours, mins, isTbd: false };
  if (hours > 0) return { text: `${hours}h ${mins}m`, days, hours, mins, isTbd: false };
  return { text: `${mins}m`, days, hours, mins, isTbd: false };
}

function getCountdownSimple(dateStr: string | null, timeStr: string) {
  return getCountdown(dateStr, timeStr).text;
}

// Derive which side batted first from the result text. In limited-overs cricket
// "won by N wickets" means the winning team chased (batted 2nd); "won by N runs"
// means the winning team defended a total (batted 1st). Returns null when the
// result text is missing or ambiguous (e.g. tied / no result / D-L).
function getBattedFirst(match: Match): 'team' | 'opponent' | null {
  if (!match.result || !match.result_summary) return null;
  const summary = match.result_summary.toLowerCase();
  const byWickets = /\bwicket/.test(summary);
  const byRuns = /\brun/.test(summary);
  if (!byWickets && !byRuns) return null;
  if (match.result === 'won') return byWickets ? 'opponent' : 'team';
  if (match.result === 'lost') return byWickets ? 'team' : 'opponent';
  return null;
}

/* ── Add to Calendar (.ics) — uses device local timezone ── */
const localTZ = Intl.DateTimeFormat().resolvedOptions().timeZone; // e.g. "America/Los_Angeles"
const pad2 = (n: number) => String(n).padStart(2, '0');
const toICS = (d: Date) =>
  `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;

function addToCalendar(match: Match) {
  if (!match.match_date) {
    toast.error('Cannot add TBD match to calendar');
    return;
  }
  const start = new Date(`${match.match_date}T${match.match_time}:00`);
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000); // 4 hour duration

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${getTeamName()}//Schedule//EN`,
    'BEGIN:VEVENT',
    `DTSTART;TZID=${localTZ}:${toICS(start)}`,
    `DTEND;TZID=${localTZ}:${toICS(end)}`,
    `SUMMARY:${getTeamCode()} vs ${match.opponent}`,
    `LOCATION:${match.venue}`,
    `DESCRIPTION:${match.overs} overs league match${match.notes ? ' — ' + match.notes : ''}`,
    `UID:${match.id}@${getTeamName().toLowerCase().replace(/\s+/g, '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `srm-vs-${match.opponent.toLowerCase().replace(/\s+/g, '-')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('Calendar event downloaded');
}

function addAllToCalendar(matches: Match[]) {
  // Filter out TBD matches — they have no date to schedule
  const schedulable = matches.filter((m) => m.match_date);
  if (schedulable.length === 0) {
    toast.error('No matches with confirmed dates to add');
    return;
  }
  const events = schedulable.map((match) => {
    const start = new Date(`${match.match_date}T${match.match_time}:00`);
    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
    return [
      'BEGIN:VEVENT',
      `DTSTART;TZID=${localTZ}:${toICS(start)}`,
      `DTEND;TZID=${localTZ}:${toICS(end)}`,
      `SUMMARY:${getTeamCode()} vs ${match.opponent}`,
      `LOCATION:${match.venue}`,
      `DESCRIPTION:20 overs league match${match.umpire ? ' | Umpires: ' + match.umpire : ''}${match.notes ? ' | ' + match.notes : ''}`,
      `UID:${match.id}@${getTeamName().toLowerCase().replace(/\s+/g, '')}`,
      'END:VEVENT',
    ].join('\r\n');
  });

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${getTeamName()}//Schedule//EN`,
    `X-WR-CALNAME:${getTeamCode()} League Schedule`,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'srm-spring-2026-schedule.ics';
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`${matches.length} matches added to calendar`);
}

async function exportSchedulePDF(upcoming: Match[], completed: Match[], seasonName: string) {
  try {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = doc.internal.pageSize.getWidth(); // 210mm
  const H = doc.internal.pageSize.getHeight(); // 297mm
  const M = 10;
  const TW = W - M * 2;
  let y = 0;

  type RGB = [number, number, number];
  const WHITE: RGB = [255, 255, 255];
  const BLACK: RGB = [30, 30, 30];
  const GRAY: RGB = [120, 120, 120];
  const LGRAY: RGB = [170, 170, 170];
  const GREEN: RGB = [22, 163, 74];
  const RED: RGB = [220, 38, 38];

  const txt = (s: string, x: number, yy: number, opts?: { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'center' | 'right' }) => {
    doc.setFontSize(opts?.size ?? 9);
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setTextColor(...(opts?.color ?? BLACK));
    doc.text(s, x, yy, { align: opts?.align ?? 'left' });
  };

  const fmtDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Date TBD';
  const fmtTime = (t: string) => { if (!t || !t.includes(':')) return ''; const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };

  const totalMatches = upcoming.length + completed.length;

  // ═══ BANNER ═══
  const bannerH = 28;
  for (let i = 0; i < bannerH; i++) {
    const t = i / bannerH;
    doc.setFillColor(Math.round(20 + t * 15), Math.round(50 + t * 30), Math.round(90 + t * 40));
    doc.rect(0, i, W, 1, 'F');
  }
  try {
    const logoUrl = getTeamLogoUrl();
    if (!logoUrl) throw new Error('no logo');
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    const b64 = await new Promise<string>((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(blob); });
    doc.addImage(b64, 'PNG', M, 5, 14, 14);
  } catch { /* skip */ }
  txt(getTeamName(), M + 18, 13, { size: 18, bold: true, color: WHITE });
  txt(seasonName || 'League Schedule', M + 18, 19, { size: 9, color: [255, 255, 230] });
  txt(`${totalMatches} Matches`, W - M, 13, { size: 10, bold: true, color: [255, 220, 180], align: 'right' });
  txt(`Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, W - M, 19, { size: 7, color: [220, 200, 170], align: 'right' });

  y = bannerH + 4;

  // ═══ Section header helper ═══
  const sectionHeader = (label: string, count: number) => {
    if (y + 12 > H - 18) { doc.addPage(); y = 10; }
    doc.setFillColor(240, 242, 248);
    doc.roundedRect(M, y, TW, 8, 2, 2, 'F');
    txt(label, M + 4, y + 5.5, { size: 9, bold: true, color: [27, 58, 107] });
    txt(`${count}`, W - M - 4, y + 5.5, { size: 8, bold: true, color: GRAY, align: 'right' });
    y += 11;
  };

  // ═══ Match row helper ═══
  const matchRow = (m: Match, idx: number, showResult: boolean) => {
    const hasResult = showResult && m.result;
    const cardH = (m.umpire ? 22 : 18) + (hasResult ? 6 : 0);
    if (y + cardH > H - 18) { doc.addPage(); y = 10; }

    if (idx % 2 === 0) {
      doc.setFillColor(248, 249, 252);
      doc.roundedRect(M, y, TW, cardH, 2, 2, 'F');
    }
    doc.setDrawColor(235, 235, 235);
    doc.setLineWidth(0.15);
    doc.line(M, y + cardH, W - M, y + cardH);

    const ha = m.is_home === true ? 'Home' : m.is_home === false ? 'Away' : '';
    const haC: RGB = m.is_home === true ? GREEN : m.is_home === false ? [37, 99, 235] : GRAY;
    const haBg: RGB = m.is_home === true ? [220, 252, 231] : [219, 234, 254];

    // Row 1: # + Opponent + H/A badge
    txt(String(idx + 1), M + 3, y + 6, { size: 8, color: GRAY });
    txt(`vs ${m.opponent}`, M + 12, y + 6, { size: 10, bold: true, color: BLACK });
    if (ha) {
      doc.setFontSize(6);
      const bw = doc.getTextWidth(ha) + 4;
      doc.setFillColor(...haBg);
      doc.roundedRect(W - M - bw - 2, y + 2.5, bw, 5, 1.5, 1.5, 'F');
      txt(ha, W - M - bw / 2 - 2, y + 6, { size: 6, bold: true, color: haC, align: 'center' });
    }

    // Row 2: Date · Time | Venue
    const time = fmtTime(m.match_time);
    txt(`${fmtDate(m.match_date)}${time ? ` · ${time}` : ''}  |  ${m.venue}`, M + 12, y + 12, { size: 8, color: GRAY });

    // Row 3: Umpires
    if (m.umpire) {
      txt(`Umpires: ${m.umpire}`, M + 12, y + 17.5, { size: 7, color: LGRAY });
    }

    // Row 4: Result (completed only)
    if (hasResult) {
      const rY = m.umpire ? y + 21.5 : y + 16;
      const resultColor: RGB = m.result === 'won' ? GREEN : m.result === 'lost' ? RED : GRAY;
      const resultLabel = m.result === 'won' ? 'WON' : m.result === 'lost' ? 'LOST' : m.result === 'draw' ? 'DRAW' : 'NR';
      txt(resultLabel, M + 12, rY, { size: 7, bold: true, color: resultColor });
      if (m.result_summary) {
        txt(m.result_summary, M + 28, rY, { size: 7, color: GRAY });
      } else if (m.team_score != null && m.opponent_score != null) {
        txt(`${m.team_score}${m.team_overs ? `/${m.team_overs}ov` : ''} — ${m.opponent_score}${m.opponent_overs ? `/${m.opponent_overs}ov` : ''}`, M + 28, rY, { size: 7, color: GRAY });
      }
    }

    y += cardH + 2;
  };

  // ═══ UPCOMING SECTION ═══
  if (upcoming.length > 0) {
    sectionHeader('Upcoming Matches', upcoming.length);
    upcoming.forEach((m, i) => matchRow(m, i, false));
  }

  // ═══ COMPLETED SECTION ═══
  if (completed.length > 0) {
    if (upcoming.length > 0) y += 2; // gap between sections
    sectionHeader('Completed Matches', completed.length);
    completed.forEach((m, i) => matchRow(m, i, true));
  }

  // ═══ FOOTER ═══
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.2);
    doc.line(M, H - 12, W - M, H - 12);
    txt('viberstoolkit.com/cricket/schedule', M, H - 7, { size: 7, color: [77, 187, 235] });
    txt('Designed by Bhaskar Mantrala', W / 2, H - 7, { size: 7, color: LGRAY, align: 'center' });
    txt(`Page ${i} of ${total}`, W - M, H - 7, { size: 7, color: LGRAY, align: 'right' });
  }
  doc.setPage(1);
  doc.link(M, H - 12, 50, 5, { url: 'https://viberstoolkit.com/cricket/schedule/' });

  // Share or download
  const fileName = `${getTeamCode()}_Schedule.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: `${getTeamCode()} League Schedule` });
  } else {
    doc.save(fileName);
    toast.success('Schedule PDF downloaded');
  }
  } catch (e) {
    if (e instanceof Error && (e.name === 'AbortError' || e.name === 'InvalidStateError')) return;
    throw e;
  }
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

function parseDateParts(dateStr: string | null) {
  if (!dateStr) {
    return {
      dayName: '',
      dayNum: 0,
      month: 'TBD',
      monthFull: 'TBD',
      year: 0,
      isTbd: true,
    };
  }
  const d = new Date(dateStr + 'T00:00:00');
  return {
    dayName: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    dayNum: d.getDate(),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    monthFull: d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase(),
    year: d.getFullYear(),
    isTbd: false,
  };
}

function groupByMonth(matches: Match[]): { label: string; matches: Match[] }[] {
  const groups: Record<string, Match[]> = {};
  for (const m of matches) {
    const { monthFull, year, isTbd } = parseDateParts(m.match_date);
    const key = isTbd ? 'DATE TBD' : `${monthFull} ${year}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  }
  // Put TBD group at the end
  const entries = Object.entries(groups);
  const tbdIdx = entries.findIndex(([label]) => label === 'DATE TBD');
  if (tbdIdx > 0) {
    const [tbdEntry] = entries.splice(tbdIdx, 1);
    entries.push(tbdEntry);
  }
  return entries.map(([label, matches]) => ({ label, matches }));
}

/* ── Season Record Summary ── */
function SeasonRecord({ completed }: { completed: Match[] }) {
  if (completed.length === 0) return null;
  const wins = completed.filter((m) => m.result === 'won').length;
  const losses = completed.filter((m) => m.result === 'lost').length;
  const draws = completed.filter((m) => m.result === 'draw').length;
  const noResult = completed.filter((m) => !m.result).length;
  const parts: Array<[number, string]> = [[wins, 'won'], [losses, 'lost']];
  if (draws > 0) parts.push([draws, 'tied']);
  if (noResult > 0) parts.push([noResult, 'no result']);

  return (
    <div className="flex items-baseline gap-3 px-1">
      <Text size="sm" color="muted">
        {parts.map(([n, word], i) => (
          <span key={word}>
            {i > 0 && ' · '}
            <span className="font-semibold tabular-nums text-[var(--text)]">{n}</span> {word}
          </span>
        ))}
      </Text>
      <Text size="sm" color="muted" tabular className="ml-auto">{completed.length} played</Text>
    </div>
  );
}

/* ── Countdown Block for Hero ── */
function CountdownBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-start">
      <span className="text-[34px] font-semibold leading-none tabular-nums tracking-tight text-[var(--text)]">
        {value}
      </span>
      <Text size="2xs" weight="medium" color="muted" className="mt-1.5">{label}</Text>
    </div>
  );
}

/* ── Next Match Hero Card ──
   A plain card, like every other card on the page. It leads by type size —
   the countdown is the biggest thing on screen — not by a coloured slab.
   Blue in this app means "tap to do something", and nothing here is that. */
function NextMatchHero({ match, isAdmin, onMenuOpen, openMenuId, menuBtnRef }: {
  match: Match;
  isAdmin: boolean;
  onMenuOpen: (id: string | null) => void;
  openMenuId: string | null;
  menuBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { dayName, dayNum, month } = parseDateParts(match.match_date);

  // Live countdown tick
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const freshCountdown = getCountdown(match.match_date, match.match_time);

  return (
    <div className="rounded-2xl relative" style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}>
      {isAdmin && (
        <button
          ref={openMenuId === match.id ? menuBtnRef : null}
          onClick={() => onMenuOpen(openMenuId === match.id ? null : match.id)}
          aria-label="Next match actions"
          className="absolute top-1.5 right-1.5 h-11 w-11 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] active:bg-[var(--hover-bg)] transition-colors z-20"
        >
          <EllipsisVertical size={16} />
        </button>
      )}

      <div className="p-4 sm:p-5">
        <Text as="p" size="xs" weight="semibold" color="muted" className="mb-1">Next match</Text>

        <div className="flex items-center gap-2 flex-wrap pr-8">
          <Text as="h2" size="xl" weight="bold" tracking="tight" className="leading-tight">
            vs {match.opponent}
          </Text>
          {match.is_home != null && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide"
              style={match.is_home
                ? { background: 'color-mix(in srgb, var(--green) 15%, transparent)', color: 'var(--credit-text)' }
                : { background: 'var(--fill)', color: 'var(--muted)' }}>
              {match.is_home ? 'Home' : 'Away'}
            </span>
          )}
        </div>

        {/* Countdown — show "Date TBD" when no date */}
        <div className="mt-4 mb-4">
          {freshCountdown.isTbd ? (
            <span className="text-[28px] font-semibold leading-none tracking-tight text-[var(--text)]">Date TBD</span>
          ) : (
            <div className="flex items-start gap-6">
              {freshCountdown.days > 0 && <CountdownBlock label="Days" value={freshCountdown.days} />}
              <CountdownBlock label="Hours" value={freshCountdown.hours} />
              <CountdownBlock label="Mins" value={freshCountdown.mins} />
            </div>
          )}
        </div>

        {/* Date / Time / Venue / Umpires — one grouped list under a hairline */}
        <div className="flex flex-col gap-1.5 pt-3 text-[13px] text-[var(--muted)]" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Clock size={14} aria-hidden className="flex-shrink-0" />
            <span>{match.match_date ? `${dayName} ${dayNum} ${month} · ${formatMatchTime(match.match_time)}` : 'Date and time to be confirmed'}</span>
          </div>
          <div className="flex items-start gap-2">
            <MapPin size={14} aria-hidden className="flex-shrink-0 mt-[3px]" />
            <span>{match.venue}</span>
          </div>
          {match.umpire && (
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0 mt-[2px]" aria-hidden><UmpireIcon size={14} /></span>
              <span>Umpires: {match.umpire}</span>
            </div>
          )}
        </div>

        {match.notes && (
          <Text as="p" size="xs" color="muted" className="mt-2">{match.notes}</Text>
        )}
      </div>
    </div>
  );
}

/* ── Timeline Date Block (left side of match card) ── */
function DateBlock({ dateStr, isFirst }: { dateStr: string | null; isFirst?: boolean }) {
  const { dayName, dayNum, month, isTbd } = parseDateParts(dateStr);

  if (isTbd) {
    return (
      <div className="flex flex-col items-center justify-center w-[52px] flex-shrink-0">
        <span
          className="text-[13px] font-black leading-none"
          style={{ color: 'var(--dim)' }}
        >
          TBD
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-[52px] flex-shrink-0">
      <Text size="2xs" weight="semibold" uppercase tracking="wider" color="muted">
        {dayName}
      </Text>
      <span
        className="text-[22px] font-bold leading-none mt-0.5 tabular-nums"
        style={{ color: 'var(--text)' }}
      >
        {dayNum}
      </span>
      <Text size="2xs" weight="semibold" uppercase tracking="wide" color="muted" className="mt-0.5">
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
        className="flex-1 rounded-2xl p-3.5 relative min-w-0"
        style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}
      >

        {isAdmin && (
          <button
            ref={openMenuId === match.id ? menuBtnRef : null}
            onClick={() => onMenuOpen(openMenuId === match.id ? null : match.id)}
            className="absolute top-1 right-1 h-11 w-11 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] active:bg-[var(--hover-bg)] transition-colors"
            aria-label="Match actions"
          >
            <EllipsisVertical size={15} />
          </button>
        )}

        <div className="pr-8">
          <Text as="p" size="md" weight="bold" className="sm:text-[15px] mb-1">
            vs {match.opponent}
          </Text>

          {/* Time and venue wrap as two whole units: never "7:30 / AM", and
              never a truncated venue — the field number at the end
              ("BaseBall 2") is the part players need. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium" style={{ color: 'var(--muted)' }}>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Clock size={14} aria-hidden className="flex-shrink-0" />
              {match.match_date ? formatMatchTime(match.match_time) : 'Time TBD'}
            </span>
            <span className="inline-flex items-start gap-1.5 min-w-0">
              <MapPin size={14} aria-hidden className="flex-shrink-0 mt-[3px]" />
              <span>{match.venue}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {match.is_home != null && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide"
                style={match.is_home
                  ? { background: 'color-mix(in srgb, var(--green) 15%, transparent)', color: 'var(--green)' }
                  // Neutral, not blue — Away is ordinary metadata, and blue
                  // is reserved for the umpiring "signed up" state.
                  : { background: 'color-mix(in srgb, var(--text) 8%, transparent)', color: 'var(--muted)' }
                }>
                {match.is_home ? 'Home' : 'Away'}
              </span>
            )}
            <span className="text-[12px] font-medium tabular-nums" style={{ color: 'var(--muted)' }}>
              {getCountdownSimple(match.match_date, match.match_time)}
            </span>
          </div>

          {match.umpire && (
            <Text as="p" size="xs" color="muted" className="mt-1.5">Umpires: {match.umpire}</Text>
          )}
          {match.notes && (
            <Text as="p" size="2xs" color="muted" className="mt-1">{match.notes}</Text>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Team avatar: our logo, or a neutral monogram for opponents ── */
function TeamAvatar({ name, isOurTeam }: { name: string; isOurTeam: boolean }) {
  const logoUrl = isOurTeam ? getTeamLogoUrl() : null;
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="h-7 w-7 rounded-full object-cover flex-shrink-0"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      />
    );
  }
  const initials = name
    .replace(/^MTCA\s+/i, '')
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
  // Neutral monogram — one colour per opponent read as a rainbow down the list.
  return (
    <div
      className="flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0 bg-[var(--fill)] text-[10px] font-semibold text-[var(--text)]"
      aria-hidden
    >
      {initials}
    </div>
  );
}

/* ── Completed Match Card ──
 *
 * The result comes FIRST: a Won/Lost badge and the margin head the card, so
 * the outcome is read before anything else. Then when and where, then the two
 * innings in batting order. Both teams stay in full ink — greying the loser
 * read as a disabled row — and the winner is marked by weight and a pointer
 * beside its score, the way a scoreboard does it. Win/loss is the one place
 * colour is used, because there it carries the meaning. The scorecard link is
 * the card's one action, so it is the one thing in blue.
 */
function CompletedMatchCard({ match, isAdmin, onMenuOpen, openMenuId, menuBtnRef, scorecardUrl, tossWinner, tossDecision }: {
  match: Match;
  isAdmin: boolean;
  onMenuOpen: (id: string | null) => void;
  openMenuId: string | null;
  menuBtnRef: React.RefObject<HTMLButtonElement | null>;
  scorecardUrl?: string;
  tossWinner?: string | null;
  tossDecision?: 'bat' | 'bowl' | null;
}) {
  const typeConfig = MATCH_TYPE_CONFIG[match.match_type];
  const isWin = match.result === 'won';
  const isLoss = match.result === 'lost';
  const isDraw = match.result === 'draw';

  // "MTCA Sunrisers Manteca won by 8 Wickets" → "8 wickets"
  let margin = '';
  if (match.result_summary) {
    const m = match.result_summary.match(/(?:won|lost) by\s+(.+?)\s*$/i);
    if (m && m[1]) margin = m[1].trim().replace(/\b(wickets?|runs?)\b/gi, (w) => w.toLowerCase());
  }
  const verdict = isWin ? 'Won' : isLoss ? 'Lost' : isDraw ? 'Tied' : 'No result';
  const verdictColor = isWin ? 'var(--credit-text)' : isLoss ? 'var(--danger-text)' : 'var(--muted)';
  const verdictBg = isWin || isLoss
    ? `color-mix(in srgb, ${verdictColor} 14%, transparent)`
    : 'var(--fill)';
  const opponent = match.opponent.replace(/^MTCA\s+/i, '');

  type ScoreRow = { name: string; score?: string; overs?: string; isOurTeam: boolean; won: boolean };
  const ourRow: ScoreRow = { name: getTeamName(), score: match.team_score, overs: match.team_overs, isOurTeam: true, won: isWin };
  const oppRow: ScoreRow = { name: opponent, score: match.opponent_score, overs: match.opponent_overs, isOurTeam: false, won: isLoss };
  const rows = getBattedFirst(match) === 'opponent' ? [oppRow, ourRow] : [ourRow, oppRow];
  const hasScores = Boolean(match.team_score && match.opponent_score);

  const share = async () => {
    if (!scorecardUrl) return;
    const title = `${getTeamName()} vs ${match.opponent}`;
    const scoreLine = hasScores ? `${getTeamName()} ${match.team_score} · ${match.opponent} ${match.opponent_score}` : '';
    const text = [match.result_summary, scoreLine].filter(Boolean).join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ url: scorecardUrl, title, text });
      } else {
        await navigator.clipboard.writeText(scorecardUrl);
        toast.success('Scorecard link copied');
      }
    } catch (err) {
      // Cancelling the share sheet throws AbortError — not an error.
      if ((err as Error).name !== 'AbortError') toast.error('Could not share link');
    }
  };

  return (
    <article
      className="relative rounded-2xl px-4 pt-3.5 pb-3.5"
      style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}
      aria-label={`${verdict}${margin ? ` by ${margin}` : ''} against ${opponent}, ${formatMatchDate(match.match_date)}`}
    >
      {isAdmin && (
        <button
          ref={openMenuId === match.id ? menuBtnRef : null}
          onClick={() => onMenuOpen(openMenuId === match.id ? null : match.id)}
          className="absolute top-1 right-1 h-11 w-11 flex items-center justify-center rounded-full cursor-pointer text-[var(--muted)] active:bg-[var(--hover-bg)] transition-colors"
          aria-label={`Actions for the match against ${opponent}`}
        >
          <EllipsisVertical size={16} />
        </button>
      )}

      <div className={'flex items-center gap-2 ' + (isAdmin ? 'pr-9' : '')}>
        <span
          className="inline-flex h-6 flex-shrink-0 items-center rounded-full px-2.5 text-[13px] font-semibold"
          style={{ background: verdictBg, color: verdictColor }}
        >
          {verdict}
        </span>
        {margin && (
          <span className="truncate text-[16px] font-semibold text-[var(--text)]">by {margin}</span>
        )}
      </div>
      <Text as="p" size="xs" color="muted" truncate className="mt-1.5">
        {formatMatchDate(match.match_date)}
        {match.venue ? ` · ${match.venue}` : ''}
        {match.match_type !== 'league' && typeConfig ? ` · ${typeConfig.label}` : ''}
      </Text>

      {hasScores ? (
        <div className="mt-3 flex flex-col gap-2.5">
          {rows.map((row) => (
            <div key={row.isOurTeam ? 'us' : 'them'} className="flex items-center gap-2.5">
              <TeamAvatar name={row.name} isOurTeam={row.isOurTeam} />
              <span className={'min-w-0 flex-1 truncate text-[15px] text-[var(--text)] ' + (row.won ? 'font-semibold' : 'font-normal')}>
                {row.name}
              </span>
              <span className={'text-[17px] tabular-nums text-[var(--text)] ' + (row.won ? 'font-bold' : 'font-normal')}>
                {row.score}
              </span>
              {/* Winner pointer — a scoreboard's mark, not a colour. Reserves
                  its width on both rows so the scores stay aligned. */}
              <span aria-hidden className="w-2 flex-shrink-0 text-[var(--text)]">
                {row.won && (
                  <svg width="7" height="9" viewBox="0 0 7 9"><path d="M7 0v9L0 4.5z" fill="currentColor" /></svg>
                )}
              </span>
              {row.overs && (
                <span className="w-11 flex-shrink-0 text-right text-[12px] tabular-nums text-[var(--muted)]">{row.overs} ov</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Text as="p" size="md" weight="semibold" className="mt-2">vs {opponent}</Text>
      )}

      {tossWinner && tossDecision && (
        <Text as="p" size="xs" color="muted" className="mt-3">
          {tossWinner.replace(/^MTCA\s+/i, '')} won the toss and chose to {tossDecision}
        </Text>
      )}

      {match.performers && match.performers.length > 0 && (
        <div className="mt-3 border-t border-[var(--border)] pt-2.5">
          <Text as="p" size="xs" weight="semibold" color="muted" className="mb-1">Top performers</Text>
          <ul className="flex flex-col gap-1">
            {match.performers.map((p) => (
              <li key={p.rank} className="flex items-baseline gap-2 text-[13px]">
                <span className="font-medium text-[var(--text)]">{p.name}</span>
                <span className="ml-auto tabular-nums text-[var(--muted)]">{p.stat}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {scorecardUrl && (
        <div className="-mb-1.5 mt-2.5 flex items-center justify-between border-t border-[var(--border)] pt-1">
          <a
            href={scorecardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="-ml-1 flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-[15px] font-medium text-[var(--cricket)] active:opacity-60 transition-opacity"
          >
            View scorecard
            <ExternalLink size={14} aria-hidden />
          </a>
          <button
            type="button"
            onClick={share}
            className="-mr-2.5 flex h-11 w-11 items-center justify-center rounded-full text-[var(--cricket)] active:bg-[var(--hover-bg)] transition-colors cursor-pointer"
            aria-label="Share scorecard link"
          >
            <Share size={19} aria-hidden />
          </button>
        </div>
      )}
    </article>
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
          <EllipsisVertical size={11} />
        </button>
      )}

      <div className="flex items-center gap-3 pr-8">
        <Trash2 size={18} style={{ color: 'var(--dim)', flexShrink: 0 }} />
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
    <div className="flex items-center gap-3 pb-2">
      <Text size="sm" weight="semibold" color="muted">
        {label === 'DATE TBD' ? 'Date to be confirmed' : label.charAt(0) + label.slice(1).toLowerCase()}
      </Text>
      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
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
  const {  currentTeamId, userTeams, isTeamAdmin } = useAuthStore();
  const isAdmin = isTeamAdmin();  // team admin OR global admin — matches the is_team_admin() gate the database itself uses
  const { selectedSeasonId, seasons } = useCricketStore();
  const selectedSeason = seasons.find((s) => s.id === selectedSeasonId);
  const seasonName = selectedSeason?.name ?? 'League Schedule';

  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  // Cricclubs scorecard URLs keyed by `${match_date}|${normalized_opponent}`.
  // Populated from cricclubs_matches so completed schedule cards can link to
  // the canonical scorecard. Empty Map until the lookup query resolves.
  const [cricclubsLookup, setCricclubsLookup] = useState<Map<string, CricclubsMeta>>(new Map());
  const router = useRouter();
  // ?tab= is the deep link (the menu's Matches › Upcoming / Completed); the
  // #hash is still read for older links (League Stats tiles → #completed).
  const urlTab = useSearchParams().get('tab');
  const linkedTab = urlTab === 'upcoming' || urlTab === 'completed' ? urlTab : null;
  const [activeTab, _setActiveTab] = useState<ScheduleTab>(() => {
    if (linkedTab) return linkedTab;
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '') as ScheduleTab;
      if (['upcoming', 'completed'].includes(hash)) return hash;
    }
    return 'upcoming';
  });
  const [seenLinkedTab, setSeenLinkedTab] = useState(linkedTab);
  if (linkedTab !== seenLinkedTab) {
    setSeenLinkedTab(linkedTab);
    if (linkedTab) _setActiveTab(linkedTab);
  }
  const setActiveTab = (tab: ScheduleTab) => {
    _setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `?tab=${tab}`);
    }
  };

  // Legacy #hash links can still arrive by back/forward or a typed URL.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'upcoming' || hash === 'completed') _setActiveTab(hash);
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  const [showForm, setShowForm] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deletingMatch, setDeletingMatch] = useState<{ id: string; opponent: string } | null>(null);
  const [permanentDeleting, setPermanentDeleting] = useState<{ id: string; opponent: string } | null>(null);
  const [recordingMatch, setRecordingMatch] = useState<Match | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  // NOTE on the removed Sync button: cricclubs.com blocks Apify's residential
  // proxy IPs (verified 2026-05-19 — 403 across all retries). The Edge
  // Function `?type=full-sync` route is still there but no longer surfaced
  // in the UI; the canonical scorecard sync path is the iPhone Scriptable
  // script at scripts/scriptable/cricclubs-sync.js, which uses the user's
  // home residential IP. If a working CF-passing proxy becomes available
  // later (Bright Data Web Unlocker, etc.), the button + dialog can be
  // restored from git history at commit 0c0df2e.

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

  // Fetch cricclubs metadata for this team and build a (date, opponent)
  // → CricclubsMeta lookup (scorecard URL + toss). Names normalize by
  // lowercasing + stripping the "MTCA " prefix since schedule entries may say
  // "Hawks" while cricclubs records "MTCA Hawks".
  useEffect(() => {
    if (!currentTeamId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const myTeam = userTeams.find((t) => t.team_id === currentTeamId);
    const cricclubsMyName = myTeam ? `MTCA ${myTeam.team_name}` : 'MTCA Sunrisers Manteca';
    const normalize = (s: string) => s.toLowerCase().replace(/^mtca\s+/i, '').trim();
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('cricclubs_matches')
        .select('match_date, team_a, team_b, scorecard_url, toss_winner, toss_decision')
        .eq('team_id', currentTeamId);
      if (cancelled) return;
      if (error || !data) {
        // Cricclubs sync may not have run yet, or RLS blocks; silently skip.
        setCricclubsLookup(new Map());
        return;
      }
      const map = new Map<string, CricclubsMeta>();
      for (const m of data as {
        match_date: string | null;
        team_a: string;
        team_b: string;
        scorecard_url: string | null;
        toss_winner: string | null;
        toss_decision: 'bat' | 'bowl' | null;
      }[]) {
        if (!m.match_date || !m.scorecard_url) continue;
        const opponent = m.team_a === cricclubsMyName ? m.team_b : m.team_a;
        map.set(`${m.match_date}|${normalize(opponent)}`, {
          scorecard_url: m.scorecard_url,
          toss_winner: m.toss_winner,
          toss_decision: m.toss_decision,
        });
      }
      setCricclubsLookup(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentTeamId, userTeams]);

  const getCricclubsMeta = useCallback(
    (match: Match): CricclubsMeta | undefined => {
      if (!match.match_date || !match.opponent) return undefined;
      const key = `${match.match_date}|${match.opponent.toLowerCase().replace(/^mtca\s+/i, '').trim()}`;
      return cricclubsLookup.get(key);
    },
    [cricclubsLookup],
  );

  const active = matches.filter((m) => !m.deleted_at);
  const trashed = matches.filter((m) => m.deleted_at)
    .sort((a, b) => new Date(b.deleted_at!).getTime() - new Date(a.deleted_at!).getTime());

  // Use local date (not UTC) to avoid timezone mismatch
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const upcoming = active
    // TBD matches (null date) are upcoming; dated matches compare against today
    .filter((m) => m.status === 'upcoming' && (m.match_date === null || m.match_date >= today))
    // Sort: dated matches by date ascending, TBD matches at the end
    .sort((a, b) => {
      if (!a.match_date && !b.match_date) return 0;
      if (!a.match_date) return 1;  // TBD goes to end
      if (!b.match_date) return -1;
      return new Date(a.match_date).getTime() - new Date(b.match_date).getTime();
    });

  const completed = active
    // Only completed if status is completed OR (upcoming with a past date that is NOT null)
    .filter((m) => m.status === 'completed' || (m.status === 'upcoming' && m.match_date !== null && m.match_date < today))
    .sort((a, b) => {
      // Both should have dates for completed, but guard anyway
      if (!a.match_date || !b.match_date) return 0;
      return new Date(b.match_date).getTime() - new Date(a.match_date).getTime();
    });

  const nextMatch = upcoming[0];
  const restUpcoming = upcoming.slice(1);
  const monthGroups = groupByMonth(restUpcoming);

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
        .insert({ season_id: selectedSeasonId, ...data, status: 'upcoming', team_id: currentTeamId })
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
        { label: 'Restore', icon: <ArchiveRestore size={15} />, color: 'var(--cricket)', onClick: () => handleRestore(m.id) },
        { label: 'Delete Forever', icon: <Trash2 size={15} />, color: 'var(--red)', onClick: () => setPermanentDeleting({ id: m.id, opponent: m.opponent }), dividerBefore: true },
      ];
    }

    // Record Result is only offered for practice matches. League match
    // results sync from cricclubs (via the iOS Shortcut + Edge Function),
    // and a manual override would create divergence — see the RICM
    // incident (2026-05-18) where date+result drift made the schedule
    // disagree with cricclubs truth.
    const isPractice = m.match_type === 'practice';
    // Add to Calendar only makes sense for matches that haven't happened yet —
    // a past match has nothing to remind the user about.
    const isUpcoming = m.status === 'upcoming';
    return [
      ...(isUpcoming ? [{ label: 'Add to Calendar', icon: <Calendar size={15} />, color: 'var(--text)', onClick: () => addToCalendar(m) }] : []),
      ...(isPractice ? [{ label: 'Record Result', icon: <MdScoreboard size={15} />, color: 'var(--cricket)', onClick: () => setRecordingMatch(m) }] : []),
      { label: 'Edit', icon: <Pencil size={15} />, color: 'var(--text)', onClick: () => { setEditingMatch(m); setShowForm(true); } },
    ];
  };


  /* Contextual navigation — belongs to the League Schedule content, directly
     under the section header. Stats is a sibling view that lives on its own
     route; the control routes there while Upcoming/Completed switch in-page. */
  const scheduleTabs = (
    <SegmentedControl
      ariaLabel="Schedule view"
      options={MATCH_TABS}
      active={activeTab}
      onChange={(key) => {
        if (key === 'stats') {
          router.push('/cricket/league-stats');
          return;
        }
        setActiveTab(key as ScheduleTab);
        setOpenMenu(null);
      }}
    />
  );

  /* ── Loading state ── */
  if (loading) {
    return (
      <>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--dim)] border-t-transparent" />
        </div>
      </>
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
      {/* Contextual view switcher — part of the page, not the dock */}
      {scheduleTabs}

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

      {/* Upcoming: action bar + season record */}
      {activeTab === 'upcoming' && upcoming.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
          {completed.length > 0 ? <SeasonRecord completed={completed} /> : <div />}
          {/* Page-wide actions (every upcoming match), so they sit under the
              hero rather than inside it. Gray, not blue: the FAB is this
              screen's one primary action. */}
          <div className="flex items-center gap-2">
            <Button variant="secondary" brand="cricket" size="md" className="h-11 px-3.5 gap-1.5"
              onClick={() => addAllToCalendar(upcoming)}>
              <CalendarPlus size={16} aria-hidden />
              Add to Calendar
            </Button>
            <Button variant="secondary" brand="cricket" size="md" className="h-11 px-3.5 gap-1.5"
              aria-label="Share schedule as PDF"
              onClick={() => exportSchedulePDF(upcoming, completed, seasonName).catch((e) => { console.error('[schedule] PDF export failed:', e); toast.error('Failed to generate PDF'); })}>
              <Share size={16} aria-hidden />
              Share
            </Button>
          </div>
        </div>
      )}


      {/* Tab content */}
      <div className="min-h-[200px]">
        {activeTab === 'upcoming' && (
          <>
            {restUpcoming.length > 0 ? (
              <div className="space-y-6">
                {monthGroups.map((group) => (
                  <div key={group.label}>
                    <MonthHeader label={group.label} />
                    <div className="space-y-3">
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
              <div className="space-y-5">
                {groupByMonth(completed).map((group) => (
                  <section key={group.label}>
                    <MonthHeader label={group.label} />
                    <div className="space-y-2.5">
                      {group.matches.map((m) => {
                        const meta = getCricclubsMeta(m);
                        return (
                          <CompletedMatchCard
                            key={m.id}
                            match={m}
                            isAdmin={isAdmin}
                            onMenuOpen={setOpenMenu}
                            openMenuId={openMenu}
                            menuBtnRef={menuBtnRef}
                            scorecardUrl={meta?.scorecard_url}
                            tossWinner={meta?.toss_winner ?? null}
                            tossDecision={meta?.toss_decision ?? null}
                          />
                        );
                      })}
                    </div>
                  </section>
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

      </div>

      {/* Match context menu — shared bottom-sheet ActionSheet, same items */}
      <ActionSheet
        open={openMenu !== null}
        onOpenChange={(o) => { if (!o) setOpenMenu(null); }}
        title="Match actions"
        {...(() => {
          const m = openMenu ? matches.find((x) => x.id === openMenu) : undefined;
          if (!m) return {};
          const result = m.result === 'won' ? 'Won' : m.result === 'lost' ? 'Lost' : m.result === 'draw' ? 'Draw' : null;
          return {
            heading: `vs ${m.opponent.replace(/^MTCA\s+/i, '')}`,
            detail: [formatMatchDate(m.match_date), result, m.venue || null].filter(Boolean).join(' · '),
          };
        })()}
        items={openMenu ? getMenuItems(openMenu) : []}
      />

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


      {/* FAB for admin — shared placement, see CricketFab */}
      {isAdmin && (
        <CricketFab
          onClick={() => { setEditingMatch(null); setShowForm(true); }}
          label="Add match"
        >
          <Plus size={24} />
        </CricketFab>
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
