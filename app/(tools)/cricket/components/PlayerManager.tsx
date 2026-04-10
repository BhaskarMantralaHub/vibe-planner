'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { PLAYER_ROLES, BATTING_STYLES, BOWLING_STYLES, SHIRT_SIZES } from '../lib/constants';
import type { CricketPlayer, PlayerRole, BattingStyle, BowlingStyle } from '@/types/cricket';
import { GiTennisBall, GiGloves } from 'react-icons/gi';
import { Crown, ShieldCheck, EllipsisVertical, Shirt, Pencil, Trash2, Mail, Badge as BadgeIcon, Copy, Check, ChevronRight, Camera, X, UserPlus, UserX } from 'lucide-react';
import { MdSportsCricket } from 'react-icons/md';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import { compressPlayerImage } from '../lib/image';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { EmptyState, Text, CardMenu, Badge } from '@/components/ui';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import PlayerProfile from './PlayerProfile';

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
            <Trash2 size={20} style={{ color: 'var(--red)' }} />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[var(--text)]">Remove Player</p>
            <p className="text-[13px] text-[var(--muted)]">Remove <b>{player.name}</b> from the team?</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button onClick={onCancel} variant="secondary" size="sm">
            Cancel
          </Button>
          <Button onClick={onConfirm} variant="danger" size="sm">
            Remove
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Role config ── */
const roleConfig: Record<string, { icon: React.ReactNode; label: string; color: string; desc: string }> = {
  batsman: { icon: <MdSportsCricket size={15} />, label: 'Batsman', color: 'var(--cricket)', desc: 'Run scorer' },
  bowler: { icon: <GiTennisBall size={14} />, label: 'Bowler', color: '#3B82F6', desc: 'Wicket taker' },
  'all-rounder': { icon: <><MdSportsCricket size={14} /><GiTennisBall size={12} /></>, label: 'All-Rounder', color: 'var(--cricket-accent)', desc: 'Bat & ball' },
  keeper: { icon: <GiGloves size={15} />, label: 'Keeper', color: '#16A34A', desc: 'Behind stumps' },
};

