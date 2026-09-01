'use client';

import { useMemo, useRef, useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency } from '../lib/utils';
import { seasonRoster, billableRoster } from '../lib/season-roster';
import { myCricketPlayer } from '../lib/my-player';
import { buildFeeReminderText } from '../lib/fee-message';
import { whatsappShareUrl } from '@/lib/duty-share';
import {
  EmptyState, Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter,
  Button, Text, ComposerModal, Input, Label, CardMenu,
} from '@/components/ui';
import type { CardMenuItem } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  Check, ChevronDown, CircleAlert, Pencil, Send, Undo2, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CricketPlayer, CricketSeasonFee } from '@/types/cricket';

/**
 * Season fees.
 *
 * ── ONE LAYOUT FOR EVERYONE ──
 * Team pool, then your own fee, then the squad. Identical for an admin and a
 * player; only the CONTROLS differ. Two layouts to keep in step is how a screen
 * drifts, and every player wants the who-has-paid picture, not just their own
 * line — so nothing here is admin-only except the things that write data.
 *
 * Admin-gated (all behind `isAdmin`, and independently enforced by RLS — every
 * write policy on cricket_season_fees requires is_team_admin):
 *   the group reminder button · Mark paid · the row menu (partial, revert) ·
 *   editing the per-player amount.
 *
 * A player's version is entirely read-only.
 */

type Status = 'paid' | 'partial' | 'unpaid';

