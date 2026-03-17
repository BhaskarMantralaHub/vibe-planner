'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { PLAYER_ROLES, BATTING_STYLES, BOWLING_STYLES, SHIRT_SIZES } from '../lib/constants';
import type { CricketPlayer, PlayerRole, BattingStyle, BowlingStyle } from '@/types/cricket';
import { GiCricketBat, GiBaseballGlove, GiTennisBall } from 'react-icons/gi';
import { FaBullseye, FaStar, FaCrown, FaShieldAlt, FaEllipsisV } from 'react-icons/fa';
import { getSupabaseClient } from '@/lib/supabase/client';
import { MdEdit, MdDeleteOutline, MdSportsCricket } from 'react-icons/md';

/* ── Sorting ── */
const ROLE_ORDER: Record<string, number> = {
  'all-rounder': 2, batsman: 3, bowler: 4, keeper: 5,
};
function playerSort(a: CricketPlayer, b: CricketPlayer): number {
  const da = a.designation === 'captain' ? 0 : a.designation === 'vice-captain' ? 1 : 99;
  const db = b.designation === 'captain' ? 0 : b.designation === 'vice-captain' ? 1 : 99;
  if (da !== db) return da - db;
  const ra = ROLE_ORDER[a.player_role ?? ''] ?? 10;
  const rb = ROLE_ORDER[b.player_role ?? ''] ?? 10;
  return ra - rb;
}

