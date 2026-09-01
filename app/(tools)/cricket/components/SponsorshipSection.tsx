'use client';

import { useState, useEffect } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency, formatDate } from '../lib/utils';
import {
  EmptyState, Text, ActionSheet, Input,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter, DialogClose,
  ComposerModal,
} from '@/components/ui';
import {
  Handshake, Pencil, Trash2, Plus,
  ChevronDown, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { toast } from 'sonner';
import type { CricketSponsorship } from '@/types/cricket';

// ── Initials avatar for sponsor ──
function SponsorAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-11 w-11';
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-[13px]';
  return (
    <div
      className={`${dim} flex-shrink-0 rounded-xl flex items-center justify-center font-bold ${textSize}`}
      style={{
        background: 'var(--cricket)',
        color: 'var(--cricket-on)',
        boxShadow: '0 2px 8px var(--cricket-glow)',
      }}
    >
      {initials}
    </div>
  );
}

// ── Hero stat card ──
function HeroStats({ total, count }: { total: number; count: number }) {
  return (
    // Quiet hero — same surface language as the pool hero: tone + elevation,
    // brand only in the icon tint. (Replaced a brand-soaked gradient card
    // with a glow orb and white-on-orange text.)
    <div
      className="rounded-2xl p-4 sm:p-5"
      style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <Text as="p" size="2xs" weight="medium" color="muted" uppercase tracking="wider" className="mb-1">
            Total Sponsorships
          </Text>
          <Text as="p" size="2xl" weight="bold" tabular tracking="tight">
            {formatCurrency(total)}
          </Text>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--cricket) 14%, transparent)', color: 'var(--cricket)' }}
          >
            <Handshake size={20} />
          </div>
          <Text size="2xs" weight="medium" color="muted">
            {count} sponsor{count !== 1 ? 's' : ''}
          </Text>
        </div>
      </div>
    </div>
  );
}

// ── Individual sponsor card ──
function SponsorCard({
  sponsor,
  isAdmin,
  onEdit,
  onDelete,
}: {
  sponsor: CricketSponsorship;
  isAdmin: boolean;
  onEdit: (s: CricketSponsorship) => void;
  onDelete: (s: CricketSponsorship) => void;
}) {
  const [openMenu, setOpenMenu] = useState(false);

  return (
    // Continuous ledger row — the section surface provides the grouping.
    // Two sponsorships from the same sponsor ("Himalayan Kitchen" twice) are
    // SEPARATE transactions by design; the purpose · date line is what tells
    // them apart, so it sits directly under the name.
    <div className="animate-view-in px-3 py-3 sm:px-4">
      <div className="flex items-start gap-3">
        <SponsorAvatar name={sponsor.sponsor_name} />

        <div className="flex-1 min-w-0">
          {/* Full sponsor name — wraps rather than truncating */}
          <Text as="p" size="md" weight="semibold" className="leading-snug break-words">
            {sponsor.sponsor_name}
          </Text>
          <Text as="p" size="2xs" color="muted" className="mt-0.5">
            {sponsor.notes ? `${sponsor.notes} · ` : ''}{formatDate(sponsor.sponsored_date)}
          </Text>
          {/* Audit trail — one quiet dim line, discoverable but never
              competing with sponsor + amount. The badge-chip footer read
              as an audit log. */}
          {(sponsor.created_by || sponsor.updated_by) && (
            <Text as="p" size="2xs" color="dim" className="mt-1">
              {sponsor.created_by && `Added ${formatDate(sponsor.created_at?.split('T')[0] || sponsor.sponsored_date)} by ${sponsor.created_by}`}
              {sponsor.updated_by && `${sponsor.created_by ? ' · ' : ''}Updated${sponsor.updated_at ? ` ${formatDate(sponsor.updated_at.split('T')[0])}` : ''} by ${sponsor.updated_by}`}
            </Text>
          )}
        </div>

        <div className="flex items-start gap-1 flex-shrink-0">
          {/* Financial value, not a pill — restrained semantic green */}
          <span
            className="pt-0.5 text-[14px] font-bold tabular-nums"
            style={{ color: 'var(--split-credit)' }}
          >
            +{formatCurrency(Number(sponsor.amount))}
          </span>

          {isAdmin && (
              <>
                <button
                  onClick={() => setOpenMenu(true)}
                  className="h-11 w-11 -my-1.5 -mr-1.5 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] active:bg-[var(--hover-bg)] transition-colors"
                  aria-label="Sponsor actions"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
                  </svg>
                </button>
                <ActionSheet
                  open={openMenu}
                  onOpenChange={setOpenMenu}
                  title={`Actions for ${sponsor.sponsor_name}`}
                  items={[
                    { label: 'Edit', icon: <Pencil size={17} />, color: 'var(--text)', onClick: () => onEdit(sponsor) },
                    { label: 'Delete', icon: <Trash2 size={17} />, color: 'var(--red)', onClick: () => onDelete(sponsor), dividerBefore: true },
                  ]}
                />
              </>
            )}
          </div>
      </div>
    </div>
  );
}

