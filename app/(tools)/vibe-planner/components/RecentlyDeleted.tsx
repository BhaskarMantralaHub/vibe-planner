'use client';

import { useVibeStore } from '@/stores/vibe-store';
import { fmtDate } from '../lib/utils';

export default function RecentlyDeleted() {
  const { items, showTrash, setShowTrash, restoreItem, permanentlyDelete, clearTrash } = useVibeStore();

  const trashed = items.filter((i) => i.deleted_at);
  if (trashed.length === 0) return null;

  const formatAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="px-5 pb-8 mt-6">
      <button
        onClick={() => setShowTrash(!showTrash)}
        className="flex items-center gap-3 text-[17px] text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer mb-4 py-2"
      >
        <span className="text-xl">🗑</span>
        <span className="font-medium">Recently Deleted</span>
        <span className="text-[14px] bg-[var(--surface)] px-2.5 py-1 rounded-xl font-medium">
          {trashed.length}
        </span>
        <span className="text-[14px] ml-1">{showTrash ? '▼' : '▶'}</span>
      </button>

      {showTrash && (
        <div className="animate-[slideIn_0.15s]">
          <div className="space-y-3 mb-4">
            {trashed.map((vibe) => (
              <div
                key={vibe.id}
                className="bg-[var(--surface)] rounded-2xl p-4"
              >
                <div className="flex items-start gap-3 mb-2">
                  <span className="flex-1 text-[16px] text-[var(--muted)] line-through leading-relaxed">
                    {vibe.text}
                  </span>
                </div>

                {/* Dates */}
                <div className="flex flex-wrap items-center gap-3 mb-2 text-[13px] text-[var(--dim)]">
                  {vibe.deleted_at && (
                    <span>🗑 Deleted {formatAgo(vibe.deleted_at)}</span>
                  )}
                  {vibe.completed_at && (
                    <span>✓ Completed {fmtDate(vibe.completed_at.split('T')[0])}</span>
                  )}
                  {vibe.due_date && (
                    <span>📅 Due {fmtDate(vibe.due_date)}</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => restoreItem(vibe.id)}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-[var(--blue)] hover:bg-[var(--blue)]/10 transition-colors cursor-pointer"
                  >
                    ↩ Restore
                  </button>
                  <button
                    onClick={() => permanentlyDelete(vibe.id)}
                    className="px-3 py-1.5 rounded-lg text-[13px] text-[var(--red)] hover:bg-[var(--red)]/10 transition-colors cursor-pointer"
                  >
                    ✕ Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {trashed.length > 1 && (
            <button
              onClick={clearTrash}
              className="text-[13px] text-[var(--red)] hover:opacity-70 transition-opacity cursor-pointer mt-1"
            >
              Empty Trash
            </button>
          )}
        </div>
      )}
    </div>
  );
}
