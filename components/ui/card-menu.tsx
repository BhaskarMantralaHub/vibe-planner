'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export type CardMenuItem = {
  label: string;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
  dividerBefore?: boolean;
};

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
      setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
    }
    const close = () => onClose();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [anchorRef, onClose, width]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[99]" onClick={onClose} />
      <div
        className="fixed z-[100] rounded-xl overflow-hidden shadow-2xl animate-[scaleIn_0.1s]"
        style={{ top: pos.top, left: pos.left, width, background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {items.map((item, i) => (
          <div key={i}>
            {item.dividerBefore && <div className="border-t border-[var(--border)] my-0.5 mx-2" />}
            <button
              onClick={() => { item.onClick(); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors hover:bg-[var(--hover-bg)] text-left cursor-pointer"
              style={{ color: item.color }}
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
