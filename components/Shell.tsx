'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { HamburgerMenu } from '@/components/HamburgerMenu';
import { useAuthStore } from '@/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';

function PendingApprovals() {
  const { user, userAccess } = useAuthStore();
  const [pending, setPending] = useState<{ id: string; email: string; full_name: string; created_at: string }[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const isAdmin = userAccess.includes('admin');

  useEffect(() => {
    if (!user || !isAdmin) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    supabase
      .from('profiles')
      .select('id, email, full_name, created_at')
      .eq('approved', false)
      .eq('disabled', false)
      .order('created_at', { ascending: false })
      .then(({ data }: { data: { id: string; email: string; full_name: string; created_at: string }[] | null }) => {
        setPending(data ?? []);
      });
  }, [user, isAdmin]);

  const handleApprove = async (id: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.from('profiles').update({ approved: true }).eq('id', id);
    setPending((prev) => prev.filter((p) => p.id !== id));
  };

  const handleReject = async (id: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    // Disable the account instead of deleting
    await supabase.from('profiles').update({ disabled: true, approved: false }).eq('id', id);
    setPending((prev) => prev.filter((p) => p.id !== id));
  };

  if (!isAdmin || pending.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setShowPopup(!showPopup)}
        className="relative cursor-pointer rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {/* Badge */}
        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--red)] text-[9px] font-bold text-white">
          {pending.length}
        </span>
      </button>

      {showPopup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPopup(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-[320px] rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl animate-[scaleIn_0.15s]">
            <div className="p-4 border-b border-[var(--border)]">
              <h3 className="text-[14px] font-semibold text-[var(--text)]">Pending Approvals</h3>
              <p className="text-[12px] text-[var(--muted)]">{pending.length} cricket signup{pending.length !== 1 ? 's' : ''} awaiting approval</p>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {pending.map((p) => (
                <div key={p.id} className="p-3 border-b border-[var(--border)]/50 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full flex items-center justify-center text-[14px] font-bold text-white flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, var(--orange), var(--red))' }}>
                      {(p.full_name || p.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[var(--text)] truncate">{p.full_name || 'No name'}</div>
                      <div className="text-[11px] text-[var(--muted)] truncate">{p.email}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2 ml-12">
                    <button
                      onClick={() => handleApprove(p.id)}
                      className="flex-1 rounded-lg py-1.5 text-[12px] font-medium text-white bg-[var(--green)] cursor-pointer hover:opacity-90 transition-all"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(p.id)}
                      className="flex-1 rounded-lg py-1.5 text-[12px] font-medium text-[var(--red)] border border-[var(--red)]/30 cursor-pointer hover:bg-[var(--red)]/10 transition-all"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, isCloud, userAccess } = useAuthStore();
  const pathname = usePathname();

  const isCricketContext = pathname.startsWith('/cricket')
    || (userAccess.includes('cricket') && !userAccess.includes('toolkit') && !userAccess.includes('admin'));

  const showNav = !isCloud || !!user;

  return (
    <>
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

        <Link href={isCricketContext ? '/cricket' : '/'} className="group flex items-center gap-2">
          {isCricketContext ? (
            <>
              <img src="/cricket-logo.png" alt="Sunrisers Manteca" className="h-9 transition-opacity group-hover:opacity-80" />
              <span className="bg-gradient-to-r from-[var(--orange)] to-[var(--red)] bg-clip-text text-lg font-bold tracking-tight text-transparent">
                Sunrisers Manteca
              </span>
            </>
          ) : (
            <h1 className="bg-gradient-to-r from-[var(--purple)] via-[var(--blue)] to-[var(--indigo)] bg-clip-text text-lg font-bold tracking-tight text-transparent transition-opacity group-hover:opacity-80">
              Viber&apos;s Toolkit
            </h1>
          )}
        </Link>

        <div className="flex items-center gap-1">
          <PendingApprovals />
          <ThemeToggle />
        </div>
      </header>

      {showNav && <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />}

      <main>{children}</main>
    </>
  );
}
