'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, LogOut, ChevronRight } from 'lucide-react';
import { tools, type Tool } from '@/lib/nav';
import { useAuthStore } from '@/stores/auth-store';
import { Text } from '@/components/ui';
import { TeamLogo } from '@/components/TeamSwitcher';

interface HamburgerMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

type Child = NonNullable<Tool['children']>[number];

/** The static export serves /cricket/umpiring/; the nav config has no slash. */
const strip = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

/**
 * Which section — and which page inside it — the current URL is.
 *
 * 1. An exact child match on its query param (`?view=fees`, `?tab=roster`),
 *    falling back to the hash, which the dashboard and Matches still write.
 * 2. Else a tool with NO children on this path (Roster owns a bare /cricket).
 * 3. Else the first child on this path — a section page with no tab in the
 *    URL is showing its default tab.
 */
export function resolveCurrent(
  list: Tool[], pathname: string, search: string, hash: string,
): { section: string | null; child: string | null } {
  const path = strip(pathname);
  const params = new URLSearchParams(search);
  const hashValue = hash.replace(/^#/, '') || null;
  for (const t of list) {
    for (const c of t.children ?? []) {
      const [cPath, cQuery] = c.href.split('?');
      if (strip(cPath!) !== path) continue;
      if (!cQuery) return { section: t.name, child: c.href };
      const [k, v] = cQuery.split('=');
      if ((params.get(k!) ?? hashValue) === v) return { section: t.name, child: c.href };
    }
  }
  const leaf = list.find((t) => !t.children && strip(t.href.split('?')[0]!) === path);
  if (leaf) return { section: leaf.name, child: null };
  for (const t of list) {
    const first = t.children?.find((c) => strip(c.href.split('?')[0]!) === path);
    if (first) return { section: t.name, child: first.href };
  }
  return { section: null, child: null };
}

/**
 * The app's only navigation (the bottom bar was removed 2026-10, user
 * decision). Full-screen, meta.com-style: the five main sections as large
 * rows, the occasional tools smaller beneath, the account at the foot.
 * A section with pages (Finances, Matches, Umpiring) EXPANDS in place to list
 * them; the one you are in opens already expanded.
 *
 * Neutral by rule — the current section is marked with a gray fill, not the
 * accent, because selection is navigation state and blue means "act".
 */
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
  // A TEAM admin (owner/admin on a team) is not a platform admin, but they
  // still need the Admin entry — it is the only route to the Teams tab, where
  // the team's invite link is generated.
  const isTeamAdmin = userTeams.some((t) => t.approved && (t.role === 'owner' || t.role === 'admin'));

  const visibleTools = tools.filter((t) => {
    if (t.feature) return userFeatures.includes(t.feature);
    if (!t.roles) return true;
    if (t.roles.includes('admin') && isTeamAdmin) return true;
    return t.roles.some((r) => access.includes(r));
  });
  const primary = visibleTools.filter((t) => t.primary);
  // A tool that is already a section's page (League Stats = Matches › Stats)
  // is listed there, not again under More.
  const childHrefs = new Set(primary.flatMap((t) => t.children?.map((c) => c.href) ?? []));
  const secondary = visibleTools.filter((t) => !t.primary && !childHrefs.has(t.href));

  // Read from the URL only while open, so the closed first render can never
  // disagree with the server HTML.
  const current = isOpen && typeof window !== 'undefined'
    ? resolveCurrent(visibleTools, pathname ?? '', window.location.search, window.location.hash)
    : { section: null, child: null };

  // Accordion: one section open at a time. Each time the menu opens, the
  // section you are in starts expanded — set during render ("adjusting state
  // when a prop changes"), not in an effect, so the first painted frame is
  // already right.
  const expandableCurrent = () => {
    const sec = primary.find((t) => t.name === current.section);
    return sec?.children ? sec.name : null;
  };
  const [expanded, setExpanded] = useState<string | null>(() => (isOpen ? expandableCurrent() : null));
  const [wasOpen, setWasOpen] = useState(isOpen);
  // Bumped per open; keys the nav so its entrance cascade replays every time.
  const [openSeq, setOpenSeq] = useState(0);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setExpanded(expandableCurrent());
      setOpenSeq((n) => n + 1);
    }
  }

  const currentTeam = userTeams.find((t) => t.team_id === currentTeamId) ?? userTeams[0];
  const title = currentTeam?.team_name ?? 'Cricket';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)] overscroll-contain"
      style={{
        opacity: isOpen ? 1 : 0,
        transform: isOpen ? 'none' : 'translateY(-8px)',
        visibility: isOpen ? 'visible' : 'hidden',
        transition: isOpen
          ? 'opacity var(--duration-normal) var(--ease-out), transform var(--duration-slow) var(--ease-out), visibility 0s'
          : 'opacity var(--duration-fast) var(--ease-in), transform var(--duration-fast) var(--ease-in), visibility 0s var(--duration-fast)',
        touchAction: 'pan-y',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      {/* Header — the app bar it covers, re-drawn: same height, the team
          centred, and the X exactly where the hamburger was, so closing is
          the same tap as opening. */}
      <div
        className="grid flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4 pb-2"
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="-ml-2.5 flex h-11 w-11 items-center justify-center justify-self-start rounded-full cursor-pointer text-[var(--text)] transition-colors active:bg-[var(--hover-bg)]"
          aria-label="Close menu"
        >
          <X key={openSeq} size={22} className="animate-menu-x-in" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          {currentTeam && <TeamLogo team={currentTeam} size="sm" />}
          <Text as="h2" size="md" weight="semibold" truncate>{title}</Text>
        </div>
        <span aria-hidden />
      </div>

      <nav key={openSeq} className="flex-1 overflow-y-auto overscroll-contain scrollbar-hide px-4 pb-6">
        {/* Main sections — large type is the design */}
        <ul className="-mx-3 mt-3">
          {primary.map((tool, i) => (
            <SectionRow
              key={tool.name}
              index={i}
              tool={tool}
              current={current}
              expanded={expanded === tool.name}
              onToggle={() => setExpanded(expanded === tool.name ? null : tool.name)}
              onClose={onClose}
            />
          ))}
        </ul>

        {secondary.length > 0 && (
          <>
            <Text
              as="p" size="sm" weight="medium" color="muted" className="mt-8 mb-1 animate-menu-row-in"
              style={{ '--i': primary.length } as CSSProperties}
            >More</Text>
            <ul className="-mx-3">
              {secondary.map((tool, i) => (
                <li
                  key={tool.name}
                  className="animate-menu-row-in"
                  style={{ '--i': Math.min(primary.length + 1 + i, 9) } as CSSProperties}
                >
                  <Link
                    href={tool.href}
                    onClick={onClose}
                    aria-current={current.section === tool.name ? 'page' : undefined}
                    className="flex min-h-12 flex-col justify-center rounded-xl px-3 py-1.5 cursor-pointer transition-colors active:bg-[var(--hover-bg)]"
                    style={current.section === tool.name ? { background: 'var(--fill)' } : undefined}
                  >
                    <span className="text-[17px] leading-snug font-medium text-[var(--text)]">{tool.name}</span>
                    <Text as="span" size="xs" color="muted">{tool.description}</Text>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      <UserSection onClose={onClose} />
    </div>
  );
}

const SECTION_TEXT = 'block text-[26px] leading-[1.15] font-semibold tracking-tight text-[var(--text)]';
const SECTION_ROW = 'flex min-h-[60px] w-full items-center justify-between gap-3 rounded-xl px-3 text-left cursor-pointer transition-colors active:bg-[var(--hover-bg)]';

/**
 * A main section. Without pages it is a plain link (no chevron — a chevron
 * promises more inside). With pages it is a disclosure button whose chevron
 * turns down, and its pages slide open beneath it.
 */
function SectionRow({ tool, index, current, expanded, onToggle, onClose }: {
  tool: Tool;
  index: number;
  current: { section: string | null; child: string | null };
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const isCurrent = current.section === tool.name;
  const cascade = { className: 'animate-menu-row-in', style: { '--i': index } as CSSProperties };
  if (!tool.children) {
    return (
      <li {...cascade}>
        <Link
          href={tool.href}
          onClick={onClose}
          aria-current={isCurrent ? 'page' : undefined}
          className={SECTION_ROW}
          style={isCurrent ? { background: 'var(--fill)' } : undefined}
        >
          <span className={SECTION_TEXT}>{tool.name}</span>
        </Link>
      </li>
    );
  }
  const listId = `menu-${tool.name.toLowerCase()}`;
  return (
    <li {...cascade}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={listId}
        className={SECTION_ROW}
        // Collapsed, the section itself carries the "you are here" fill;
        // expanded, the current page inside it does.
        style={isCurrent && !expanded ? { background: 'var(--fill)' } : undefined}
      >
        <span className={SECTION_TEXT}>{tool.name}</span>
        <ChevronRight
          size={22}
          aria-hidden
          className="flex-shrink-0 text-[var(--dim)]"
          style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform var(--duration-normal) var(--ease-out)' }}
        />
      </button>
      {/* grid-rows 0fr→1fr opens to the list's real height; inert keeps the
          collapsed links out of VoiceOver's swipe order. */}
      <div
        id={listId}
        inert={!expanded}
        data-expanded={expanded || undefined}
        className="grid"
        style={{
          gridTemplateRows: expanded ? '1fr' : '0fr',
          opacity: expanded ? 1 : 0,
          transition: 'grid-template-rows var(--duration-slow) var(--ease-out), opacity var(--duration-normal) var(--ease-out)',
        }}
      >
        <ul className="min-h-0 overflow-hidden">
          {tool.children.map((c: Child, i) => {
            const here = current.child === c.href;
            return (
              <li key={c.href} className="menu-child" style={{ '--i': i } as CSSProperties}>
                <Link
                  href={c.href}
                  onClick={onClose}
                  aria-current={here ? 'page' : undefined}
                  className="ml-3 flex min-h-12 items-center rounded-xl px-3 cursor-pointer transition-colors active:bg-[var(--hover-bg)]"
                  style={here ? { background: 'var(--fill)' } : undefined}
                >
                  <span className={'text-[19px] leading-snug text-[var(--text)] ' + (here ? 'font-semibold' : 'font-normal')}>
                    {c.name}
                  </span>
                </Link>
              </li>
            );
          })}
          <li aria-hidden className="h-2" />
        </ul>
      </div>
    </li>
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
      className="flex flex-shrink-0 items-center gap-3 px-4 pt-3"
      style={{
        borderTop: '1px solid var(--border)',
        paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <span
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-[var(--text)]"
        style={{ background: 'var(--fill)' }}
        aria-hidden
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        {name && <Text as="p" size="sm" weight="semibold" truncate>{name}</Text>}
        {email && <Text as="p" size="xs" color="muted" truncate>{email}</Text>}
      </div>
      <button
        type="button"
        onClick={() => { logout(); onClose(); }}
        className="flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-xl px-3 text-[14px] font-medium text-[var(--danger-text)] transition-colors active:bg-[var(--hover-bg)] cursor-pointer"
      >
        <LogOut size={15} aria-hidden /> Sign out
      </button>
    </div>
  );
}