export default function FeeTracker() {
  const { userAccess, user } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const adminName = (user?.user_metadata?.full_name as string) || user?.email || 'Admin';
  const {
    players, seasonPlayers, fees, selectedSeasonId, seasons,
    updateSeason, recordFee, deleteFee,
  } = useCricketStore();

  /**
   * Only THIS season's roster is billed — previously this read the whole team,
   * so a player who joined for Fall appeared in Spring's dues owing a fee for a
   * season they never played, and Spring's outstanding total rose with them.
   *
   * Season-level guests are excluded from the fee denominator via
   * billableRoster. Falls back to the team-wide list for a season with no
   * roster rows — see ../lib/season-roster.
   */
  const roster = useMemo(
    () => seasonRoster(players, seasonPlayers, selectedSeasonId),
    [players, seasonPlayers, selectedSeasonId],
  );
  const activePlayers = useMemo(() => billableRoster(roster), [roster]);

  const season = seasons.find((s) => s.id === selectedSeasonId);
  const feeAmount = season?.fee_amount ?? 60;

  const [editingFee, setEditingFee] = useState(false);
  const [feeInput, setFeeInput] = useState(String(feeAmount));
  const [payingPlayer, setPayingPlayer] = useState<CricketPlayer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [undoPlayer, setUndoPlayer] = useState<{ id: string; name: string } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Which list is expanded. Admin lands on the worklist; a player lands on the
  // settled list, because they have no action to take on the other one and an
  // open list of who owes money is the board this screen avoids being.
  const [openList, setOpenList] = useState<'owed' | 'paid'>(isAdmin ? 'owed' : 'paid');
  const menuAnchors = useRef(new Map<string, HTMLButtonElement | null>());

  const seasonFees = fees.filter((f) => f.season_id === selectedSeasonId);
  const feeMap = useMemo(
    () => new Map<string, CricketSeasonFee>(seasonFees.map((f) => [f.player_id, f])),
    [seasonFees],
  );

  const paidOf = (playerId: string) => Number(feeMap.get(playerId)?.amount_paid ?? 0);
  const statusOf = (playerId: string): Status => {
    const paid = paidOf(playerId);
    if (paid >= feeAmount) return 'paid';
    return paid > 0 ? 'partial' : 'unpaid';
  };

  const totalExpected = activePlayers.length * feeAmount;
  // Deliberately ALL fee rows, including anyone no longer on the roster: money
  // received is money in the pool, and dropping it would make the season's
  // collected total fall with no expense to explain the gap.
  const totalCollected = seasonFees.reduce((sum, f) => sum + Number(f.amount_paid), 0);

  /**
   * The counts, unlike the total, MUST be roster-scoped.
   *
   * They previously counted every fee row while the denominator was the player
   * list, so the moment a paid player was off that list, `unpaidCount` went
   * NEGATIVE — 18 - 19 - 0 = -1. Unreachable while the denominator was the
   * whole team; reachable the instant this screen started filtering by season.
   */
  const paidCount = activePlayers.filter((p) => statusOf(p.id) === 'paid').length;

  /**
   * What the squad still owes. Summed PER PLAYER against their own shortfall,
   * not derived as (unpaid × fee) — the derived form re-bills the whole $60 to
   * someone who has already put in $40. Clamped at zero so an overpayment on
   * one player cannot cancel out another's debt.
   */
  const outstanding = activePlayers.reduce(
    (sum, p) => sum + Math.max(0, feeAmount - paidOf(p.id)),
    0,
  );

  const collectedPct = totalExpected > 0
    ? Math.min(Math.round((totalCollected / totalExpected) * 100), 100)
    : 0;

  const me = useMemo(() => myCricketPlayer(players, user), [players, user]);
  const myFee = me ? feeMap.get(me.id) : undefined;
  const myPaid = me ? paidOf(me.id) : 0;
  const myStatus: Status | null = me ? statusOf(me.id) : null;

  const paidList = useMemo(
    () => activePlayers
      .filter((p) => statusOf(p.id) === 'paid')
      // Most recent payment first — the list reads as movement rather than a
      // static register, and a Zelle recorded this morning sits at the top,
      // which is the fastest confirmation that it landed.
      .sort((a, b) => (feeMap.get(b.id)?.paid_date ?? '').localeCompare(feeMap.get(a.id)?.paid_date ?? '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePlayers, feeMap, feeAmount],
  );
  const owedList = useMemo(
    () => activePlayers
      .filter((p) => statusOf(p.id) !== 'paid')
      // Part-payers first: they are the closest to done and the cheapest to close.
      .sort((a, b) => paidOf(b.id) - paidOf(a.id) || a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePlayers, feeMap, feeAmount],
  );

  const reminderText = buildFeeReminderText({
    seasonName: season?.name ?? null,
    playerCount: activePlayers.length,
    paidCount,
    outstanding,
  });

  const saveFeeAmount = () => {
    const val = parseFloat(feeInput);
    if (!selectedSeasonId || Number.isNaN(val) || val <= 0) {
      toast.error('Enter an amount greater than zero');
      return;
    }
    updateSeason(selectedSeasonId, { fee_amount: val });
    setEditingFee(false);
  };

  const handleMarkPaid = (p: CricketPlayer) => {
    if (!selectedSeasonId) return;
    recordFee(selectedSeasonId, p.id, feeAmount, adminName);
    // Names the player: with nineteen rows, "Fee marked as paid" leaves you
    // unsure which one you just tapped.
    toast.success(`${p.name} marked as paid`);
  };

  const confirmUndo = () => {
    if (!undoPlayer) return;
    const fee = feeMap.get(undoPlayer.id);
    if (fee) {
      deleteFee(fee.id);
      toast.success(`Payment reverted for ${undoPlayer.name}`);
    }
    setUndoPlayer(null);
  };

  /**
   * recordFee REPLACES amount_paid; it does not add to it.
   *
   * The old inline form asked for "Amount" with an empty box, so the obvious
   * thing to type for a second payment was the new instalment — and $20 already
   * banked would be silently overwritten by $40, vanishing from the pool with no
   * trace. The field is now labelled "Total paid so far" and pre-filled with
   * what is already recorded, so the default action is to edit a number upward
   * rather than to replace one blind.
   */
  const openPartial = (p: CricketPlayer) => {
    setPayingPlayer(p);
    const already = paidOf(p.id);
    setPayAmount(already > 0 ? String(already) : '');
  };

  const handlePartialSubmit = () => {
    if (!selectedSeasonId || !payingPlayer) return;
    const val = parseFloat(payAmount);
    if (Number.isNaN(val) || val < 0) {
      toast.error('Enter a valid amount');
      return;
    }
    recordFee(selectedSeasonId, payingPlayer.id, val, adminName);
    toast.success(
      val >= feeAmount
        ? `${payingPlayer.name} marked as paid`
        : `${payingPlayer.name} recorded at ${formatCurrency(val)}`,
    );
    setPayingPlayer(null);
    setPayAmount('');
  };

  if (activePlayers.length === 0) {
    return (
      <EmptyState
        icon={<Wallet size={36} style={{ color: 'var(--cricket)' }} />}
        title="Nobody on this season's roster"
        description="Add players to the season roster to start tracking fees"
        brand="cricket"
      />
    );
  }

  return (
    <div className="space-y-3">

      {/* ── TEAM POOL — first, for everyone. Players want the who-has-paid
             picture too, so this is not an admin-only concern. ── */}
      <div
        className="rounded-2xl p-4 sm:p-5 min-w-0"
        style={{
          background: 'var(--card)',
          boxShadow: 'var(--card-shadow)',
        }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <Text size="2xs" weight="bold" color="muted" uppercase tracking="wider">
            Team pool
          </Text>
          <Text size="xs" weight="semibold" color="muted" tabular>
            {paidCount} of {activePlayers.length} paid
          </Text>
        </div>

        <div className="mt-2 flex items-baseline gap-2 flex-wrap">
          <Text size="2xl" weight="bold" tabular className="sm:text-[26px] leading-none">
            {formatCurrency(totalCollected)}
          </Text>
          <Text size="xs" color="muted" tabular>of {formatCurrency(totalExpected)} collected</Text>
        </div>

        {/* Never red. The old bar painted red below 50%, which in week one of
            collection is every season — an alarm that is always on is ignored. */}
        <div
          className="mt-3 h-[7px] rounded-full overflow-hidden"
          style={{ background: 'var(--border)' }}
          role="progressbar"
          aria-valuenow={collectedPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${collectedPct}% of season fees collected`}
        >
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{
              width: `${collectedPct}%`,
              background: 'linear-gradient(90deg, var(--cricket-accent), var(--cricket))',
            }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <Text size="2xs" color="dim" tabular>{collectedPct}%</Text>
          {outstanding >= 0.01 ? (
            <Text size="2xs" color="dim" tabular>{formatCurrency(outstanding)} still to come in</Text>
          ) : (
            <Text size="2xs" weight="semibold" style={{ color: 'var(--split-credit)' }}>
              Everyone has paid
            </Text>
          )}
        </div>

        {/* Per-player amount. Read-only text for a player; a button for admin. */}
        <div className="mt-3 pt-3 border-t border-[var(--border)]/60 flex items-center justify-between gap-3 flex-wrap">
          {isAdmin && editingFee ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Label htmlFor="fee-amount" className="mb-0">Per player</Label>
              <Input
                id="fee-amount"
                type="number"
                step="0.01"
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                className="w-24 text-center"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveFeeAmount();
                  if (e.key === 'Escape') setEditingFee(false);
                }}
              />
              <Button variant="primary" brand="cricket" size="sm" onClick={saveFeeAmount}>Save</Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingFee(false)}>Cancel</Button>
            </div>
          ) : (
            <>
              <Text size="xs" color="muted">
                <Text as="span" weight="bold" tabular style={{ color: 'var(--text)' }}>
                  {formatCurrency(feeAmount)}
                </Text>
                {' '}per player
              </Text>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => { setFeeInput(String(feeAmount)); setEditingFee(true); }}
                  aria-label="Edit the per-player fee amount"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12px] font-semibold text-[var(--muted)] cursor-pointer transition-transform active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cricket)]/60"
                >
                  <Pencil size={13} /> Edit
                </button>
              )}
            </>
          )}
        </div>

        {/* ── The chase. ADMIN ONLY — a player must never have a button that
               nags teammates. Hidden entirely when there is nothing to chase,
               rather than posting "everyone has paid, please pay". ── */}
        {isAdmin && reminderText && (
          <a
            href={whatsappShareUrl(reminderText)}
            target="_blank"
            rel="noopener"
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cricket)]/60"
            style={{
              background: 'var(--cricket)',
              color: 'var(--cricket-on)',
              boxShadow: '0 2px 10px var(--cricket-glow)',
            }}
          >
            <Send size={15} /> Post a fees reminder to the group
          </a>
        )}
      </div>

      {/* ── YOUR OWN FEE — second, and present for admins too. Absent only for
             a viewer with no player record, which is a normal state. ── */}
      {me && myStatus && (
        <YourFeeCard
          status={myStatus}
          feeAmount={feeAmount}
          paid={myPaid}
          fee={myFee}
          seasonName={season?.name ?? null}
        />
      )}

      {/* ── THE SQUAD ── */}
      <SquadSection
        title="Recently paid"
        subtotal={paidList.reduce((s, p) => s + paidOf(p.id), 0)}
        count={paidList.length}
        tone="var(--split-credit)"
        open={openList === 'paid'}
        onToggle={() => setOpenList((v) => (v === 'paid' ? 'owed' : 'paid'))}
      >
        {paidList.map((p) => (
          <FeeRow
            key={p.id}
            player={p}
            isMe={p.id === me?.id}
            status="paid"
            paid={paidOf(p.id)}
            feeAmount={feeAmount}
            fee={feeMap.get(p.id)}
            isAdmin={isAdmin}
            menuOpen={menuFor === p.id}
            onMenuToggle={() => setMenuFor((v) => (v === p.id ? null : p.id))}
            onMenuClose={() => setMenuFor(null)}
            anchorRef={(el) => menuAnchors.current.set(p.id, el)}
            anchors={menuAnchors}
            onMarkPaid={() => handleMarkPaid(p)}
            onPartial={() => openPartial(p)}
            onRevert={() => setUndoPlayer({ id: p.id, name: p.name })}
          />
        ))}
      </SquadSection>

      <SquadSection
        title="Still to pay"
        subtotal={outstanding}
        count={owedList.length}
        tone="var(--muted)"
        open={openList === 'owed'}
        onToggle={() => setOpenList((v) => (v === 'owed' ? 'paid' : 'owed'))}
      >
        {owedList.map((p) => (
          <FeeRow
            key={p.id}
            player={p}
            isMe={p.id === me?.id}
            status={statusOf(p.id)}
            paid={paidOf(p.id)}
            feeAmount={feeAmount}
            fee={feeMap.get(p.id)}
            isAdmin={isAdmin}
            menuOpen={menuFor === p.id}
            onMenuToggle={() => setMenuFor((v) => (v === p.id ? null : p.id))}
            onMenuClose={() => setMenuFor(null)}
            anchorRef={(el) => menuAnchors.current.set(p.id, el)}
            anchors={menuAnchors}
            onMarkPaid={() => handleMarkPaid(p)}
            onPartial={() => openPartial(p)}
            onRevert={() => setUndoPlayer({ id: p.id, name: p.name })}
          />
        ))}
      </SquadSection>

      {/* ── Partial payment. ComposerModal, not vaul Drawer: it has a text input
             and vaul's repositionInputs is broken (CLAUDE.md). ── */}
      <ComposerModal
        open={payingPlayer !== null}
        onClose={() => { setPayingPlayer(null); setPayAmount(''); }}
        title={payingPlayer ? `Record payment · ${payingPlayer.name}` : 'Record payment'}
        rightAction={{
          label: 'Save',
          onClick: handlePartialSubmit,
          disabled: payAmount.trim() === '',
          color: 'var(--cricket)',
        }}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pay-total">Total paid so far</Label>
            <Input
              id="pay-total"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder={String(feeAmount)}
              autoFocus
            />
            {/* States the running-total rule outright. This is the field where
                typing the latest instalment instead of the total used to erase
                the earlier one. */}
            <Text as="p" size="2xs" color="dim">
              {payingPlayer && paidOf(payingPlayer.id) > 0
                ? `${formatCurrency(paidOf(payingPlayer.id))} is already recorded. Enter the new TOTAL, not just the extra amount.`
                : `The full fee is ${formatCurrency(feeAmount)}. Enter less to record a part payment.`}
            </Text>
          </div>

          <Button
            variant="primary"
            brand="cricket"
            size="lg"
            fullWidth
            disabled={payAmount.trim() === ''}
            onClick={handlePartialSubmit}
          >
            Save payment
          </Button>
        </div>
      </ComposerModal>

      {/* ── Revert confirmation ── */}
      <Dialog open={!!undoPlayer} onOpenChange={(open) => { if (!open) setUndoPlayer(null); }}>
        <DialogContent showClose={false} className="max-w-xs text-center">
          <div className="mb-3 flex justify-center">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ background: 'var(--split-owe-bg)', color: 'var(--split-owe)' }}
            >
              <CircleAlert size={22} />
            </span>
          </div>
          <DialogTitle className="text-center">Revert payment?</DialogTitle>
          <DialogDescription className="text-center">
            This removes the fee record for <strong>{undoPlayer?.name}</strong>. They will show as
            unpaid, and the pool total drops by that amount.
          </DialogDescription>
          <DialogFooter className="mt-5">
            <Button variant="secondary" size="lg" fullWidth onClick={() => setUndoPlayer(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="lg" fullWidth onClick={confirmUndo}>
              Revert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Your own fee ──────────────────────────────────────────────────────────
 * The card that did not exist. A player used to open this screen and get a wall
 * of nineteen other people's payment status with their own name buried in it —
 * the one question they came with was the one thing the page never answered.
 *
 * Carries no payment details on purpose. The WhatsApp group already has them,
 * and a teammate's Zelle number sitting permanently on a shared screen is a
 * different thing from that person choosing to post it once.
 */
function YourFeeCard({ status, feeAmount, paid, fee, seasonName }: {
  status: Status;
  feeAmount: number;
  paid: number;
  fee: CricketSeasonFee | undefined;
  seasonName: string | null;
}) {
  const cfg = {
    paid: {
      tone: 'var(--split-credit)',
      bg: 'var(--split-credit-bg)',
      br: 'var(--split-credit-border)',
      head: "You're all paid up",
      figure: paid,
      filled: true,
    },
    partial: {
      tone: 'var(--orange)',
      bg: 'color-mix(in srgb, var(--orange) 7%, transparent)',
      br: 'color-mix(in srgb, var(--orange) 22%, transparent)',
      // The REMAINDER is the headline, not what is already in — that is the
      // number the player has to act on.
      head: `${formatCurrency(feeAmount - paid)} still to pay`,
      figure: feeAmount - paid,
      filled: false,
    },
    unpaid: {
      tone: 'var(--split-owe)',
      bg: 'var(--split-owe-bg)',
      br: 'var(--split-owe-border)',
      head: 'Not paid yet',
      figure: feeAmount,
      filled: false,
    },
  }[status];

  return (
    <div
      className="rounded-2xl p-4 sm:p-5 min-w-0"
      style={{
        border: `1px solid ${cfg.br}`,
        background: `linear-gradient(165deg, ${cfg.bg}, var(--surface) 70%)`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full"
          style={cfg.filled
            ? { background: cfg.tone, color: '#fff' }
            : { background: cfg.bg, border: `1px solid ${cfg.br}`, color: cfg.tone }}
          aria-hidden
        >
          {cfg.filled ? <Check size={12} strokeWidth={3.5} /> : <CircleAlert size={12} />}
        </span>
        <Text size="2xs" weight="bold" color="muted" uppercase tracking="wider">
          Your season fee
        </Text>
      </div>

      <Text as="p" size="lg" weight="bold" tracking="tight" className="mt-3 sm:text-[21px]">
        {cfg.head}
      </Text>
      <Text
        as="p"
        weight="bold"
        tabular
        className="mt-0.5 text-[34px] sm:text-[40px] leading-none tracking-[-0.03em]"
        style={{ color: cfg.tone }}
      >
        {formatCurrency(cfg.figure)}
      </Text>

      <Text as="p" size="xs" color="muted" className="mt-1.5">
        {status === 'paid' && fee?.paid_date
          ? `Paid ${new Date(fee.paid_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${fee.marked_by ? ` · marked by ${fee.marked_by}` : ''}`
          : status === 'partial' && fee?.paid_date
            ? `${formatCurrency(paid)} of ${formatCurrency(feeAmount)} paid on ${new Date(fee.paid_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            : seasonName ?? 'This season'}
      </Text>
    </div>
  );
}

/* ── Collapsible squad section ─────────────────────────────────────────── */
function SquadSection({ title, subtotal, count, tone, open, onToggle, children }: {
  title: string;
  subtotal: number;
  count: number;
  tone: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-1.5 text-left cursor-pointer transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cricket)]/60"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <Text size="2xs" weight="bold" uppercase tracking="wider" style={{ color: tone }}>
            {title} · {count}
          </Text>
          <ChevronDown
            size={14}
            style={{ color: tone }}
            className={cn('transition-transform duration-200 flex-shrink-0', open ? '' : '-rotate-90')}
            aria-hidden
          />
        </span>
        <Text size="xs" weight="bold" tabular style={{ color: tone }}>
          {formatCurrency(subtotal)}
        </Text>
      </button>
      {open && <div className="mt-1 space-y-1.5">{children}</div>}
    </div>
  );
}

/* ── One player's row ──────────────────────────────────────────────────────
 * Status is encoded ONCE, as the tick. The old row carried it four times over:
 * a left border, an avatar ring, a corner dot and a coloured amount.
 *
 * And one action, not two. "Mark Paid" and "Partial" used to sit side by side as
 * gradient uppercase pills on every unpaid row — eleven times over. Partial is
 * the rare case, so it lives in the menu with Revert.
 */
function FeeRow({
  player, isMe, status, paid, feeAmount, fee, isAdmin,
  menuOpen, onMenuToggle, onMenuClose, anchorRef, anchors,
  onMarkPaid, onPartial, onRevert,
}: {
  player: CricketPlayer;
  isMe: boolean;
  status: Status;
  paid: number;
  feeAmount: number;
  fee: CricketSeasonFee | undefined;
  isAdmin: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
  anchorRef: (el: HTMLButtonElement | null) => void;
  anchors: React.RefObject<Map<string, HTMLButtonElement | null>>;
  onMarkPaid: () => void;
  onPartial: () => void;
  onRevert: () => void;
}) {
  const localRef = useRef<HTMLButtonElement | null>(null);

  const when = fee?.paid_date
    ? new Date(fee.paid_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  // Only the VIEWER's own outstanding fee is coloured — it is the one they can
  // act on. Everyone else's is neutral, so the list is not a wall of red.
  const amountTone = status === 'paid'
    ? 'var(--split-credit)'
    : status === 'partial'
      ? 'var(--orange)'
      : isMe ? 'var(--split-owe)' : 'var(--muted)';

  const revertItem: CardMenuItem = {
    label: 'Revert payment',
    icon: <Undo2 size={14} />,
    color: 'var(--red)',
    onClick: onRevert,
    // Separated from the edit action above it — this one destroys a record and
    // drops the pool total, so it should not sit flush against a benign item.
    dividerBefore: true,
  };

  const menuItems: CardMenuItem[] = status === 'paid'
    ? [
      { label: 'Edit amount', icon: <Pencil size={14} />, color: 'var(--text)', onClick: onPartial },
      revertItem,
    ]
    : [
      { label: 'Record part payment', icon: <Pencil size={14} />, color: 'var(--text)', onClick: onPartial },
      // Nothing to revert until something has been paid.
      ...(paid > 0 ? [revertItem] : []),
    ];

  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border bg-[var(--surface)] px-3 py-2.5 min-w-0"
      style={{
        borderColor: isMe
          ? 'color-mix(in srgb, var(--cricket) 45%, transparent)'
          : 'var(--border)',
        background: isMe
          ? 'color-mix(in srgb, var(--cricket) 5%, var(--surface))'
          : 'var(--surface)',
      }}
    >
      <span
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold tabular-nums"
        style={{
          background: 'color-mix(in srgb, var(--cricket) 11%, transparent)',
          color: 'var(--cricket)',
        }}
        aria-hidden
      >
        {player.jersey_number ?? player.name.charAt(0).toUpperCase()}
      </span>

      <div className="min-w-0 flex-1">
        <Text size="sm" weight="semibold" truncate className="block">
          {player.name}{isMe && <Text as="span" color="muted" weight="normal"> · you</Text>}
        </Text>
        <Text as="p" size="2xs" color="muted" truncate>
          {status === 'paid' && when
            // "who marked it" — the marked_by column is already written on every
            // payment and was displayed nowhere. Two people record fees, so the
            // row answers "who ticked this off" without anyone having to ask.
            ? `${when}${fee?.marked_by ? ` · marked by ${fee.marked_by}` : ''}`
            : status === 'partial'
              // Subtraction done for the reader.
              ? `${formatCurrency(paid)} paid · ${formatCurrency(feeAmount - paid)} left`
              : 'Not paid'}
        </Text>
      </div>

      <Text size="sm" weight="bold" tabular className="flex-shrink-0" style={{ color: amountTone }}>
        {status === 'partial' ? formatCurrency(feeAmount - paid) : formatCurrency(status === 'paid' ? paid : feeAmount)}
      </Text>

      {status === 'paid' ? (
        <span
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--split-credit)', color: '#fff' }}
          aria-label="Paid"
          role="img"
        >
          <Check size={11} strokeWidth={3.5} />
        </span>
      ) : (
        <span
          className="h-5 w-5 flex-shrink-0 rounded-full"
          style={{ border: '1.5px dashed color-mix(in srgb, var(--muted) 55%, transparent)' }}
          aria-label="Not paid"
          role="img"
        />
      )}

      {isAdmin && (
        <>
          {status !== 'paid' && (
            <button
              type="button"
              onClick={onMarkPaid}
              className="flex-shrink-0 rounded-full border px-3.5 min-h-10 -my-1 flex items-center text-[11.5px] font-bold whitespace-nowrap cursor-pointer transition-transform active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cricket)]/60"
              style={{
                background: 'var(--split-credit-bg)',
                borderColor: 'var(--split-credit-border)',
                color: 'var(--split-credit)',
              }}
            >
              Mark paid
            </button>
          )}
          <button
            type="button"
            ref={(el) => { localRef.current = el; anchorRef(el); }}
            onClick={onMenuToggle}
            aria-label={`More actions for ${player.name}`}
            className="flex h-11 w-10 -my-1.5 flex-shrink-0 items-center justify-center rounded-lg text-[var(--dim)] cursor-pointer transition-transform active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cricket)]/60"
          >
            <span className="text-[16px] leading-none tracking-[1.5px]">···</span>
          </button>
          {menuOpen && (
            <CardMenu
              anchorRef={{ current: anchors.current?.get(player.id) ?? null }}
              items={menuItems}
              onClose={onMenuClose}
              width={190}
            />
          )}
        </>
      )}
    </div>
  );
}
