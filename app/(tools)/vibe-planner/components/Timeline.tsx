'use client';

import { DndContext, DragEndEvent, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useVibeStore } from '@/stores/vibe-store';
import { getWeekDates, todayStr } from '../lib/utils';
import type { Vibe } from '@/types/vibe';
import VibeCard from './VibeCard';

function DayColumn({ date, items }: { date: string; items: Vibe[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: date });
  const isToday = date === todayStr();
  const d = new Date(date + 'T00:00:00');
  const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNum = d.getDate();

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[130px] rounded-xl p-2 min-h-[140px] transition-colors ${
        isToday
          ? 'bg-[var(--today-bg)] border border-[var(--indigo)]'
          : 'bg-[var(--surface)]'
      } ${isOver ? 'ring-2 ring-[var(--indigo)]/50' : ''}`}
    >
      {/* Day header */}
      <div className="text-center mb-2">
        <div className={`text-[10px] uppercase tracking-wide ${isToday ? 'text-[var(--indigo)]' : 'text-[var(--dim)]'}`}>
          {dayName}
        </div>
        <div className={`text-lg font-bold ${isToday ? 'text-[var(--indigo)]' : 'text-[var(--text)]'}`}>
          {dayNum}
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-0">
        {items.map((vibe) => (
          <VibeCard key={vibe.id} vibe={vibe} />
        ))}
      </div>
    </div>
  );
}

export default function Timeline() {
  const { items: allItems, weekOffset, filter, setWeekOffset, updateItem, setDragId } = useVibeStore();
  const items = allItems.filter((i) => !i.deleted_at);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const weekDates = getWeekDates(weekOffset);

  const filtered = filter
    ? items.filter((i) => i.category === filter)
    : items;

  const unscheduled = filtered.filter((i) => !i.due_date);

  const weekLabel = weekOffset === 0
    ? 'This Week'
    : weekOffset === 1
      ? 'Next Week'
      : weekOffset === -1
        ? 'Last Week'
        : `${weekOffset > 0 ? '+' : ''}${weekOffset} Weeks`;

  const handleDragEnd = (event: DragEndEvent) => {
    setDragId(null);
    const { active, over } = event;
    if (!over) return;

    const vibeId = active.id as string;
    const targetDate = over.id as string;

    const vibe = items.find((i) => i.id === vibeId);
    const updates: Partial<Vibe> = { due_date: targetDate };

    if (vibe && vibe.status === 'spark') {
      updates.status = 'scheduled';
    }

    updateItem(vibeId, updates);
  };

  return (
    <div className="p-4">
      {/* Week navigation */}
      <div className="flex items-center justify-center gap-4 mb-4">
        <button
          onClick={() => setWeekOffset(weekOffset - 1)}
          className="text-[var(--muted)] hover:text-[var(--text)] text-sm px-2 py-1 rounded-md hover:bg-[var(--hover-bg)] transition-colors"
        >
          ← Prev
        </button>
        <span className="text-sm font-semibold text-[var(--text)] min-w-[100px] text-center">
          {weekLabel}
        </span>
        <button
          onClick={() => setWeekOffset(weekOffset + 1)}
          className="text-[var(--muted)] hover:text-[var(--text)] text-sm px-2 py-1 rounded-md hover:bg-[var(--hover-bg)] transition-colors"
        >
          Next →
        </button>
      </div>

      {/* Day columns */}
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setDragId(e.active.id as string)}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col md:flex-row gap-3">
          {weekDates.map((date) => (
            <DayColumn
              key={date}
              date={date}
              items={filtered.filter((i) => i.due_date === date)}
            />
          ))}
        </div>

        {/* Unscheduled vibes — drag these onto days */}
        {unscheduled.length > 0 && (
          <div className="mt-6">
            <h3 className="text-[15px] font-medium text-[var(--muted)] mb-3 px-1">
              No due date — set one via ⋮ menu or drag to a day
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {unscheduled.map((vibe) => (
                <VibeCard key={vibe.id} vibe={vibe} />
              ))}
            </div>
          </div>
        )}
      </DndContext>
    </div>
  );
}
