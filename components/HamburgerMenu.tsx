'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, LogOut } from 'lucide-react';
import { tools, type Tool } from '@/lib/nav';
import { useAuthStore } from '@/stores/auth-store';
import { Text } from '@/components/ui';

interface HamburgerMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Global toolkit drawer. The bottom dock is the PRIMARY navigation (Players /
 * Finances / Matches / Umpiring / Moments); this is everything else — the
 * command center — so it reads as grouped sections, not a second dock.
 */
const GROUP_LABELS: Record<Tool['group'], string> = {
  personal: 'Personal',
  team: 'Team',
  'team-management': 'Team management',
  'game-day': 'Game day',
  management: 'Administration',
};
const GROUP_ORDER: Tool['group'][] = ['team', 'team-management', 'game-day', 'personal', 'management'];

export function HamburgerMenu({ isOpen, onClose }: HamburgerMenuProps) {
  const { userAccess, userFeatures, userTeams, currentTeamId } = useAuthStore();
  const pathname = usePathname();

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

  // Active = the FIRST visible tool whose path matches the current route.
  // Matching ignores query strings deliberately: "Cricket" and "Finances"
  // share /cricket, and reading the query would drag useSearchParams (and a
  // Suspense boundary) into the shell just to break a tie.
  const activeName = visibleTools.find((t) => t.href.split('?')[0] === pathname)?.name ?? null;

  const groups = GROUP_ORDER
    .map((g) => ({ key: g, label: GROUP_LABELS[g], items: visibleTools.filter((t) => t.group === g) }))
    .filter((g) => g.items.length > 0);

  const title = userAccess.includes('cricket') && !userAccess.includes('toolkit') && !userAccess.includes('admin')
    ? (userTeams.find((t) => t.team_id === currentTeamId)?.team_name ?? 'Cricket')
    : "Viber's Toolkit";

  return (
    <>
      {/* Backdrop — plain scrim, no blur (mobile Safari perf); fades on its
          own timing, independent of the panel slide. touch-action:none
          prevents iOS scroll-through. */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity ${
          isOpen ? 'opacity-100 duration-300' : 'pointer-events-none opacity-0 duration-200'
        }`}
        style={{ touchAction: 'none' }}
        onClick={onClose}
      />

      {/* Panel — solid elevated surface (the old translucent backdrop-blur-xl
          read as dated glassmorphism and cost compositing on Safari).
          Slide: 300ms ease-out in, 200ms ease-in out. */}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-[300px] max-w-[85vw] rounded-r-2xl bg-[var(--card)] shadow-2xl border-r border-[var(--border)]/50 transition-transform flex flex-col overscroll-contain ${
          isOpen ? 'translate-x-0 duration-300 ease-out' : '-translate-x-full duration-200 ease-in'
        }`}
        style={{ touchAction: 'pan-y' }}
        role="dialog"
        aria-modal="true"
        aria-label="Toolkit menu"
      >
        {/* Header */}
        <div
          className="px-5 pb-3"
          style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Text as="h2" size="lg" weight="bold" tracking="tight" truncate>
                {title}
              </Text>
              <Text as="p" size="xs" color="muted" className="mt-0.5">
                Team tools & management
              </Text>
            </div>
            <button
              onClick={onClose}
              className="-mr-2 -mt-1.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] transition-colors hover:text-[var(--text)] active:bg-[var(--hover-bg)]"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Sections — scrollable middle; the account footer stays anchored.
            Keyed on isOpen so the row entrance animations replay per open. */}
        <nav
          key={String(isOpen)}
          className="flex-1 overflow-y-auto overscroll-contain scrollbar-hide px-3 pb-3"
        >
          {groups.map((group, gIdx) => {
            // Running index across groups drives the subtle stagger (~18ms/row)
            const offset = groups.slice(0, gIdx).reduce((n, g) => n + g.items.length, 0);
            return (
              <div key={group.key} className={gIdx > 0 ? 'mt-4' : 'mt-1'}>
                <Text
                  as="p"
                  size="2xs"
                  weight="bold"
                  color="dim"
                  uppercase
                  tracking="wider"
                  className="px-3 pb-1"
                >
                  {group.label}
                </Text>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((tool, idx) => {
                    const isActive = tool.name === activeName;
                    return (
                      <Link key={tool.name} href={tool.href} onClick={onClose} aria-current={isActive ? 'page' : undefined}>
                        <div
                          className="animate-view-in flex min-h-11 items-start gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-colors hover:bg-[var(--hover-bg)] active:bg-[var(--hover-bg)]"
                          style={{
                            animationDelay: isOpen ? `${(offset + idx) * 18}ms` : undefined,
                            animationFillMode: 'backwards',
                            background: isActive ? 'color-mix(in srgb, var(--cricket) 8%, transparent)' : undefined,
                          }}
                        >
                          {/* Neutral when inactive; brand orange only on the
                              current destination — never a wall of orange. */}
                          <span
                            className="mt-0.5 flex-shrink-0"
                            style={{ color: isActive ? 'var(--cricket)' : 'var(--muted)' }}
                          >
                            {tool.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <Text
                              size="md"
                              weight={isActive ? 'semibold' : 'medium'}
                              className="text-[15px]"
                              style={isActive ? { color: 'var(--cricket)' } : undefined}
                            >
                              {tool.name}
                            </Text>
                            <Text as="p" size="xs" color="muted" className="mt-0.5">
                              {tool.description}
                            </Text>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Account footer — anchored, safe-area aware */}
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
  const initials = (name || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

  return (
    <div
      className="flex-shrink-0 border-t border-[var(--border)]/60 px-4 pt-3"
      style={{ paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="flex items-center gap-3 px-1 pb-3">
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
          style={{
            background: 'color-mix(in srgb, var(--cricket) 11%, transparent)',
            color: 'var(--cricket)',
          }}
          aria-hidden
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          {name && <Text as="p" size="sm" weight="semibold" truncate>{name}</Text>}
          {email && <Text as="p" size="xs" color="muted" truncate>{email}</Text>}
        </div>
      </div>
      <button
        onClick={() => { logout(); onClose(); }}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--surface)] px-4 text-[14px] font-medium text-[var(--red)] transition-colors hover:bg-[var(--hover-bg)] active:bg-[var(--hover-bg)] cursor-pointer"
      >
        <LogOut size={15} aria-hidden /> Sign out
      </button>
    </div>
  );
}