const JERSEY_COLORS = ['var(--cricket)', '#3B82F6', '#16A34A', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#F97316'];

function getJerseyColor(jerseyNumber: number | null, index: number): string {
  if (jerseyNumber) return JERSEY_COLORS[jerseyNumber % JERSEY_COLORS.length];
  return JERSEY_COLORS[index % JERSEY_COLORS.length];
}

/// Mix a color with transparent at a given percentage (works with CSS variables and hex)
function colorAlpha(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

const battingIcon = () => <MdSportsCricket size={14} />;
const bowlingIcon = () => <GiTennisBall size={13} />;

/* ── Photo helpers ── */

async function uploadPlayerPhoto(file: File, userId: string, playerId: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const compressed = await compressPlayerImage(file);
  const path = `${userId}/${playerId}.jpg`;
  const { error } = await supabase.storage.from('player-photos').upload(path, compressed, {
    upsert: true, contentType: 'image/jpeg',
  });
  if (error) { console.error('[cricket] photo upload:', error); return null; }
  const { data } = supabase.storage.from('player-photos').getPublicUrl(path);
  // Append timestamp to bust cache after re-upload
  return `${data.publicUrl}?t=${Date.now()}`;
}

/* ── Main Component ── */
export default function PlayerManager() {
  const { user } = useAuthStore();
  const { userAccess } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const { players, addPlayer, updatePlayer, removePlayer, restorePlayer, showPlayerForm, setShowPlayerForm, editingPlayer, setEditingPlayer } = useCricketStore();
  const userEmail = user?.email?.toLowerCase();
  const myPlayer = players.find((p) => p.is_active && p.email?.toLowerCase() === userEmail);
  const isSelfEditing = !isAdmin && editingPlayer === myPlayer?.id;
  const rosterPlayers = [...players.filter((p) => p.is_active && !p.is_guest)].sort((a, b) => playerSort(a, b, userEmail));
  const guestPlayers = [...players.filter((p) => p.is_active && p.is_guest)].sort((a, b) => a.name.localeCompare(b.name));
  const removedPlayers = players.filter((p) => !p.is_active);
  // Keep activePlayers for backward compat (used in expense splits, etc.)
  const activePlayers = [...players.filter((p) => p.is_active)].sort((a, b) => playerSort(a, b, userEmail));
  const [showRemoved, setShowRemoved] = useState(false);
  const [showGuests, setShowGuests] = useState(false);
  const [promotingGuest, setPromotingGuest] = useState<CricketPlayer | null>(null);
  const [movingToGuest, setMovingToGuest] = useState<CricketPlayer | null>(null);
  const [deletingGuest, setDeletingGuest] = useState<CricketPlayer | null>(null);
  const [openGuestMenu, setOpenGuestMenu] = useState<string | null>(null);

  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deletingPlayer, setDeletingPlayer] = useState<CricketPlayer | null>(null);
  const [permanentDeleting, setPermanentDeleting] = useState<CricketPlayer | null>(null);
  const [adminModal, setAdminModal] = useState<{ player: CricketPlayer; status: 'loading' | 'no-email' | 'no-account' | 'has-admin' | 'can-grant' } | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<{ name: string; url: string } | null>(null);
  const [profilePlayer, setProfilePlayer] = useState<CricketPlayer | null>(null);
  const [adminEmails, setAdminEmails] = useState<Set<string>>(new Set());
  const [signedUpEmails, setSignedUpEmails] = useState<Set<string>>(new Set());

  // Admin emails + signed-up status — now loaded from dashboard RPC (no extra queries)
  const { adminUserIds: storeAdminUserIds, signedUpEmails: storeSignedUpEmails } = useCricketStore();
  useEffect(() => {
    if (!isAdmin) return;
    // Derive admin emails from store's adminUserIds
    const adminUids = new Set(storeAdminUserIds);
    setAdminEmails(new Set(
      activePlayers.filter(p => p.user_id && adminUids.has(p.user_id) && p.email)
        .map(p => p.email!.toLowerCase())
    ));
    setSignedUpEmails(new Set(storeSignedUpEmails.map((e: string) => e.toLowerCase())));
  }, [isAdmin, storeAdminUserIds, storeSignedUpEmails, activePlayers.length]);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const guestMenuBtnRef = useRef<HTMLButtonElement>(null);
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
  const [isGuestPlayer, setIsGuestPlayer] = useState(draft?.isGuestPlayer ?? false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Player autocomplete suggestions
  interface PlayerSuggestion { source: string; name: string; email: string | null; jersey_number: number | null; player_role: string | null; batting_style: string | null; bowling_style: string | null; shirt_size: string | null; cricclub_id: string | null; designation: string | null; user_id: string | null; }
  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [linkedUserId, setLinkedUserId] = useState<string | null>(null);
  const [linkedSource, setLinkedSource] = useState<string | null>(null); // 'member' | 'other_team' | null
  const isLinkedProfile = !!linkedUserId;
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestRequestRef = useRef(0);

  const fetchSuggestions = (query: string) => {
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    if (query.length < 2 || editingPlayer) { setSuggestions([]); setShowSuggestions(false); return; }
    suggestTimerRef.current = setTimeout(async () => {
      const requestId = ++suggestRequestRef.current;
      const supabase = getSupabaseClient();
      if (!supabase) return;
      try {
        const teamId = useAuthStore.getState().currentTeamId;
        const { data, error } = await supabase.rpc('suggest_players', { p_query: query, p_team_id: teamId });
        if (error || requestId !== suggestRequestRef.current) return; // stale or failed
        const items = (data ?? []) as PlayerSuggestion[];
        setSuggestions(items);
        setShowSuggestions(items.length > 0);
      } catch { /* network error — silently ignore */ }
    }, 300);
  };

  const applySuggestion = (s: PlayerSuggestion) => {
    setName(s.name);
    if (s.email != null) setEmail(s.email);
    if (s.jersey_number != null) setJersey(String(s.jersey_number));
    if (s.player_role != null) setPlayerRole(s.player_role);
    if (s.batting_style != null) setBattingStyle(s.batting_style);
    if (s.bowling_style != null) setBowlingStyle(s.bowling_style);
    if (s.shirt_size != null) setShirtSize(s.shirt_size);
    if (s.cricclub_id != null) setCricclubId(s.cricclub_id);
    if (s.designation != null) setDesignation(s.designation);
    if (s.user_id) setLinkedUserId(s.user_id);
    setLinkedSource(s.source);
    setShowSuggestions(false);
    setSuggestions([]);
  };

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
        battingStyle, bowlingStyle, designation, isGuestPlayer, editingPlayer,
      }));
    }
  }, [name, jersey, email, cricclubId, shirtSize, playerRole, battingStyle, bowlingStyle, designation, isGuestPlayer, editingPlayer, showPlayerForm]);

  const showBatting = ['batsman', 'all-rounder', 'keeper'].includes(playerRole);
  const showBowling = ['bowler', 'all-rounder'].includes(playerRole);

  const resetForm = () => {
    setName(''); setJersey(''); setEmail(''); setCricclubId(''); setShirtSize('');
    setPlayerRole(''); setBattingStyle(''); setBowlingStyle(''); setDesignation('');
    setIsGuestPlayer(false); setLinkedUserId(null); setLinkedSource(null);
    setPhotoFile(null); setPhotoPreview(null); setPhotoRemoved(false);
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
    if (!name.trim()) return false;
    // Guest players only need a name
    if (isGuestPlayer) return true;
    if (!playerRole) return false;
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

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || !isFormValid() || submitting) return;

    // Check for duplicate name on current team
    const duplicate = activePlayers.find(
      (p) => p.name.toLowerCase() === name.trim().toLowerCase() && p.id !== editingPlayer
    );
    if (duplicate) {
      setFormError(`A player named "${duplicate.name}" already exists on this team.`);
      return;
    }
    // If not linked, check if this player already exists (by email or cricclub ID)
    if (!isLinkedProfile && !editingPlayer) {
      const supabase = getSupabaseClient();
      if (supabase) {
        const teamId = useAuthStore.getState().currentTeamId;
        if (!teamId) { setFormError('Team not loaded yet. Please refresh.'); setSubmitting(false); return; }
        const checkEmail = email.trim().toLowerCase();
        // Check by email first (most reliable identifier)
        if (checkEmail) {
          const { data: emailMatch, error: emailErr } = await supabase
            .from('cricket_players')
            .select('name, team_id')
            .ilike('email', checkEmail)
            .neq('team_id', teamId)
            .eq('is_active', true)
            .limit(1)
            .single();
          if (emailErr) { console.warn('[player] email check failed:', emailErr.message); }
          if (emailMatch) {
            setFormError(`A player with this email already exists (${emailMatch.name}). Type their name and use the suggestion dropdown to link their profile.`);
            setSubmitting(false);
            return;
          }
        }
        // Check by CricClub ID
        if (cricclubId.trim()) {
          const { data: ccMatch, error: ccErr } = await supabase
            .from('cricket_players')
            .select('name, team_id')
            .eq('cricclub_id', cricclubId.trim())
            .neq('team_id', teamId)
            .eq('is_active', true)
            .limit(1)
            .single();
          if (ccErr) { console.warn('[player] cricclub check failed:', ccErr.message); }
          if (ccMatch) {
            setFormError(`CricClub ID "${cricclubId.trim()}" belongs to ${ccMatch.name} on another team. Type their name and use the suggestion dropdown to link their profile.`);
            setSubmitting(false);
            return;
          }
        }
        // Name matching removed — names vary (Bhaskar vs Bachi vs Bhaskar Bachi)
        // Email and CricClub ID are the reliable identifiers
      }
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
    setSubmitting(true);

    const data: Record<string, unknown> = {
      name: name.trim(), jersey_number: jersey ? Number(jersey) : null, phone: null,
      email: email.trim() || null, cricclub_id: cricclubId.trim() || null, shirt_size: shirtSize || null,
      player_role: (isGuestPlayer ? null : (playerRole || null)) as PlayerRole | null,
      batting_style: (isGuestPlayer ? null : (showBatting ? battingStyle || null : null)) as BattingStyle | null,
      bowling_style: (isGuestPlayer ? null : (showBowling ? bowlingStyle || null : null)) as BowlingStyle | null,
      designation: (isGuestPlayer ? null : (designation || null)) as 'captain' | 'vice-captain' | null,
      is_guest: isGuestPlayer,
      linked_user_id: linkedUserId,
    };

    // Handle photo: upload new, or clear if removed
    if (photoRemoved && !photoFile) {
      data.photo_url = null;
    }

    if (editingPlayer) {
      // Upload photo for existing player
      if (photoFile) {
        const url = await uploadPlayerPhoto(photoFile, user.id, editingPlayer);
        if (url) data.photo_url = url;
      }
      updatePlayer(editingPlayer, data);
    } else {
      // New player: add first, then upload photo with the real ID
      addPlayer(user.id, data as Parameters<typeof addPlayer>[1]);
      if (photoFile) {
        // Wait briefly for the server ID to come back, then upload
        setTimeout(async () => {
          const newPlayer = useCricketStore.getState().players.find(
            (p) => p.name === name.trim() && p.is_active
          );
          if (newPlayer) {
            const url = await uploadPlayerPhoto(photoFile, user.id, newPlayer.id);
            if (url) updatePlayer(newPlayer.id, { photo_url: url });
          }
        }, 1500);
      }
    }

    setSubmitting(false);
    // Toast handled by cricket-store after DB confirmation
    resetForm(); setShowPlayerForm(false);
  };

  const handleAdminAccess = async (p: CricketPlayer) => {
    if (!p.user_id) {
      setAdminModal({ player: p, status: 'no-account' });
      return;
    }
    setAdminModal({ player: p, status: 'loading' });
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const teamId = useAuthStore.getState().currentTeamId;
    if (!teamId) return;

    // Check team_members role (team-scoped, not global)
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('user_id', p.user_id)
      .eq('team_id', teamId)
      .single();

    if (!membership) {
      setAdminModal({ player: p, status: 'no-account' });
      return;
    }

    if (membership.role === 'admin' || membership.role === 'owner') {
      setAdminModal({ player: p, status: 'has-admin' });
    } else {
      setAdminModal({ player: p, status: 'can-grant' });
    }
  };

  const grantAdmin = async () => {
    if (!adminModal?.player.user_id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const teamId = useAuthStore.getState().currentTeamId;
    if (!teamId) return;

    // Update team_members role to 'admin' (team-scoped, not global)
    const { error } = await supabase.from('team_members')
      .update({ role: 'admin' })
      .eq('user_id', adminModal.player.user_id)
      .eq('team_id', teamId);

    if (error) { console.error('[cricket] grant team admin:', error); toast.error('Failed to grant admin'); }
    else { toast.success(`${adminModal.player.name} is now a team admin`); }
    setAdminModal(null);
  };

  const revokeAdmin = async () => {
    if (!adminModal?.player.user_id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const teamId = useAuthStore.getState().currentTeamId;
    if (!teamId) return;

    // Revert team_members role to 'player' (team-scoped)
    const { error } = await supabase.from('team_members')
      .update({ role: 'player' })
      .eq('user_id', adminModal.player.user_id)
      .eq('team_id', teamId);

    if (error) { console.error('[cricket] revoke team admin:', error); toast.error('Failed to revoke admin'); }
    else { toast.success(`${adminModal.player.name} is no longer a team admin`); }
    setAdminModal(null);
  };

  const handleEdit = (p: CricketPlayer) => {
    setEditingPlayer(p.id); setName(p.name); setJersey(p.jersey_number?.toString() ?? '');
    setEmail(p.email ?? ''); setCricclubId(p.cricclub_id ?? ''); setShirtSize(p.shirt_size ?? '');
    setPlayerRole(p.player_role ?? ''); setBattingStyle(p.batting_style ?? '');
    setBowlingStyle(p.bowling_style ?? ''); setDesignation(p.designation ?? '');
    setIsGuestPlayer(p.is_guest ?? false);
    setPhotoFile(null); setPhotoPreview(p.photo_url ?? null); setPhotoRemoved(false);
    setShowPlayerForm(true);
  };

  const handleCopy = (value: string, fieldKey: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 1500);
    const label = fieldKey.startsWith('email') ? 'Email' : fieldKey.startsWith('cc') ? 'CricClub ID' : 'Value';
    toast.success(`${label} copied`);
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-5 min-w-0 overflow-hidden">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Text as="h3" size="md" weight="semibold" truncate className="sm:text-[16px] min-w-0">
          Squad <Text color="muted" weight="normal">({rosterPlayers.length})</Text>
        </Text>
        {isAdmin && (
          <Button onClick={() => { resetForm(); setShowPlayerForm(!showPlayerForm); }}
            variant="primary" brand="cricket" size="sm" className="flex-shrink-0 whitespace-nowrap">
            {showPlayerForm ? '✕ Close' : '＋ Add Player'}
          </Button>
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
              <Text as="h3" size="lg" weight="bold" className="text-[18px]">{editingPlayer ? 'Edit Player' : 'Add Player'}</Text>
              <button onClick={() => { resetForm(); setShowPlayerForm(false); }} className="text-[var(--muted)] hover:text-[var(--text)] cursor-pointer text-lg">✕</button>
            </div>

            {/* Linked profile banner */}
            {isLinkedProfile && !editingPlayer && (
              <div className="mb-4 rounded-xl overflow-hidden border"
                style={{ borderColor: 'color-mix(in srgb, var(--green) 30%, transparent)' }}>
                <div className="flex items-center gap-2.5 px-3 py-2.5"
                  style={{ background: 'color-mix(in srgb, var(--green) 8%, transparent)' }}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--green)' }}>
                    <Check size={13} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <Text size="xs" weight="semibold" className="leading-tight">Found {name.split(' ')[0]} in your roster</Text>
                    <Text size="2xs" color="muted" className="leading-tight mt-0.5">Profile shared across teams. Assign jersey and designation below.</Text>
                  </div>
                </div>
              </div>
            )}

            {/* Linked profile: simplified form — only jersey + designation */}
            {isLinkedProfile && !editingPlayer ? (
              <div className="space-y-4">
                {/* Player profile card — matches PlayerProfile design */}
                {(() => {
                  const allPlayers = useCricketStore.getState().players;
                  const sourcePlayer = linkedUserId ? allPlayers.find(p => p.user_id === linkedUserId) : null;
                  const photoUrl = sourcePlayer?.photo_url ?? null;
                  const rc = roleConfig[playerRole ?? ''];
                  const roleColor = rc?.color ?? 'var(--cricket)';
                  const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

                  return (
                    <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
                      {/* Header — centered photo + name + badges */}
                      <div className="flex flex-col items-center pt-5 pb-3 px-5 rounded-t-2xl"
                        style={{ background: colorAlpha(roleColor, 6) }}>
                        {photoUrl ? (
                          <img src={photoUrl} alt={name}
                            className="h-16 w-16 rounded-full object-cover"
                            style={{ border: `3px solid ${colorAlpha(roleColor, 30)}` }} />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-full text-[20px] font-extrabold"
                            style={{ backgroundColor: colorAlpha(roleColor, 10), color: roleColor, border: `3px solid ${colorAlpha(roleColor, 25)}` }}>
                            {initials}
                          </div>
                        )}
                        <Text size="md" weight="bold" className="mt-2">{name}</Text>
                        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1.5">
                          {rc && (
                            <Badge size="sm" className="inline-flex items-center gap-1"
                              style={{ color: roleColor, background: colorAlpha(roleColor, 10) }}>
                              {rc.icon} {rc.label}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Skills */}
                      {(battingStyle || bowlingStyle || shirtSize) && (
                        <div className="px-4 py-3 flex flex-wrap gap-2">
                          {battingStyle && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px]"
                              style={{ background: colorAlpha(roleColor, 5), border: `1px solid ${colorAlpha(roleColor, 12)}` }}>
                              <MdSportsCricket size={14} style={{ color: roleColor }} />
                              <span className="text-[var(--muted)]">Bat</span>
                              <span className="font-semibold text-[var(--text)]">{battingStyle === 'right' ? 'Right' : 'Left'} Hand</span>
                            </div>
                          )}
                          {bowlingStyle && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px]"
                              style={{ background: colorAlpha(roleColor, 5), border: `1px solid ${colorAlpha(roleColor, 12)}` }}>
                              <GiTennisBall size={13} style={{ color: roleColor }} />
                              <span className="text-[var(--muted)]">Bowl</span>
                              <span className="font-semibold text-[var(--text)]">{bowlingStyle.charAt(0).toUpperCase() + bowlingStyle.slice(1)}</span>
                            </div>
                          )}
                          {shirtSize && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px]"
                              style={{ background: colorAlpha(roleColor, 5), border: `1px solid ${colorAlpha(roleColor, 12)}` }}>
                              <Shirt size={12} style={{ color: roleColor }} />
                              <span className="text-[var(--muted)]">Size</span>
                              <span className="font-semibold text-[var(--text)]">{shirtSize}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Contact */}
                      {(email || cricclubId) && (
                        <div className="px-4 pb-3 space-y-2">
                          {email && (
                            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                              <div className="flex-shrink-0 h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: colorAlpha(roleColor, 8) }}>
                                <Mail size={14} style={{ color: roleColor }} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <Text size="2xs" weight="semibold" color="muted" className="block text-[9px] uppercase tracking-wider">Email</Text>
                                <Text size="xs" weight="medium" className="block truncate">{email}</Text>
                              </div>
                              <button onClick={() => { navigator.clipboard.writeText(email); toast.success('Email copied'); }}
                                className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
                                title="Copy email">
                                <Copy size={13} />
                              </button>
                            </div>
                          )}
                          {cricclubId && (
                            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                              <div className="flex-shrink-0 h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: colorAlpha(roleColor, 8) }}>
                                <BadgeIcon size={14} style={{ color: roleColor }} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <Text size="2xs" weight="semibold" color="muted" className="block text-[9px] uppercase tracking-wider">CricClub ID</Text>
                                <Text size="xs" weight="semibold" className="block">{cricclubId}</Text>
                              </div>
                              <button onClick={() => { navigator.clipboard.writeText(cricclubId); toast.success('CricClub ID copied'); }}
                                className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
                                title="Copy CricClub ID">
                                <Copy size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Guest Player toggle */}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsGuestPlayer(!isGuestPlayer)}
                    className="w-full flex items-center justify-between rounded-xl p-3 cursor-pointer transition-all border"
                    style={{
                      backgroundColor: isGuestPlayer ? 'color-mix(in srgb, var(--cricket) 8%, transparent)' : 'var(--surface)',
                      borderColor: isGuestPlayer ? 'var(--cricket)' : 'var(--border)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Text size="sm" weight="medium">Guest Player</Text>
                      <Text size="2xs" color="dim">Practice / fill-in player</Text>
                    </div>
                    <div className={`w-10 h-5.5 rounded-full transition-all relative ${isGuestPlayer ? 'bg-[var(--cricket)]' : 'bg-[var(--border)]'}`}>
                      <div className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-all ${isGuestPlayer ? 'left-[22px]' : 'left-0.5'}`} />
                    </div>
                  </button>
                )}

                {/* Jersey number */}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Jersey Number</label>
                  <input type="number" value={jersey} onChange={(e) => setJersey(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
                    placeholder="e.g. 7" />
                </div>

                {/* Designation (admin only, not for guests) */}
                {isAdmin && !isGuestPlayer && (
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Designation</label>
                    <div className="flex gap-2">
                      {[{ key: 'captain', label: 'Captain', icon: <Crown size={12} /> }, { key: 'vice-captain', label: 'Vice Captain', icon: <ShieldCheck size={12} /> }].map((d) => (
                        <button key={d.key} type="button" onClick={() => setDesignation(designation === d.key ? '' : d.key)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium cursor-pointer transition-all border"
                          style={{
                            backgroundColor: designation === d.key ? 'var(--cricket-accent)' : 'transparent',
                            borderColor: designation === d.key ? 'var(--cricket-accent)' : 'var(--border)',
                            color: designation === d.key ? 'white' : 'var(--muted)',
                          }}>
                          {d.icon} {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Submit */}
                <button
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="w-full rounded-xl py-3 text-[15px] font-semibold text-white cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}>
                  {submitting ? 'Adding...' : '+ Add to Team'}
                </button>
              </div>
            ) : (

            <div className="space-y-4">
              {/* Photo upload — only for self-edit (signed-up player editing own card) */}
              {(isSelfEditing || (isAdmin && editingPlayer)) && (
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="relative h-20 w-20 rounded-full overflow-hidden cursor-pointer group"
                    onClick={() => photoInputRef.current?.click()}
                    style={{
                      background: photoPreview ? 'transparent' : 'var(--surface)',
                      border: `2px dashed ${photoPreview ? 'transparent' : 'var(--border)'}`,
                    }}
                  >
                    {photoPreview ? (
                      <img src={photoPreview} alt="Player" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex flex-col items-center justify-center text-[var(--muted)]">
                        <Camera size={24} />
                        <span className="text-[9px] font-semibold mt-0.5">Add Photo</span>
                      </div>
                    )}
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                      <Camera size={20} className="text-white" />
                    </div>
                  </div>
                  {photoPreview && (
                    <button
                      type="button"
                      onClick={() => { setPhotoFile(null); setPhotoPreview(null); setPhotoRemoved(true); }}
                      className="text-[11px] text-[var(--red)] font-medium cursor-pointer hover:underline flex items-center gap-0.5"
                    >
                      <X size={14} /> Remove photo
                    </button>
                  )}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setPhotoFile(file);
                        setPhotoPreview(URL.createObjectURL(file));
                        setPhotoRemoved(false);
                      }
                      e.target.value = '';
                    }}
                  />
                </div>
              )}

              <div className="relative">
              <div className="grid grid-cols-[1fr_72px] gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Name *</label>
                  <input value={name} onChange={(e) => { if (!isLinkedProfile) { setName(e.target.value); setFormError(''); fetchSuggestions(e.target.value); } }}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    readOnly={isLinkedProfile}
                    autoComplete="off"
                    className={`w-full rounded-lg border border-[var(--border)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none transition-colors ${
                      isLinkedProfile ? 'bg-[var(--surface)]/60 opacity-70 cursor-not-allowed' : 'bg-[var(--surface)] focus:border-[var(--cricket)]'
                    }`}
                    placeholder="Player name" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Jersey</label>
                  <input type="number" value={jersey} onChange={(e) => setJersey(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors text-center"
                    placeholder="#" />
                </div>
              </div>
              {/* Suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 z-50 mt-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] max-h-60 overflow-y-auto overflow-x-hidden"
                  style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08)' }}>
                  {suggestions.map((s, i) => (
                    <button
                      key={`${s.name}-${s.source}-${i}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applySuggestion(s)}
                      className="w-full flex items-center gap-3 px-3 py-3 text-left cursor-pointer active:bg-[var(--surface)] hover:bg-[var(--surface)] transition-colors border-l-[3px]"
                      style={{ borderLeftColor: s.source === 'member' ? 'var(--green)' : 'var(--blue)' }}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold text-[14px] shrink-0"
                        style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}>
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <span className="truncate text-[14px] font-semibold text-[var(--text)]">{s.name}</span>
                          {s.player_role && (
                            <span className="shrink-0 text-[11px] text-[var(--dim)] capitalize">{s.player_role.replace('-', ' ')}</span>
                          )}
                        </div>
                        {s.email && (
                          <p className="truncate text-[12px] text-[var(--muted)] mt-0.5">{s.email}</p>
                        )}
                      </div>
                      <svg className="h-4 w-4 shrink-0 text-[var(--dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
              </div>
              {/* Guest Player toggle (only for new players, not editing) */}
              {isAdmin && !editingPlayer && (
                <button
                  type="button"
                  onClick={() => setIsGuestPlayer(!isGuestPlayer)}
                  className="w-full flex items-center justify-between rounded-xl p-3 cursor-pointer transition-all border"
                  style={{
                    backgroundColor: isGuestPlayer ? 'color-mix(in srgb, var(--cricket) 8%, transparent)' : 'var(--surface)',
                    borderColor: isGuestPlayer ? 'var(--cricket)' : 'var(--border)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Text size="sm" weight="medium">Guest Player</Text>
                    <Text size="2xs" color="dim">Practice / fill-in player</Text>
                  </div>
                  <div className={`w-10 h-5.5 rounded-full transition-all relative ${isGuestPlayer ? 'bg-[var(--cricket)]' : 'bg-[var(--border)]'}`}>
                    <div className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-all ${isGuestPlayer ? 'left-[22px]' : 'left-0.5'}`} />
                  </div>
                </button>
              )}

              {!isGuestPlayer && <>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Email</label>
                <input type="email" value={email} onChange={(e) => { if (!isLinkedProfile) setEmail(e.target.value); }}
                  readOnly={isLinkedProfile}
                  className={`w-full rounded-lg border border-[var(--border)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none transition-colors ${
                    isLinkedProfile ? 'bg-[var(--surface)]/60 opacity-70 cursor-not-allowed' : 'bg-[var(--surface)] focus:border-[var(--cricket)]'
                  }`}
                  placeholder="player@email.com" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">CricClub ID</label>
                <input value={cricclubId} onChange={(e) => { if (!isLinkedProfile) setCricclubId(e.target.value); }}
                  readOnly={isLinkedProfile}
                  className={`w-full rounded-lg border border-[var(--border)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none transition-colors ${
                    isLinkedProfile ? 'bg-[var(--surface)]/60 opacity-70 cursor-not-allowed' : 'bg-[var(--surface)] focus:border-[var(--cricket)]'
                  }`}
                  placeholder="Optional" />
              </div>
              {/* Designation (admin only) */}
              {isAdmin && <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Designation</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleDesignation('captain')}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium cursor-pointer transition-all border"
                    style={{ backgroundColor: designation === 'captain' ? 'var(--cricket-accent)' : 'transparent', borderColor: designation === 'captain' ? 'var(--cricket-accent)' : 'var(--border)', color: designation === 'captain' ? 'white' : 'var(--text)' }}>
                    <Crown size={13} /> Captain
                  </button>
                  <button type="button" onClick={() => handleDesignation('vice-captain')}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium cursor-pointer transition-all border"
                    style={{ backgroundColor: designation === 'vice-captain' ? 'var(--cricket-accent)' : 'transparent', borderColor: designation === 'vice-captain' ? 'var(--cricket-accent)' : 'var(--border)', color: designation === 'vice-captain' ? 'white' : 'var(--text)' }}>
                    <ShieldCheck size={12} /> Vice Captain
                  </button>
                </div>
                {designationConflict && (
                  <div className="mt-2 flex items-center gap-2 p-2.5 rounded-lg bg-[var(--cricket)]/5 border border-[var(--cricket)]/20">
                    <span className="text-[12px] text-[var(--text)] flex-1"><b>{designationConflict.existingName}</b> is currently {designationConflict.value === 'captain' ? 'Captain' : 'Vice Captain'}. Reassign?</span>
                    <button onClick={() => setDesignationConflict(null)} className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-[var(--muted)] border border-[var(--border)] cursor-pointer hover:bg-[var(--hover-bg)]">No</button>
                    <button onClick={confirmDesignationSwap} className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-white bg-[var(--cricket)] cursor-pointer hover:opacity-90">Yes</button>
                  </div>
                )}
              </div>}
              {/* Shirt Size */}
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Shirt Size</label>
                <div className="flex flex-wrap gap-1.5">
                  {SHIRT_SIZES.map((s) => (
                    <button key={s.key} type="button" onClick={() => { if (!isLinkedProfile) setShirtSize(shirtSize === s.key ? '' : s.key); }}
                      disabled={isLinkedProfile}
                      className={`h-8 w-10 rounded-lg text-[12px] font-medium transition-all border ${isLinkedProfile ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                      style={{ backgroundColor: shirtSize === s.key ? 'var(--cricket-accent)' : 'transparent', borderColor: shirtSize === s.key ? 'var(--cricket-accent)' : 'var(--border)', color: shirtSize === s.key ? 'white' : 'var(--muted)' }}>
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
                      <button key={r.key} type="button" onClick={() => { if (!isLinkedProfile) handleRoleChange(r.key); }}
                        disabled={isLinkedProfile}
                        className={`flex items-center gap-2.5 rounded-xl p-2.5 transition-all border-2 text-left ${isLinkedProfile ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                        style={{
                          backgroundColor: isSelected ? 'color-mix(in srgb, var(--cricket-accent) 8%, transparent)' : 'var(--surface)',
                          borderColor: isSelected ? 'var(--cricket-accent)' : 'var(--border)',
                        }}>
                        <div className="flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center transition-all"
                          style={{
                            backgroundColor: isSelected ? 'var(--cricket-accent)' : colorAlpha(rc?.color ?? 'var(--cricket)', 8),
                            color: isSelected ? 'white' : rc?.color,
                          }}>
                          {rc?.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold leading-tight" style={{ color: isSelected ? 'var(--cricket-accent)' : 'var(--text)' }}>{r.label}</p>
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
                          <button key={s.key} type="button" onClick={() => { if (!isLinkedProfile) setBattingStyle(battingStyle === s.key ? '' : s.key); }}
                            disabled={isLinkedProfile}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all border ${isLinkedProfile ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                            style={{ backgroundColor: battingStyle === s.key ? 'var(--cricket-accent)' : 'transparent', borderColor: battingStyle === s.key ? 'var(--cricket-accent)' : 'var(--border)', color: battingStyle === s.key ? 'white' : 'var(--text)' }}>
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
                          <button key={s.key} type="button" onClick={() => { if (!isLinkedProfile) setBowlingStyle(bowlingStyle === s.key ? '' : s.key); }}
                            disabled={isLinkedProfile}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all border ${isLinkedProfile ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                            style={{ backgroundColor: bowlingStyle === s.key ? 'var(--cricket-accent)' : 'transparent', borderColor: bowlingStyle === s.key ? 'var(--cricket-accent)' : 'var(--border)', color: bowlingStyle === s.key ? 'white' : 'var(--text)' }}>
                            {bowlingIcon()} {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              </>}
              <Alert variant="error">{formError}</Alert>
              <Button onClick={handleSubmit} disabled={!isFormValid() || !!designationConflict}
                variant="primary" brand="cricket" size="lg" fullWidth loading={submitting}>
                {editingPlayer ? '✓ Update Player' : '＋ Add Player'}
              </Button>
            </div>
            )}
          </div>
        </>,
        document.body,
      )}

      {/* ── Player List ── */}
      {rosterPlayers.length === 0 ? (
        <EmptyState
          icon="🏏"
          title="No players yet"
          description="Build your squad by adding team members"
          brand="cricket"
          action={isAdmin ? { label: '+ Add Player', onClick: () => setShowPlayerForm(true) } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {rosterPlayers.map((p) => {
            const rc = roleConfig[p.player_role ?? ''];
            const isCaptain = p.designation === 'captain';
            const isVC = p.designation === 'vice-captain';
            const isPlayerAdmin = p.email ? adminEmails.has(p.email.toLowerCase()) : false;
            const isSignedUp = isAdmin && !!p.email && signedUpEmails.has(p.email.toLowerCase());
            const isSelf = !isAdmin && p.id === myPlayer?.id;

            const isExpanded = expandedPlayer === p.id;
            const hasSkills = p.batting_style || p.bowling_style || p.shirt_size;
            const hasContact = p.email || p.cricclub_id;
            const hasDetails = hasSkills || hasContact;
            const roleColor = rc?.color ?? 'var(--cricket)';
            const borderColor = isExpanded ? colorAlpha(roleColor, 25) : isCaptain ? 'var(--cricket-accent)' : isVC ? '#6B7280' : isPlayerAdmin ? '#3B82F6' : 'var(--border)';
            const hasThickLeft = isCaptain || isVC || isPlayerAdmin;

            return (
              <div key={p.id}
                className="rounded-2xl overflow-hidden transition-all duration-300"
                style={{
                  background: 'var(--surface)',
                  borderTop: `1.5px solid ${borderColor}`,
                  borderRight: `1.5px solid ${borderColor}`,
                  borderBottom: `1.5px solid ${borderColor}`,
                  borderLeft: `${hasThickLeft ? '4px' : '1.5px'} solid ${borderColor}`,
                  boxShadow: isExpanded ? `0 8px 32px ${colorAlpha(roleColor, 8)}, 0 2px 8px rgba(0,0,0,0.08)` : 'none',
                }}>
                {/* Clickable header area */}
                <div
                  className="relative p-3 sm:p-3.5 cursor-pointer transition-colors hover:bg-[var(--hover-bg)]"
                  onClick={() => hasDetails && setExpandedPlayer(isExpanded ? null : p.id)}
                >
                  {/* Three-dot menu trigger (admin only) */}
                  {isAdmin && (
                    <>
                      <button
                        ref={openMenu === p.id ? menuBtnRef : null}
                        data-menu-id={p.id}
                        onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === p.id ? null : p.id); }}
                        className="absolute top-3 right-3 h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors z-10"
                      >
                        <EllipsisVertical size={14} />
                      </button>

                      {openMenu === p.id && (
                        <CardMenu
                          anchorRef={menuBtnRef}
                          onClose={() => setOpenMenu(null)}
                          items={(() => {
                            const isMe = p.id === myPlayer?.id;
                            const items = [
                              { label: 'Edit', icon: <Pencil size={15} />, color: 'var(--text)', onClick: () => handleEdit(p) },
                              ...(isMe ? [
                                { label: 'Leave Team', icon: <UserX size={15} />, color: 'var(--red)', onClick: () => setPermanentDeleting(p), dividerBefore: true },
                              ] : []),
                              ...(!isMe ? [
                                { label: 'Admin Access', icon: <Crown size={13} />, color: 'var(--toolkit)', onClick: () => handleAdminAccess(p) },
                                { label: 'Move to Guest', icon: <BadgeIcon size={15} />, color: 'var(--muted)', onClick: () => setMovingToGuest(p) },
                                { label: 'Remove', icon: <Trash2 size={15} />, color: 'var(--red)', onClick: () => setDeletingPlayer(p), dividerBefore: true },
                                ...(p.user_id ? [{ label: 'Delete Permanently', icon: <UserX size={15} />, color: 'var(--red)', onClick: () => setPermanentDeleting(p) }] : []),
                              ] : []),
                            ];
                            return items;
                          })()}
                        />
                      )}
                    </>
                  )}

                  {/* Self-edit button */}
                  {isSelf && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEdit(p); }}
                      className="absolute top-3 right-3 h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors z-10"
                    >
                      <Pencil size={16} />
                    </button>
                  )}

                  <div className="flex items-center gap-3 pr-10">
                    {/* Jersey badge or photo */}
                    <div className="relative flex-shrink-0">
                      {p.photo_url ? (
                        <>
                          <img
                            src={p.photo_url}
                            alt={p.name}
                            className="h-12 w-12 sm:h-13 sm:w-13 rounded-full object-cover transition-all duration-300 cursor-pointer"
                            style={{
                              border: `2.5px solid ${colorAlpha(roleColor, isSignedUp ? 30 : 20)}`,
                              boxShadow: isExpanded ? `0 0 0 3px ${colorAlpha(roleColor, 6)}` : 'none',
                            }}
                            onClick={(e) => { e.stopPropagation(); setLightboxPhoto({ name: p.name, url: p.photo_url! }); }}
                          />
                          {p.jersey_number && (
                            <span
                              className="absolute -bottom-1 -left-1 flex items-center justify-center rounded-full text-[9px] font-bold text-white"
                              style={{ width: 22, height: 22, background: roleColor, border: '2px solid var(--surface)' }}
                            >
                              #{p.jersey_number}
                            </span>
                          )}
                        </>
                      ) : (
                        <div className="flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center rounded-full font-extrabold text-[14px] sm:text-[15px] transition-all duration-300"
                          style={{
                            backgroundColor: colorAlpha(roleColor, isSignedUp ? 10 : 5),
                            color: isSignedUp ? roleColor : colorAlpha(roleColor, 55),
                            border: `2.5px ${isSignedUp ? 'solid' : 'dashed'} ${colorAlpha(roleColor, isSignedUp ? 30 : 20)}`,
                            boxShadow: isExpanded ? `0 0 0 3px ${colorAlpha(roleColor, 6)}` : 'none',
                          }}>
                          {p.jersey_number ? `#${p.jersey_number}` : p.name.charAt(0)}
                        </div>
                      )}
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
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Text
                          size="md" weight="bold" truncate
                          className="sm:text-[16px] hover:underline decoration-[var(--cricket)]/40 underline-offset-2 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); setProfilePlayer(p); }}
                        >{p.name}</Text>
                        {isCaptain && (
                          <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-extrabold tracking-wider" style={{ color: 'var(--cricket-accent)', background: 'color-mix(in srgb, var(--cricket-accent) 7%, transparent)' }}>
                            <Crown size={8} /> C
                          </span>
                        )}
                        {isVC && (
                          <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-extrabold tracking-wider" style={{ color: '#6B7280', background: '#6B728012' }}>
                            <ShieldCheck size={8} /> VC
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {/* Role chip */}
                        {rc && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                            style={{ color: roleColor, background: colorAlpha(roleColor, 7) }}>
                            {rc.icon} {rc.label}
                          </span>
                        )}
                        {p.batting_style && (
                          <span className="text-[11px] text-[var(--muted)]">{p.batting_style === 'right' ? 'Right' : 'Left'} Hand</span>
                        )}
                        {/* Chevron */}
                        {hasDetails && (
                          <ChevronRight
                            size={16}
                            className="flex-shrink-0 text-[var(--muted)] transition-transform duration-300 ml-auto"
                            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Expanded Details ── */}
                <div
                  className="overflow-hidden transition-all duration-300 ease-out"
                  style={{ maxHeight: isExpanded ? '300px' : '0px', opacity: isExpanded ? 1 : 0 }}
                >
                  <div className="px-3 sm:px-4 pb-3.5">
                    {/* Divider with role-colored accent */}
                    <div className="relative h-px mb-3">
                      <div className="absolute inset-0" style={{ background: 'var(--border)', opacity: 0.5 }} />
                      <div className="absolute left-0 top-0 h-full w-12 rounded-full" style={{ background: roleColor, opacity: 0.6 }} />
                    </div>

                    {/* Skills row — horizontal chips */}
                    {hasSkills && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {p.batting_style && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px]"
                            style={{ background: colorAlpha(roleColor, 5), border: `1px solid ${colorAlpha(roleColor, 10)}` }}>
                            <MdSportsCricket size={14} style={{ color: roleColor }} />
                            <span className="text-[var(--muted)]">Bat</span>
                            <span className="font-semibold text-[var(--text)]">{p.batting_style === 'right' ? 'Right' : 'Left'}</span>
                          </div>
                        )}
                        {p.bowling_style && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px]"
                            style={{ background: colorAlpha(roleColor, 5), border: `1px solid ${colorAlpha(roleColor, 10)}` }}>
                            <GiTennisBall size={13} style={{ color: roleColor }} />
                            <span className="text-[var(--muted)]">Bowl</span>
                            <span className="font-semibold text-[var(--text)]">{p.bowling_style.charAt(0).toUpperCase() + p.bowling_style.slice(1)}</span>
                          </div>
                        )}
                        {p.shirt_size && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px]"
                            style={{ background: colorAlpha(roleColor, 5), border: `1px solid ${colorAlpha(roleColor, 10)}` }}>
                            <Shirt size={12} style={{ color: roleColor }} />
                            <span className="text-[var(--muted)]">Size</span>
                            <span className="font-semibold text-[var(--text)]">{p.shirt_size}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Contact section — copyable fields */}
                    {hasContact && (
                      <div className="space-y-2">
                        {p.email && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopy(p.email!, `email-${p.id}`); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all group active:scale-[0.98]"
                            style={{
                              background: copiedField === `email-${p.id}` ? 'var(--green)' + '10' : 'var(--card)',
                              border: `1.5px solid ${copiedField === `email-${p.id}` ? 'var(--green)' : 'var(--border)'}`,
                            }}
                          >
                            <div className="flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: colorAlpha(roleColor, 6) }}>
                              <Mail size={16} style={{ color: roleColor }} />
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Email</span>
                              <span className="block text-[13px] font-medium text-[var(--text)] truncate">{p.email}</span>
                            </div>
                            <div className="flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center transition-colors group-hover:bg-[var(--hover-bg)]">
                              {copiedField === `email-${p.id}`
                                ? <Check size={16} style={{ color: 'var(--green)' }} />
                                : <Copy size={15} className="text-[var(--muted)] group-hover:text-[var(--text)] transition-colors" />
                              }
                            </div>
                          </button>
                        )}
                        {p.cricclub_id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopy(p.cricclub_id!, `cc-${p.id}`); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all group active:scale-[0.98]"
                            style={{
                              background: copiedField === `cc-${p.id}` ? 'var(--green)' + '10' : 'var(--card)',
                              border: `1.5px solid ${copiedField === `cc-${p.id}` ? 'var(--green)' : 'var(--border)'}`,
                            }}
                          >
                            <div className="flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: colorAlpha(roleColor, 6) }}>
                              <BadgeIcon size={16} style={{ color: roleColor }} />
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">CricClub ID</span>
                              <span className="block text-[13px] font-semibold text-[var(--text)] tracking-wide">{p.cricclub_id}</span>
                            </div>
                            <div className="flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center transition-colors group-hover:bg-[var(--hover-bg)]">
                              {copiedField === `cc-${p.id}`
                                ? <Check size={16} style={{ color: 'var(--green)' }} />
                                : <Copy size={15} className="text-[var(--muted)] group-hover:text-[var(--text)] transition-colors" />
                              }
                            </div>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Guest Players (Net Players — from practice matches) */}
      {isAdmin && guestPlayers.length > 0 && (
        <div className="mt-4 rounded-2xl border border-[var(--border)]/50 overflow-hidden">
          <button onClick={() => setShowGuests(!showGuests)}
            className="w-full flex items-center justify-between p-3 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors">
            <Text size="sm" weight="semibold" color="muted">Guest Players ({guestPlayers.length})</Text>
            <Text size="xs" color="muted">{showGuests ? '▲' : '▼'}</Text>
          </button>
          {showGuests && (
            <div className="px-3 pb-3 space-y-2">
              {guestPlayers.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)]/50 bg-[var(--surface)] p-2.5 relative">
                  <div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--cricket) 6%, transparent)', color: 'color-mix(in srgb, var(--cricket-accent) 35%, transparent)', border: '1.5px solid color-mix(in srgb, var(--cricket) 12%, transparent)' }}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Text as="p" size="sm" weight="semibold" color="muted" truncate>{p.name}</Text>
                    <Text as="p" size="2xs" color="dim">Guest player</Text>
                  </div>
                  <button
                    ref={openGuestMenu === p.id ? guestMenuBtnRef : null}
                    onClick={(e) => { e.stopPropagation(); setOpenGuestMenu(openGuestMenu === p.id ? null : p.id); }}
                    className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
                  >
                    <EllipsisVertical size={13} />
                  </button>
                  {openGuestMenu === p.id && (
                    <CardMenu
                      anchorRef={guestMenuBtnRef}
                      onClose={() => setOpenGuestMenu(null)}
                      items={[
                        { label: 'Edit', icon: <Pencil size={15} />, color: 'var(--text)', onClick: () => handleEdit(p) },
                        { label: 'Add to Squad', icon: <UserPlus size={15} />, color: 'var(--cricket)', onClick: () => setPromotingGuest(p) },
                        { label: 'Delete', icon: <Trash2 size={15} />, color: 'var(--red)', onClick: () => setDeletingGuest(p), dividerBefore: true },
                      ]}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Past Players */}
      {isAdmin && removedPlayers.length > 0 && (
        <div className="mt-4 rounded-2xl border border-[var(--border)]/50 overflow-hidden">
          <button onClick={() => setShowRemoved(!showRemoved)}
            className="w-full flex items-center justify-between p-3 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors">
            <Text size="sm" weight="semibold" color="muted">Past Players ({removedPlayers.length})</Text>
            <Text size="xs" color="muted">{showRemoved ? '▲' : '▼'}</Text>
          </button>
          {showRemoved && (
            <div className="px-3 pb-3 space-y-2">
              {removedPlayers.map((p) => {
                const rc = roleConfig[p.player_role ?? ''];
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)]/50 bg-[var(--surface)] p-2.5">
                    <div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold"
                      style={{ backgroundColor: colorAlpha(rc?.color ?? 'var(--cricket)', 6), color: colorAlpha(rc?.color ?? 'var(--cricket-accent)', 35), border: `1.5px solid ${colorAlpha(rc?.color ?? 'var(--cricket)', 12)}` }}>
                      {p.jersey_number ? `#${p.jersey_number}` : p.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Text as="p" size="sm" weight="semibold" color="muted" truncate
                        className="hover:underline decoration-[var(--cricket)]/40 underline-offset-2 cursor-pointer"
                        onClick={() => setProfilePlayer(p)}>{p.name}</Text>
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

      {/* Promote Guest confirmation dialog */}
      <Dialog open={!!promotingGuest} onOpenChange={(open) => { if (!open) setPromotingGuest(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Squad</DialogTitle>
            <DialogDescription>
              Promote <b>{promotingGuest?.name}</b> from guest to a full squad member? Their practice match stats will carry over. You can edit their details (role, jersey, email) after promoting.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              variant="primary"
              brand="cricket"
              size="sm"
              onClick={async () => {
                if (!promotingGuest) return;
                const player = promotingGuest;
                setPromotingGuest(null);
                if (!isCloudMode()) return;
                const supabase = getSupabaseClient();
                if (!supabase) return;
                const { error } = await supabase.rpc('promote_guest_to_roster', { target_player_id: player.id });
                if (error) { toast.error('Failed to promote player'); console.error(error); return; }
                updatePlayer(player.id, { is_guest: false });
                toast.success(`${player.name} added to the squad!`);
              }}
            >
              Add to Squad
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Guest confirmation dialog */}
      <Dialog open={!!movingToGuest} onOpenChange={(open) => { if (!open) setMovingToGuest(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to Guest</DialogTitle>
            <DialogDescription>
              Move <b>{movingToGuest?.name}</b> from the active squad to guest players? Their match stats and profile data will be preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              variant="primary"
              brand="cricket"
              size="sm"
              onClick={() => {
                if (!movingToGuest) return;
                const player = movingToGuest;
                setMovingToGuest(null);
                updatePlayer(player.id, { is_guest: true, designation: null });
                toast.success(`${player.name} moved to guest players`);
              }}
            >
              Move to Guest
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Guest confirmation dialog (hard delete, guest only) */}
      <Dialog open={!!deletingGuest} onOpenChange={(open) => { if (!open) setDeletingGuest(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Guest Player</DialogTitle>
            <DialogDescription>
              Permanently delete <b>{deletingGuest?.name}</b>? Their leaderboard stats will be removed. Match history data (balls, runs, wickets) will remain but will no longer be linked to this player.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                if (!deletingGuest) return;
                const player = deletingGuest;
                setDeletingGuest(null);
                if (!isCloudMode()) {
                  useCricketStore.setState({ players: useCricketStore.getState().players.filter((p) => p.id !== player.id) });
                  toast.success(`${player.name} deleted`);
                  return;
                }
                const supabase = getSupabaseClient();
                if (!supabase) return;
                // Hard delete — only for guests (extra .eq('is_guest', true) safety guard)
                const { error } = await supabase
                  .from('cricket_players')
                  .delete()
                  .eq('id', player.id)
                  .eq('is_guest', true);
                if (error) { toast.error('Failed to delete guest player'); console.error(error); return; }
                useCricketStore.setState({ players: useCricketStore.getState().players.filter((p) => p.id !== player.id) });
                toast.success(`${player.name} deleted`);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation modal (roster players — soft delete via removePlayer) */}
      {deletingPlayer && (
        <DeleteConfirm
          player={deletingPlayer}
          onConfirm={() => { removePlayer(deletingPlayer.id); setDeletingPlayer(null); }}
          onCancel={() => setDeletingPlayer(null)}
        />
      )}

      {/* Permanent delete confirmation — soft-deletes player record + hard-deletes auth/profile/team_members */}
      {permanentDeleting && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={() => setPermanentDeleting(null)}
        >
          <div
            className="w-[340px] rounded-2xl p-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const isLeavingSelf = permanentDeleting.id === myPlayer?.id;
              return (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(248,113,113,0.15)' }}>
                      <UserX size={20} style={{ color: 'var(--red)' }} />
                    </div>
                    <div>
                      <Text as="p" size="sm" weight="semibold">{isLeavingSelf ? 'Leave Team' : 'Delete Permanently'}</Text>
                      <Text as="p" size="xs" color="muted">
                        {isLeavingSelf
                          ? 'Leave this team?'
                          : <>Remove <b>{permanentDeleting.name}</b> from this team?</>}
                      </Text>
                    </div>
                  </div>
                  <Text as="p" size="xs" color="dim" className="mb-4">
                    {isLeavingSelf
                      ? 'Your player record will be deactivated and you will lose access to this team. You can rejoin later with a new invite.'
                      : 'This will deactivate their player record (kept for audit) and remove them from this team. Their login account and other team memberships are not affected.'}
                  </Text>
                </>
              );
            })()}
            <div className="flex gap-2 justify-end">
              <Button onClick={() => setPermanentDeleting(null)} variant="secondary" size="sm">
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  const p = permanentDeleting;
                  const supabase = getSupabaseClient();
                  if (!supabase) return;
                  const teamId = useAuthStore.getState().currentTeamId;
                  // 1. Hard-delete player record for THIS team only
                  // (audit trail in team_audit_log captures full old_data)
                  await supabase.from('cricket_players').delete().eq('id', p.id).eq('team_id', teamId);
                  useCricketStore.setState({ players: useCricketStore.getState().players.filter(pl => pl.id !== p.id) });
                  // 2. Remove team membership for this team only
                  if (p.user_id && teamId) {
                    await supabase.from('team_members').delete().eq('user_id', p.user_id).eq('team_id', teamId);
                  }
                  setPermanentDeleting(null);
                  toast.success(`${p.name} permanently deleted`);
                }}
              >
                {permanentDeleting.id === myPlayer?.id ? 'Leave Team' : 'Delete Permanently'}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Admin access modal */}
      {/* Photo lightbox */}
      {lightboxPhoto && createPortal(
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white cursor-pointer"
            onClick={() => setLightboxPhoto(null)}
          >
            <X size={28} />
          </button>
          <img
            src={lightboxPhoto.url}
            alt={lightboxPhoto.name}
            className="max-w-[80vw] max-h-[70vh] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <Text as="p" size="lg" weight="semibold" color="white" className="mt-3 opacity-90">{lightboxPhoto.name}</Text>
        </div>,
        document.body,
      )}

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
                <Crown size={18} style={{ color: 'var(--toolkit)' }} />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-[var(--text)]">Admin Access</p>
                <p className="text-[13px] text-[var(--muted)]">{adminModal.player.name}</p>
              </div>
            </div>

            {adminModal.status === 'loading' && (
              <div className="flex justify-center py-4">
                <Spinner size="md" brand="cricket" />
              </div>
            )}

            {adminModal.status === 'no-email' && (
              <div className="rounded-xl bg-[var(--cricket)]/10 border border-[var(--cricket)]/20 p-3 mb-4">
                <p className="text-[13px] text-[var(--text)]">This player doesn&apos;t have an email address. Add their email first to link them to an account.</p>
              </div>
            )}

            {adminModal.status === 'no-account' && (
              <div className="rounded-xl bg-[var(--cricket)]/10 border border-[var(--cricket)]/20 p-3 mb-4">
                <p className="text-[13px] text-[var(--text)]"><b>{adminModal.player.email}</b> is not registered with the cricket tool. Ask them to sign up first at <b>/cricket</b>.</p>
              </div>
            )}

            {adminModal.status === 'has-admin' && (
              <>
                <Alert variant="success" className="mb-4">
                  <p className="text-[13px] text-[var(--text)]"><b>{adminModal.player.name}</b> already has admin access.</p>
                </Alert>
                <div className="flex gap-2 justify-end">
                  <Button onClick={() => setAdminModal(null)} variant="secondary" size="sm">
                    Close
                  </Button>
                  <Button onClick={revokeAdmin} variant="danger" size="sm">
                    Revoke Admin
                  </Button>
                </div>
              </>
            )}

            {adminModal.status === 'can-grant' && (
              <>
                <Alert variant="info" className="mb-4">
                  <p className="text-[13px] text-[var(--text)]">Grant admin access to <b>{adminModal.player.name}</b>? They will be able to manage players, expenses, and seasons.</p>
                </Alert>
                <div className="flex gap-2 justify-end">
                  <Button onClick={() => setAdminModal(null)} variant="secondary" size="sm">
                    Cancel
                  </Button>
                  <Button onClick={grantAdmin} size="sm" className="bg-[var(--toolkit)] text-white hover:opacity-90">
                    Grant Admin
                  </Button>
                </div>
              </>
            )}

            {(adminModal.status === 'no-email' || adminModal.status === 'no-account') && (
              <div className="flex justify-end">
                <Button onClick={() => setAdminModal(null)} variant="secondary" size="sm">
                  Close
                </Button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {/* Player profile dialog */}
      {profilePlayer && (
        <PlayerProfile
          player={profilePlayer}
          open={!!profilePlayer}
          onOpenChange={(open) => { if (!open) setProfilePlayer(null); }}
        />
      )}
    </div>
  );
}
