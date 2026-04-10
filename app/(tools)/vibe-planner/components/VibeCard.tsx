'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDraggable } from '@dnd-kit/core';
import type { Vibe } from '@/types/vibe';
import { useVibeStore } from '@/stores/vibe-store';
import { STATUSES } from '../lib/constants';
import { fmtTime, fmtDate, todayStr } from '../lib/utils';
import CardNotes from './CardNotes';
import CardMenu from './CardMenu';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Briefcase, Home, Palette, BookOpen, Heart, Calendar, CircleCheck } from 'lucide-react';
import { Text } from '@/components/ui';

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

  const hasBadges = vibe.category || vibe.time_spent > 0;
  const isOverdue = vibe.due_date && vibe.status !== 'done' && vibe.due_date < todayStr();

  const handleCardClick = () => {
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
      : undefined,
    opacity: isDragging ? 0.4 : 1,
    borderLeftColor: status.color,
    transition: isDragging ? 'none' : 'transform 200ms ease, opacity 200ms ease',
  };

  return (
    <div className="relative mb-2">
      <div
        ref={setNodeRef}
        {...(isMobile ? {} : { ...listeners, ...attributes })}
        className={`rounded-[14px] p-3.5 relative border ${
          isOverdue ? 'border-[var(--red)]/50' : 'border-[var(--border)]'
        } ${!isMobile ? 'cursor-grab active:cursor-grabbing' : ''
        } ${isDragging ? '' : 'transition-shadow hover:translate-y-[-1px]'
        } ${isExpanded ? 'ring-1 ring-[var(--toolkit)]' : ''}`}
        style={{
          transform: style.transform,
          opacity: style.opacity,
          transition: isDragging ? 'none' : 'box-shadow 0.2s, opacity 0.2s',
          background: isOverdue
            ? 'linear-gradient(135deg, rgba(248,113,113,0.08), rgba(248,113,113,0.03))'
            : status.gradient,
          boxShadow: isDragging
            ? '0 20px 40px rgba(0,0,0,0.3)'
            : isOverdue
              ? '0 0 0 1px rgba(248,113,113,0.2), var(--card-shadow)'
              : isExpanded ? 'var(--card-hover-shadow)' : 'var(--card-shadow)',
        }}
        data-testid="vibe-card"
        onClick={handleCardClick}
        onContextMenu={handleContextMenu}
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
              className="w-full bg-transparent text-[17px] text-[var(--text)] outline-none border-b-2 border-[var(--toolkit-accent)] pb-1"
              value={editText}
              onChange={(e) => useVibeStore.getState().setEditingCard(vibe.id, e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingCard(null); }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onDoubleClick={(e) => { e.stopPropagation(); setEditingCard(vibe.id, vibe.text); }}
              className={`text-[16px] font-medium leading-relaxed block tracking-[-0.01em] ${
                vibe.status === 'done' ? 'line-through text-[var(--dim)]' : 'text-[var(--text)]'
              }`}
            >
              {vibe.text}
            </span>
          )}

          {/* Due date or completed date */}
          {vibe.status === 'done' && vibe.completed_at ? (
            <div className="flex items-center gap-1.5 mt-2">
              <CircleCheck size={14} className="text-[var(--green)]" />
              <Text size="sm" weight="semibold" color="success">
                Completed {fmtDate(vibe.completed_at.split('T')[0])}
              </Text>
            </div>
          ) : (
            vibe.due_date && <DueDateDisplay dueDate={vibe.due_date} vibeId={vibe.id} vibeStatus={vibe.status} />
          )}

          {/* Badges */}
          {hasBadges && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {vibe.category && <CategoryBadge category={vibe.category} vibeId={vibe.id} />}
              {vibe.time_spent > 0 && (
                <Text size="sm" className="px-2.5 py-0.5 rounded-lg bg-[var(--blue)]/10 text-[var(--blue)]">
                  ⏱ {fmtTime(vibe.time_spent)}
                </Text>
              )}
            </div>
          )}

          {/* Timestamp */}
          <Text as="div" size="md" weight="medium" align="right" className="mt-2.5 text-[var(--blue)]">
            Added {fmtDate(vibe.created_at.split('T')[0])}
            {vibe.updated_at && vibe.updated_at.split('T')[0] !== vibe.created_at.split('T')[0] && ' · edited'}
          </Text>
        </div>

        {/* Menu button — prominent on mobile */}
        <button
          onClick={handleMenuToggle}
          data-menu-id={vibe.id}
          className="text-[var(--muted)] bg-[var(--surface)] border border-[var(--border)] hover:text-[var(--text)] hover:bg-[var(--hover-bg)] w-10 h-10 flex items-center justify-center rounded-xl transition-colors text-xl shrink-0"
          title="Options"
        >
          ⋮
        </button>
      </div>

      {/* Notes — always visible if they exist */}
      {vibe.notes && !isNotesExpanded && (
        <div
          className="mt-3 cursor-pointer group/notes"
          onClick={(e) => {
            if ((e.target as HTMLElement).tagName === 'A') return;
            e.stopPropagation();
            setExpandedNotes(vibe.id);
          }}
        >
          <div className="rounded-xl p-3.5 transition-all hover:shadow-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-[15px] text-[var(--text)] leading-[1.7] break-words tracking-[-0.005em]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                      className="text-[var(--blue)] font-medium underline decoration-[var(--blue)]/40 hover:decoration-[var(--blue)] underline-offset-2 transition-colors break-all">
                      {children}
                    </a>
                  ),
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
                  li: ({ children }) => <li>{children}</li>,
                  strong: ({ children }) => <strong className="font-bold text-[var(--text)]">{children}</strong>,
                  em: ({ children }) => <em className="italic">{children}</em>,
                  code: ({ children }) => (
                    <code className="text-[13px] px-1.5 py-0.5 rounded-md bg-[var(--card)] text-[var(--orange)] font-mono border border-[var(--border)]">{children}</code>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-3 border-[var(--toolkit)] pl-4 my-2 text-[var(--muted)]">{children}</blockquote>
                  ),
                  h1: ({ children }) => <h1 className="text-[18px] font-bold text-[var(--text)] mb-2">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-[16px] font-bold text-[var(--text)] mb-1.5">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-[15px] font-semibold text-[var(--text)] mb-1">{children}</h3>,
                  hr: () => <hr className="border-[var(--border)] my-3" />,
                }}
              >
                {vibe.notes}
              </ReactMarkdown>
            </div>
            <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[var(--border)]">
              <Text size="2xs" weight="medium" color="muted">📝 Notes</Text>
              <Text size="2xs" weight="medium" className="text-[var(--blue)] opacity-0 group-hover/notes:opacity-100 transition-opacity">Tap to edit</Text>
            </div>
          </div>
        </div>
      )}

      {/* Notes editor */}
      {isNotesExpanded && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]" onClick={(e) => e.stopPropagation()}>
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
          <Text as="p" size="lg" color="dim" className="italic">
            Tap to add a note...
          </Text>
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

