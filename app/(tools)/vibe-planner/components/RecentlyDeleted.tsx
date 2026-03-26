'use client';

import { useVibeStore } from '@/stores/vibe-store';
import { fmtDate } from '../lib/utils';
import { Button, Badge, Text } from '@/components/ui';

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
        <Text weight="medium">Recently Deleted</Text>
        <Badge variant="muted" size="md">
          {trashed.length}
        </Badge>
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
                  <Text size="lg" color="muted" className="flex-1 line-through leading-relaxed">
                    {vibe.text}
                  </Text>
                </div>

                {/* Dates */}
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  {vibe.deleted_at && (
                    <Text size="sm" color="dim">🗑 Deleted {formatAgo(vibe.deleted_at)}</Text>
                  )}
                  {vibe.completed_at && (
                    <Text size="sm" color="dim">✓ Completed {fmtDate(vibe.completed_at.split('T')[0])}</Text>
                  )}
                  {vibe.due_date && (
                    <Text size="sm" color="dim">📅 Due {fmtDate(vibe.due_date)}</Text>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[var(--blue)] hover:bg-[var(--blue)]/10 hover:text-[var(--blue)]"
                    onClick={() => restoreItem(vibe.id)}
                  >
                    ↩ Restore
                  </Button>
                  <Button
                    variant="danger-outline"
                    size="sm"
                    onClick={() => permanentlyDelete(vibe.id)}
                  >
                    ✕ Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {trashed.length > 1 && (
            <Button
              variant="danger-outline"
              size="sm"
              className="mt-1"
              onClick={clearTrash}
            >
              Empty Trash
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
