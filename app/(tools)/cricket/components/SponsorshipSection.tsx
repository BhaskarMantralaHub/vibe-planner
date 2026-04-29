'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
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
  Calendar, StickyNote, ChevronDown, RotateCcw, TrendingUp, Crown,
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

// ── Sponsor Hero — refined, matches Pool Fund design language ──
function SponsorHero({
  total, count, average, largest,
}: {
  total: number; count: number; average: number;
  largest: { name: string; amount: number } | null;
}) {
  return (
    <div className="relative rounded-3xl overflow-hidden"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      {/* Atmospheric gradient mesh */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden
        style={{
          background: 'radial-gradient(ellipse at 0% 0%, color-mix(in srgb, var(--cricket) 10%, transparent), transparent 55%), radial-gradient(ellipse at 100% 100%, color-mix(in srgb, var(--cricket) 5%, transparent), transparent 50%)',
        }} />

      <div className="relative p-5 sm:p-7">
        {/* Status pill */}
        <div className="flex items-center gap-2 mb-3">
          <Text as="span" size="2xs" weight="bold" color="muted" uppercase tracking="wider">
            Sponsorship Total
          </Text>
          {count > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
              style={{ background: 'var(--split-credit-bg)', border: '1px solid var(--split-credit-border)' }}>
              <Handshake size={9} style={{ color: 'var(--split-credit)' }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--split-credit)' }}>
                {count} sponsor{count !== 1 ? 's' : ''}
              </span>
            </span>
          )}
        </div>

        {/* Focal number */}
        <div className="flex items-baseline gap-2.5 mb-1">
          <span className="font-bold leading-[0.95] tracking-tight tabular-nums"
            style={{
              fontSize: 'clamp(40px, 7vw, 56px)',
              color: 'var(--text)',
              fontFeatureSettings: '"tnum"',
            }}>
            {formatCurrency(total)}
          </span>
        </div>
        {largest && (
          <Text as="p" size="xs" color="muted" className="mb-5">
            Largest from {' '}
            <Text as="span" weight="semibold" style={{ color: 'var(--text)' }}>{largest.name}</Text>
            {' · '}
            <Text as="span" weight="semibold" tabular style={{ color: 'var(--split-credit)' }}>
              {formatCurrency(largest.amount)}
            </Text>
          </Text>
        )}

        {/* Stat strip */}
        {count > 0 && (
          <div className="grid grid-cols-3 rounded-xl overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {([
              { icon: Handshake, label: 'Sponsors', value: String(count), color: 'var(--cricket)' },
              { icon: TrendingUp, label: 'Average', value: formatCurrency(average), color: '#0891B2' },
              { icon: Crown, label: 'Largest', value: largest ? formatCurrency(largest.amount) : '—', color: 'var(--split-credit)' },
            ] as const).map(({ icon: Icon, label, value, color }, i) => (
              <div key={label}
                className="px-3 py-3 sm:py-3.5"
                style={{ borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={11} style={{ color }} />
                  <Text size="2xs" weight="bold" uppercase tracking="wider" style={{ color }}>{label}</Text>
                </div>
                <Text size="md" weight="bold" tabular className="leading-none truncate">
                  {value}
                </Text>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sponsor Row — denser, matches ExpenseRow layout pattern ──
function SponsorRow({
  sponsor, isAdmin, isLast, onEdit, onDelete,
}: {
  sponsor: CricketSponsorship; isAdmin: boolean; isLast: boolean;
  onEdit: (s: CricketSponsorship) => void; onDelete: (s: CricketSponsorship) => void;
}) {
  const [openMenu, setOpenMenu] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div>
      <div className="group relative flex items-start sm:items-center gap-3 px-3 sm:px-4 py-3 transition-colors hover:bg-[var(--hover-bg)]">
        <SponsorAvatar name={sponsor.sponsor_name} size="sm" />

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 mb-0.5">
            <Text as="p" size="sm" weight="semibold" truncate className="flex-1 min-w-0 leading-snug">
              {sponsor.sponsor_name}
            </Text>
            {/* Fixed-width right-aligned amount column with credit-green sign */}
            <Text size="md" weight="bold" tabular className="flex-shrink-0 leading-snug text-right"
              style={{ minWidth: '92px', color: 'var(--split-credit)', fontVariantNumeric: 'tabular-nums' }}>
              +{formatCurrency(Number(sponsor.amount))}
            </Text>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Text size="2xs" color="muted">{formatDate(sponsor.sponsored_date)}</Text>
            {sponsor.notes && (
              <>
                <Text size="2xs" color="dim">·</Text>
                <span className="inline-flex items-center gap-1 min-w-0 max-w-[280px]">
                  <StickyNote size={10} style={{ color: 'var(--dim)' }} className="flex-shrink-0" />
                  <Text size="2xs" color="muted" truncate>{sponsor.notes}</Text>
                </span>
              </>
            )}
            {sponsor.created_by && (
              <>
                <Text size="2xs" color="dim">·</Text>
                <Text size="2xs" color="dim">
                  by <Text as="span" weight="semibold" color="muted">{sponsor.created_by}</Text>
                </Text>
              </>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="flex-shrink-0 self-center">
            <button
              ref={openMenu ? menuBtnRef : null}
              onClick={() => setOpenMenu(!openMenu)}
              className="h-9 w-9 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors"
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
          </div>
        )}
      </div>
      {!isLast && <div className="mx-3 sm:mx-4" style={{ height: '1px', background: 'color-mix(in srgb, var(--border) 50%, transparent)' }} />}
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
  const averageSponsor = activeSponsors.length > 0 ? totalSponsorship / activeSponsors.length : 0;
  const largestSponsor = activeSponsors.length > 0
    ? activeSponsors.reduce((max, s) => Number(s.amount) > Number(max.amount) ? s : max)
    : null;

  // Group active sponsors by month — newest first
  const groupedSponsors = useMemo(() => {
    const groups: { key: string; label: string; total: number; sponsors: typeof activeSponsors }[] = [];
    const sorted = [...activeSponsors].sort((a, b) => b.sponsored_date.localeCompare(a.sponsored_date));
    for (const s of sorted) {
      const date = new Date(s.sponsored_date);
      const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      let group = groups.find((g) => g.key === key);
      if (!group) { group = { key, label, total: 0, sponsors: [] }; groups.push(group); }
      group.sponsors.push(s);
      group.total += Number(s.amount);
    }
    return groups;
  }, [activeSponsors]);

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

      {/* ── Hero + List: side-by-side at lg, stacked below ── */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-6 lg:items-start lg:space-y-0 space-y-4">
        {activeSponsors.length > 0 && (
          <div className="lg:sticky lg:top-20">
            <SponsorHero
              total={totalSponsorship}
              count={activeSponsors.length}
              average={averageSponsor}
              largest={largestSponsor ? { name: largestSponsor.sponsor_name, amount: Number(largestSponsor.amount) } : null}
            />
          </div>
        )}

        <div className="space-y-4">
          {activeSponsors.length === 0 ? (
            <EmptyState
              icon={<Handshake size={36} style={{ color: 'var(--cricket)' }} />}
              title="No sponsors yet"
              description="Add team sponsors to track contributions and show your supporters"
              brand="cricket"
              action={isAdmin ? { label: 'Add First Sponsor', onClick: openAddDrawer } : undefined}
            />
          ) : (
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                boxShadow: 'inset 0 1px 0 0 var(--inner-glow)',
              }}
            >
              {groupedSponsors.map((group, gIdx) => (
                <div key={group.key}>
                  {/* Month header — label + count on left, subtotal pinned right */}
                  <div className="flex items-baseline justify-between gap-3 px-3 sm:px-4 pt-3.5 pb-2.5"
                    style={{ borderTop: gIdx > 0 ? '1px solid var(--border)' : 'none' }}>
                    <div className="flex items-baseline gap-2 min-w-0">
                      <Text size="xs" weight="bold" uppercase tracking="wider" style={{ color: 'var(--text)' }}>
                        {group.label}
                      </Text>
                      <Text size="2xs" color="dim">
                        {group.sponsors.length} {group.sponsors.length === 1 ? 'sponsor' : 'sponsors'}
                      </Text>
                    </div>
                    <Text size="xs" weight="bold" tabular style={{ color: 'var(--split-credit)', fontVariantNumeric: 'tabular-nums' }}>
                      +{formatCurrency(group.total)}
                    </Text>
                  </div>
                  {group.sponsors.map((s, i) => (
                    <SponsorRow
                      key={s.id}
                      sponsor={s}
                      isAdmin={isAdmin}
                      isLast={i === group.sponsors.length - 1}
                      onEdit={handleEdit}
                      onDelete={(sp) => setDeletingSponsor({ id: sp.id, name: sp.sponsor_name })}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
