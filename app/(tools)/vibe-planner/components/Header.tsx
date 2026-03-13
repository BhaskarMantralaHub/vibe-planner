'use client';

import { useVibeStore } from '@/stores/vibe-store';
import { useAuthStore } from '@/stores/auth-store';
import { isCloudMode } from '@/lib/supabase/client';
import { CATEGORIES } from '../lib/constants';
import { todayStr, getGreeting } from '../lib/utils';
import ViewTabs from './ViewTabs';
import DailyQuote from './DailyQuote';

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
  const todayDone = items.filter((i) => i.status === 'done' && i.due_date === today).length;
  const todayScheduled = items.filter((i) => i.due_date === today).length;

  const handleAdd = () => {
    addItem(userId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  };

  return (
    <div className="px-5 py-5 border-b border-[var(--border)] sticky top-[52px] bg-[var(--bg)] z-30">
      {/* Greeting */}
      {greeting && (
        <h2 className="text-[20px] lg:text-[24px] font-semibold mb-3 bg-gradient-to-r from-[var(--purple)] via-[var(--blue)] to-[var(--indigo)] bg-clip-text text-transparent">
          {greeting} {(() => {
            const h = new Date().getHours();
            if (h >= 5 && h < 12) return '☀️';
            if (h >= 12 && h < 17) return '🌤️';
            if (h >= 17 && h < 22) return '🌙';
            return '✨';
          })()}
        </h2>
      )}
      <DailyQuote />

      {/* Top row: Stats + View tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        {/* Stats cards */}
        <div className="flex flex-wrap items-center gap-3" data-testid="stats-row">
          <div className="bg-[var(--surface)] rounded-2xl px-4 py-3 min-w-[100px]">
            <div className="text-[13px] text-[var(--muted)]">Total Vibes</div>
            <div className="text-[22px] font-bold text-[var(--purple)]">{total}</div>
          </div>
          <div className="bg-[var(--surface)] rounded-2xl px-4 py-3 min-w-[100px]">
            <div className="text-[13px] text-[var(--muted)]">In Progress</div>
            <div className="text-[22px] font-bold text-[var(--blue)]">{inProgress}</div>
          </div>
          <div className="bg-[var(--surface)] rounded-2xl px-4 py-3 min-w-[100px]">
            <div className="text-[13px] text-[var(--muted)]">Today</div>
            <div className="text-[22px] font-bold text-[var(--green)]">{todayDone}<span className="text-[15px] font-normal text-[var(--muted)]">/{todayScheduled}</span></div>
          </div>
        </div>

        {/* View tabs + User info */}
        <div className="flex items-center gap-4">
          <ViewTabs
            view={view}
            onViewChange={(v) => setView(v as 'board' | 'timeline' | 'list')}
          />

          {!cloud && (
            <span className="text-[13px] text-[var(--dim)] px-3 py-1.5 rounded-xl bg-[var(--surface)]">
              Local Mode
            </span>
          )}
        </div>
      </div>

      {/* Input row */}
      <div className="flex items-center gap-3 mb-4" data-testid="input-row">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What's on your mind?"
          className="flex-1 bg-[var(--surface)] rounded-2xl text-[var(--text)] px-4 py-3.5 text-[17px] outline-none focus:ring-2 focus:ring-[var(--indigo)]/50 placeholder:text-[var(--dim)] transition-all shadow-sm"
          data-testid="new-vibe-input"
        />

        <button
          onClick={handleAdd}
          className="bg-[var(--indigo)] text-white rounded-2xl px-6 py-3 text-[15px] font-medium hover:opacity-90 transition-opacity shrink-0 shadow-sm cursor-pointer"
          data-testid="add-vibe-button"
        >
          + Add
        </button>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap items-center gap-2" data-testid="category-filter">
        <button
          onClick={() => setFilter('')}
          className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer border ${
            !filter
              ? 'bg-[var(--filter-active)] text-white border-transparent shadow-sm'
              : 'bg-[var(--filter-bg)] text-[var(--muted)] border-[var(--filter-border)] hover:bg-[var(--hover-bg)]'
          }`}
        >
          All
          <span className={`ml-1.5 text-[12px] ${!filter ? 'text-white/70' : 'text-[var(--dim)]'}`}>
            {total}
          </span>
        </button>
        {CATEGORIES.map((cat) => {
          const count = items.filter((i) => i.category === cat).length;
          const isActive = filter === cat;
          return (
            <button
              key={cat}
              onClick={() => setFilter(isActive ? '' : cat)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer border ${
                isActive
                  ? 'bg-[var(--filter-active)] text-white border-transparent shadow-sm'
                  : 'bg-[var(--filter-bg)] text-[var(--muted)] border-[var(--filter-border)] hover:bg-[var(--hover-bg)]'
              }`}
            >
              {cat}
              {count > 0 && (
                <span className={`ml-1.5 text-[12px] ${isActive ? 'text-white/70' : 'text-[var(--dim)]'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
