'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { tools } from '@/lib/nav';
import { useAuthStore } from '@/stores/auth-store';

interface HamburgerMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HamburgerMenu({ isOpen, onClose }: HamburgerMenuProps) {
  const { user, userAccess } = useAuthStore();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      // Lock body scroll when menu is open
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKey);
      return () => {
        document.body.style.overflow = '';
        document.removeEventListener('keydown', handleKey);
      };
    }
  }, [isOpen, onClose]);

  const access = userAccess.length > 0 ? userAccess : ['toolkit'];
  const visibleTools = tools.filter((t) => {
    if (!t.roles) return true;
    return t.roles.some((r) => access.includes(r));
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-72 bg-[var(--card)] shadow-2xl transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <h2 className="bg-gradient-to-r from-[var(--toolkit)] to-[var(--blue)] bg-clip-text text-lg font-bold text-transparent">
              {userAccess.includes('cricket') && !userAccess.includes('toolkit') && !userAccess.includes('admin')
                ? 'Sunrisers Manteca'
                : "Viber\u0027s Toolkit"}
            </h2>
            <button
              onClick={onClose}
              className="cursor-pointer rounded-lg p-1 text-[var(--muted)] transition-colors hover:text-[var(--text)]"
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>
          <div className="mt-4 h-px bg-[var(--border)]" />
        </div>

        {/* Tools — scrollable */}
        <nav className="flex-1 overflow-y-auto overscroll-contain px-6 flex flex-col gap-1">
          {visibleTools.map((tool) => (
            <Link key={tool.name} href={tool.href} onClick={onClose}>
              <div className="flex items-start gap-3 rounded-lg px-3 py-3 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors">
                <span className="mt-0.5 flex-shrink-0 text-[var(--toolkit)]">{tool.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-[15px] font-medium text-[var(--text)]">
                    {tool.name}
                  </span>
                  <p className="mt-0.5 text-[13px] text-[var(--muted)]">
                    {tool.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </nav>

        {/* Bottom section — user info + logout */}
        <UserSection onClose={onClose} />
      </div>
    </>
  );
}

function UserSection({ onClose }: { onClose: () => void }) {
  const { user, isCloud, logout } = useAuthStore();

  if (!isCloud || !user) return null;

  const name = (user.user_metadata?.full_name as string) || '';
  const email = user.email || '';

  return (
    <div className="flex-shrink-0 p-6 border-t border-[var(--border)]">
      <div className="mb-3">
        {name && <div className="text-[13px] font-medium text-[var(--text)] truncate">{name}</div>}
        {email && <div className="text-[12px] text-[var(--muted)] truncate">{email}</div>}
      </div>
      <button
        onClick={() => { logout(); onClose(); }}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--surface)] text-[var(--red)] text-[15px] font-medium hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
      >
        Sign Out
      </button>
    </div>
  );
}