/* ── Three-dot Card Menu (portal) ── */
function PlayerCardMenu({ anchorRef, onEdit, onDelete, onToggleAdmin, onClose }: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
  onDelete: () => void;
  onToggleAdmin: () => void;
  onClose: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const menuWidth = 150;
      const left = Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8);
      setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
    }
    const close = () => onClose();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[99]" onClick={onClose} />
      <div
        className="fixed z-[100] w-[150px] rounded-xl overflow-hidden shadow-2xl animate-[scaleIn_0.1s]"
        style={{ top: pos.top, left: pos.left, background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <button
          onClick={() => { onEdit(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors hover:bg-[var(--hover-bg)] text-left cursor-pointer"
          style={{ color: 'var(--text)' }}
        >
          <MdEdit size={15} style={{ color: 'var(--blue)' }} />
          Edit
        </button>
        <button
          onClick={() => { onToggleAdmin(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors hover:bg-[var(--hover-bg)] text-left cursor-pointer"
          style={{ color: 'var(--purple)' }}
        >
          <FaCrown size={13} style={{ color: 'var(--purple)' }} />
          Admin Access
        </button>
        <div className="border-t border-[var(--border)] my-0.5 mx-2" />
        <button
          onClick={() => { onDelete(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors hover:bg-[var(--hover-bg)] text-left cursor-pointer"
          style={{ color: 'var(--red)' }}
        >
          <MdDeleteOutline size={15} />
          Remove
        </button>
      </div>
    </>,
    document.body,
  );
}

/* ── Delete Confirmation (portal) ── */
function DeleteConfirm({ player, onConfirm, onCancel }: { player: CricketPlayer; onConfirm: () => void; onCancel: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        className="w-[340px] rounded-2xl p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(248,113,113,0.1)' }}>
            <MdDeleteOutline size={20} style={{ color: 'var(--red)' }} />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[var(--text)]">Remove Player</p>
            <p className="text-[13px] text-[var(--muted)]">Remove <b>{player.name}</b> from the team?</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 rounded-xl text-[13px] font-medium border border-[var(--border)] text-[var(--muted)] cursor-pointer hover:bg-[var(--hover-bg)] transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-[13px] font-medium bg-[var(--red)] text-white cursor-pointer hover:opacity-90 transition-all">
            Remove
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Role config ── */
const roleConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  batsman: { icon: <GiCricketBat size={13} />, label: 'Batsman', color: '#F59E0B' },
  bowler: { icon: <FaBullseye size={12} />, label: 'Bowler', color: '#3B82F6' },
  'all-rounder': { icon: <FaStar size={12} />, label: 'All-Rounder', color: '#D97706' },
  keeper: { icon: <GiBaseballGlove size={13} />, label: 'Keeper', color: '#16A34A' },
};

const JERSEY_COLORS = ['#F59E0B', '#3B82F6', '#16A34A', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#F97316'];

function getJerseyColor(jerseyNumber: number | null, index: number): string {
  if (jerseyNumber) return JERSEY_COLORS[jerseyNumber % JERSEY_COLORS.length];
  return JERSEY_COLORS[index % JERSEY_COLORS.length];
}

const battingIcon = () => <MdSportsCricket size={14} />;
const bowlingIcon = () => <GiTennisBall size={13} />;

/* ── Main Component ── */
export default function PlayerManager() {
  const { user } = useAuthStore();
  const { userAccess } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const { players, addPlayer, updatePlayer, removePlayer, showPlayerForm, setShowPlayerForm, editingPlayer, setEditingPlayer } = useCricketStore();
  const activePlayers = [...players.filter((p) => p.is_active)].sort(playerSort);

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deletingPlayer, setDeletingPlayer] = useState<CricketPlayer | null>(null);
  const [adminModal, setAdminModal] = useState<{ player: CricketPlayer; status: 'loading' | 'no-email' | 'no-account' | 'has-admin' | 'can-grant' } | null>(null);
  const [adminEmails, setAdminEmails] = useState<Set<string>>(new Set());

  // Load which player emails have admin access
  useEffect(() => {
    if (!isAdmin) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.from('profiles').select('email, access').then(({ data }: { data: { email: string; access: string[] }[] | null }) => {
      if (!data) return;
      const emails = new Set(
        data.filter((p) => p.access?.includes('admin')).map((p) => p.email.toLowerCase())
      );
      setAdminEmails(emails);
    });
  }, [isAdmin, adminModal]); // re-fetch after granting/revoking
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [designationConflict, setDesignationConflict] = useState<{ value: string; existingName: string; existingId: string } | null>(null);

  const [name, setName] = useState('');
  const [jersey, setJersey] = useState('');
  const [email, setEmail] = useState('');
  const [cricclubId, setCricclubId] = useState('');
  const [shirtSize, setShirtSize] = useState('');
  const [playerRole, setPlayerRole] = useState('');
  const [battingStyle, setBattingStyle] = useState('');
  const [bowlingStyle, setBowlingStyle] = useState('');
  const [designation, setDesignation] = useState('');

  const showBatting = ['batsman', 'all-rounder', 'keeper'].includes(playerRole);
  const showBowling = ['bowler', 'all-rounder'].includes(playerRole);

  const resetForm = () => {
    setName(''); setJersey(''); setEmail(''); setCricclubId(''); setShirtSize('');
    setPlayerRole(''); setBattingStyle(''); setBowlingStyle(''); setDesignation('');
    setEditingPlayer(null); setDesignationConflict(null);
  };

  const handleRoleChange = (role: string) => {
    const newRole = playerRole === role ? '' : role;
    setPlayerRole(newRole);
    if (!['batsman', 'all-rounder', 'keeper'].includes(newRole)) setBattingStyle('');
    if (!['bowler', 'all-rounder'].includes(newRole)) setBowlingStyle('');
  };

  const handleDesignation = (value: string) => {
    if (designation === value) { setDesignation(''); setDesignationConflict(null); return; }
    const existing = activePlayers.find((p) => p.designation === value && p.id !== editingPlayer);
    if (existing) {
      setDesignationConflict({ value, existingName: existing.name, existingId: existing.id });
    } else {
      setDesignation(value);
      setDesignationConflict(null);
    }
  };

  const confirmDesignationSwap = () => {
    if (!designationConflict) return;
    updatePlayer(designationConflict.existingId, { designation: null });
    setDesignation(designationConflict.value);
    setDesignationConflict(null);
  };

  const isFormValid = () => {
    if (!name.trim() || !playerRole) return false;
    if (showBatting && !battingStyle) return false;
    if (showBowling && !bowlingStyle) return false;
    return true;
  };

  const [formError, setFormError] = useState('');

  const handleSubmit = () => {
    if (!user || !isFormValid()) return;

    // Check for duplicate name
    const duplicate = activePlayers.find(
      (p) => p.name.toLowerCase() === name.trim().toLowerCase() && p.id !== editingPlayer
    );
    if (duplicate) {
      setFormError(`A player named "${duplicate.name}" already exists.`);
      return;
    }
    setFormError('');

    const data = {
      name: name.trim(), jersey_number: jersey ? Number(jersey) : null, phone: null,
      email: email.trim() || null, cricclub_id: cricclubId.trim() || null, shirt_size: shirtSize || null,
      player_role: (playerRole || null) as PlayerRole | null,
      batting_style: (showBatting ? battingStyle || null : null) as BattingStyle | null,
      bowling_style: (showBowling ? bowlingStyle || null : null) as BowlingStyle | null,
      designation: (designation || null) as 'captain' | 'vice-captain' | null,
    };
    if (editingPlayer) updatePlayer(editingPlayer, data);
    else addPlayer(user.id, data);
    resetForm(); setShowPlayerForm(false);
  };

  const handleAdminAccess = async (p: CricketPlayer) => {
    if (!p.email) {
      setAdminModal({ player: p, status: 'no-email' });
      return;
    }
    setAdminModal({ player: p, status: 'loading' });
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, access')
      .ilike('email', p.email!)
      .single();

    if (!profile) {
      setAdminModal({ player: p, status: 'no-account' });
      return;
    }

    const access: string[] = profile.access ?? [];
    if (access.includes('admin')) {
      setAdminModal({ player: p, status: 'has-admin' });
    } else {
      setAdminModal({ player: p, status: 'can-grant' });
    }
  };

  const grantAdmin = async () => {
    if (!adminModal?.player.email) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data: profile, error: fetchErr } = await supabase
      .from('profiles')
      .select('id, access')
      .ilike('email', adminModal.player.email)
      .single();

    if (fetchErr) { console.error('[cricket] grant admin fetch:', fetchErr); }
    if (!profile) return;
    const access: string[] = profile.access ?? [];
    if (!access.includes('admin')) {
      const { error: updateErr } = await supabase.from('profiles').update({ access: [...access, 'admin'] }).eq('id', profile.id);
      if (updateErr) { console.error('[cricket] grant admin update:', updateErr); }
    }
    setAdminModal(null);
  };

  const revokeAdmin = async () => {
    if (!adminModal?.player.email) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, access')
      .ilike('email', adminModal.player.email)
      .single();

    if (!profile) return;
    const access: string[] = profile.access ?? [];
    await supabase.from('profiles').update({ access: access.filter((a) => a !== 'admin') }).eq('id', profile.id);
    setAdminModal(null);
  };

  const handleEdit = (p: CricketPlayer) => {
    setEditingPlayer(p.id); setName(p.name); setJersey(p.jersey_number?.toString() ?? '');
    setEmail(p.email ?? ''); setCricclubId(p.cricclub_id ?? ''); setShirtSize(p.shirt_size ?? '');
    setPlayerRole(p.player_role ?? ''); setBattingStyle(p.batting_style ?? '');
    setBowlingStyle(p.bowling_style ?? ''); setDesignation(p.designation ?? '');
    setShowPlayerForm(true); setOpenMenu(null);
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-5 min-w-0 overflow-hidden">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-[15px] sm:text-[16px] font-semibold text-[var(--text)] min-w-0 truncate">
          Players <span className="text-[var(--muted)] font-normal">({activePlayers.length})</span>
        </h3>
        {isAdmin && (
          <button onClick={() => { resetForm(); setShowPlayerForm(!showPlayerForm); }}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[var(--orange)] to-[var(--red)] px-2.5 sm:px-3 py-1.5 text-[12px] sm:text-[13px] font-medium text-white cursor-pointer hover:opacity-90 transition-all flex-shrink-0 whitespace-nowrap">
            {showPlayerForm ? '✕ Close' : '＋ Add Player'}
          </button>
        )}
      </div>

      {/* ── Form (admin only) ── */}
      {isAdmin && showPlayerForm && (
        <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
          <div className="grid grid-cols-[1fr_72px] gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Name *</label>
              <input value={name} onChange={(e) => { setName(e.target.value); setFormError(''); }}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors"
                placeholder="Player name" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Jersey</label>
              <input type="number" value={jersey} onChange={(e) => setJersey(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors text-center"
                placeholder="#" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors"
              placeholder="player@email.com" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">CricClub ID</label>
            <input value={cricclubId} onChange={(e) => setCricclubId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors"
              placeholder="Optional" />
          </div>
          {/* Designation */}
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Designation</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => handleDesignation('captain')}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium cursor-pointer transition-all border"
                style={{ backgroundColor: designation === 'captain' ? '#D97706' : 'transparent', borderColor: designation === 'captain' ? '#D97706' : 'var(--border)', color: designation === 'captain' ? 'white' : 'var(--text)' }}>
                <FaCrown size={13} /> Captain
              </button>
              <button type="button" onClick={() => handleDesignation('vice-captain')}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium cursor-pointer transition-all border"
                style={{ backgroundColor: designation === 'vice-captain' ? '#6B7280' : 'transparent', borderColor: designation === 'vice-captain' ? '#6B7280' : 'var(--border)', color: designation === 'vice-captain' ? 'white' : 'var(--text)' }}>
                <FaShieldAlt size={12} /> Vice Captain
              </button>
            </div>
            {designationConflict && (
              <div className="mt-2 flex items-center gap-2 p-2.5 rounded-lg bg-[var(--orange)]/5 border border-[var(--orange)]/20">
                <span className="text-[12px] text-[var(--text)] flex-1"><b>{designationConflict.existingName}</b> is currently {designationConflict.value === 'captain' ? 'Captain' : 'Vice Captain'}. Reassign?</span>
                <button onClick={() => setDesignationConflict(null)} className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-[var(--muted)] border border-[var(--border)] cursor-pointer hover:bg-[var(--hover-bg)]">No</button>
                <button onClick={confirmDesignationSwap} className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-white bg-[var(--orange)] cursor-pointer hover:opacity-90">Yes</button>
              </div>
            )}
          </div>
          {/* Shirt Size */}
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Shirt Size</label>
            <div className="flex flex-wrap gap-1.5">
              {SHIRT_SIZES.map((s) => (
                <button key={s.key} type="button" onClick={() => setShirtSize(shirtSize === s.key ? '' : s.key)}
                  className="h-8 w-10 rounded-lg text-[12px] font-medium cursor-pointer transition-all border"
                  style={{ backgroundColor: shirtSize === s.key ? s.color : 'transparent', borderColor: shirtSize === s.key ? s.color : 'var(--border)', color: shirtSize === s.key ? 'white' : 'var(--muted)' }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {/* Role */}
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Role *</label>
            <div className="flex flex-wrap gap-1.5">
              {PLAYER_ROLES.map((r) => {
                const rc = roleConfig[r.key];
                return (
                  <button key={r.key} type="button" onClick={() => handleRoleChange(r.key)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium cursor-pointer transition-all border"
                    style={{ backgroundColor: playerRole === r.key ? rc?.color ?? 'var(--orange)' : 'transparent', borderColor: playerRole === r.key ? rc?.color ?? 'var(--orange)' : 'var(--border)', color: playerRole === r.key ? 'white' : 'var(--text)' }}>
                    {rc?.icon} {r.label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Batting + Bowling — conditional */}
          {(showBatting || showBowling) && (
            <div className={`grid gap-4 ${showBatting && showBowling ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {showBatting && (
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Batting *</label>
                  <div className="flex flex-col gap-1.5">
                    {BATTING_STYLES.map((s) => (
                      <button key={s.key} type="button" onClick={() => setBattingStyle(battingStyle === s.key ? '' : s.key)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium cursor-pointer transition-all border"
                        style={{ backgroundColor: battingStyle === s.key ? 'var(--blue)' : 'transparent', borderColor: battingStyle === s.key ? 'var(--blue)' : 'var(--border)', color: battingStyle === s.key ? 'white' : 'var(--text)' }}>
                        {battingIcon()} {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {showBowling && (
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Bowling *</label>
                  <div className="flex flex-col gap-1.5">
                    {BOWLING_STYLES.map((s) => (
                      <button key={s.key} type="button" onClick={() => setBowlingStyle(bowlingStyle === s.key ? '' : s.key)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium cursor-pointer transition-all border"
                        style={{ backgroundColor: bowlingStyle === s.key ? 'var(--green)' : 'transparent', borderColor: bowlingStyle === s.key ? 'var(--green)' : 'var(--border)', color: bowlingStyle === s.key ? 'white' : 'var(--text)' }}>
                        {bowlingIcon()} {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {formError && (
            <div className="rounded-lg border border-[var(--red)]/30 bg-[var(--red)]/10 px-3 py-2 text-[13px] text-[var(--red)]">
              {formError}
            </div>
          )}
          <button onClick={handleSubmit} disabled={!isFormValid() || !!designationConflict}
            className="w-full rounded-xl bg-gradient-to-r from-[var(--orange)] to-[var(--red)] px-4 py-3 text-[14px] font-semibold text-white cursor-pointer hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {editingPlayer ? '✓ Update Player' : '＋ Add Player'}
          </button>
        </div>
      )}

      {/* ── Player List ── */}
      {activePlayers.length === 0 ? (
        <p className="text-[14px] text-[var(--muted)] text-center py-8">No players yet</p>
      ) : (
        <div className="space-y-2">
          {activePlayers.map((p) => {
            const rc = roleConfig[p.player_role ?? ''];
            const isCaptain = p.designation === 'captain';
            const isVC = p.designation === 'vice-captain';
            const isPlayerAdmin = p.email ? adminEmails.has(p.email.toLowerCase()) : false;

            return (
              <div key={p.id} className="relative rounded-xl border bg-[var(--surface)] p-2.5 sm:p-3 overflow-hidden"
                style={{
                  borderColor: isCaptain ? '#D97706' : isVC ? '#6B7280' : isPlayerAdmin ? '#3B82F6' : 'var(--border)',
                  borderLeftWidth: (isCaptain || isVC || isPlayerAdmin) ? '4px' : '1px',
                }}>
                {/* Three-dot menu trigger (admin only) */}
                {isAdmin && (
                  <>
                    <button
                      ref={openMenu === p.id ? menuBtnRef : null}
                      data-menu-id={p.id}
                      onClick={() => setOpenMenu(openMenu === p.id ? null : p.id)}
                      className="absolute top-3 right-3 h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
                    >
                      <FaEllipsisV size={14} />
                    </button>

                    {openMenu === p.id && (
                      <PlayerCardMenu
                        anchorRef={menuBtnRef}
                        onEdit={() => handleEdit(p)}
                        onToggleAdmin={() => handleAdminAccess(p)}
                        onDelete={() => { setDeletingPlayer(p); setOpenMenu(null); }}
                        onClose={() => setOpenMenu(null)}
                      />
                    )}
                  </>
                )}

                {/* Player info */}
                <div className="flex items-center gap-2 sm:gap-3 pr-10">
                  <div className="flex-shrink-0 flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl font-bold text-[13px] sm:text-[14px]"
                    style={{
                      backgroundColor: '#F59E0B20',
                      color: '#D97706',
                      border: '2px solid #F59E0B40',
                    }}>
                    {p.jersey_number ? `#${p.jersey_number}` : '—'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                      <span className="text-[14px] sm:text-[15px] font-semibold text-[var(--text)] truncate max-w-[120px] sm:max-w-none">{p.name}</span>
                      {isCaptain && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-0.5" style={{ background: '#D9770615', color: '#D97706' }}>
                          <FaCrown size={10} /> C
                        </span>
                      )}
                      {isVC && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-0.5" style={{ background: '#6B728015', color: '#6B7280' }}>
                          <FaShieldAlt size={10} /> VC
                        </span>
                      )}
                      {rc && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-0.5" style={{ background: `${rc.color}20`, color: rc.color }}>
                          {rc.icon} {rc.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5 mt-1 sm:mt-1.5 flex-wrap">
                      {p.batting_style && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg shadow-sm"
                          style={{ background: 'color-mix(in srgb, var(--blue) 18%, transparent)', color: 'var(--blue)' }}>
                          {battingIcon()} {p.batting_style === 'right' ? 'Right Hand' : 'Left Hand'}
                        </span>
                      )}
                      {p.bowling_style && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg shadow-sm"
                          style={{ background: 'color-mix(in srgb, var(--green) 18%, transparent)', color: 'var(--green)' }}>
                          {bowlingIcon()} {p.bowling_style.charAt(0).toUpperCase() + p.bowling_style.slice(1)}
                        </span>
                      )}
                      {p.shirt_size && (() => {
                        const sizeColor = SHIRT_SIZES.find((s) => s.key === p.shirt_size)?.color ?? '#F59E0B';
                        return (
                          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-lg"
                            style={{ background: `${sizeColor}20`, color: sizeColor }}>
                            Size {p.shirt_size}
                          </span>
                        );
                      })()}
                      {p.cricclub_id && (
                        <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-lg"
                          style={{ background: 'var(--surface)', color: 'var(--dim)', border: '1px solid var(--border)' }}>
                          CC: {p.cricclub_id}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deletingPlayer && (
        <DeleteConfirm
          player={deletingPlayer}
          onConfirm={() => { removePlayer(deletingPlayer.id); setDeletingPlayer(null); }}
          onCancel={() => setDeletingPlayer(null)}
        />
      )}

      {/* Admin access modal */}
      {adminModal && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={() => setAdminModal(null)}
        >
          <div
            className="w-[360px] rounded-2xl p-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
                <FaCrown size={18} style={{ color: 'var(--purple)' }} />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-[var(--text)]">Admin Access</p>
                <p className="text-[13px] text-[var(--muted)]">{adminModal.player.name}</p>
              </div>
            </div>

            {adminModal.status === 'loading' && (
              <div className="flex justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--purple)] border-t-transparent" />
              </div>
            )}

            {adminModal.status === 'no-email' && (
              <div className="rounded-xl bg-[var(--orange)]/10 border border-[var(--orange)]/20 p-3 mb-4">
                <p className="text-[13px] text-[var(--text)]">This player doesn&apos;t have an email address. Add their email first to link them to an account.</p>
              </div>
            )}

            {adminModal.status === 'no-account' && (
              <div className="rounded-xl bg-[var(--orange)]/10 border border-[var(--orange)]/20 p-3 mb-4">
                <p className="text-[13px] text-[var(--text)]"><b>{adminModal.player.email}</b> is not registered with the cricket tool. Ask them to sign up first at <b>/cricket</b>.</p>
              </div>
            )}

            {adminModal.status === 'has-admin' && (
              <>
                <div className="rounded-xl bg-[var(--green)]/10 border border-[var(--green)]/20 p-3 mb-4">
                  <p className="text-[13px] text-[var(--text)]"><b>{adminModal.player.name}</b> already has admin access.</p>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setAdminModal(null)}
                    className="px-4 py-2 rounded-xl text-[13px] font-medium border border-[var(--border)] text-[var(--muted)] cursor-pointer hover:bg-[var(--hover-bg)]">
                    Close
                  </button>
                  <button onClick={revokeAdmin}
                    className="px-4 py-2 rounded-xl text-[13px] font-medium bg-[var(--red)] text-white cursor-pointer hover:opacity-90">
                    Revoke Admin
                  </button>
                </div>
              </>
            )}

            {adminModal.status === 'can-grant' && (
              <>
                <div className="rounded-xl bg-[var(--purple)]/10 border border-[var(--purple)]/20 p-3 mb-4">
                  <p className="text-[13px] text-[var(--text)]">Grant admin access to <b>{adminModal.player.name}</b>? They will be able to manage players, expenses, and seasons.</p>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setAdminModal(null)}
                    className="px-4 py-2 rounded-xl text-[13px] font-medium border border-[var(--border)] text-[var(--muted)] cursor-pointer hover:bg-[var(--hover-bg)]">
                    Cancel
                  </button>
                  <button onClick={grantAdmin}
                    className="px-4 py-2 rounded-xl text-[13px] font-medium bg-[var(--purple)] text-white cursor-pointer hover:opacity-90">
                    Grant Admin
                  </button>
                </div>
              </>
            )}

            {(adminModal.status === 'no-email' || adminModal.status === 'no-account') && (
              <div className="flex justify-end">
                <button onClick={() => setAdminModal(null)}
                  className="px-4 py-2 rounded-xl text-[13px] font-medium border border-[var(--border)] text-[var(--muted)] cursor-pointer hover:bg-[var(--hover-bg)]">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
