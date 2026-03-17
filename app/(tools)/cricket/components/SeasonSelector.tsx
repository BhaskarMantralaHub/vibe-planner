'use client';

import { useState, useRef, useEffect } from 'react';
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
  const [showDropdown, setShowDropdown] = useState(false);
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [newType, setNewType] = useState('summer');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedSeason = seasons.find((s) => s.id === selectedSeasonId);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showDropdown]);

  const handleCreate = () => {
    if (!user) return;
    const typeLabel = SEASON_TYPES.find((t) => t.key === newType)?.label ?? newType;
    addSeason(user.id, { name: `${typeLabel} ${newYear}`, year: newYear, season_type: newType });
    setShowCreate(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Custom dropdown instead of native select */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--text)] cursor-pointer"
        >
          {selectedSeason?.name ?? 'No seasons'}
          <span className="text-[var(--muted)] text-[12px]">&#9662;</span>
        </button>
        {showDropdown && seasons.length > 0 && (
          <div className="absolute left-0 top-full mt-1 z-50 min-w-[160px] rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl py-1">
            {seasons.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelectedSeason(s.id); setShowDropdown(false); }}
                className={`w-full text-left px-3 py-2 text-[14px] cursor-pointer transition-colors ${
                  s.id === selectedSeasonId
                    ? 'text-[var(--orange)] font-medium bg-[var(--hover-bg)]'
                    : 'text-[var(--text)] hover:bg-[var(--hover-bg)]'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {isAdmin && !showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-xl bg-gradient-to-r from-[var(--orange)] to-[var(--red)] px-3 py-2 text-[13px] font-medium text-white cursor-pointer hover:opacity-90 transition-all whitespace-nowrap"
        >
          + New Season
        </button>
      ) : isAdmin && showCreate ? (
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex gap-1.5">
            {SEASON_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setNewType(t.key)}
                className="rounded-lg px-2.5 py-1.5 text-[12px] cursor-pointer transition-all border"
                style={{
                  backgroundColor: newType === t.key ? 'var(--orange)' : 'transparent',
                  borderColor: newType === t.key ? 'var(--orange)' : 'var(--border)',
                  color: newType === t.key ? 'white' : 'var(--muted)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
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
