'use client';

import { useRef, useCallback, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Vibe } from '@/types/vibe';
import { useVibeStore } from '@/stores/vibe-store';
import { STATUSES, STATUS_KEYS } from '../lib/constants';
import { fmtTime, fmtDate, todayStr } from '../lib/utils';
import CardNotes from './CardNotes';
import CardMenu from './CardMenu';

function useIsMobile() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
}

export default function VibeCard({ vibe }: { vibe: Vibe }) {
  const {
    editingCard, editText, expandedNotes, openMenu,
    setEditingCard, setExpandedNotes, setOpenMenu, updateItem,
  } = useVibeStore();

  const isMobile = useIsMobile();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: vibe.id });

  const status = STATUSES[vibe.status];
  const isEditing = editingCard === vibe.id;
  const isNotesExpanded = expandedNotes === vibe.id;
  const isMenuOpen = openMenu === vibe.id;
  const [isExpanded, setIsExpanded] = useState(false);
  const [swipeStatus, setSwipeStatus] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const hasBadges = vibe.category || vibe.time_spent > 0;

  // Touch tracking for long-press + swipe
  const touchRef = useRef({ startX: 0, startY: 0, moved: false, longPressed: false, swiped: false });
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, moved: false, longPressed: false, swiped: false };
    setSwipeOffset(0);
    setSwipeStatus(null);

    longPressTimer.current = setTimeout(() => {
      touchRef.current.longPressed = true;
      setOpenMenu(vibe.id);
    }, 500);
  }, [vibe.id, setOpenMenu]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchRef.current.startX;
    const deltaY = touch.clientY - touchRef.current.startY;

    // If moved more than 10px, cancel long-press
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      touchRef.current.moved = true;
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    }

    // Horizontal swipe detection (only if more horizontal than vertical)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 20) {
      setSwipeOffset(deltaX * 0.3); // Damped follow

      const currentIdx = STATUS_KEYS.indexOf(vibe.status);
      if (deltaX > 60 && currentIdx < STATUS_KEYS.length - 1) {
        const next = STATUS_KEYS[currentIdx + 1];
        setSwipeStatus(STATUSES[next].label + ' →');
      } else if (deltaX < -60 && currentIdx > 0) {
        const prev = STATUS_KEYS[currentIdx - 1];
        setSwipeStatus('← ' + STATUSES[prev].label);
      } else {
        setSwipeStatus(null);
      }
    }
  }, [vibe.status]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }

    const deltaX = swipeOffset / 0.3; // Undo damping to get real delta
    const currentIdx = STATUS_KEYS.indexOf(vibe.status);

    // Swipe right → next status
    if (deltaX > 60 && currentIdx < STATUS_KEYS.length - 1) {
      touchRef.current.swiped = true;
      updateItem(vibe.id, { status: STATUS_KEYS[currentIdx + 1] as Vibe['status'] });
    }
    // Swipe left → previous status
    else if (deltaX < -60 && currentIdx > 0) {
      touchRef.current.swiped = true;
      updateItem(vibe.id, { status: STATUS_KEYS[currentIdx - 1] as Vibe['status'] });
    }

    setSwipeOffset(0);
    setSwipeStatus(null);
  }, [swipeOffset, vibe.id, vibe.status, updateItem]);

  const handleCardClick = () => {
    // Don't toggle expand if we just long-pressed or swiped
    if (touchRef.current.longPressed || touchRef.current.swiped || touchRef.current.moved) return;
    setIsExpanded(!isExpanded);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpenMenu(isMenuOpen ? null : vibe.id);
  };

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenu(isMenuOpen ? null : vibe.id);
  };

  const handleSaveEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== vibe.text) {
      updateItem(vibe.id, { text: trimmed });
    }
    setEditingCard(null);
  };

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    borderLeftColor: status.color,
    transition: swipeOffset ? 'none' : undefined,
  };

  return (
    <div className="relative mb-3">
      {/* Swipe status indicator */}
      {swipeStatus && (
        <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
          <span className="text-[13px] font-semibold text-[var(--indigo)] bg-[var(--surface)] px-3 py-1 rounded-xl">
            {swipeStatus}
          </span>
        </div>
      )}
      <div
        ref={setNodeRef}
        {...(isMobile ? {} : { ...listeners, ...attributes })}
        className={`rounded-[14px] p-[18px] relative border border-[var(--border)] transition-all duration-250 ${
          !isMobile ? 'cursor-grab active:cursor-grabbing' : ''
        } ${isExpanded ? 'ring-1 ring-[var(--accent)]' : 'hover:translate-y-[-2px]'}`}
        style={{
          transform: style.transform,
          opacity: style.opacity,
          transition: style.transition,
          background: status.gradient,
          boxShadow: isExpanded ? 'var(--card-hover-shadow)' : 'var(--card-shadow)',
        }}
        data-testid="vibe-card"
        onClick={handleCardClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      >
      {/* Main row */}
      <div className="flex items-start gap-3">
        <span
          className="text-lg mt-0.5 shrink-0 select-none"
          style={{ color: status.color }}
        >
          {status.icon}
        </span>

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              autoFocus
              className="w-full bg-transparent text-[17px] text-[var(--text)] outline-none border-b-2 border-[var(--indigo)] pb-1"
              value={editText}
              onChange={(e) => useVibeStore.getState().setEditingCard(vibe.id, e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingCard(null); }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onDoubleClick={(e) => { e.stopPropagation(); setEditingCard(vibe.id, vibe.text); }}
              className={`text-[17px] leading-relaxed block ${
                vibe.status === 'done' ? 'line-through text-[var(--dim)]' : 'text-[var(--text)]'
              }`}
            >
              {vibe.text}
            </span>
          )}

          {/* Due date or completed date */}
          {vibe.status === 'done' && vibe.completed_at ? (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-[14px] font-medium text-[var(--green)]">
                ✓ Completed {fmtDate(vibe.completed_at.split('T')[0])}
              </span>
            </div>
          ) : (
            vibe.due_date && <DueDateDisplay dueDate={vibe.due_date} vibeId={vibe.id} vibeStatus={vibe.status} />
          )}

          {/* Badges */}
          {hasBadges && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {vibe.category && (
                <span className="text-[13px] px-2.5 py-0.5 rounded-lg bg-[var(--surface)] text-[var(--muted)]">
                  {vibe.category}
                </span>
              )}
              {vibe.time_spent > 0 && (
                <span className="text-[13px] px-2.5 py-0.5 rounded-lg bg-[var(--blue)]/10 text-[var(--blue)]">
                  ⏱ {fmtTime(vibe.time_spent)}
                </span>
              )}
            </div>
          )}

          {/* Timestamp */}
          <div className="mt-2.5 text-[14px] font-medium text-[var(--blue)] text-right">
            Added {fmtDate(vibe.created_at.split('T')[0])}
            {vibe.updated_at && vibe.updated_at.split('T')[0] !== vibe.created_at.split('T')[0] && ' · edited'}
          </div>
        </div>

        {/* Menu button */}
        <button
          onClick={handleMenuToggle}
          data-menu-id={vibe.id}
          className="text-[var(--dim)] hover:text-[var(--text)] hover:bg-[var(--hover-bg)] w-10 h-10 flex items-center justify-center rounded-xl transition-colors text-xl shrink-0"
          title="Options"
        >
          ⋮
        </button>
      </div>

      {/* Notes — always visible if they exist */}
      {vibe.notes && !isNotesExpanded && (
        <div
          className="mt-3 pt-3 border-t border-[var(--border)] cursor-pointer"
          onClick={(e) => {
            // Don't open editor if user clicked a link
            if ((e.target as HTMLElement).tagName === 'A') return;
            e.stopPropagation();
            setExpandedNotes(vibe.id);
          }}
        >
          <div className="text-[15px] text-[var(--muted)] leading-relaxed whitespace-pre-wrap break-words">
            <Linkify text={vibe.notes} />
          </div>
        </div>
      )}

      {/* Notes editor */}
      {isNotesExpanded && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] animate-[slideIn_0.15s]" onClick={(e) => e.stopPropagation()}>
          <CardNotes
            notes={vibe.notes}
            onSave={(notes) => updateItem(vibe.id, { notes })}
            onDelete={() => updateItem(vibe.id, { notes: '' })}
            onClose={() => setExpandedNotes(null)}
          />
        </div>
      )}

      {/* Expand prompt for adding notes */}
      {isExpanded && !vibe.notes && !isNotesExpanded && (
        <div
          className="mt-3 pt-3 border-t border-[var(--border)] animate-[slideIn_0.15s] cursor-pointer"
          onClick={(e) => { e.stopPropagation(); setExpandedNotes(vibe.id); }}
        >
          <p className="text-[15px] text-[var(--dim)] italic">
            Tap to add a note...
          </p>
        </div>
      )}

      {/* Card menu */}
      {isMenuOpen && (
        <CardMenu vibe={vibe} onClose={() => setOpenMenu(null)} />
      )}
    </div>
    </div>
  );
}

