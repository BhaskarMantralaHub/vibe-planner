'use client';

import { useState, useRef, useEffect } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { SEASON_TYPES } from '../lib/constants';
import { Alert } from '@/components/ui/alert';
import { Text } from '@/components/ui';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

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
  const yearInputRef = useRef<HTMLInputElement>(null);

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
      setCreateError(`${newName} already exists. Try a different season type or year.`);
      yearInputRef.current?.focus();
      yearInputRef.current?.select();
      return;
    }
    setCreateError('');
    addSeason(user.id, { name: newName, year: newYear, season_type: newType });
    toast.success(`Season "${newName}" created`);
    setShowCreate(false);
  };

  const seasonIcon: Record<string, string> = { spring: '🌱', summer: '☀️', fall: '🍂' };
  const activeIcon = selectedSeason ? (seasonIcon[selectedSeason.season_type] ?? '📅') : '📅';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Season selector */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="group flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-full text-[14px] font-semibold cursor-pointer transition-all bg-[var(--card)] border border-[var(--border)] hover:border-[var(--cricket)]/40 hover:shadow-sm text-[var(--text)]"
        >
          <span className="text-[16px]">{activeIcon}</span>
          <Text weight="bold">{selectedSeason?.name ?? 'No seasons'}</Text>
          <span className={`flex items-center justify-center h-5 w-5 rounded-full bg-[var(--hover-bg)] group-hover:bg-[var(--cricket)]/10 text-[var(--muted)] text-[9px] transition-transform ${showDropdown ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {showDropdown && sortedSeasons.length > 0 && (
          <div className="absolute left-0 top-full mt-1.5 z-[60] w-max min-w-[180px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl py-1.5 animate-slide-in">
            {sortedSeasons.map((s) => {
              const isActive = s.id === selectedSeasonId;
              const icon = seasonIcon[s.season_type] ?? '📅';
              return (
                <button
                  key={s.id}
                  onClick={() => { setSelectedSeason(s.id); setShowDropdown(false); }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[14px] cursor-pointer transition-colors ${
                    isActive
                      ? 'text-[var(--cricket)] bg-[var(--cricket)]/5 font-bold'
                      : 'text-[var(--text)] hover:bg-[var(--hover-bg)]'
                  }`}
                >
                  <span className="text-[15px]">{icon}</span>
                  <span className="flex-1 text-left">{s.name}</span>
                  {isActive && <span className="h-2 w-2 rounded-full bg-[var(--cricket)]" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* New season */}
      {isAdmin && !showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center justify-center h-9 w-9 rounded-full border border-dashed border-[var(--cricket)]/40 text-[var(--cricket)] cursor-pointer hover:bg-[var(--cricket)]/10 hover:border-[var(--cricket)] transition-all active:scale-95"
          title="New Season"
          aria-label="New Season"
        >
          <Plus size={16} strokeWidth={2.25} />
        </button>
      ) : isAdmin && showCreate ? (
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex gap-1.5">
            {SEASON_TYPES.map((t) => {
              const exists = seasons.some((s) => s.season_type === t.key && s.year === newYear);
              const icon = seasonIcon[t.key] ?? '';
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => !exists && setNewType(t.key)}
                  disabled={exists}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium cursor-pointer transition-all border disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: newType === t.key && !exists ? 'var(--cricket)' : 'transparent',
                    borderColor: newType === t.key && !exists ? 'var(--cricket)' : 'var(--border)',
                    color: newType === t.key && !exists ? 'white' : 'var(--muted)',
                  }}
                >
                  {icon} {t.label}{exists ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
          <input
            ref={yearInputRef}
            type="number"
            value={newYear}
            onChange={(e) => setNewYear(Number(e.target.value))}
            className="w-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
          />
          <button onClick={handleCreate}
            disabled={seasons.some((s) => s.season_type === newType && s.year === newYear)}
            className="rounded-full bg-[var(--cricket)] px-3.5 py-1.5 text-[12px] font-bold text-white cursor-pointer hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
            Create
          </button>
          <button onClick={() => { setShowCreate(false); setCreateError(''); }} className="text-[13px] text-[var(--muted)] cursor-pointer hover:text-[var(--text)]">
            Cancel
          </button>
          {createError && (
            <Alert variant="error" className="w-full text-[12px]">{createError}</Alert>
          )}
        </div>
      ) : null}
    </div>
  );
}
