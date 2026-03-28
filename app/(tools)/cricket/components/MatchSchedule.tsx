'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { EmptyState, Text, CardMenu } from '@/components/ui';
import { FaEllipsisV } from 'react-icons/fa';
import { MdEdit, MdDeleteOutline, MdSportsCricket, MdScoreboard } from 'react-icons/md';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import MatchForm from './MatchForm';

/* ── Types ── */
interface Performer {
  rank: number;
  name: string;
  stat: string;
  type: 'batting' | 'bowling' | 'fielding';
}

export interface Match {
  id: string;
  opponent: string;
  match_date: string;
  match_time: string;
  venue: string;
  match_type: 'league' | 'practice';
  overs: number;
  status: 'upcoming' | 'completed';
  notes?: string;
  result?: 'won' | 'lost' | 'tied';
  team_score?: string;
  team_overs?: string;
  opponent_score?: string;
  opponent_overs?: string;
  result_summary?: string;
  performers?: Performer[];
}

/* ── Mock Data ── */

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
  if (diff <= 0) return 'Starting soon';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h away`;
  return `${hours}h away`;
}

// MatchMenu replaced by shared CardMenu

/* ── Delete Confirm ── */
function DeleteConfirm({ opponent, onConfirm, onCancel }: { opponent: string; onConfirm: () => void; onCancel: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onCancel}>
      <div className="w-[340px] rounded-2xl p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(248,113,113,0.1)' }}>
            <MdDeleteOutline size={20} style={{ color: 'var(--red)' }} />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[var(--text)]">Delete Match</p>
            <p className="text-[13px] text-[var(--muted)]">Remove match vs <b>{opponent}</b>?</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 rounded-xl text-[13px] font-medium border border-[var(--border)] text-[var(--muted)] cursor-pointer hover:bg-[var(--hover-bg)]">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-[13px] font-medium bg-[var(--red)] text-white cursor-pointer hover:opacity-90">
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Next Match Hero Card ── */
function NextMatchHero({ match }: { match: Match }) {
  const typeConfig = MATCH_TYPE_CONFIG[match.match_type];
  return (
    <div className="rounded-2xl p-4 sm:p-5 overflow-hidden relative"
      style={{ background: 'linear-gradient(135deg, #1B3A6B, #4DBBEB)' }}>
      {/* Decorative circle */}
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10"
        style={{ background: 'white' }} />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <Text size="2xs" weight="bold" uppercase tracking="wider" className="text-white/60">Next Match</Text>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', backdropFilter: 'blur(4px)' }}>
            {getCountdown(match.match_date, match.match_time)}
          </span>
        </div>

        <Text as="h2" size="xl" weight="bold" color="white" tracking="tight" className="sm:text-[22px] mb-1 leading-tight">
          vs {match.opponent}
        </Text>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[13px] text-white/75">
          <span>{formatMatchDate(match.match_date)} · {formatMatchTime(match.match_time)}</span>
          <span>·</span>
          <span>{match.venue}</span>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
            style={{ background: `${typeConfig.color}30`, color: 'white' }}>
            {typeConfig.label}
          </span>
          <span className="text-[12px] text-white/50">{match.overs} overs</span>
          {match.notes && (
            <span className="text-[12px] text-white/50">· {match.notes}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Upcoming Match Card ── */
function UpcomingCard({ match, isAdmin, onMenuOpen, openMenuId, menuBtnRef }: {
  match: Match;
  isAdmin: boolean;
  onMenuOpen: (id: string | null) => void;
  openMenuId: string | null;
  menuBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const typeConfig = MATCH_TYPE_CONFIG[match.match_type];
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4 overflow-hidden relative">
      {isAdmin && (
        <button
          ref={openMenuId === match.id ? menuBtnRef : null}
          onClick={() => onMenuOpen(openMenuId === match.id ? null : match.id)}
          className="absolute top-2 right-2 h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors">
          <FaEllipsisV size={12} />
        </button>
      )}

      <div className="flex items-start gap-3 pr-8">
        <div className="flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center"
          style={{ background: 'color-mix(in srgb, var(--cricket) 12%, transparent)', border: '1.5px solid color-mix(in srgb, var(--cricket) 25%, transparent)' }}>
          <MdSportsCricket size={20} style={{ color: 'var(--cricket)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Text as="p" size="md" weight="semibold" truncate className="sm:text-[15px]">
              vs {match.opponent}
            </Text>
            <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
              style={{ background: `${typeConfig.color}15`, color: typeConfig.color, border: `1px solid ${typeConfig.color}30` }}>
              {typeConfig.label}
            </span>
          </div>
          <Text as="p" size="xs" color="muted">
            {formatMatchDate(match.match_date)} · {formatMatchTime(match.match_time)} · {match.venue}
          </Text>
          {match.notes && (
            <Text as="p" size="2xs" color="dim" truncate className="mt-1">{match.notes}</Text>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Completed Match Card ── */
function CompletedCard({ match, isAdmin, onMenuOpen, openMenuId, menuBtnRef }: {
  match: Match;
  isAdmin: boolean;
  onMenuOpen: (id: string | null) => void;
  openMenuId: string | null;
  menuBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const typeConfig = MATCH_TYPE_CONFIG[match.match_type];
  const resultColor = match.result === 'won' ? 'var(--green)' : match.result === 'lost' ? 'var(--red)' : 'var(--muted)';
  const resultBg = match.result === 'won' ? 'rgba(74,222,128,0.1)' : match.result === 'lost' ? 'rgba(248,113,113,0.1)' : 'rgba(156,163,175,0.1)';
  const resultLabel = match.result === 'won' ? 'Won' : match.result === 'lost' ? 'Lost' : 'Tied';

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4 overflow-hidden relative"
      style={{ borderLeftWidth: '4px', borderLeftColor: resultColor }}>
      {isAdmin && (
        <button
          ref={openMenuId === match.id ? menuBtnRef : null}
          onClick={() => onMenuOpen(openMenuId === match.id ? null : match.id)}
          className="absolute top-2 right-2 h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors">
          <FaEllipsisV size={12} />
        </button>
      )}

      {/* Header: opponent + type + result badge */}
      <div className="flex items-center gap-2 mb-3 pr-8">
        <Text as="p" size="md" weight="semibold" truncate className="sm:text-[15px]">
          vs {match.opponent}
        </Text>
        <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
          style={{ background: `${typeConfig.color}15`, color: typeConfig.color, border: `1px solid ${typeConfig.color}30` }}>
          {typeConfig.label}
        </span>
        <span className="flex-shrink-0 ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
          style={{ background: resultBg, color: resultColor }}>
          {resultLabel}
        </span>
      </div>

      {/* Scoreboard */}
      {match.team_score && match.opponent_score && (
        <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Text size="xs" weight="bold" color="cricket" uppercase tracking="wide">SHM</Text>
              <div className="flex items-baseline gap-1.5">
                <Text size="lg" weight="bold" tabular>{match.team_score}</Text>
                <Text size="2xs" color="muted">({match.team_overs} ov)</Text>
              </div>
            </div>
            <div className="h-px" style={{ background: 'var(--border)' }} />
            <div className="flex items-center justify-between">
              <Text size="xs" weight="bold" color="muted" uppercase tracking="wide">{match.opponent.split(' ').map(w => w[0]).join('').slice(0, 3)}</Text>
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
        <div className="space-y-1.5">
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

      {/* Footer: date/venue */}
      <div className="mt-2.5 pt-2 border-t border-[var(--border)]/30">
        <Text as="p" size="2xs" color="muted">
          {formatMatchDate(match.match_date)} · {match.venue}
        </Text>
      </div>
    </div>
  );
}

/* ── Main Component ── */
export default function MatchSchedule() {
  const { userAccess } = useAuthStore();
  const isAdmin = userAccess.includes('admin');

  const [matches, setMatches] = useState<Match[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deletingMatch, setDeletingMatch] = useState<{ id: string; opponent: string } | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const upcoming = matches
    .filter((m) => m.status === 'upcoming')
    .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());

  const completed = matches
    .filter((m) => m.status === 'completed')
    .sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime());

  const nextMatch = upcoming[0];
  const restUpcoming = upcoming.slice(1);

  const handleAdd = (data: Omit<Match, 'id' | 'status'>) => {
    const newMatch: Match = {
      ...data,
      id: Date.now().toString(),
      status: 'upcoming',
    };
    setMatches((prev) => [...prev, newMatch]);
    setShowForm(false);
    toast.success(`Match vs ${data.opponent} scheduled`);
  };

  const handleEdit = (data: Omit<Match, 'id' | 'status'>) => {
    if (!editingMatch) return;
    setMatches((prev) =>
      prev.map((m) => m.id === editingMatch.id ? { ...m, ...data } : m)
    );
    setEditingMatch(null);
    setShowForm(false);
    toast.success('Match updated');
  };

  const handleDelete = (id: string) => {
    setMatches((prev) => prev.filter((m) => m.id !== id));
    setDeletingMatch(null);
    toast.success('Match deleted');
  };

  const handleRecordResult = () => {
    toast('Coming soon', { description: 'Result recording will be available in a future update.' });
  };

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
    <div className="space-y-4">
      {/* Next Match Hero */}
      {nextMatch && <NextMatchHero match={nextMatch} />}

      {/* Upcoming Matches */}
      {restUpcoming.length > 0 && (
        <div>
          <Text as="h3" size="md" weight="bold" color="muted" uppercase tracking="wider" className="mb-2 px-1">
            Upcoming ({restUpcoming.length})
          </Text>
          <div className="space-y-2">
            {restUpcoming.map((m) => (
              <UpcomingCard
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
      )}

      {/* Completed Matches */}
      {completed.length > 0 && (
        <div>
          <Text as="h3" size="md" weight="bold" color="muted" uppercase tracking="wider" className="mb-2 px-1">
            Completed ({completed.length})
          </Text>
          <div className="space-y-2">
            {completed.map((m) => (
              <CompletedCard
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
      )}

      {/* Portal-based menus */}
      {openMenu && (
        <CardMenu
          anchorRef={menuBtnRef}
          onClose={() => setOpenMenu(null)}
          width={170}
          items={[
            { label: 'Record Result', icon: <MdScoreboard size={15} />, color: 'var(--text)', onClick: () => handleRecordResult() },
            { label: 'Edit', icon: <MdEdit size={15} />, color: 'var(--text)', onClick: () => { const m = matches.find((m) => m.id === openMenu); if (m) { setEditingMatch(m); setShowForm(true); } } },
            { label: 'Delete', icon: <MdDeleteOutline size={15} />, color: 'var(--red)', onClick: () => { const m = matches.find((m) => m.id === openMenu); if (m) setDeletingMatch({ id: m.id, opponent: m.opponent }); }, dividerBefore: true },
          ]}
        />
      )}

      {/* Delete confirmation */}
      {deletingMatch && (
        <DeleteConfirm
          opponent={deletingMatch.opponent}
          onConfirm={() => handleDelete(deletingMatch.id)}
          onCancel={() => setDeletingMatch(null)}
        />
      )}

      {/* FAB for admin */}
      {isAdmin && (
        <button
          onClick={() => { setEditingMatch(null); setShowForm(true); }}
          className="fixed bottom-20 right-5 z-40 h-14 w-14 flex items-center justify-center rounded-full text-white cursor-pointer active:scale-95 transition-transform"
          style={{
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
    </div>
  );
}
