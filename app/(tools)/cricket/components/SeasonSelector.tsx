'use client';

import { useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { SEASON_TYPES } from '../lib/constants';

function useIsAdmin() {
  const { userAccess } = useAuthStore();
  return userAccess.includes('admin');
}

export default function SeasonSelector() {
  const { user } = useAuthStore();
  const { seasons, selectedSeasonId, setSelectedSeason, addSeason } = useCricketStore();
  const isAdmin = useIsAdmin();
  const [showCreate, setShowCreate] = useState(false);
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [newType, setNewType] = useState('summer');

  const handleCreate = () => {
    if (!user) return;
    const typeLabel = SEASON_TYPES.find((t) => t.key === newType)?.label ?? newType;
    addSeason(user.id, { name: `${typeLabel} ${newYear}`, year: newYear, season_type: newType });
    setShowCreate(false);
  };

  return (
    <div className="flex items-center gap-3">
      <select
        value={selectedSeasonId ?? ''}
        onChange={(e) => setSelectedSeason(e.target.value || null)}
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--text)] outline-none"
      >
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
        {seasons.length === 0 && <option value="">No seasons</option>}
      </select>

      {isAdmin && !showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-xl bg-gradient-to-r from-[var(--orange)] to-[var(--red)] px-3 py-2 text-[13px] font-medium text-white cursor-pointer hover:opacity-90 transition-all"
        >
          + New Season
        </button>
      ) : isAdmin && showCreate ? (
        <div className="flex items-center gap-2">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[13px] text-[var(--text)] outline-none"
          >
            {SEASON_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <input
            type="number"
            value={newYear}
            onChange={(e) => setNewYear(Number(e.target.value))}
            className="w-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[13px] text-[var(--text)] outline-none"
          />
          <button onClick={handleCreate} className="rounded-lg bg-[var(--green)] px-3 py-1.5 text-[13px] text-white cursor-pointer">
            Create
          </button>
          <button onClick={() => setShowCreate(false)} className="text-[13px] text-[var(--muted)] cursor-pointer">
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
