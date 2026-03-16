'use client';

import { useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';

export default function PlayerManager() {
  const { user } = useAuthStore();
  const { players, addPlayer, updatePlayer, removePlayer, showPlayerForm, setShowPlayerForm, editingPlayer, setEditingPlayer } = useCricketStore();
  const activePlayers = players.filter((p) => p.is_active);

  const [name, setName] = useState('');
  const [jersey, setJersey] = useState('');
  const [phone, setPhone] = useState('');

  const resetForm = () => { setName(''); setJersey(''); setPhone(''); setEditingPlayer(null); };

  const handleSubmit = () => {
    if (!user || !name.trim()) return;

    if (editingPlayer) {
      updatePlayer(editingPlayer, {
        name: name.trim(),
        jersey_number: jersey ? Number(jersey) : null,
        phone: phone.trim() || null,
      });
    } else {
      addPlayer(user.id, {
        name: name.trim(),
        jersey_number: jersey ? Number(jersey) : null,
        phone: phone.trim() || null,
      });
    }
    resetForm();
    setShowPlayerForm(false);
  };

  const handleEdit = (p: typeof players[0]) => {
    setEditingPlayer(p.id);
    setName(p.name);
    setJersey(p.jersey_number?.toString() ?? '');
    setPhone(p.phone ?? '');
    setShowPlayerForm(true);
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-[var(--text)]">Players ({activePlayers.length})</h3>
        <button
          onClick={() => { resetForm(); setShowPlayerForm(!showPlayerForm); }}
          className="rounded-lg bg-gradient-to-r from-[var(--orange)] to-[var(--red)] px-3 py-1.5 text-[13px] font-medium text-white cursor-pointer hover:opacity-90 transition-all"
        >
          {showPlayerForm ? 'Cancel' : '+ Add Player'}
        </button>
      </div>

      {showPlayerForm && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex-1 min-w-[140px]">
            <label className="mb-1 block text-[12px] text-[var(--muted)]">Name *</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none"
              placeholder="Player name"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </div>
          <div className="w-20">
            <label className="mb-1 block text-[12px] text-[var(--muted)]">Jersey #</label>
            <input
              type="number" value={jersey} onChange={(e) => setJersey(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none"
              placeholder="#"
            />
          </div>
          <div className="w-36">
            <label className="mb-1 block text-[12px] text-[var(--muted)]">Phone</label>
            <input
              value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none"
              placeholder="Optional"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="rounded-lg bg-[var(--green)] px-4 py-2 text-[13px] font-medium text-white cursor-pointer disabled:opacity-50"
          >
            {editingPlayer ? 'Update' : 'Add'}
          </button>
        </div>
      )}

      {activePlayers.length === 0 ? (
        <p className="text-[14px] text-[var(--muted)] text-center py-6">No players yet. Add your first player above.</p>
      ) : (
        <div className="space-y-1">
          {activePlayers.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--hover-bg)] transition-colors group">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--orange)]/30 bg-[var(--orange)]/10 text-[13px] font-bold text-[var(--orange)]">
                {p.jersey_number ? `#${p.jersey_number}` : '—'}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[14px] font-medium text-[var(--text)]">{p.name}</span>
                {p.phone && <span className="ml-2 text-[12px] text-[var(--muted)]">{p.phone}</span>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(p)} className="rounded-lg px-2 py-1 text-[12px] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer">
                  Edit
                </button>
                <button onClick={() => removePlayer(p.id)} className="rounded-lg px-2 py-1 text-[12px] text-[var(--red)] hover:bg-[var(--red)]/10 cursor-pointer">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
