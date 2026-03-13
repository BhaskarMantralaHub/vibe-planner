'use client';

import { useVibeStore } from '@/stores/vibe-store';
import { STATUSES, STATUS_KEYS } from '../lib/constants';
import { fmtTime, fmtDate, todayStr } from '../lib/utils';
import type { VibeStatus } from '@/types/vibe';

const STATUS_PRIORITY: Record<string, number> = {
  in_progress: 0,
  scheduled: 1,
  spark: 2,
  done: 3,
};

export default function ListView() {
  const { items: allItems, filter, updateItem, deleteItem, setExpandedNotes, expandedNotes, setOpenMenu } = useVibeStore();
  const items = allItems.filter((i) => !i.deleted_at);

  const filtered = filter
    ? items.filter((i) => i.category === filter)
    : items;

  const sorted = [...filtered].sort(
    (a, b) => (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9),
  );

  const cycleStatus = (currentStatus: VibeStatus): VibeStatus => {
    const idx = STATUS_KEYS.indexOf(currentStatus);
    return STATUS_KEYS[(idx + 1) % STATUS_KEYS.length] as VibeStatus;
  };

  const today = todayStr();

  return (
    <div className="p-4 max-w-3xl mx-auto">
      {sorted.length === 0 && (
        <div className="text-center py-12 text-[15px] text-[var(--dim)]">
          No vibes yet. Add one above!
        </div>
      )}

      {sorted.map((vibe) => {
        const status = STATUSES[vibe.status];
        const isDone = vibe.status === 'done';
        const isNotesOpen = expandedNotes === vibe.id;

        // Due date logic
        let dueDateLabel = '';
        let dueDateColor = '';
        if (vibe.due_date) {
          const dueMs = new Date(vibe.due_date + 'T00:00:00').getTime();
          const todayMs = new Date(today + 'T00:00:00').getTime();
          const daysUntil = Math.round((dueMs - todayMs) / 86400000);
          if (daysUntil < 0) { dueDateLabel = 'Overdue · ' + fmtDate(vibe.due_date); dueDateColor = 'var(--red)'; }
          else if (daysUntil === 0) { dueDateLabel = 'Due today'; dueDateColor = 'var(--orange)'; }
          else if (daysUntil === 1) { dueDateLabel = 'Due tomorrow'; dueDateColor = 'var(--orange)'; }
          else if (daysUntil <= 3) { dueDateLabel = 'Due in ' + daysUntil + ' days'; dueDateColor = 'var(--orange)'; }
          else { dueDateLabel = fmtDate(vibe.due_date); dueDateColor = 'var(--green)'; }
        }

        return (
          <div key={vibe.id} className="border-b border-[var(--border)] px-4 py-4 group">
            {/* Row 1: status + text + menu */}
            <div className="flex items-start gap-3">
              <button
                onClick={() => updateItem(vibe.id, { status: cycleStatus(vibe.status) })}
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[var(--hover-bg)] transition-colors text-lg mt-0.5"
                style={{ color: status.color }}
                title={status.label}
              >
                {status.icon}
              </button>

              <div className="flex-1 min-w-0">
                <span className={`text-[17px] leading-relaxed block ${isDone ? 'line-through text-[var(--dim)]' : 'text-[var(--text)]'}`}>
                  {vibe.text}
                </span>

                {/* Row 2: metadata */}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {/* Due date */}
                  {isDone && vibe.completed_at ? (
                    <span className="text-[13px] font-medium" style={{ color: 'var(--green)' }}>
                      ✓ Completed {fmtDate(vibe.completed_at.split('T')[0])}
                    </span>
                  ) : vibe.due_date ? (
                    <span className="text-[13px] font-medium" style={{ color: dueDateColor }}>
                      📅 {dueDateLabel}
                    </span>
                  ) : null}

                  {/* Category */}
                  {vibe.category && (
                    <span className="text-[12px] px-2 py-0.5 rounded-lg bg-[var(--surface)] text-[var(--muted)]">
                      {vibe.category}
                    </span>
                  )}

                  {/* Time */}
                  {vibe.time_spent > 0 && (
                    <span className="text-[12px] px-2 py-0.5 rounded-lg bg-[var(--blue)]/10 text-[var(--blue)]">
                      ⏱ {fmtTime(vibe.time_spent)}
                    </span>
                  )}

                  {/* Notes indicator */}
                  {vibe.notes && (
                    <button
                      onClick={() => setExpandedNotes(isNotesOpen ? null : vibe.id)}
                      className="text-[12px] px-2 py-0.5 rounded-lg bg-[var(--orange)]/10 text-[var(--orange)] cursor-pointer hover:opacity-70"
                    >
                      📝 {isNotesOpen ? 'Hide' : 'Notes'}
                    </button>
                  )}

                  {/* Created date */}
                  <span className="text-[12px] text-[var(--blue)] font-medium ml-auto">
                    {fmtDate(vibe.created_at.split('T')[0])}
                  </span>
                </div>

                {/* Notes expanded */}
                {isNotesOpen && vibe.notes && (
                  <div className="mt-2 text-[14px] text-[var(--muted)] leading-relaxed whitespace-pre-wrap break-words border-l-2 border-[var(--orange)]/30 pl-3">
                    {vibe.notes}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setOpenMenu(vibe.id)}
                  data-menu-id={vibe.id}
                  className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[var(--hover-bg)] text-[var(--dim)] hover:text-[var(--text)] text-lg transition-colors"
                >
                  ⋮
                </button>
                <button
                  onClick={() => deleteItem(vibe.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[var(--hover-bg)] text-[var(--muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--red)] text-sm transition-all"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
