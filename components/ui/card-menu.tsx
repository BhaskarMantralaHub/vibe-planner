'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '@/lib/haptics';

export type CardMenuItem = {
  label: string;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
  dividerBefore?: boolean;
};

/**
 * iOS context-menu colour rule: every row is plain label ink, and ONLY a
 * destructive row (delete, remove, revoke) is red. Callers still pass a colour
 * per item; anything that isn't a red is ignored, so a menu can never again
 * show green, blue and orange rows competing side by side.
 */
export function menuItemColor(color: string | undefined): string {
  const c = (color ?? '').toLowerCase();
  const destructive = c.includes('--red') || c.includes('--danger') || c.includes('--split-owe')
    || c === '#ef4444' || c === '#dc2626' || c === '#f87171' || c === 'red';
  return destructive ? 'var(--danger-text)' : 'var(--text)';
}

export interface CardMenuProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  items: CardMenuItem[];
  onClose: () => void;
  width?: number;
}

export function CardMenu({ anchorRef, items, onClose, width = 160 }: CardMenuProps) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const left = Math.min(rect.right - width, window.innerWidth - width - 8);
      // Estimate the menu height (44px row + divider slack) and flip above the
      // anchor when opening downward would push it off the bottom of the screen.
      const estimatedHeight = items.length * 44 + 8;
      const top = rect.bottom + 4 + estimatedHeight > window.innerHeight - 8
        ? Math.max(8, rect.top - 4 - estimatedHeight)
        : rect.bottom + 4;
      setPos({ top, left: Math.max(8, left) });
    }
    const close = () => onClose();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [anchorRef, onClose, width, items.length]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[99]" onClick={onClose} />
      <div
        className="fixed z-[100] rounded-xl overflow-hidden shadow-2xl animate-[scaleIn_0.1s]"
        style={{ top: pos.top, left: pos.left, width, background: 'var(--elevated)', border: '0.5px solid var(--border)' }}
      >
        {items.map((item, i) => (
          <div key={i}>
            {item.dividerBefore && <div className="border-t border-[var(--border)] my-0.5 mx-2" />}
            <button
              // Same haptic as the ActionSheet row it is being migrated to, so
              // a screen that has not moved over yet does not feel different.
              onClick={() => { haptic('selection'); item.onClick(); onClose(); }}
              className="w-full flex min-h-11 items-center gap-2.5 px-3.5 py-2.5 text-[15px] font-normal transition-colors hover:bg-[var(--hover-bg)] active:bg-[var(--hover-bg)] text-left cursor-pointer"
              style={{ color: menuItemColor(item.color) }}
            >
              {item.icon}
              {item.label}
            </button>
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
}
