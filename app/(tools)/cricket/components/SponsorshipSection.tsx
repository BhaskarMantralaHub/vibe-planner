'use client';

import { useState, useEffect, useRef } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency, formatDate } from '../lib/utils';
import {
  EmptyState, Text, CardMenu, Badge, Input,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter, DialogClose,
  Drawer, DrawerHandle, DrawerTitle, DrawerHeader, DrawerBody,
} from '@/components/ui';
import {
  Handshake, Pencil, Trash2, Plus,
  Calendar, StickyNote, ChevronDown, RotateCcw,
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
        background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))',
        color: 'white',
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
    <div
      className="relative rounded-2xl p-4 sm:p-5 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, var(--cricket-deep), color-mix(in srgb, var(--cricket) 25%, var(--card)))',
        border: '1px solid color-mix(in srgb, var(--cricket) 30%, transparent)',
        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06), 0 4px 24px var(--cricket-glow)',
      }}
    >
      {/* Decorative glow orb */}
      <div
        className="absolute -top-12 -right-12 h-32 w-32 rounded-full pointer-events-none"
        style={{ background: 'var(--cricket)', opacity: 0.08, filter: 'blur(40px)' }}
      />
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <Text as="p" size="2xs" weight="medium" uppercase tracking="wider" className="mb-1 opacity-60" color="white">
            Total Sponsorships
          </Text>
          <Text as="p" size="2xl" weight="bold" color="white" tabular tracking="tight">
            {formatCurrency(total)}
          </Text>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}
          >
            <Handshake size={20} color="white" />
          </div>
          <Text size="2xs" weight="medium" color="white" className="opacity-60">
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
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className="group relative rounded-xl overflow-hidden transition-all duration-200"
      style={{
        background: 'var(--elevated)',
        border: '1px solid var(--border)',
        boxShadow: 'inset 0 1px 0 0 var(--inner-glow)',
      }}
    >
      {/* Top accent bar */}
      <div
        className="h-[3px]"
        style={{ background: 'linear-gradient(90deg, var(--cricket), var(--cricket-accent))' }}
      />

      <div className="p-3 sm:p-4">
        {/* Main row: avatar + info + amount */}
        <div className="flex items-start gap-3">
          <SponsorAvatar name={sponsor.sponsor_name} />

          <div className="flex-1 min-w-0">
            <Text as="p" size="md" weight="semibold" truncate>
              {sponsor.sponsor_name}
            </Text>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <div className="flex items-center gap-1">
                <Calendar size={11} style={{ color: 'var(--muted)' }} />
                <Text size="2xs" color="muted">{formatDate(sponsor.sponsored_date)}</Text>
              </div>
              {sponsor.notes && (
                <>
                  <Text size="2xs" color="dim">&middot;</Text>
                  <div className="flex items-center gap-1 min-w-0">
                    <StickyNote size={11} style={{ color: 'var(--muted)' }} />
                    <Text size="2xs" color="muted" truncate>{sponsor.notes}</Text>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="green" size="md" className="font-bold tabular-nums">
              +{formatCurrency(Number(sponsor.amount))}
            </Badge>

            {isAdmin && (
              <>
                <button
                  ref={openMenu ? menuBtnRef : null}
                  onClick={() => setOpenMenu(!openMenu)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
                  aria-label="Sponsor actions"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
                  </svg>
                </button>
                {openMenu && (
                  <CardMenu
                    anchorRef={menuBtnRef}
                    onClose={() => setOpenMenu(false)}
                    items={[
                      { label: 'Edit', icon: <Pencil size={15} />, color: 'var(--text)', onClick: () => onEdit(sponsor) },
                      { label: 'Delete', icon: <Trash2 size={15} />, color: 'var(--red)', onClick: () => onDelete(sponsor), dividerBefore: true },
                    ]}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Audit footer */}
        <div className="mt-3 pt-2.5 flex items-center gap-3 flex-wrap" style={{ borderTop: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}>
          <div className="flex items-center gap-1.5">
            <Badge variant="muted" size="sm">Added</Badge>
            <Text size="2xs" weight="medium">{formatDate(sponsor.created_at?.split('T')[0] || sponsor.sponsored_date)}</Text>
            {sponsor.created_by && (
              <Text size="2xs" color="muted">
                by <Text weight="semibold">{sponsor.created_by}</Text>
              </Text>
            )}
          </div>
          {sponsor.updated_by && (
            <div className="flex items-center gap-1.5">
              <Badge variant="blue" size="sm">Updated</Badge>
              <Text size="2xs" weight="medium">{sponsor.updated_at ? formatDate(sponsor.updated_at.split('T')[0]) : ''}</Text>
              <Text size="2xs" color="muted">
                by <Text weight="semibold">{sponsor.updated_by}</Text>
              </Text>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Deleted sponsor row ──
function DeletedSponsorRow({ sponsor, onRestore }: { sponsor: CricketSponsorship; onRestore: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl p-2.5" style={{ background: 'var(--surface)', border: '1px solid color-mix(in srgb, var(--border) 40%, transparent)' }}>
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
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--cricket) 15%, transparent)' }}
          >
            <Handshake size={16} style={{ color: 'var(--cricket)' }} />
          </div>
          <Text as="h3" size="lg" weight="bold">Sponsorships</Text>
        </div>
        {isAdmin && (
          <Button onClick={openAddDrawer} variant="primary" brand="cricket" size="sm" className="gap-1.5">
            <Plus size={15} />
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
        <div className="space-y-3">
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

      {/* ── Deleted section ── */}
      {isAdmin && deletedSponsors.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid color-mix(in srgb, var(--red) 20%, var(--border))' }}>
          <button
            onClick={() => setShowDeleted(!showDeleted)}
            className="w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Text size="sm" weight="semibold" color="danger">Deleted</Text>
              <Badge variant="red" size="sm">{deletedSponsors.length}</Badge>
            </div>
            <ChevronDown
              size={16}
              className="transition-transform duration-200"
              style={{ color: 'var(--muted)', transform: showDeleted ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>
          {showDeleted && (
            <div className="px-3 pb-3 space-y-2">
              {deletedSponsors.map((s) => (
                <DeletedSponsorRow key={s.id} sponsor={s} onRestore={() => restoreSponsorship(s.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add/Edit Drawer ── */}
      {isAdmin && (
        <Drawer open={drawerOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setDrawerOpen(open); }}>
          <DrawerHandle />
          <DrawerTitle>{editingId ? 'Edit Sponsorship' : 'Add Sponsorship'}</DrawerTitle>
          <DrawerHeader>
            <div className="flex items-center gap-3">
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}
              >
                <Handshake size={18} color="white" />
              </div>
              <div>
                <Text as="p" size="lg" weight="bold">{editingId ? 'Edit Sponsorship' : 'New Sponsorship'}</Text>
                <Text as="p" size="2xs" color="muted">Track contributions from supporters</Text>
              </div>
            </div>
          </DrawerHeader>
          <DrawerBody>
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
            <div className="pt-2 pb-2">
              <Button onClick={handleSubmit} variant="primary" brand="cricket" size="lg" fullWidth>
                {editingId ? 'Update Sponsorship' : 'Add Sponsorship'}
              </Button>
            </div>
          </DrawerBody>
        </Drawer>
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
              <Button variant="secondary" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              size="sm"
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
