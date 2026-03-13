'use client';

import { useVibeStore } from '@/stores/vibe-store';
import { useAuthStore } from '@/stores/auth-store';
import { isCloudMode } from '@/lib/supabase/client';
import { CATEGORIES } from '../lib/constants';
import { todayStr, getGreeting } from '../lib/utils';
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
          <div className="text-[18px] lg:text-[22px] font-bold text-[var(--green)]">{todayDone}<span className="text-[13px] font-normal text-[var(--muted)]">/{todayScheduled}</span></div>
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
    </>
  );
}
