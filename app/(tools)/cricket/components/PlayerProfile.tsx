'use client';

import { useState, useRef } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CricketPlayer } from '@/types/cricket';
import { MdSportsCricket, MdEmail, MdBadge, MdContentCopy, MdEdit, MdCameraAlt, MdClose } from 'react-icons/md';
import { GiTennisBall, GiGloves } from 'react-icons/gi';
import { FaCrown, FaShieldAlt, FaTshirt } from 'react-icons/fa';
import { PLAYER_ROLES, BATTING_STYLES, BOWLING_STYLES, SHIRT_SIZES } from '../lib/constants';
import { cn } from '@/lib/utils';
import { Text } from '@/components/ui';
import { toast } from 'sonner';
import { getSupabaseClient } from '@/lib/supabase/client';
import { compressPlayerImage } from '../lib/image';

function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        toast.success(`${label} copied`);
      }}
      className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
      title={`Copy ${label}`}
    >
      <MdContentCopy size={14} />
    </button>
  );
}

const roleConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  batsman: { icon: <MdSportsCricket size={16} />, label: 'Batsman', color: 'var(--cricket)' },
  bowler: { icon: <GiTennisBall size={15} />, label: 'Bowler', color: '#3B82F6' },
  'all-rounder': { icon: <><MdSportsCricket size={15} /><GiTennisBall size={13} /></>, label: 'All-Rounder', color: 'var(--cricket-accent)' },
  keeper: { icon: <GiGloves size={16} />, label: 'Keeper', color: '#16A34A' },
};

