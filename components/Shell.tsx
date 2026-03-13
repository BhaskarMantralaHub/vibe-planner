'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { HamburgerMenu } from '@/components/HamburgerMenu';
import { useAuthStore } from '@/stores/auth-store';

export function Shell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, isCloud } = useAuthStore();

  const showNav = !isCloud || !!user;

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/80 px-4 py-3 backdrop-blur-md">
        {showNav ? (
          <button
            onClick={() => setMenuOpen(true)}
            className="cursor-pointer rounded-lg p-1.5 text-lg text-[var(--muted)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text)]"
            aria-label="Open menu"
          >
            &#9776;
          </button>
        ) : (
          <div className="w-8" />
        )}

        <Link href="/" className="group flex items-center gap-2">
          <h1 className="bg-gradient-to-r from-[var(--purple)] via-[var(--blue)] to-[var(--indigo)] bg-clip-text text-lg font-bold tracking-tight text-transparent transition-opacity group-hover:opacity-80">
            Viber&apos;s Toolkit
          </h1>
        </Link>

        <ThemeToggle />
      </header>

      {/* Menu — only after login */}
      {showNav && <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />}

      {/* Page Content */}
      <main>{children}</main>
    </>
  );
}