function Linkify({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[var(--blue)] underline decoration-[var(--blue)]/30 hover:decoration-[var(--blue)] transition-colors break-all"
          >
            {part.length > 50 ? part.slice(0, 50) + '…' : part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function DueDateDisplay({ dueDate, vibeId, vibeStatus }: { dueDate: string; vibeId: string; vibeStatus: string }) {
  const [editing, setEditing] = useState(false);
  const { updateItem } = useVibeStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const today = todayStr();
  const dueMs = new Date(dueDate + 'T00:00:00').getTime();
  const todayMs = new Date(today + 'T00:00:00').getTime();
  const daysUntil = Math.round((dueMs - todayMs) / 86400000);

  let color: string;
  let label: string;

  if (daysUntil < 0) {
    color = 'var(--red)';
    label = `Overdue · ${fmtDate(dueDate)}`;
  } else if (daysUntil === 0) {
    color = 'var(--orange)';
    label = 'Due today';
  } else if (daysUntil === 1) {
    color = 'var(--orange)';
    label = 'Due tomorrow';
  } else if (daysUntil <= 3) {
    color = 'var(--orange)';
    label = `Due in ${daysUntil} days`;
  } else {
    color = 'var(--green)';
    label = fmtDate(dueDate);
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
    setTimeout(() => inputRef.current?.showPicker?.(), 50);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value || null;
    updateItem(vibeId, {
      due_date: val,
      status: val && vibeStatus === 'spark' ? 'scheduled' : vibeStatus as Vibe['status'],
    });
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <span
        className="text-[14px] font-medium cursor-pointer hover:opacity-70 transition-opacity"
        style={{ color }}
        onClick={handleClick}
      >
        📅 {label}
      </span>
      {editing && (
        <input
          ref={inputRef}
          type="date"
          defaultValue={dueDate}
          onChange={handleChange}
          onBlur={() => setEditing(false)}
          className="absolute opacity-0 w-0 h-0"
          autoFocus
        />
      )}
    </div>
  );
}
