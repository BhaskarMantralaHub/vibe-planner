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

  const seasonOrder: Record<string, number> = { spring: 0, summer: 1, fall: 2 };
  const sortedSeasons = [...seasons].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return (seasonOrder[a.season_type] ?? 0) - (seasonOrder[b.season_type] ?? 0);
  });
  const selectedSeason = sortedSeasons.find((s) => s.id === selectedSeasonId);

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

  const [createError, setCreateError] = useState('');

  const handleCreate = () => {
    if (!user) return;
    const typeLabel = SEASON_TYPES.find((t) => t.key === newType)?.label ?? newType;
    const newName = `${typeLabel} ${newYear}`;

    // Check for duplicate season
    const duplicate = seasons.find((s) => s.name.toLowerCase() === newName.toLowerCase());
    if (duplicate) {
      setCreateError(`"${newName}" already exists.`);
      return;
    }
    setCreateError('');
    addSeason(user.id, { name: newName, year: newYear, season_type: newType });
    setShowCreate(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Custom dropdown instead of native select */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[14px] font-medium cursor-pointer transition-all bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--muted)] text-[var(--text)]"
        >
          <span>{selectedSeason?.name ?? 'No seasons'}</span>
          <span className={`text-[var(--muted)] text-[10px] transition-transform ${showDropdown ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {showDropdown && sortedSeasons.length > 0 && (
          <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl py-1">
            {sortedSeasons.map((s) => (
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
            {SEASON_TYPES.map((t) => {
              const exists = seasons.some((s) => s.season_type === t.key && s.year === newYear);
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => !exists && setNewType(t.key)}
                  disabled={exists}
                  className="rounded-lg px-2.5 py-1.5 text-[12px] cursor-pointer transition-all border disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: newType === t.key && !exists ? 'var(--orange)' : 'transparent',
                    borderColor: newType === t.key && !exists ? 'var(--orange)' : 'var(--border)',
                    color: newType === t.key && !exists ? 'white' : 'var(--muted)',
                  }}
                >
                  {t.label} {exists ? '✓' : ''}
                </button>
              );
            })}
          </div>
          <input
            type="number"
            value={newYear}
            onChange={(e) => setNewYear(Number(e.target.value))}
            className="w-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[13px] text-[var(--text)] outline-none"
          />
          <button onClick={handleCreate}
            disabled={seasons.some((s) => s.season_type === newType && s.year === newYear)}
            className="rounded-lg bg-[var(--green)] px-3 py-1.5 text-[13px] text-white cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
            Create
          </button>
          <button onClick={() => { setShowCreate(false); setCreateError(''); }} className="text-[13px] text-[var(--muted)] cursor-pointer">
            Cancel
          </button>
          {createError && (
            <span className="text-[12px] text-[var(--red)] w-full">{createError}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
