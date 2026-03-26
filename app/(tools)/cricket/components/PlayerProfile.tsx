'use client';

import { useCricketStore } from '@/stores/cricket-store';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { CricketPlayer } from '@/types/cricket';
import { MdSportsCricket, MdEmail, MdBadge, MdContentCopy } from 'react-icons/md';
import { GiTennisBall, GiGloves } from 'react-icons/gi';
import { FaCrown, FaShieldAlt, FaTshirt } from 'react-icons/fa';
import { cn } from '@/lib/utils';
import { Text } from '@/components/ui';
import { toast } from 'sonner';

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

/* ── Role config (matches PlayerManager) ── */
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
  const { gallery, galleryTags, fees, seasons, selectedSeasonId } = useCricketStore();
  const rc = roleConfig[player.player_role ?? ''];
  const roleColor = rc?.color ?? 'var(--cricket)';

  // Experience: derived from when the player was added
  const joinYear = player.created_at ? new Date(player.created_at).getFullYear() : null;

  // Gallery: posts this player is tagged in (most recent first, limit 4)
  const taggedPostIds = new Set(
    galleryTags.filter((t) => t.player_id === player.id).map((t) => t.post_id)
  );
  const taggedPosts = gallery
    .filter((p) => taggedPostIds.has(p.id) && !p.deleted_at)
    .slice(0, 4);

  // Season fees: current season payment status
  const currentSeason = seasons.find((s) => s.id === selectedSeasonId);
  const playerFees = fees.filter(
    (f) => f.season_id === selectedSeasonId && f.player_id === player.id
  );
  const totalPaid = playerFees.reduce((sum, f) => sum + f.amount_paid, 0);
  const feeAmount = currentSeason?.fee_amount ?? 0;

  const feeStatus = feeAmount === 0
    ? null
    : totalPaid >= feeAmount
      ? 'paid'
      : totalPaid > 0
        ? 'partial'
        : 'unpaid';

  const initials = player.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto p-0" showClose>
        {/* ── Header ── */}
        <div
          className="relative flex flex-col items-center pt-6 pb-4 px-6 rounded-t-2xl"
          style={{ background: colorAlpha(roleColor, 6) }}
        >
          {/* Photo or initials */}
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

          {/* Name + badges */}
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

        {/* ── Info Section ── */}
        <div className="px-5 py-4 space-y-4">
          {/* Skills row */}
          {(player.batting_style || player.bowling_style || player.shirt_size) && (
            <div className="flex flex-wrap gap-2">
              {player.batting_style && (
                <div
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px]"
                  style={{ background: colorAlpha(roleColor, 5), border: `1px solid ${colorAlpha(roleColor, 12)}` }}
                >
                  <MdSportsCricket size={15} style={{ color: roleColor }} />
                  <span className="text-[var(--muted)]">Bat</span>
                  <span className="font-semibold text-[var(--text)]">
                    {player.batting_style === 'right' ? 'Right' : 'Left'} Hand
                  </span>
                </div>
              )}
              {player.bowling_style && (
                <div
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px]"
                  style={{ background: colorAlpha(roleColor, 5), border: `1px solid ${colorAlpha(roleColor, 12)}` }}
                >
                  <GiTennisBall size={14} style={{ color: roleColor }} />
                  <span className="text-[var(--muted)]">Bowl</span>
                  <span className="font-semibold text-[var(--text)]">
                    {player.bowling_style.charAt(0).toUpperCase() + player.bowling_style.slice(1)}
                  </span>
                </div>
              )}
              {player.shirt_size && (
                <div
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px]"
                  style={{ background: colorAlpha(roleColor, 5), border: `1px solid ${colorAlpha(roleColor, 12)}` }}
                >
                  <FaTshirt size={13} style={{ color: roleColor }} />
                  <span className="text-[var(--muted)]">Size</span>
                  <span className="font-semibold text-[var(--text)]">{player.shirt_size}</span>
                </div>
              )}
            </div>
          )}

          {/* Contact info */}
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

          {/* ── Gallery / Tagged Posts ── */}
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
                    <div
                      key={post.id}
                      className="aspect-square rounded-xl overflow-hidden bg-[var(--surface)]"
                    >
                      <img
                        src={thumbUrl}
                        alt={post.caption ?? 'Post'}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Season Fees ── */}
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
      </DialogContent>
    </Dialog>
  );
}