function colorAlpha(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

type Props = {
  player: CricketPlayer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function PlayerProfile({ player, open, onOpenChange }: Props) {
  const { gallery, galleryTags, fees, seasons, selectedSeasonId, updatePlayer } = useCricketStore();
  const { user } = useAuthStore();
  const rc = roleConfig[player.player_role ?? ''];
  const roleColor = rc?.color ?? 'var(--cricket)';

  const isOwnProfile = user?.id === player.user_id;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState(player.name);
  const [editEmail, setEditEmail] = useState(player.email ?? '');
  const [editRole, setEditRole] = useState(player.player_role ?? '');
  const [editBatting, setEditBatting] = useState(player.batting_style ?? '');
  const [editBowling, setEditBowling] = useState(player.bowling_style ?? '');
  const [editShirtSize, setEditShirtSize] = useState(player.shirt_size ?? '');
  const [editCricclub, setEditCricclub] = useState(player.cricclub_id ?? '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setEditName(player.name);
    setEditEmail(player.email ?? '');
    setEditRole(player.player_role ?? '');
    setEditBatting(player.batting_style ?? '');
    setEditBowling(player.bowling_style ?? '');
    setEditShirtSize(player.shirt_size ?? '');
    setEditCricclub(player.cricclub_id ?? '');
    setPhotoFile(null);
    setPhotoPreview(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const saveProfile = async () => {
    if (!editName.trim()) { toast.error('Name is required'); return; }
    setSaving(true);

    const updates: Partial<CricketPlayer> = {
      name: editName.trim(),
      email: editEmail.trim() || null,
      player_role: (editRole || null) as CricketPlayer['player_role'],
      batting_style: (editBatting || null) as CricketPlayer['batting_style'],
      bowling_style: (editBowling || null) as CricketPlayer['bowling_style'],
      shirt_size: editShirtSize || null,
      cricclub_id: editCricclub.trim() || null,
    };

    // Upload photo if changed
    if (photoFile && user) {
      try {
        const compressed = await compressPlayerImage(photoFile);
        const supabase = getSupabaseClient();
        if (supabase) {
          const path = `${user.id}/${player.id}.jpg`;
          await supabase.storage.from('player-photos').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
          const { data: { publicUrl } } = supabase.storage.from('player-photos').getPublicUrl(path);
          updates.photo_url = `${publicUrl}?t=${Date.now()}`;
        }
      } catch {
        toast.error('Photo upload failed');
      }
    }

    updatePlayer(player.id, updates);
    setEditing(false);
    setSaving(false);
    toast.success('Profile updated');
  };

  // Show role-specific batting/bowling options
  const showBatting = ['batsman', 'all-rounder', 'keeper'].includes(editRole);
  const showBowling = ['bowler', 'all-rounder'].includes(editRole);

  const joinYear = player.created_at ? new Date(player.created_at).getFullYear() : null;

  const taggedPostIds = new Set(
    galleryTags.filter((t) => t.player_id === player.id).map((t) => t.post_id)
  );
  const taggedPosts = gallery
    .filter((p) => taggedPostIds.has(p.id) && !p.deleted_at)
    .slice(0, 4);

  const currentSeason = seasons.find((s) => s.id === selectedSeasonId);
  const playerFees = fees.filter(
    (f) => f.season_id === selectedSeasonId && f.player_id === player.id
  );
  const totalPaid = playerFees.reduce((sum, f) => sum + f.amount_paid, 0);
  const feeAmount = currentSeason?.fee_amount ?? 0;
  const feeStatus = feeAmount === 0 ? null
    : totalPaid >= feeAmount ? 'paid'
    : totalPaid > 0 ? 'partial' : 'unpaid';

  const initials = player.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const displayPhoto = photoPreview ?? player.photo_url;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cancelEditing(); onOpenChange(o); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto p-0" showClose>

        {/* ── EDIT MODE ── */}
        {editing ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <Text as="h3" size="lg" weight="bold">Edit Profile</Text>
              <button onClick={cancelEditing} className="text-[var(--muted)] hover:text-[var(--text)] cursor-pointer">
                <MdClose size={20} />
              </button>
            </div>

            {/* Team-specific fields (read-only) */}
            {(player.jersey_number != null || player.designation) && (
              <div className="flex flex-wrap gap-2">
                {player.jersey_number != null && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium bg-[var(--surface)] text-[var(--muted)] border border-[var(--border)]">
                    #{player.jersey_number} <span className="text-[var(--dim)]">· set by admin</span>
                  </span>
                )}
                {player.designation && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium bg-[var(--surface)] text-[var(--muted)] border border-[var(--border)] capitalize">
                    {player.designation === 'captain' && <FaCrown size={9} />}
                    {player.designation === 'vice-captain' && <FaShieldAlt size={9} />}
                    {player.designation} <span className="text-[var(--dim)]">· set by admin</span>
                  </span>
                )}
              </div>
            )}

            {/* ── Identity Section ── */}

            {/* Photo */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="relative h-20 w-20 rounded-full overflow-hidden cursor-pointer group"
                onClick={() => photoInputRef.current?.click()}
                style={{
                  background: displayPhoto ? 'transparent' : colorAlpha(roleColor, 10),
                  border: `3px solid ${colorAlpha(roleColor, 25)}`,
                }}
              >
                {displayPhoto ? (
                  <img src={displayPhoto} alt={editName} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center" style={{ color: roleColor }}>
                    <MdCameraAlt size={24} />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                  <MdCameraAlt size={20} className="text-white" />
                </div>
              </div>
              <Text size="2xs" color="dim">Tap to change photo</Text>
              <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); }
                  e.target.value = '';
                }} />
            </div>

            {/* Name */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Name *</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors" />
            </div>

            {/* Email */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Email</label>
              <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
                placeholder="player@email.com" />
            </div>

            {/* CricClub ID */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">CricClub ID</label>
              <input value={editCricclub} onChange={(e) => setEditCricclub(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
                placeholder="Optional" />
            </div>

            {/* ── Cricket Skills Section ── */}
            <div className="pt-1">
              <Text size="2xs" weight="semibold" color="dim" className="uppercase tracking-wider mb-3">Cricket Skills</Text>

              {/* Shirt Size */}
              <div className="mb-4">
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Shirt Size</label>
                <div className="flex flex-wrap gap-1.5">
                  {SHIRT_SIZES.map((s) => (
                    <button key={s.key} type="button" onClick={() => setEditShirtSize(editShirtSize === s.key ? '' : s.key)}
                      className="h-8 w-10 rounded-lg text-[12px] font-medium cursor-pointer transition-all border"
                      style={{ backgroundColor: editShirtSize === s.key ? 'var(--cricket-accent)' : 'transparent', borderColor: editShirtSize === s.key ? 'var(--cricket-accent)' : 'var(--border)', color: editShirtSize === s.key ? 'white' : 'var(--muted)' }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

            {/* Role */}
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Role</label>
              <div className="grid grid-cols-2 gap-2">
                {PLAYER_ROLES.map((r) => {
                  const rConf = roleConfig[r.key];
                  const isSelected = editRole === r.key;
                  return (
                    <button key={r.key} type="button" onClick={() => {
                      const newRole = editRole === r.key ? '' : r.key;
                      setEditRole(newRole);
                      if (!['batsman', 'all-rounder', 'keeper'].includes(newRole)) setEditBatting('');
                      if (!['bowler', 'all-rounder'].includes(newRole)) setEditBowling('');
                    }}
                      className="flex items-center gap-2 rounded-xl p-2.5 cursor-pointer transition-all border-2 text-left"
                      style={{
                        backgroundColor: isSelected ? colorAlpha(rConf?.color ?? 'var(--cricket)', 8) : 'var(--surface)',
                        borderColor: isSelected ? (rConf?.color ?? 'var(--cricket)') : 'var(--border)',
                      }}>
                      <div className="flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: isSelected ? (rConf?.color ?? 'var(--cricket)') : colorAlpha(rConf?.color ?? 'var(--cricket)', 8), color: isSelected ? 'white' : (rConf?.color ?? 'var(--cricket)') }}>
                        {rConf?.icon}
                      </div>
                      <Text size="xs" weight={isSelected ? 'bold' : 'medium'}>{r.label}</Text>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Batting Style */}
            {showBatting && (
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Batting Style</label>
                <div className="flex gap-2">
                  {BATTING_STYLES.map((s) => (
                    <button key={s.key} type="button" onClick={() => setEditBatting(editBatting === s.key ? '' : s.key)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium cursor-pointer transition-all border"
                      style={{ backgroundColor: editBatting === s.key ? 'var(--cricket-accent)' : 'transparent', borderColor: editBatting === s.key ? 'var(--cricket-accent)' : 'var(--border)', color: editBatting === s.key ? 'white' : 'var(--text)' }}>
                      <MdSportsCricket size={14} /> {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bowling Style */}
            {showBowling && (
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Bowling Style</label>
                <div className="flex flex-col gap-1.5">
                  {BOWLING_STYLES.map((s) => (
                    <button key={s.key} type="button" onClick={() => setEditBowling(editBowling === s.key ? '' : s.key)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium cursor-pointer transition-all border"
                      style={{ backgroundColor: editBowling === s.key ? 'var(--cricket-accent)' : 'transparent', borderColor: editBowling === s.key ? 'var(--cricket-accent)' : 'var(--border)', color: editBowling === s.key ? 'white' : 'var(--text)' }}>
                      <GiTennisBall size={13} /> {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Save / Cancel */}
            <div className="flex gap-2 pt-3 pb-1">
              <Button onClick={cancelEditing} variant="secondary" size="lg" fullWidth>Cancel</Button>
              <Button onClick={saveProfile} variant="primary" brand="cricket" size="lg" fullWidth loading={saving}>
                Save Profile
              </Button>
            </div>
            </div>
          </div>
        ) : (
          <>
        {/* ── VIEW MODE (original design) ── */}
        <div
          className="relative flex flex-col items-center pt-6 pb-4 px-6 rounded-t-2xl"
          style={{ background: colorAlpha(roleColor, 6) }}
        >
          {/* Edit button — own profile only, top-right */}
          {isOwnProfile && (
            <button
              onClick={startEditing}
              className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer transition-colors bg-white/80 dark:bg-black/30 hover:bg-white dark:hover:bg-black/50 text-[var(--text)] border border-[var(--border)] z-10"
            >
              <MdEdit size={14} /> Edit
            </button>
          )}

          {player.photo_url ? (
            <img
              src={player.photo_url}
              alt={player.name}
              className="h-20 w-20 rounded-full object-cover"
              style={{ border: `3px solid ${colorAlpha(roleColor, 30)}` }}
            />
          ) : (
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full text-[24px] font-extrabold"
              style={{
                backgroundColor: colorAlpha(roleColor, 10),
                color: roleColor,
                border: `3px solid ${colorAlpha(roleColor, 25)}`,
              }}
            >
              {initials}
            </div>
          )}

          <DialogTitle className="mt-3 text-center text-[20px]">
            {player.name}
          </DialogTitle>

          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
            {player.jersey_number != null && (
              <Badge variant="blue" size="sm">#{player.jersey_number}</Badge>
            )}
            {rc && (
              <Badge
                size="sm"
                className="inline-flex items-center gap-1"
                style={{ color: roleColor, background: colorAlpha(roleColor, 10) }}
              >
                {rc.icon} {rc.label}
              </Badge>
            )}
            {player.designation === 'captain' && (
              <Badge size="sm" className="inline-flex items-center gap-0.5" style={{ color: 'var(--cricket-accent)', background: 'color-mix(in srgb, var(--cricket-accent) 10%, transparent)' }}>
                <FaCrown size={9} /> Captain
              </Badge>
            )}
            {player.designation === 'vice-captain' && (
              <Badge size="sm" className="inline-flex items-center gap-0.5" style={{ color: '#6B7280', background: '#6B728015' }}>
                <FaShieldAlt size={9} /> Vice Captain
              </Badge>
            )}
          </div>

          {joinYear && (
            <Text as="p" size="xs" color="muted" className="mt-2">
              Player since {joinYear}
            </Text>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">
          {(player.batting_style || player.bowling_style || player.shirt_size) && (
            <div className="flex flex-wrap gap-2">
              {player.batting_style && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px]"
                  style={{ background: colorAlpha(roleColor, 5), border: `1px solid ${colorAlpha(roleColor, 12)}` }}>
                  <MdSportsCricket size={15} style={{ color: roleColor }} />
                  <span className="text-[var(--muted)]">Bat</span>
                  <span className="font-semibold text-[var(--text)]">{player.batting_style === 'right' ? 'Right' : 'Left'} Hand</span>
                </div>
              )}
              {player.bowling_style && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px]"
                  style={{ background: colorAlpha(roleColor, 5), border: `1px solid ${colorAlpha(roleColor, 12)}` }}>
                  <GiTennisBall size={14} style={{ color: roleColor }} />
                  <span className="text-[var(--muted)]">Bowl</span>
                  <span className="font-semibold text-[var(--text)]">{player.bowling_style.charAt(0).toUpperCase() + player.bowling_style.slice(1)}</span>
                </div>
              )}
              {player.shirt_size && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px]"
                  style={{ background: colorAlpha(roleColor, 5), border: `1px solid ${colorAlpha(roleColor, 12)}` }}>
                  <FaTshirt size={13} style={{ color: roleColor }} />
                  <span className="text-[var(--muted)]">Size</span>
                  <span className="font-semibold text-[var(--text)]">{player.shirt_size}</span>
                </div>
              )}
            </div>
          )}

          {(player.email || player.cricclub_id) && (
            <div className="space-y-2">
              {player.email && (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                  <div className="flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: colorAlpha(roleColor, 8) }}>
                    <MdEmail size={16} style={{ color: roleColor }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Text as="span" size="2xs" weight="semibold" color="muted" uppercase tracking="wider" className="block text-[10px]">Email</Text>
                    <Text as="span" size="sm" weight="medium" truncate className="block">{player.email}</Text>
                  </div>
                  <CopyButton text={player.email} label="Email" />
                </div>
              )}
              {player.cricclub_id && (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                  <div className="flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: colorAlpha(roleColor, 8) }}>
                    <MdBadge size={16} style={{ color: roleColor }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Text as="span" size="2xs" weight="semibold" color="muted" uppercase tracking="wider" className="block text-[10px]">CricClub ID</Text>
                    <Text as="span" size="sm" weight="semibold" tracking="wide" className="block">{player.cricclub_id}</Text>
                  </div>
                  <CopyButton text={player.cricclub_id} label="CricClub ID" />
                </div>
              )}
            </div>
          )}

          {taggedPosts.length > 0 && (
            <div>
              <Text as="h4" size="xs" weight="semibold" color="muted" uppercase tracking="wider" className="mb-2">
                Tagged in Moments
              </Text>
              <div className="grid grid-cols-4 gap-1.5">
                {taggedPosts.map((post) => {
                  const thumbUrl = post.photo_urls?.[0] ?? post.photo_url;
                  if (!thumbUrl) return null;
                  return (
                    <div key={post.id} className="aspect-square rounded-xl overflow-hidden bg-[var(--surface)]">
                      <img src={thumbUrl} alt={post.caption ?? 'Post'} className="h-full w-full object-cover" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {currentSeason && feeStatus && (
            <div>
              <Text as="h4" size="xs" weight="semibold" color="muted" uppercase tracking="wider" className="mb-2">
                Season Fee &mdash; {currentSeason.name}
              </Text>
              <div
                className={cn(
                  'flex items-center justify-between px-3 py-2.5 rounded-xl border',
                  feeStatus === 'paid' && 'bg-[var(--green)]/5 border-[var(--green)]/20',
                  feeStatus === 'partial' && 'bg-[var(--orange)]/5 border-[var(--orange)]/20',
                  feeStatus === 'unpaid' && 'bg-[var(--red)]/5 border-[var(--red)]/20',
                )}
              >
                <div>
                  <span className={cn(
                    'text-[13px] font-bold',
                    feeStatus === 'paid' && 'text-[var(--green)]',
                    feeStatus === 'partial' && 'text-[var(--orange)]',
                    feeStatus === 'unpaid' && 'text-[var(--red)]',
                  )}>
                    {feeStatus === 'paid' ? 'Paid' : feeStatus === 'partial' ? 'Partial' : 'Unpaid'}
                  </span>
                  {feeStatus === 'partial' && (
                    <span className="text-[12px] text-[var(--muted)] ml-1.5">
                      ${totalPaid} / ${feeAmount}
                    </span>
                  )}
                </div>
                <span className="text-[14px] font-bold text-[var(--text)]">
                  ${feeStatus === 'paid' ? feeAmount : feeStatus === 'partial' ? totalPaid : 0}
                  {feeStatus !== 'paid' && (
                    <span className="text-[12px] text-[var(--muted)] font-normal"> / ${feeAmount}</span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