const CATEGORY_STYLES: Record<string, { bg: string; text: string; icon: React.ComponentType<{ size?: number; color?: string; className?: string }> }> = {
  Work:     { bg: '#2563eb', text: '#ffffff', icon: Briefcase },
  Personal: { bg: '#0d9488', text: '#ffffff', icon: Home },
  Creative: { bg: '#ea580c', text: '#ffffff', icon: Palette },
  Learning: { bg: '#16a34a', text: '#ffffff', icon: BookOpen },
  Health:   { bg: '#e11d48', text: '#ffffff', icon: Heart },
};

function CategoryBadge({ category, vibeId }: { category: string; vibeId: string }) {
  const [open, setOpen] = useState(false);
  const { updateItem } = useVibeStore();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const style = CATEGORY_STYLES[category];
  if (!style) return null;
  const Icon = style.icon;

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuHeight = 280; // approximate dropdown height
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < menuHeight ? rect.top - menuHeight : rect.bottom + 4;
      setPos({ top: Math.max(8, top), left: Math.max(8, rect.left) });
    }
    setOpen(!open);
  };

  const handleSelect = (cat: string | null, e: React.MouseEvent) => {
    e.stopPropagation();
    updateItem(vibeId, { category: cat as Vibe['category'] });
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1 rounded-lg shadow-sm cursor-pointer hover:opacity-85 active:scale-95 transition-all"
        style={{ background: style.bg, color: style.text }}
      >
        <Icon size={12} />
        {category}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[150]" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div
            className="fixed z-[151] bg-[var(--card)] border border-[var(--border)] rounded-xl p-1.5 shadow-2xl min-w-[150px] animate-[scaleIn_0.15s]"
            style={{ top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {Object.entries(CATEGORY_STYLES).map(([cat, s]) => {
              const CatIcon = s.icon;
              const isActive = cat === category;
              return (
                <button
                  key={cat}
                  onClick={(e) => handleSelect(isActive ? null : cat, e)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                    isActive ? 'text-white' : 'text-[var(--text)] hover:bg-[var(--hover-bg)]'
                  }`}
                  style={isActive ? { background: s.bg } : undefined}
                >
                  <CatIcon size={14} color={isActive ? '#fff' : s.bg} />
                  <span>{cat}</span>
                </button>
              );
            })}
            <div className="border-t border-[var(--border)] my-1" />
            <button
              onClick={(e) => handleSelect(null, e)}
              className="flex items-center w-full px-3 py-2 rounded-lg text-[13px] text-[var(--red)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
            >
              Remove
            </button>
          </div>
        </>,
        document.body
      )}
    </>
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
    <div className="flex items-center gap-1.5 mt-2">
      <button
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold cursor-pointer hover:opacity-80 transition-opacity px-2.5 py-1 rounded-lg"
        style={{ color, background: `${color}15` }}
        onClick={handleClick}
      >
        <Calendar size={13} />
        {label}
      </button>
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
