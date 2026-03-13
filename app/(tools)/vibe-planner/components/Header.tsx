'use client';

import { useState } from 'react';
import { useVibeStore } from '@/stores/vibe-store';
import { useAuthStore } from '@/stores/auth-store';
import { isCloudMode } from '@/lib/supabase/client';
import { CATEGORIES } from '../lib/constants';
import type { Vibe } from '@/types/vibe';
import { todayStr, getGreeting } from '../lib/utils';
import { Filter, X } from 'lucide-react';
import ViewTabs from './ViewTabs';

export default function Header() {
  const {
    items: allItems,
    view,
    newText,
    filter,
    setView,
    setNewText,
    setFilter,
    addItem,
  } = useVibeStore();
  const items = allItems.filter((i) => !i.deleted_at);

  const { user } = useAuthStore();
  const cloud = isCloudMode();

  const userId = user?.id ?? '';
  const userName = (user?.user_metadata?.full_name as string) || '';
  const greeting = cloud && userName ? getGreeting(userName) : null;

  // Stats
  const total = items.length;
  const inProgress = items.filter((i) => i.status === 'in_progress').length;
  const today = todayStr();
  const todayDone = items.filter((i) => i.status === 'done' && i.completed_at?.split('T')[0] === today).length;
  const todayDue = items.filter((i) => i.due_date === today && i.status !== 'done').length;

  const handleAdd = () => {
    addItem(userId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  };

  return (
    <>
    {/* Scrollable section — greeting, quote, stats */}
    <div className="px-4 lg:px-5 pt-4 lg:pt-5">
      {greeting && (
        <h2 className="text-[18px] lg:text-[24px] font-semibold mb-2 lg:mb-3 bg-gradient-to-r from-[var(--purple)] via-[var(--blue)] to-[var(--indigo)] bg-clip-text text-transparent">
          {greeting} {(() => {
            const h = new Date().getHours();
            if (h >= 5 && h < 12) return '☀️';
            if (h >= 12 && h < 17) return '🌤️';
            if (h >= 17 && h < 22) return '🌙';
            return '✨';
          })()}
        </h2>
      )}
      {/* Stats — compact on mobile */}
      <div className="flex items-center gap-2 lg:gap-3 mb-3 overflow-x-auto" data-testid="stats-row">
        <div className="bg-[var(--surface)] rounded-xl lg:rounded-2xl px-3 lg:px-4 py-2 lg:py-3 shrink-0">
          <div className="text-[11px] lg:text-[13px] text-[var(--muted)]">Vibes</div>
          <div className="text-[18px] lg:text-[22px] font-bold text-[var(--purple)]">{total}</div>
        </div>
        <div className="bg-[var(--surface)] rounded-xl lg:rounded-2xl px-3 lg:px-4 py-2 lg:py-3 shrink-0">
          <div className="text-[11px] lg:text-[13px] text-[var(--muted)]">Active</div>
          <div className="text-[18px] lg:text-[22px] font-bold text-[var(--blue)]">{inProgress}</div>
        </div>
        <div className="bg-[var(--surface)] rounded-xl lg:rounded-2xl px-3 lg:px-4 py-2 lg:py-3 shrink-0">
          <div className="text-[11px] lg:text-[13px] text-[var(--muted)]">Today</div>
          <div className="text-[18px] lg:text-[22px] font-bold text-[var(--green)]">
            {todayDone}
            <span className="text-[12px] font-normal text-[var(--dim)]"> done</span>
          </div>
          {todayDue > 0 && <div className="text-[11px] font-semibold text-[var(--orange)]">{todayDue} due</div>}
        </div>

        {/* View tabs inline with stats on mobile */}
        <div className="ml-auto shrink-0">
          <ViewTabs
            view={view}
            onViewChange={(v) => setView(v as 'board' | 'timeline' | 'list')}
          />
        </div>

        {!cloud && (
          <span className="text-[11px] text-[var(--dim)] px-2 py-1 rounded-lg bg-[var(--surface)] shrink-0">
            Local
          </span>
        )}
      </div>
    </div>

    {/* Sticky section — input + filters only */}
    <div className="sticky top-[52px] bg-[var(--bg)] z-30 px-4 lg:px-5 pb-3 pt-2 border-b border-[var(--border)]">
      <div className="flex items-center gap-2 lg:gap-3 mb-2" data-testid="input-row">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What's on your mind?"
          className="flex-1 lg:max-w-xl bg-[var(--surface)] border border-[var(--border)] rounded-2xl text-[var(--text)] px-4 py-3 text-[15px] lg:text-[17px] outline-none focus:border-[var(--purple)] focus:ring-2 focus:ring-[var(--purple)]/20 placeholder:text-[var(--dim)] transition-all"
          data-testid="new-vibe-input"
        />

        <button
          onClick={handleAdd}
          className="bg-[var(--indigo)] text-white rounded-2xl px-5 py-3 text-[14px] lg:text-[15px] font-medium hover:opacity-90 transition-opacity shrink-0 shadow-sm cursor-pointer"
          data-testid="add-vibe-button"
        >
          + Add
        </button>

        {/* Category filter — inline on desktop */}
        <div className="hidden lg:block">
          <CategoryFilter items={items} filter={filter} setFilter={setFilter} />
        </div>
      </div>

      {/* Category filter — below on mobile */}
      <div className="lg:hidden">
        <CategoryFilter items={items} filter={filter} setFilter={setFilter} />
      </div>
    </div>
    </>
  );
}

function CategoryFilter({ items, filter, setFilter }: { items: Vibe[]; filter: string; setFilter: (f: string) => void }) {
  const [open, setOpen] = useState(false);

  const categories = [
    { key: '', label: 'All Vibes' },
    ...CATEGORIES.map(c => ({ key: c, label: c })),
  ];

  const activeLabel = categories.find(c => c.key === filter)?.label || 'All Vibes';
  const activeCount = filter ? items.filter(i => i.category === filter).length : items.length;

  return (
    <div className="relative" data-testid="category-filter">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[14px] font-medium cursor-pointer transition-all bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--muted)] text-[var(--text)]"
      >
        <Filter size={15} className="text-[var(--purple)]" />
        <span>{activeLabel}</span>
        <span className="text-[12px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--purple)]/15 text-[var(--purple)]">{activeCount}</span>
        {filter && (
          <span
            onClick={(e) => { e.stopPropagation(); setFilter(''); setOpen(false); }}
            className="ml-1 w-5 h-5 flex items-center justify-center rounded-full hover:bg-[var(--hover-bg)] text-[var(--dim)] hover:text-[var(--text)]"
          >
            <X size={12} />
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-12 z-50 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-2 shadow-2xl min-w-[200px] animate-[scaleIn_0.15s]">
            {categories.map((cat) => {
              const count = cat.key ? items.filter(i => i.category === cat.key).length : items.length;
              const isActive = filter === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => { setFilter(isActive && cat.key ? '' : cat.key); setOpen(false); }}
                  className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[var(--purple)]/15 text-[var(--purple)]'
                      : 'text-[var(--text)] hover:bg-[var(--hover-bg)]'
                  }`}
                >
                  <span>{cat.label}</span>
                  <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-md ${
                    isActive ? 'bg-[var(--purple)]/20 text-[var(--purple)]' : 'bg-[var(--border)] text-[var(--dim)]'
                  }`}>{count}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
