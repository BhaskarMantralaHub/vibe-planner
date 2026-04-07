'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { tools } from '@/lib/nav';
import { useAuthStore } from '@/stores/auth-store';
import { Text } from '@/components/ui';

interface HamburgerMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HamburgerMenu({ isOpen, onClose }: HamburgerMenuProps) {
  const { user, userAccess, userFeatures, userTeams, currentTeamId } = useAuthStore();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      // Lock body scroll — position:fixed is required for iOS Safari
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKey);
      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.overflow = '';
        window.scrollTo({ top: scrollY, behavior: 'instant' });
        document.removeEventListener('keydown', handleKey);
      };
    }
  }, [isOpen, onClose]);

  const access = userAccess.length > 0 ? userAccess : ['toolkit'];
  // userFeatures is derived from access in auth-store when empty/null (backward compat)
  // No separate fallback here — auth-store handles the derivation
  const visibleTools = tools.filter((t) => {
    // Tools with a feature key: check features array (no admin override)
    if (t.feature) return userFeatures.includes(t.feature);
    // Tools without a feature key (e.g., Admin): fall back to role check
    if (!t.roles) return true;
    return t.roles.some((r) => access.includes(r));
  });

  return (
    <>
      {/* Backdrop — touch-action:none prevents iOS scroll-through */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{ touchAction: 'none' }}
        onClick={onClose}
      />

      {/* Panel — overscroll-contain prevents scroll chaining to body */}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-72 bg-[var(--card)]/90 backdrop-blur-xl shadow-2xl transition-transform duration-300 ease-in-out flex flex-col overscroll-contain ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ touchAction: 'pan-y' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <Text as="h2" size="lg" weight="semibold" tracking="tight" className="bg-gradient-to-r from-[var(--toolkit)] to-[var(--blue)] bg-clip-text text-transparent">
              {userAccess.includes('cricket') && !userAccess.includes('toolkit') && !userAccess.includes('admin')
                ? (userTeams.find(t => t.team_id === currentTeamId)?.team_name ?? 'Cricket')
                : "Viber\u0027s Toolkit"}
            </Text>
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
        <nav className="flex-1 overflow-y-auto overscroll-contain scrollbar-hide px-6 flex flex-col gap-1">
          {visibleTools.map((tool) => (
            <Link key={tool.name} href={tool.href} onClick={onClose}>
              <div className="flex items-start gap-3 rounded-lg px-3 py-3 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors">
                <span className="mt-0.5 flex-shrink-0 text-[var(--toolkit)]">{tool.icon}</span>
                <div className="flex-1 min-w-0">
                  <Text size="md" weight="medium" className="text-[15px]">
                    {tool.name}
                  </Text>
                  <Text as="p" size="sm" color="muted" className="mt-0.5">
                    {tool.description}
                  </Text>
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
        {name && <Text as="div" size="sm" weight="medium" truncate>{name}</Text>}
        {email && <Text as="div" size="xs" color="muted" truncate>{email}</Text>}
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
