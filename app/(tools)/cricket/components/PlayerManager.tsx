'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { PLAYER_ROLES, BATTING_STYLES, BOWLING_STYLES, SHIRT_SIZES } from '../lib/constants';
import type { CricketPlayer, PlayerRole, BattingStyle, BowlingStyle } from '@/types/cricket';
import { GiCricketBat, GiTennisBall, GiGloves, GiLightningTrio } from 'react-icons/gi';
import { FaCrown, FaShieldAlt, FaEllipsisV } from 'react-icons/fa';
import { getSupabaseClient } from '@/lib/supabase/client';
import { MdEdit, MdDeleteOutline, MdSportsCricket } from 'react-icons/md';

/* ── Sorting: logged-in user first, then alphabetical by name ── */
function playerSort(a: CricketPlayer, b: CricketPlayer, currentUserEmail?: string): number {
  if (currentUserEmail) {
    const aIsSelf = a.email?.toLowerCase() === currentUserEmail;
    const bIsSelf = b.email?.toLowerCase() === currentUserEmail;
    if (aIsSelf && !bIsSelf) return -1;
    if (bIsSelf && !aIsSelf) return 1;
  }
  return a.name.localeCompare(b.name);
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
const roleConfig: Record<string, { icon: React.ReactNode; label: string; color: string; desc: string }> = {
  batsman: { icon: <GiCricketBat size={15} />, label: 'Batsman', color: '#F59E0B', desc: 'Run scorer' },
  bowler: { icon: <GiTennisBall size={14} />, label: 'Bowler', color: '#3B82F6', desc: 'Wicket taker' },
  'all-rounder': { icon: <GiLightningTrio size={15} />, label: 'All-Rounder', color: '#D97706', desc: 'Bat & ball' },
  keeper: { icon: <GiGloves size={15} />, label: 'Keeper', color: '#16A34A', desc: 'Behind stumps' },
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
  const { players, addPlayer, updatePlayer, removePlayer, restorePlayer, showPlayerForm, setShowPlayerForm, editingPlayer, setEditingPlayer } = useCricketStore();
  const userEmail = user?.email?.toLowerCase();
  const myPlayer = players.find((p) => p.is_active && p.email?.toLowerCase() === userEmail);
  const isSelfEditing = !isAdmin && editingPlayer === myPlayer?.id;
  const activePlayers = [...players.filter((p) => p.is_active)].sort((a, b) => playerSort(a, b, userEmail));
  const removedPlayers = players.filter((p) => !p.is_active);
  const [showRemoved, setShowRemoved] = useState(false);

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deletingPlayer, setDeletingPlayer] = useState<CricketPlayer | null>(null);
  const [adminModal, setAdminModal] = useState<{ player: CricketPlayer; status: 'loading' | 'no-email' | 'no-account' | 'has-admin' | 'can-grant' } | null>(null);
  const [adminEmails, setAdminEmails] = useState<Set<string>>(new Set());
  const [signedUpEmails, setSignedUpEmails] = useState<Set<string>>(new Set());

  // Load admin emails from profiles + signed-up emails from auth.users via RPC
  useEffect(() => {
    if (!isAdmin) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Fetch admin emails from profiles (RLS: own row for regular admins, all for super admin)
    supabase.from('profiles').select('email, access').then(({ data }: { data: { email: string; access: string[] }[] | null }) => {
      if (!data) return;
      setAdminEmails(new Set(
        data.filter((p) => p.access?.includes('admin')).map((p) => p.email.toLowerCase())
      ));
    });

    // Fetch signed-up status via RPC (SECURITY DEFINER — bypasses RLS, checks auth.users)
    const playerEmails = activePlayers
      .map((p) => p.email?.toLowerCase())
      .filter(Boolean) as string[];
    if (playerEmails.length > 0) {
      supabase.rpc('get_signed_up_emails', { check_emails: playerEmails }).then(({ data }: { data: string[] | null }) => {
        if (!data) return;
        setSignedUpEmails(new Set((data as string[]).map((e) => e.toLowerCase())));
      });
    }
  }, [isAdmin, adminModal, activePlayers.length]); // re-fetch after granting/revoking or player changes
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [designationConflict, setDesignationConflict] = useState<{ value: string; existingName: string; existingId: string } | null>(null);

  const FORM_STORAGE_KEY = 'cricket_player_form_draft';

  const getSavedForm = () => {
    try {
      const saved = sessionStorage.getItem(FORM_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  };

  const draft = getSavedForm();
  const [name, setName] = useState(draft?.name ?? '');
  const [jersey, setJersey] = useState(draft?.jersey ?? '');
  const [email, setEmail] = useState(draft?.email ?? '');
  const [cricclubId, setCricclubId] = useState(draft?.cricclubId ?? '');
  const [shirtSize, setShirtSize] = useState(draft?.shirtSize ?? '');
  const [playerRole, setPlayerRole] = useState(draft?.playerRole ?? '');
  const [battingStyle, setBattingStyle] = useState(draft?.battingStyle ?? '');
  const [bowlingStyle, setBowlingStyle] = useState(draft?.bowlingStyle ?? '');
  const [designation, setDesignation] = useState(draft?.designation ?? '');

  // Restore modal open state + editing player after iOS Safari reload
  useEffect(() => {
    if (draft && (draft.name || draft.jersey || draft.email)) {
      setShowPlayerForm(true);
      if (draft.editingPlayer) setEditingPlayer(draft.editingPlayer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist form state to sessionStorage for iOS Safari survival
  useEffect(() => {
    if (showPlayerForm && (name || jersey || email || cricclubId || playerRole)) {
      sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify({
        name, jersey, email, cricclubId, shirtSize, playerRole,
        battingStyle, bowlingStyle, designation, editingPlayer,
      }));
    }
  }, [name, jersey, email, cricclubId, shirtSize, playerRole, battingStyle, bowlingStyle, designation, editingPlayer, showPlayerForm]);

  const showBatting = ['batsman', 'all-rounder', 'keeper'].includes(playerRole);
  const showBowling = ['bowler', 'all-rounder'].includes(playerRole);

  const resetForm = () => {
    setName(''); setJersey(''); setEmail(''); setCricclubId(''); setShirtSize('');
    setPlayerRole(''); setBattingStyle(''); setBowlingStyle(''); setDesignation('');
    setEditingPlayer(null); setDesignationConflict(null);
    sessionStorage.removeItem(FORM_STORAGE_KEY);
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

  // Lock body scroll when player form modal is open (position:fixed is the only reliable method on iOS Safari)
  useEffect(() => {
    if (!showPlayerForm) return;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      window.scrollTo(0, scrollY);
    };
  }, [showPlayerForm]);

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
    // Check for duplicate email
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail) {
      const emailDup = players.find(
        (p) => p.email?.trim().toLowerCase() === trimmedEmail && p.id !== editingPlayer
      );
      if (emailDup) {
        setFormError(`A player with email "${email.trim()}" already exists (${emailDup.name}).`);
        return;
      }
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

      {/* ── Form Modal (admin or self-edit) ── */}
      {(isAdmin || isSelfEditing) && showPlayerForm && createPortal(
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => { resetForm(); setShowPlayerForm(false); }} />

          {/* Modal — use top/bottom instead of max-h-[90vh] because vh units include iOS Safari chrome */}
          <div className="fixed inset-x-3 top-[3%] bottom-[3%] z-50 mx-auto max-w-md overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl animate-slide-in"
            style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-[18px] font-bold text-[var(--text)]">{editingPlayer ? 'Edit Player' : 'Add Player'}</h3>
              <button onClick={() => { resetForm(); setShowPlayerForm(false); }} className="text-[var(--muted)] hover:text-[var(--text)] cursor-pointer text-lg">✕</button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-[1fr_72px] gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Name *</label>
                  <input value={name} onChange={(e) => { setName(e.target.value); setFormError(''); }}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors"
                    placeholder="Player name" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Jersey</label>
                  <input type="number" value={jersey} onChange={(e) => setJersey(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors text-center"
                    placeholder="#" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors"
                  placeholder="player@email.com" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">CricClub ID</label>
                <input value={cricclubId} onChange={(e) => setCricclubId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors"
                  placeholder="Optional" />
              </div>
              {/* Designation (admin only) */}
              {isAdmin && <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Designation</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleDesignation('captain')}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium cursor-pointer transition-all border"
                    style={{ backgroundColor: designation === 'captain' ? '#D97706' : 'transparent', borderColor: designation === 'captain' ? '#D97706' : 'var(--border)', color: designation === 'captain' ? 'white' : 'var(--text)' }}>
                    <FaCrown size={13} /> Captain
                  </button>
                  <button type="button" onClick={() => handleDesignation('vice-captain')}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium cursor-pointer transition-all border"
                    style={{ backgroundColor: designation === 'vice-captain' ? '#D97706' : 'transparent', borderColor: designation === 'vice-captain' ? '#D97706' : 'var(--border)', color: designation === 'vice-captain' ? 'white' : 'var(--text)' }}>
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
              </div>}
              {/* Shirt Size */}
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Shirt Size</label>
                <div className="flex flex-wrap gap-1.5">
                  {SHIRT_SIZES.map((s) => (
                    <button key={s.key} type="button" onClick={() => setShirtSize(shirtSize === s.key ? '' : s.key)}
                      className="h-8 w-10 rounded-lg text-[12px] font-medium cursor-pointer transition-all border"
                      style={{ backgroundColor: shirtSize === s.key ? '#D97706' : 'transparent', borderColor: shirtSize === s.key ? '#D97706' : 'var(--border)', color: shirtSize === s.key ? 'white' : 'var(--muted)' }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Role — visual cards */}
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Role *</label>
                <div className="grid grid-cols-2 gap-2">
                  {PLAYER_ROLES.map((r) => {
                    const rc = roleConfig[r.key];
                    const isSelected = playerRole === r.key;
                    return (
                      <button key={r.key} type="button" onClick={() => handleRoleChange(r.key)}
                        className="flex items-center gap-2.5 rounded-xl p-2.5 cursor-pointer transition-all border-2 text-left"
                        style={{
                          backgroundColor: isSelected ? '#D9770615' : 'var(--surface)',
                          borderColor: isSelected ? '#D97706' : 'var(--border)',
                        }}>
                        <div className="flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center transition-all"
                          style={{
                            backgroundColor: isSelected ? '#D97706' : `${rc?.color}15`,
                            color: isSelected ? 'white' : rc?.color,
                          }}>
                          {rc?.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold leading-tight" style={{ color: isSelected ? '#D97706' : 'var(--text)' }}>{r.label}</p>
                          <p className="text-[10px] text-[var(--muted)] leading-tight mt-0.5">{rc?.desc}</p>
                        </div>
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
                            style={{ backgroundColor: battingStyle === s.key ? '#D97706' : 'transparent', borderColor: battingStyle === s.key ? '#D97706' : 'var(--border)', color: battingStyle === s.key ? 'white' : 'var(--text)' }}>
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
                            style={{ backgroundColor: bowlingStyle === s.key ? '#D97706' : 'transparent', borderColor: bowlingStyle === s.key ? '#D97706' : 'var(--border)', color: bowlingStyle === s.key ? 'white' : 'var(--text)' }}>
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
          </div>
        </>,
        document.body,
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
            const isSignedUp = isAdmin && !!p.email && signedUpEmails.has(p.email.toLowerCase());
            const isSelf = !isAdmin && p.id === myPlayer?.id;

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

                {/* Self-edit button for signed-up player's own card */}
                {isSelf && (
                  <button
                    onClick={() => handleEdit(p)}
                    className="absolute top-3 right-3 h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
                  >
                    <MdEdit size={16} />
                  </button>
                )}

                {/* Player info */}
                <div className="flex items-center gap-2.5 sm:gap-3 pr-10">
                  {/* Circular jersey badge — solid=signed up, dashed=pending */}
                  <div className="relative flex-shrink-0">
                    <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full font-extrabold text-[13px] sm:text-[14px]"
                      style={{
                        backgroundColor: `${rc?.color ?? '#F59E0B'}${isSignedUp ? '18' : '08'}`,
                        color: isSignedUp ? (rc?.color ?? '#D97706') : `${rc?.color ?? '#D97706'}90`,
                        border: `2.5px ${isSignedUp ? 'solid' : 'dashed'} ${rc?.color ?? '#F59E0B'}${isSignedUp ? '50' : '35'}`,
                      }}>
                      {p.jersey_number ? `#${p.jersey_number}` : p.name.charAt(0)}
                    </div>
                    {/* Status dot: green pulse = signed up, gray = pending invite */}
                    {isAdmin && (
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full border-2 border-[var(--surface)] ${isSignedUp ? 'bg-emerald-500' : 'bg-gray-400'}`}
                        title={isSignedUp ? 'Signed up' : 'Not yet signed up'}
                      >
                        {isSignedUp && (
                          <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-40" />
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Line 1: Name + designation */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[14px] sm:text-[15px] font-bold text-[var(--text)] truncate">{p.name}</span>
                      {isCaptain && (
                        <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-extrabold tracking-wide" style={{ color: '#D97706' }}>
                          <FaCrown size={9} /> C
                        </span>
                      )}
                      {isVC && (
                        <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-extrabold tracking-wide" style={{ color: '#6B7280' }}>
                          <FaShieldAlt size={9} /> VC
                        </span>
                      )}
                    </div>
                    {/* Line 2: Role · Batting · Bowling · Size — dot-separated */}
                    <p className="text-[12px] sm:text-[13px] text-[var(--muted)] mt-0.5 truncate">
                      {[
                        rc && <span key="role" style={{ color: rc.color, fontWeight: 600 }}>{rc.label}</span>,
                        p.batting_style && <span key="bat">{p.batting_style === 'right' ? 'Right Hand' : 'Left Hand'} Bat</span>,
                        p.bowling_style && <span key="bowl">{p.bowling_style.charAt(0).toUpperCase() + p.bowling_style.slice(1)}</span>,
                        p.shirt_size && <span key="size">Size {p.shirt_size}</span>,
                        p.cricclub_id && <span key="cc" className="text-[var(--dim)]">CC: {p.cricclub_id}</span>,
                      ].filter(Boolean).reduce<React.ReactNode[]>((acc, item, i) => {
                        if (i > 0) acc.push(<span key={`dot-${i}`} className="text-[var(--border)] mx-1">&middot;</span>);
                        acc.push(item);
                        return acc;
                      }, [])}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Past Players */}
      {isAdmin && removedPlayers.length > 0 && (
        <div className="mt-4 rounded-2xl border border-[var(--border)]/50 overflow-hidden">
          <button onClick={() => setShowRemoved(!showRemoved)}
            className="w-full flex items-center justify-between p-3 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors">
            <span className="text-[13px] font-semibold text-[var(--muted)]">Past Players ({removedPlayers.length})</span>
            <span className="text-[var(--muted)] text-[12px]">{showRemoved ? '▲' : '▼'}</span>
          </button>
          {showRemoved && (
            <div className="px-3 pb-3 space-y-2">
              {removedPlayers.map((p) => {
                const rc = roleConfig[p.player_role ?? ''];
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)]/50 bg-[var(--surface)] p-2.5">
                    <div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold"
                      style={{ backgroundColor: `${rc?.color ?? '#F59E0B'}10`, color: `${rc?.color ?? '#D97706'}60`, border: `1.5px solid ${rc?.color ?? '#F59E0B'}20` }}>
                      {p.jersey_number ? `#${p.jersey_number}` : p.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--muted)] truncate">{p.name}</p>
                      {rc && (
                        <span className="text-[10px] text-[var(--dim)]">{rc.label}</span>
                      )}
                    </div>
                    <button onClick={() => restorePlayer(p.id)}
                      className="flex-shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold cursor-pointer active:scale-95 transition-all"
                      style={{ background: 'var(--surface)', color: 'var(--green)', border: '1.5px solid var(--border)' }}>
                      Restore
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
