'use client';

import { DndContext, DragEndEvent, DragStartEvent, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useVibeStore } from '@/stores/vibe-store';
import { useAuthStore } from '@/stores/auth-store';
import { STATUSES, STATUS_KEYS } from '../lib/constants';
import type { Vibe, VibeStatus } from '@/types/vibe';
import VibeCard from './VibeCard';
import { EmptyState, Text } from '@/components/ui';

function Column({ status, items }: { status: string; items: Vibe[] }) {
  const s = STATUSES[status];
  const { isOver, setNodeRef } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[220px] bg-[var(--surface)] rounded-2xl p-3 transition-colors ${
        isOver ? 'ring-2 ring-[var(--toolkit-accent)]/50' : ''
      }`}
      data-testid={`board-column-${status}`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 mb-4 px-1">
        <span style={{ color: s.color }}>{s.icon}</span>
        <Text size="lg" weight="semibold">{s.label}</Text>
        <Text size="sm" color="dim" className="ml-auto" tabular>{items.length}</Text>
      </div>

      {/* Cards */}
      <div className="space-y-0">
        {items.length > 0 ? (
          items.map((vibe) => <VibeCard key={vibe.id} vibe={vibe} />)
        ) : (
          <Text as="div" size="lg" color="dim" align="center" className="py-10">
            Drop vibes here
          </Text>
        )}
      </div>
    </div>
  );
}

export default function Board() {
  const { items: allItems, filter, setDragId, updateItem, addItem } = useVibeStore();
  const { user } = useAuthStore();
  const items = allItems.filter((i) => !i.deleted_at);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const filtered = filter
    ? items.filter((i) => i.category === filter)
    : items;

  const handleDragStart = (event: DragStartEvent) => {
    setDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragId(null);
    const { active, over } = event;
    if (!over) return;

    const vibeId = active.id as string;
    const newStatus = over.id as VibeStatus;

    if (STATUS_KEYS.includes(newStatus)) {
      updateItem(vibeId, { status: newStatus });
    }
  };

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon="✨"
        title={filter ? 'No vibes in this category' : 'No vibes yet'}
        description={filter ? 'Try clearing the filter or add a new vibe.' : 'Tap the + button to capture your first spark.'}
        action={{
          label: '+ Add a Vibe',
          onClick: () => addItem(user?.id ?? ''),
        }}
      />
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col md:flex-row gap-4 p-4 overflow-x-auto">
        {STATUS_KEYS.map((status) => (
          <Column
            key={status}
            status={status}
            items={filtered.filter((i) => i.status === status)}
          />
        ))}
      </div>
    </DndContext>
  );
}
