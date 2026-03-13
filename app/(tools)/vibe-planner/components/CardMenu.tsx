'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Vibe } from '@/types/vibe';
import { useVibeStore } from '@/stores/vibe-store';
import { STATUSES, STATUS_KEYS, CATEGORIES } from '../lib/constants';

interface CardMenuProps {
  vibe: Vibe;
  onClose: () => void;
}

export default function CardMenu({ vibe, onClose }: CardMenuProps) {
  const { updateItem, deleteItem, setExpandedNotes, setOpenMenu } = useVibeStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile once on mount
  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  // Desktop: position near trigger
  useEffect(() => {
    if (isMobile) return;
    const trigger = document.querySelector(`[data-menu-id="${vibe.id}"]`);
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      const menuWidth = 240;
      const menuHeight = 500;
      let left = rect.right - menuWidth;
      let top = rect.bottom + 6;
      if (left < 8) left = 8;
      if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 8;
      if (top + menuHeight > window.innerHeight) top = rect.top - Math.min(menuHeight, rect.top - 8);
      setPos({ top, left });
    }
  }, [vibe.id, isMobile]);

  // Lock body scroll on mobile
  useEffect(() => {
    if (!isMobile) return;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';

    const el = backdropRef.current;
    const prevent = (e: TouchEvent) => e.preventDefault();
    el?.addEventListener('touchmove', prevent, { passive: false });

    return () => {
      el?.removeEventListener('touchmove', prevent);
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [isMobile]);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  // Desktop: close on outside click
  useEffect(() => {
    if (isMobile) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', h), 10);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h); };
  }, [isMobile, onClose]);

  const close = onClose;

  const menuItems = (
    <>
      {STATUS_KEYS.map((key) => {
        const s = STATUSES[key];
        return (
          <button key={key} onClick={() => { updateItem(vibe.id, { status: key as Vibe['status'] }); close(); }}
            className={`flex items-center gap-3 w-full px-4 py-2.5 text-[15px] rounded-xl transition-colors active:bg-[var(--hover-bg)] ${vibe.status === key ? 'bg-[var(--hover-bg)]' : ''}`}
            style={{ color: s.color }}>
            <span>{s.icon}</span><span>{s.label}</span>
          </button>
        );
      })}

      <div className="border-t border-[var(--border)] my-1 mx-2" />

      <button onClick={() => { useVibeStore.getState().setEditingCard(vibe.id, vibe.text); close(); }}
        className="flex items-center gap-3 w-full px-4 py-2.5 text-[15px] rounded-xl text-[var(--text)] transition-colors active:bg-[var(--hover-bg)]">
        <span>✏️</span><span>Edit Text</span>
      </button>

      <div className="border-t border-[var(--border)] my-1 mx-2" />

      {CATEGORIES.map((cat) => (
        <button key={cat} onClick={() => { updateItem(vibe.id, { category: vibe.category === cat ? null : (cat as Vibe['category']) }); close(); }}
          className="flex items-center gap-3 w-full px-4 py-2.5 text-[15px] rounded-xl text-[var(--muted)] transition-colors active:bg-[var(--hover-bg)]">
          <span className="w-5 text-center">{vibe.category === cat ? '✓' : ''}</span><span>{cat}</span>
        </button>
      ))}

      <div className="border-t border-[var(--border)] my-1 mx-2" />

      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl">
        <span>📅</span>
        <span className="text-[15px] text-[var(--muted)]">Due</span>
        <input type="date" value={vibe.due_date || ''}
          onChange={(e) => { const val = e.target.value || null; updateItem(vibe.id, { due_date: val, status: val && vibe.status === 'spark' ? 'scheduled' : vibe.status }); close(); }}
          className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[14px] text-[var(--text)] outline-none" />
        {vibe.due_date && (
          <button onClick={() => updateItem(vibe.id, { due_date: null })} className="text-[var(--dim)] hover:text-[var(--red)] text-sm">✕</button>
        )}
      </div>

      <div className="border-t border-[var(--border)] my-1 mx-2" />

      <button onClick={() => { setExpandedNotes(vibe.id); close(); }}
        className="flex items-center gap-3 w-full px-4 py-2.5 text-[15px] rounded-xl text-[var(--orange)] transition-colors active:bg-[var(--hover-bg)]">
        <span>📝</span><span>{vibe.notes ? 'Edit Notes' : 'Add Notes'}</span>
      </button>
      {vibe.notes && (
        <button onClick={() => { updateItem(vibe.id, { notes: '' }); close(); }}
          className="flex items-center gap-3 w-full px-4 py-2.5 text-[15px] rounded-xl text-[var(--red)] transition-colors active:bg-[var(--hover-bg)]">
          <span>✕</span><span>Delete Notes</span>
        </button>
      )}

      <div className="border-t border-[var(--border)] my-1 mx-2" />

      <button onClick={() => { deleteItem(vibe.id); setOpenMenu(null); }}
        className="flex items-center gap-3 w-full px-4 py-2.5 text-[15px] rounded-xl text-[var(--red)] transition-colors active:bg-[var(--hover-bg)]">
        <span>🗑</span><span>Delete</span>
      </button>
    </>
  );

  const portal = isMobile ? (
    // MOBILE: Bottom sheet
    <div className="fixed inset-0 z-[200] flex flex-col justify-end">
      <div ref={backdropRef} className="absolute inset-0 bg-black/40" onClick={close} />
      <div className="relative bg-[var(--card)] rounded-t-2xl shadow-2xl animate-[slideUp_0.2s] max-h-[85vh] flex flex-col">
        <div className="flex justify-center py-3 shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
        </div>
        <div className="overflow-y-auto overscroll-contain px-2 pb-4">
          {menuItems}

          <div className="border-t border-[var(--border)] my-2 mx-2" />

          <button onClick={close}
            className="flex items-center justify-center w-full px-4 py-3 text-[16px] font-semibold rounded-xl text-[var(--blue)] transition-colors active:bg-[var(--hover-bg)]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  ) : (
    // DESKTOP: Compact dropdown
    <div
      ref={menuRef}
      className="fixed bg-[var(--menu-bg)] border border-[var(--border)] rounded-2xl p-1.5 z-[100] w-[240px] max-h-[70vh] overflow-y-auto shadow-2xl animate-[scaleIn_0.15s]"
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems}
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(portal, document.body);
  }
  return portal;
}
