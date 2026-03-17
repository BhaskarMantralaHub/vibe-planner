'use client';

import { useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency, formatDate } from '../lib/utils';
import { FaHandshake } from 'react-icons/fa';
import { MdDeleteOutline } from 'react-icons/md';

export default function SponsorshipSection() {
  const { userAccess } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const { sponsorships, selectedSeasonId, addSponsorship, deleteSponsorship } = useCricketStore();

  const seasonSponsors = sponsorships.filter((s) => s.season_id === selectedSeasonId);
  const totalSponsorship = seasonSponsors.reduce((sum, s) => sum + Number(s.amount), 0);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    if (!selectedSeasonId || !name.trim() || !amount) return;
    addSponsorship(selectedSeasonId, {
      sponsor_name: name.trim(),
      amount: parseFloat(amount),
      sponsored_date: date,
      notes: notes.trim() || null,
    });
    setName(''); setAmount(''); setNotes(''); setShowForm(false);
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-5 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FaHandshake size={18} style={{ color: 'var(--orange)' }} />
          <h3 className="text-[16px] font-bold text-[var(--text)]">Sponsorships</h3>
          {totalSponsorship > 0 && (
            <span className="text-[13px] font-bold text-[var(--green)]">{formatCurrency(totalSponsorship)}</span>
          )}
        </div>
        {isAdmin && (
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-[12px] sm:text-[13px] font-medium cursor-pointer transition-all flex-shrink-0 whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)', color: '#fff', border: '1.5px solid #D97706' }}>
            {showForm ? '✕ Close' : '+ Add'}
          </button>
        )}
      </div>

      {/* Add form */}
      {isAdmin && showForm && (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Sponsor Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors"
              placeholder="Company or person name" />
          </div>
          <div className="grid grid-cols-[1fr_130px] gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Amount ($) *</label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors"
                placeholder="0.00" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors"
              placeholder="Optional" />
          </div>
          <button onClick={handleSubmit} disabled={!name.trim() || !amount}
            className="w-full rounded-xl py-2.5 text-[13px] font-bold text-white cursor-pointer active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)', border: '1.5px solid #D97706' }}>
            Add Sponsorship
          </button>
        </div>
      )}

      {/* List */}
      {seasonSponsors.length === 0 ? (
        <p className="text-[13px] text-[var(--muted)] text-center py-4">No sponsorships yet this season.</p>
      ) : (
        <div className="space-y-2">
          {seasonSponsors.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 sm:p-3"
              style={{ borderLeftWidth: '4px', borderLeftColor: 'var(--orange)' }}>
              <div className="flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center"
                style={{ background: '#D9770615' }}>
                <FaHandshake size={16} style={{ color: '#D97706' }} />
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
              {isAdmin && (
                <button onClick={() => deleteSponsorship(s.id)}
                  className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--red)]/10 hover:text-[var(--red)] transition-colors">
                  <MdDeleteOutline size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