// ── Deleted sponsor row ──
function DeletedSponsorRow({ sponsor, onRestore }: { sponsor: CricketSponsorship; onRestore: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl p-2.5" style={{ background: 'var(--surface)' }}>
      <SponsorAvatar name={sponsor.sponsor_name} size="sm" />
      <div className="flex-1 min-w-0">
        <Text as="p" size="sm" weight="semibold" truncate className="line-through opacity-60">{sponsor.sponsor_name}</Text>
        <Text as="p" size="2xs" color="muted">
          {formatCurrency(Number(sponsor.amount))}
          {sponsor.deleted_by && <> &middot; by {sponsor.deleted_by}</>}
        </Text>
      </div>
      <Button variant="secondary" size="sm" onClick={onRestore} className="flex-shrink-0 gap-1.5">
        <RotateCcw size={13} />
        Restore
      </Button>
    </div>
  );
}

// ── Main component ──
export default function SponsorshipSection() {
  const { userAccess, user } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const adminName = (user?.user_metadata?.full_name as string) || user?.email || '';
  const { sponsorships, selectedSeasonId, addSponsorship, updateSponsorship, deleteSponsorship, restoreSponsorship } = useCricketStore();

  const allSeasonSponsors = sponsorships.filter((s) => s.season_id === selectedSeasonId);
  const activeSponsors = allSeasonSponsors.filter((s) => !s.deleted_at);
  const deletedSponsors = allSeasonSponsors.filter((s) => s.deleted_at);
  const totalSponsorship = activeSponsors.reduce((sum, s) => sum + Number(s.amount), 0);

  // ── Drawer form state ──
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingSponsor, setDeletingSponsor] = useState<{ id: string; name: string } | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const SPONSOR_FORM_KEY = 'cricket_sponsor_form_draft';
  const getSavedForm = () => {
    try { const s = sessionStorage.getItem(SPONSOR_FORM_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  };
  const draft = getSavedForm();
  const [name, setName] = useState(draft?.name ?? '');
  const [amount, setAmount] = useState(draft?.amount ?? '');
  const [date, setDate] = useState(draft?.date ?? new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState(draft?.notes ?? '');

  useEffect(() => {
    if (draft && (draft.name || draft.amount)) setDrawerOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (drawerOpen && (name || amount)) {
      sessionStorage.setItem(SPONSOR_FORM_KEY, JSON.stringify({ name, amount, date, notes, editingId }));
    }
  }, [name, amount, date, notes, editingId, drawerOpen]);

  const [formError, setFormError] = useState('');

  const resetForm = () => {
    setName(''); setAmount(''); setDate(new Date().toISOString().split('T')[0]); setNotes('');
    setEditingId(null); setFormError(''); sessionStorage.removeItem(SPONSOR_FORM_KEY);
  };

  const openAddDrawer = () => { resetForm(); setDrawerOpen(true); };

  const handleEdit = (s: CricketSponsorship) => {
    setEditingId(s.id); setName(s.sponsor_name); setAmount(String(s.amount));
    setDate(s.sponsored_date); setNotes(s.notes || '');
    setDrawerOpen(true);
  };

  const handleSubmit = () => {
    if (!selectedSeasonId) return;
    if (!name.trim()) { setFormError('Enter a sponsor name.'); return; }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) { setFormError('Enter an amount greater than $0.'); return; }
    setFormError('');
    if (editingId) {
      updateSponsorship(editingId, {
        sponsor_name: name.trim(), amount: parseFloat(amount),
        sponsored_date: date, notes: notes.trim() || null,
      }, adminName);
      toast.success('Sponsorship updated');
    } else {
      addSponsorship(selectedSeasonId, {
        sponsor_name: name.trim(), amount: parseFloat(amount),
        sponsored_date: date, notes: notes.trim() || null,
      }, adminName);
      toast.success('Sponsorship added');
    }
    resetForm(); setDrawerOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* ── Header — editorial, type-led; no icon chip ── */}
      <div className="flex items-center justify-between gap-2">
        <Text as="h3" size="lg" weight="bold">Sponsorships</Text>
        {isAdmin && (
          <Button onClick={openAddDrawer} variant="primary" brand="cricket" size="md" className="gap-1.5">
            <Plus size={16} />
            Add Sponsor
          </Button>
        )}
      </div>

      {/* ── Hero stats (only when there are sponsors) ── */}
      {activeSponsors.length > 0 && (
        <HeroStats total={totalSponsorship} count={activeSponsors.length} />
      )}

      {/* ── Sponsor list ── */}
      {activeSponsors.length === 0 ? (
        <EmptyState
          icon={<Handshake size={36} style={{ color: 'var(--cricket)' }} />}
          title="No sponsors yet"
          description="Add team sponsors to track contributions and show your supporters"
          brand="cricket"
          action={isAdmin ? { label: 'Add First Sponsor', onClick: openAddDrawer } : undefined}
        />
      ) : (
        // ONE ledger surface — sponsorship transactions separated by
        // hairlines, not a stack of cards.
        <div
          className="rounded-2xl overflow-hidden divide-y divide-[var(--border)]/55"
          style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}
        >
          {activeSponsors.map((s) => (
            <SponsorCard
              key={s.id}
              sponsor={s}
              isAdmin={isAdmin}
              onEdit={handleEdit}
              onDelete={(sp) => setDeletingSponsor({ id: sp.id, name: sp.sponsor_name })}
            />
          ))}
        </div>
      )}

      {/* ── Deleted — collapsible section under a hairline, matching the
             Guests/Past Players treatment. The red-tinted border box shouted
             about routine soft-deletes. ── */}
      {isAdmin && deletedSponsors.length > 0 && (
        <div className="pt-1" style={{ borderTop: '1px solid color-mix(in srgb, var(--border) 60%, transparent)' }}>
          <button
            onClick={() => setShowDeleted(!showDeleted)}
            className="w-full flex min-h-11 items-center justify-between py-2 px-1 rounded-lg cursor-pointer hover:bg-[var(--hover-bg)] active:bg-[var(--hover-bg)] transition-colors"
          >
            <Text size="sm" weight="semibold" color="muted">Deleted ({deletedSponsors.length})</Text>
            <ChevronDown
              size={16}
              className="transition-transform duration-200"
              style={{ color: 'var(--muted)', transform: showDeleted ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>
          {showDeleted && (
            <div className="pt-1 space-y-1.5">
              {deletedSponsors.map((s) => (
                <DeletedSponsorRow key={s.id} sponsor={s} onRestore={() => restoreSponsorship(s.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add/Edit Composer ── */}
      {isAdmin && (
        <ComposerModal
          open={drawerOpen}
          onClose={() => { resetForm(); setDrawerOpen(false); }}
          title={editingId ? 'Edit Sponsorship' : 'New Sponsorship'}
          footer={
            <Button onClick={handleSubmit} variant="primary" brand="cricket" size="lg" fullWidth>
              {editingId ? 'Update Sponsorship' : 'Add Sponsorship'}
            </Button>
          }
        >
          <Input
            label="Sponsor Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Company or person name"
            brand="cricket"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Amount ($)"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              brand="cricket"
            />
            <Input
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              brand="cricket"
            />
          </div>
          <Input
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — e.g. jersey sponsor"
            brand="cricket"
          />
          {formError && <Alert variant="error" className="text-[13px]">{formError}</Alert>}
        </ComposerModal>
      )}

      {/* ── Delete confirmation ── */}
      <Dialog open={!!deletingSponsor} onOpenChange={(open) => { if (!open) setDeletingSponsor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sponsorship</DialogTitle>
            <DialogDescription>
              Remove sponsorship from <b>{deletingSponsor?.name}</b>? This can be restored from the deleted section.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" brand="cricket" size="md">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              size="md"
              onClick={() => {
                if (!deletingSponsor) return;
                deleteSponsorship(deletingSponsor.id, adminName);
                setDeletingSponsor(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
