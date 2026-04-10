'use client';

import { useState, useEffect, useRef } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency, formatDate } from '../lib/utils';
import { EmptyState, Text, CardMenu, Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter, DialogClose } from '@/components/ui';
import { Handshake, EllipsisVertical, Pencil, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { toast } from 'sonner';

// SponsorMenu replaced by shared CardMenu

export default function SponsorshipSection() {
  const { userAccess, user } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const adminName = (user?.user_metadata?.full_name as string) || user?.email || '';
  const { sponsorships, selectedSeasonId, addSponsorship, updateSponsorship, deleteSponsorship, restoreSponsorship } = useCricketStore();

  const allSeasonSponsors = sponsorships.filter((s) => s.season_id === selectedSeasonId);
  const activeSponsors = allSeasonSponsors.filter((s) => !s.deleted_at);
  const deletedSponsors = allSeasonSponsors.filter((s) => s.deleted_at);
  const totalSponsorship = activeSponsors.reduce((sum, s) => sum + Number(s.amount), 0);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deletingSponsor, setDeletingSponsor] = useState<{ id: string; name: string } | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

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
    if (draft && (draft.name || draft.amount)) setShowForm(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showForm && (name || amount)) {
      sessionStorage.setItem(SPONSOR_FORM_KEY, JSON.stringify({ name, amount, date, notes, editingId }));
    }
  }, [name, amount, date, notes, editingId, showForm]);

  const [formError, setFormError] = useState('');

  const resetForm = () => { setName(''); setAmount(''); setDate(new Date().toISOString().split('T')[0]); setNotes(''); setEditingId(null); setFormError(''); sessionStorage.removeItem(SPONSOR_FORM_KEY); };

  const handleSubmit = () => {
    if (!selectedSeasonId) return;
    if (!name.trim()) {
      setFormError('Enter a sponsor name.');
      return;
    }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setFormError('Enter an amount greater than $0.');
      return;
    }
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
    resetForm(); setShowForm(false);
  };

  const handleEdit = (s: typeof activeSponsors[0]) => {
    setEditingId(s.id); setName(s.sponsor_name); setAmount(String(s.amount));
    setDate(s.sponsored_date); setNotes(s.notes || '');
    setShowForm(true);
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-5 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Handshake size={18} style={{ color: 'var(--cricket)' }} />
          <Text as="h3" size="lg" weight="bold">Sponsorships</Text>
          {totalSponsorship > 0 && (
            <Text size="sm" weight="bold" color="success">{formatCurrency(totalSponsorship)}</Text>
          )}
        </div>
        {isAdmin && (
          <Button onClick={() => { resetForm(); setShowForm(!showForm); }}
            variant="primary" brand="cricket" size="sm" className="flex-shrink-0 whitespace-nowrap">
            {showForm ? '✕ Close' : '+ Add'}
          </Button>
        )}
      </div>

      {/* Form */}
      {isAdmin && showForm && (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 space-y-3">
          <div>
            <Text as="label" size="2xs" weight="semibold" color="muted" uppercase tracking="wide" className="mb-1 block">Sponsor Name *</Text>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
              placeholder="Company or person name" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Text as="label" size="2xs" weight="semibold" color="muted" uppercase tracking="wide" className="mb-1 block">Amount ($) *</Text>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
                placeholder="0.00" />
            </div>
            <div>
              <Text as="label" size="2xs" weight="semibold" color="muted" uppercase tracking="wide" className="mb-1 block">Date</Text>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors" />
            </div>
          </div>
          <div>
            <Text as="label" size="2xs" weight="semibold" color="muted" uppercase tracking="wide" className="mb-1 block">Notes</Text>
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
              placeholder="Optional" />
          </div>
          {formError && <Alert variant="error" className="text-[13px]">{formError}</Alert>}
          <Button onClick={handleSubmit}
            variant="primary" brand="cricket" size="md" fullWidth>
            {editingId ? 'Update Sponsorship' : 'Add Sponsorship'}
          </Button>
        </div>
      )}

      {/* Active List */}
      {activeSponsors.length === 0 ? (
        <EmptyState
          icon={<Handshake size={36} style={{ color: 'var(--cricket)' }} />}
          title="No sponsors yet"
          description="Add team sponsors to track contributions"
          brand="cricket"
          action={isAdmin ? { label: '+ Add Sponsor', onClick: () => { resetForm(); setShowForm(true); } } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {activeSponsors.map((s) => (
            <div key={s.id} className="relative rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 sm:p-3 overflow-hidden"
              style={{ borderLeftWidth: '4px', borderLeftColor: 'var(--cricket)' }}>

              {/* Three-dot menu */}
              {isAdmin && (
                <>
                  <button ref={openMenu === s.id ? menuBtnRef : null}
                    onClick={() => setOpenMenu(openMenu === s.id ? null : s.id)}
                    className="absolute top-2 right-2 h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors">
                    <EllipsisVertical size={12} />
                  </button>
                  {openMenu === s.id && (
                    <CardMenu
                      anchorRef={menuBtnRef}
                      onClose={() => setOpenMenu(null)}
                      items={[
                        { label: 'Edit', icon: <Pencil size={15} />, color: 'var(--text)', onClick: () => handleEdit(s) },
                        { label: 'Delete', icon: <Trash2 size={15} />, color: 'var(--red)', onClick: () => setDeletingSponsor({ id: s.id, name: s.sponsor_name }), dividerBefore: true },
                      ]}
                    />
                  )}
                </>
              )}

              <div className="flex items-start gap-3 pr-8">
                <div className="flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center"
                  style={{ background: 'color-mix(in srgb, var(--cricket-accent) 8%, transparent)' }}>
                  <Handshake size={16} style={{ color: 'var(--cricket-accent)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <Text as="p" size="sm" weight="semibold" truncate className="sm:text-[14px]">{s.sponsor_name}</Text>
                  <Text as="p" size="2xs" color="muted">
                    {formatDate(s.sponsored_date)}
                    {s.notes && <> &middot; {s.notes}</>}
                  </Text>
                </div>
                <Text size="md" weight="bold" color="success" className="sm:text-[15px] flex-shrink-0">
                  +{formatCurrency(Number(s.amount))}
                </Text>
              </div>

              {/* Audit footer */}
              <div className="mt-2 pt-2 border-t border-[var(--border)]/30 space-y-0.5 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
                    style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>Added</span>
                  <span className="text-[var(--text)] font-bold">{formatDate(s.created_at?.split('T')[0] || s.sponsored_date)}</span>
                  {s.created_by && <span className="text-[var(--muted)] font-medium">by <span className="text-[var(--text)] font-bold">{s.created_by}</span></span>}
                </div>
                {s.updated_by && (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
                      style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>Updated</span>
                    <span className="text-[var(--text)] font-bold">{s.updated_at ? formatDate(s.updated_at.split('T')[0]) : ''}</span>
                    <span className="text-[var(--muted)] font-medium">by <span className="text-[var(--text)] font-bold">{s.updated_by}</span></span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deleted sponsorships */}
      {isAdmin && deletedSponsors.length > 0 && (
        <div className="mt-4 rounded-2xl border border-[var(--red)]/20 overflow-hidden">
          <button onClick={() => setShowDeleted(!showDeleted)}
            className="w-full flex items-center justify-between p-3 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors">
            <Text size="sm" weight="semibold" color="danger">Deleted ({deletedSponsors.length})</Text>
            <Text size="xs" color="muted">{showDeleted ? '▲' : '▼'}</Text>
          </button>
          {showDeleted && (
            <div className="px-3 pb-3 space-y-2">
              {deletedSponsors.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)]/50 bg-[var(--surface)] p-2.5">
                  <div className="flex-1 min-w-0">
                    <Text as="p" size="sm" weight="semibold" truncate>{s.sponsor_name}</Text>
                    <Text as="p" size="2xs" color="muted">
                      {formatDate(s.sponsored_date)}
                      {s.deleted_by && <> &middot; Deleted by <Text weight="bold">{s.deleted_by}</Text></>}
                    </Text>
                  </div>
                  <Text size="sm" weight="bold" className="flex-shrink-0">{formatCurrency(Number(s.amount))}</Text>
                  <button onClick={() => restoreSponsorship(s.id)}
                    className="flex-shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold cursor-pointer active:scale-95 transition-all"
                    style={{ background: 'var(--surface)', color: 'var(--green)', border: '1.5px solid var(--border)' }}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Delete Sponsorship confirmation */}
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
