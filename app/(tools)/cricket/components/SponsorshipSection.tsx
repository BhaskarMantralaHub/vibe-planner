'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency, formatDate } from '../lib/utils';
import { FaHandshake, FaEllipsisV } from 'react-icons/fa';
import { MdEdit, MdDeleteOutline, MdRestore } from 'react-icons/md';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

function SponsorMenu({ anchorRef, onEdit, onDelete, onClose }: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onEdit: () => void; onDelete: () => void; onClose: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: Math.min(rect.right - 150, window.innerWidth - 158) });
    }
    const close = () => onClose();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [anchorRef, onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[99]" onClick={onClose} />
      <div className="fixed z-[100] w-[150px] rounded-xl overflow-hidden shadow-2xl animate-[scaleIn_0.1s]"
        style={{ top: pos.top, left: pos.left, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <button onClick={() => { onEdit(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium hover:bg-[var(--hover-bg)] text-left cursor-pointer"
          style={{ color: 'var(--text)' }}>
          <MdEdit size={15} style={{ color: 'var(--blue)' }} /> Edit
        </button>
        <button onClick={() => { onDelete(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium hover:bg-[var(--hover-bg)] text-left cursor-pointer"
          style={{ color: 'var(--red)' }}>
          <MdDeleteOutline size={15} /> Delete
        </button>
      </div>
    </>,
    document.body,
  );
}

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

  const resetForm = () => { setName(''); setAmount(''); setDate(new Date().toISOString().split('T')[0]); setNotes(''); setEditingId(null); sessionStorage.removeItem(SPONSOR_FORM_KEY); };

  const handleSubmit = () => {
    if (!selectedSeasonId || !name.trim() || !amount) return;
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
    setShowForm(true); setOpenMenu(null);
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-5 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FaHandshake size={18} style={{ color: 'var(--cricket)' }} />
          <h3 className="text-[16px] font-bold text-[var(--text)]">Sponsorships</h3>
          {totalSponsorship > 0 && (
            <span className="text-[13px] font-bold text-[var(--green)]">{formatCurrency(totalSponsorship)}</span>
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
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Sponsor Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
              placeholder="Company or person name" />
          </div>
          <div className="grid grid-cols-[1fr_130px] gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Amount ($) *</label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
                placeholder="0.00" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
              placeholder="Optional" />
          </div>
          <Button onClick={handleSubmit} disabled={!name.trim() || !amount}
            variant="primary" brand="cricket" size="md" fullWidth>
            {editingId ? 'Update Sponsorship' : 'Add Sponsorship'}
          </Button>
        </div>
      )}

      {/* Active List */}
      {activeSponsors.length === 0 ? (
        <p className="text-[13px] text-[var(--muted)] text-center py-4">No sponsorships yet this season.</p>
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
                    <FaEllipsisV size={12} />
                  </button>
                  {openMenu === s.id && (
                    <SponsorMenu anchorRef={menuBtnRef}
                      onEdit={() => handleEdit(s)}
                      onDelete={() => { deleteSponsorship(s.id, adminName); setOpenMenu(null); }}
                      onClose={() => setOpenMenu(null)} />
                  )}
                </>
              )}

              <div className="flex items-start gap-3 pr-8">
                <div className="flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center"
                  style={{ background: 'color-mix(in srgb, var(--cricket-accent) 8%, transparent)' }}>
                  <FaHandshake size={16} style={{ color: 'var(--cricket-accent)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] sm:text-[14px] font-semibold text-[var(--text)] truncate">{s.sponsor_name}</p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {formatDate(s.sponsored_date)}
                    {s.notes && <> &middot; {s.notes}</>}
                  </p>
                </div>
                <span className="text-[14px] sm:text-[15px] font-extrabold text-[var(--green)] flex-shrink-0">
                  +{formatCurrency(Number(s.amount))}
                </span>
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
            <span className="text-[13px] font-semibold text-[var(--red)]">Deleted ({deletedSponsors.length})</span>
            <span className="text-[var(--muted)] text-[12px]">{showDeleted ? '▲' : '▼'}</span>
          </button>
          {showDeleted && (
            <div className="px-3 pb-3 space-y-2">
              {deletedSponsors.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)]/50 bg-[var(--surface)] p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--text)] truncate">{s.sponsor_name}</p>
                    <p className="text-[11px] text-[var(--muted)]">
                      {formatDate(s.sponsored_date)}
                      {s.deleted_by && <> &middot; Deleted by <span className="font-bold text-[var(--text)]">{s.deleted_by}</span></>}
                    </p>
                  </div>
                  <span className="text-[13px] font-bold text-[var(--text)] flex-shrink-0">{formatCurrency(Number(s.amount))}</span>
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
    </div>
  );
}
