'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import { EmptyState, Text, CardMenu, Button, Badge, Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from '@/components/ui';
import { FaEllipsisV } from 'react-icons/fa';
import { MdEdit, MdDeleteOutline, MdSportsCricket, MdScoreboard, MdRestoreFromTrash, MdDeleteForever, MdEventNote, MdDoneAll } from 'react-icons/md';
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
  season_id?: string;
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
  if (diff <= 0) return 'Starting soon';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h away`;
  return `${hours}h away`;
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

/* ── Next Match Hero Card ── */
function NextMatchHero({ match, isAdmin, onMenuOpen, openMenuId, menuBtnRef }: {
  match: Match;
  isAdmin: boolean;
  onMenuOpen: (id: string | null) => void;
  openMenuId: string | null;
  menuBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const typeConfig = MATCH_TYPE_CONFIG[match.match_type];
  return (
    <div className="rounded-2xl p-4 sm:p-5 overflow-hidden relative"
      style={{ background: 'linear-gradient(135deg, #1B3A6B, #4DBBEB)' }}>
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10"
        style={{ background: 'white' }} />

      {isAdmin && (
        <button
          ref={openMenuId === match.id ? menuBtnRef : null}
          onClick={() => onMenuOpen(openMenuId === match.id ? null : match.id)}
          className="absolute top-3 right-3 h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg cursor-pointer text-white/60 hover:text-white hover:bg-white/10 transition-colors z-20"
        >
          <FaEllipsisV size={12} />
        </button>
      )}

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3 pr-8">
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

/* ── Match Card (unified for upcoming/completed/deleted) ── */
function MatchCard({ match, isAdmin, isDeleted, onMenuOpen, openMenuId, menuBtnRef }: {
  match: Match;
  isAdmin: boolean;
  isDeleted?: boolean;
  onMenuOpen: (id: string | null) => void;
  openMenuId: string | null;
  menuBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const typeConfig = MATCH_TYPE_CONFIG[match.match_type];
  const isPastUpcoming = match.status === 'upcoming' && !isDeleted;
  const resultColor = match.result === 'won' ? 'var(--green)' : match.result === 'lost' ? 'var(--red)' : 'var(--muted)';
  const resultBg = match.result === 'won' ? 'rgba(74,222,128,0.1)' : match.result === 'lost' ? 'rgba(248,113,113,0.1)' : 'rgba(156,163,175,0.1)';
  const resultLabel = match.result === 'won' ? 'Won' : match.result === 'lost' ? 'Lost' : match.result === 'tied' ? 'Tied' : null;

  return (
    <div
      className={`rounded-2xl border border-[var(--border)] p-3 sm:p-4 overflow-hidden relative ${isDeleted ? 'opacity-60' : ''}`}
      style={{
        background: isDeleted ? 'var(--surface)' : 'var(--card)',
        ...(resultLabel && !isDeleted ? { borderLeftWidth: '4px', borderLeftColor: resultColor } : {}),
      }}
    >
      {isAdmin && (
        <button
          ref={openMenuId === match.id ? menuBtnRef : null}
          onClick={() => onMenuOpen(openMenuId === match.id ? null : match.id)}
          className="absolute top-2 right-2 h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
        >
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
            <Text as="p" size="md" weight="semibold" truncate className={`sm:text-[15px] ${isDeleted ? 'line-through' : ''}`}>
              vs {match.opponent}
            </Text>
            <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
              style={{ background: `${typeConfig.color}15`, color: typeConfig.color, border: `1px solid ${typeConfig.color}30` }}>
              {typeConfig.label}
            </span>
            {resultLabel && !isDeleted && (
              <span className="flex-shrink-0 ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                style={{ background: resultBg, color: resultColor }}>
                {resultLabel}
              </span>
            )}
            {isPastUpcoming && !isDeleted && (
              <span className="flex-shrink-0 ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                style={{ background: 'rgba(156,163,175,0.1)', color: 'var(--muted)' }}>
                No Result
              </span>
            )}
          </div>
          <Text as="p" size="xs" color="muted">
            {formatMatchDate(match.match_date)} · {formatMatchTime(match.match_time)} · {match.venue}
          </Text>
          {match.notes && !isDeleted && (
            <Text as="p" size="2xs" color="dim" truncate className="mt-1">{match.notes}</Text>
          )}
        </div>
      </div>

      {/* Scoreboard (completed with scores) */}
      {!isDeleted && match.team_score && match.opponent_score && (
        <div className="rounded-xl p-3 mt-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
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

      {/* Performers (completed only) */}
      {!isDeleted && match.performers && match.performers.length > 0 && (
        <div className="space-y-1.5 mt-3">
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

      {/* Deleted timestamp */}
      {isDeleted && match.deleted_at && (
        <Text as="p" size="2xs" color="dim" className="mt-2">
          Deleted {formatDeletedAgo(match.deleted_at)}
        </Text>
      )}
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

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = active
    .filter((m) => m.status === 'upcoming' && m.match_date >= today)
    .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());

  const completed = active
    .filter((m) => m.status === 'completed' || (m.status === 'upcoming' && m.match_date < today))
    .sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime());

  const nextMatch = upcoming[0];
  const restUpcoming = upcoming.slice(1);

  /* ── Bottom tab config ── */
  const tabs: { key: ScheduleTab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'upcoming', label: 'Upcoming', icon: <MdEventNote size={18} />, count: upcoming.length },
    { key: 'completed', label: 'Completed', icon: <MdDoneAll size={18} />, count: completed.length },
    { key: 'deleted', label: 'Deleted', icon: <MdDeleteOutline size={18} />, count: trashed.length },
  ];

  /* ── Handlers (Supabase + localStorage fallback) ── */
  const handleAdd = async (data: Omit<Match, 'id' | 'status'>, keepOpen?: boolean) => {
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
          await supabase.from('cricket_schedule_matches').delete().in('id', trashedIds);
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

  const handleRecordResult = () => {
    toast('Coming soon', { description: 'Result recording will be available in a future update.' });
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
      { label: 'Record Result', icon: <MdScoreboard size={15} />, color: 'var(--text)', onClick: () => handleRecordResult() },
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
    <div className="space-y-4">
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
      <div className="space-y-2 min-h-[200px]">
        {activeTab === 'upcoming' && (
          <>
            {restUpcoming.length > 0 ? (
              restUpcoming.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  isAdmin={isAdmin}
                  onMenuOpen={setOpenMenu}
                  openMenuId={openMenu}
                  menuBtnRef={menuBtnRef}
                />
              ))
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
              completed.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  isAdmin={isAdmin}
                  onMenuOpen={setOpenMenu}
                  openMenuId={openMenu}
                  menuBtnRef={menuBtnRef}
                />
              ))
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
              <>
                {trashed.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    isAdmin={isAdmin}
                    isDeleted
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
              </>
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

      {/* Spacer for fixed bottom tab bar */}
      <div className="h-20" />
    </div>
  );
}
