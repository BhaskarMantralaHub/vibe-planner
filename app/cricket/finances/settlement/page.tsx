'use client';

/**
 * PUBLIC team settlement report. No login, no app chrome (Shell bails out for
 * this path), read-only, scoped entirely by the token in the URL.
 *
 * Everything on screen comes from one RPC call. The browser never sees the
 * expense ledger, player ids, or anything but display names and amounts —
 * get_settlement_report does the arithmetic server-side and returns the
 * finished report.
 *
 * Every failure — bad token, expired, revoked, network down, RPC error — lands
 * on the SAME generic screen. A visitor must not be able to tell a revoked
 * link from a guessed one, and must never be left on a spinner.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Share2, Copy, ArrowRight, Check, ChevronDown, Search, RefreshCw } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { formatCents } from '@/app/(tools)/cricket/lib/settlement';
import { haptic } from '@/lib/haptics';
import { useAsyncAction } from '@/hooks/use-async-action';
import { toast } from 'sonner';

type ReasonLine = {
  label: string;
  date: string | null;
  kind: 'share' | 'settled';
  /** Signed against the row: positive adds to the debt, negative is credit. */
  amountCents: number;
};
type SettlementRow = { from: string; to: string; amountCents: number; why: ReasonLine[] };
type SettledRow = SettlementRow & { date: string };

type ShareLine = { name: string; amountCents: number };
type ExpenseRow = {
  label: string;
  date: string;
  amountCents: number;
  paidBy: string;
  shares: ShareLine[];
};

type Report = {
  teamName: string | null;
  teamLogo: string | null;
  teamSlug: string | null;
  seasonName: string | null;
  updatedAt: string;
  totalOutstandingCents: number;
  paymentCount: number;
  membersInvolved: number;
  settlements: SettlementRow[];
  settled: SettledRow[];
  expenses: ExpenseRow[];
};

/** Nothing gets to hang. If the network stalls, show the generic screen. */
const LOAD_TIMEOUT_MS = 12_000;

/**
 * The token rides in the QUERY STRING, not a path segment.
 *
 * A path segment would be prettier, but this is a static export on Cloudflare
 * Pages: /cricket/finances/settlement/<token>/ is not a file, so it needs a
 * wildcard rewrite — and that rewrite does not fire on this host. The
 * long-dormant /cricket/dues/<token> rule had the same bug and 404s to this
 * day, which is exactly how it stayed unnoticed. A query string hits the real
 * exported page every time, on any static host.
 *
 * The path form is still accepted, so links minted if the rewrite is ever
 * fixed keep working.
 */
function tokenFromUrl(): string | null {
  const isToken = (t: string | null | undefined): t is string =>
    !!t && /^[0-9a-f-]{36}$/i.test(t);

  const q = new URLSearchParams(window.location.search).get('t');
  if (isToken(q)) return q;

  const parts = window.location.pathname.split('/').filter(Boolean);
  const seg = parts[3]; // ['cricket','finances','settlement','<token>']
  return isToken(seg) ? seg : null;
}

function fmtUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function PublicSettlementReportPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [report, setReport] = useState<Report | null>(null);
  const [copied, setCopied] = useState(false);
  // Resolved after mount: `navigator` does not exist while the page is being
  // prerendered for the static export, and reading it during render would
  // also desync hydration.
  const [canShare, setCanShare] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showLedger, setShowLedger] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openExpense, setOpenExpense] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  /**
   * One fetch path for both the first paint and every refresh.
   *
   * A background refresh must NOT wipe a report the reader is looking at just
   * because their train went into a tunnel: a transport error keeps the last
   * good data, while an explicit null — the server's answer for revoked or
   * expired — does replace it, because at that point the link really is dead.
   *
   * Returns whether fresh data actually landed. The automatic refreshes ignore
   * that, but the tappable "Updated…" control needs it: a control that shows a
   * confirmation tick has to know the difference between "refreshed" and
   * "silently kept what was already on screen".
   */
  const load = useCallback(async (mode: 'initial' | 'refresh'): Promise<boolean> => {
    const supabase = getSupabaseClient();
    const token = tokenFromUrl();
    if (!token || !supabase) {
      if (mode === 'initial') setState('unavailable');
      return false;
    }
    if (mode === 'refresh') setRefreshing(true);
    try {
      const { data, error } = await supabase.rpc('get_settlement_report', { p_token: token });
      if (error) {
        if (mode === 'initial') setState('unavailable');
        return false; // transient: keep whatever is on screen
      }
      if (!data) {
        setState('unavailable');   // revoked or expired — genuinely gone
        return false;
      }
      setReport(data as Report);
      setState('ready');
      return true;
    } catch {
      if (mode === 'initial') setState('unavailable');
      return false;
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Nothing may hang: if the first load stalls, fall to the generic screen.
    const timer = setTimeout(() => {
      setState((cur) => (cur === 'loading' ? 'unavailable' : cur));
    }, LOAD_TIMEOUT_MS);
    load('initial').finally(() => clearTimeout(timer));
    return () => clearTimeout(timer);
  }, [load]);

  /**
   * Refresh when the reader comes back to the tab. Deliberately not polling:
   * a link forwarded around a group chat could have dozens of tabs open, and
   * a timer in each one turns a shared report into a load generator. Coming
   * back to the tab is the moment a stale number actually matters.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load('refresh');
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [load]);

  /**
   * FULL stored names, deliberately — not the app's shortened roster labels.
   *
   * playerLabels() shortens to a first name and only appends a surname when
   * another name IN THE SET it is given collides. Both halves of that fail
   * here. The set is only people with an outstanding balance, so a second
   * Venkat who happens to be square is invisible to the collision count; and
   * "Venkat Gudala (Kittu)" shortens to "Kittu", so it never registers as a
   * clash with "Venkat Subbu" in the first place. The reader, who knows there
   * are two Venkats and two Sreenis, is left guessing.
   *
   * A roster tile can afford that ambiguity because it is tappable. A line
   * telling someone to send money cannot.
   */
  const labelFor = (n: string) => n;

  /**
   * Grouped by WHO PAYS. Flat, this season is 28 rows across 15 people, and
   * the reader's actual question is "what do I owe?" — so the unit on screen
   * is a person and everything they need to pay, with one total at the bottom.
   */
  const groups = useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    const rows = q
      ? report.settlements.filter(
          (r) => r.from.toLowerCase().includes(q) || r.to.toLowerCase().includes(q),
        )
      : report.settlements;

    const byPayer = new Map<string, SettlementRow[]>();
    for (const r of rows) {
      const arr = byPayer.get(r.from);
      if (arr) arr.push(r);
      else byPayer.set(r.from, [r]);
    }
    return [...byPayer.entries()]
      .map(([from, rs]) => ({
        from,
        rows: rs.sort((a, b) => b.amountCents - a.amountCents),
        totalCents: rs.reduce((sum, r) => sum + r.amountCents, 0),
      }))
      .sort((a, b) => b.totalCents - a.totalCents);
  }, [report, query]);

  const matchCount = groups.reduce((n, g) => n + g.rows.length, 0);

  /**
   * Expanding a payment row.
   *
   * This ONE accordion gets a haptic and the nested transaction-history rows
   * below deliberately do not. The split is about what the tap is for: this
   * row is the reader's own answer ("what do I owe, and why?"), tapped once
   * or twice a visit. The history rows are browsing — 28 of them on a full
   * season — and a tick on each would turn the page into a rattle and drain
   * the meaning out of the taps that matter.
   */
  const toggle = (key: string) => {
    haptic('selection');
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /**
   * Same rule as TeamSwitcher: an uploaded logo wins, and Sunrisers falls back
   * to the bundled mark. A 256px copy rather than the 1024px original — this
   * page gets opened from a WhatsApp link on mobile data, and 875KB for a
   * 48px crest is rude.
   */
  const logoSrc =
    report?.teamLogo
    ?? (report?.teamSlug === 'sunrisers-manteca' ? '/sunrisers-logo.png' : null);

  /**
   * Share, or copy where there is no share sheet.
   *
   * `shared` is tracked separately from the action's own success state: the
   * native sheet resolving is not a confirmation worth a tick (the user may
   * have cancelled it, which is indistinguishable on some platforms), whereas
   * a clipboard write that resolved genuinely did copy. So only the copy
   * branch flips the label to "Link copied".
   */
  const shareAction = useAsyncAction(
    async () => {
      const url = window.location.href;
      const title = report ? `${report.teamName} settlement report` : 'Settlement report';
      if (canShare) {
        try { await navigator.share({ title, url }); return; } catch { /* dismissed */ }
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Report link copied');
    },
    {
      tapHaptic: 'light',
      // The clipboard resolves within a frame, so a success tick on top of
      // the tap tick reads as one stutter rather than two events.
      successHaptic: null,
      onError: () => toast.error("Couldn't copy the link"),
    },
  );

  // Kept as its own timer because `copied` is set inside one branch of the
  // action rather than by its status, and must clear either way.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  /**
   * The tappable "Updated…" line. A reader who has been staring at a live
   * report needs to be able to ask "is this still true?" and watch it answer
   * — which means the answer has to be real, so a refresh that brought back
   * nothing says so instead of showing a tick.
   */
  const refreshAction = useAsyncAction(
    async () => {
      const ok = await load('refresh');
      if (!ok) throw new Error('stale');
    },
    {
      tapHaptic: 'light',
      successHaptic: 'success',
      resetAfterMs: 1400,
      onError: () => toast.error("Couldn't update — showing the last figures"),
    },
  );

  if (state === 'loading') {
    return (
      <main className="min-h-[100dvh] bg-[var(--bg)] px-4 py-10">
        <div className="mx-auto w-full max-w-lg animate-pulse space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-[var(--card)]" />
          <div className="h-5 w-40 rounded bg-[var(--card)]" />
          <div className="h-32 rounded-2xl bg-[var(--card)]" />
          <div className="h-16 rounded-2xl bg-[var(--card)]" />
          <div className="h-16 rounded-2xl bg-[var(--card)]" />
        </div>
      </main>
    );
  }

  if (state === 'unavailable' || !report) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--bg)] px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-2 text-[20px] font-bold text-[var(--text)]">
            Share Link Unavailable
          </h1>
          <p className="mb-6 text-[14px] leading-relaxed text-[var(--muted)]">
            This share link is no longer valid or may have expired.
            Please ask the person who shared this report for a new link.
          </p>
          <a
            href="/cricket/"
            className="inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-[15px] font-semibold"
            style={{ background: 'var(--cricket)', color: 'var(--cricket-on)' }}
          >
            Go to Cricket
          </a>
        </div>
      </main>
    );
  }

  const allSettled = report.settlements.length === 0;

  return (
    <main className="min-h-[100dvh] bg-[var(--bg)] px-4 pb-16 pt-8">
      <div className="mx-auto w-full max-w-lg">

        {/* ── Identity: which team, which season ──────────────────────── */}
        <header className="mb-6 flex items-center gap-3">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt=""
              /* logo_url is free-text in the DB and this page is public, so a
                 hostile value must not be able to harvest viewers' referers. */
              referrerPolicy="no-referrer"
              className="h-12 w-12 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[20px]"
              style={{ background: 'color-mix(in srgb, var(--cricket) 14%, transparent)' }}
            >
              🏏
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-[17px] font-bold leading-tight text-[var(--text)]">
              {report.teamName}
            </p>
            <p className="truncate text-[13px] text-[var(--muted)]">{report.seasonName}</p>
          </div>
        </header>

        <div className="mb-5">
          <h1 className="text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Team settlement report
          </h1>
          {/* Tappable: the report is live, so a reader who has been staring
              at it needs a way to say "is this still true?" and watch it
              answer. It also refreshes itself whenever the tab regains focus. */}
          <button
            onClick={() => void refreshAction.run()}
            disabled={refreshing}
            className="mt-0.5 flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--muted)] active:opacity-70"
            aria-label="Refresh report"
            aria-busy={refreshing}
            aria-live="polite"
          >
            {refreshAction.succeeded && !refreshing ? (
              <Check size={11} className="animate-tactile-check" style={{ color: 'var(--green, #16a34a)' }} aria-hidden />
            ) : (
              <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} aria-hidden />
            )}
            {refreshing ? 'Updating…' : `Updated ${fmtUpdated(report.updatedAt)}`}
          </button>
        </div>

        {/* ── The headline number ─────────────────────────────────────── */}
        {allSettled ? (
          <section
            className="mb-6 rounded-2xl p-6 text-center"
            style={{
              background: 'color-mix(in srgb, var(--green, #16a34a) 10%, var(--card))',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div
              className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full"
              style={{ background: 'color-mix(in srgb, var(--green, #16a34a) 20%, transparent)' }}
            >
              <Check size={22} style={{ color: 'var(--green, #16a34a)' }} />
            </div>
            <p className="text-[17px] font-bold text-[var(--text)]">All settled</p>
            <p className="mt-1 text-[14px] text-[var(--muted)]">
              No payments are currently needed.
            </p>
          </section>
        ) : (
          <section
            className="mb-6 rounded-2xl p-5"
            style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Outstanding
            </p>
            <p className="mt-1 text-[34px] font-bold leading-none tracking-tight text-[var(--text)]">
              {formatCents(report.totalOutstandingCents)}
            </p>
            <p className="mt-2.5 text-[13px] text-[var(--muted)]">
              {report.paymentCount} {report.paymentCount === 1 ? 'payment' : 'payments'} needed
              {' · '}
              {report.membersInvolved} {report.membersInvolved === 1 ? 'member' : 'members'} involved
            </p>
          </section>
        )}

        {/* ── PAYMENTS TO MAKE — the point of the whole page ──────────── */}
        {!allSettled && (
          <section className="mb-6">
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <h2 className="text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Payments to make
              </h2>
              {query.trim() !== '' && (
                <span className="text-[12px] text-[var(--muted)]">
                  {matchCount} of {report.paymentCount}
                </span>
              )}
            </div>

            {/* Find yourself. With 15 people involved, scrolling a wall to
                answer "what do I owe?" is the whole complaint. */}
            <div
              className="mb-3 flex items-center gap-2 rounded-xl px-3"
              style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}
            >
              <Search size={15} className="shrink-0 text-[var(--muted)]" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find your name"
                aria-label="Find your name"
                className="min-h-11 w-full bg-transparent text-[16px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
              />
              {query && (
                <button onClick={() => setQuery('')} className="shrink-0 px-1 text-[13px] text-[var(--muted)]" aria-label="Clear">
                  Clear
                </button>
              )}
            </div>

            {groups.length === 0 ? (
              <div className="rounded-2xl px-4 py-6 text-center" style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}>
                <p className="text-[14px] text-[var(--muted)]">
                  No payments involve &ldquo;{query.trim()}&rdquo;.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {groups.map((g) => (
                  <div
                    key={g.from}
                    className="overflow-hidden rounded-2xl"
                    style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}
                  >
                    {/* One card per person who owes something. */}
                    <div className="px-4 pt-3.5 pb-1">
                      <h3 className="truncate text-[16px] font-bold text-[var(--text)]">
                        {labelFor(g.from)}
                      </h3>
                    </div>

                    <ul>
                      {g.rows.map((r) => {
                        const key = `${r.from}->${r.to}`;
                        const open = expanded.has(key);
                        return (
                          <li key={key}>
                            <button
                              onClick={() => toggle(key)}
                              aria-expanded={open}
                              /* pressable-selection, not pressable: 0.98 on a
                                 full-width card row. The deeper 0.97 is fine on
                                 a 100px button but on a row this wide it reads
                                 as the whole card lurching. */
                              className="pressable-selection flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left active:bg-[var(--hover-bg)]"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[15px] font-semibold text-[var(--text)]">
                                  Pay {labelFor(r.to)}
                                </p>
                                <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                                  {r.why.length}{' '}
                                  {r.why.length === 1 ? 'contributing expense' : 'contributing expenses'}
                                </p>
                              </div>
                              <span
                                className="shrink-0 text-[16px] font-bold tabular-nums"
                                style={{ color: 'var(--red, #dc2626)' }}
                              >
                                {formatCents(r.amountCents)}
                              </span>
                              <ChevronDown
                                size={15}
                                className="shrink-0 text-[var(--muted)] transition-transform"
                                style={{ transform: open ? 'rotate(180deg)' : 'none' }}
                                aria-hidden
                              />
                            </button>

                            {/* The invoice behind the number. These lines sum to
                                the amount above — the database asserts it. */}
                            {open && (
                              <div className="px-4 pb-3">
                                <ul className="rounded-xl px-3 py-2" style={{ background: 'var(--hover-bg)' }}>
                                  {r.why.map((w, i) => (
                                    <li key={`${w.label}-${i}`} className="flex items-baseline justify-between gap-3 py-1">
                                      <span className="min-w-0 truncate text-[13px] text-[var(--text)]">
                                        {w.label}
                                        {w.date && (
                                          <span className="ml-1.5 text-[11px] text-[var(--muted)]">{fmtDay(w.date)}</span>
                                        )}
                                      </span>
                                      <span
                                        className="shrink-0 text-[13px] tabular-nums"
                                        style={{ color: w.amountCents < 0 ? 'var(--green, #16a34a)' : 'var(--muted)' }}
                                      >
                                        {w.amountCents < 0 ? '−' : ''}
                                        {formatCents(Math.abs(w.amountCents))}
                                      </span>
                                    </li>
                                  ))}
                                  <li className="mt-1 flex items-baseline justify-between gap-3 border-t border-[var(--border)]/50 pt-1.5">
                                    <span className="text-[13px] font-semibold text-[var(--text)]">
                                      Owed to {labelFor(r.to)}
                                    </span>
                                    <span className="text-[13px] font-bold tabular-nums text-[var(--text)]">
                                      {formatCents(r.amountCents)}
                                    </span>
                                  </li>
                                </ul>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    {/* Only when there is more than one payment to add up —
                        a "total" identical to the single row above it is noise. */}
                    {g.rows.length > 1 && (
                      <div className="flex items-baseline justify-between gap-3 border-t border-[var(--border)]/50 px-4 py-3">
                        <span className="text-[14px] font-semibold text-[var(--text)]">Total to pay</span>
                        <span className="text-[16px] font-bold tabular-nums text-[var(--text)]">
                          {formatCents(g.totalCents)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Why these payments? ─────────────────────────────────────── */}
        {!allSettled && (
          <section className="mb-6">
            <h2 className="mb-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Why these payments?
            </h2>
            <div className="rounded-2xl px-4 py-3.5" style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}>
              {/* Accurate to what the app actually computes. It does NOT
                  simplify debts across the group — saying so would send
                  someone money they were never told to send. */}
              <p className="text-[13px] leading-relaxed text-[var(--muted)]">
                During the season some players paid for things the whole team
                shared. Each payment below is settled directly between two
                people: your share of what they paid, minus anything you have
                already paid them back. Nobody is asked to pay a third person
                on someone else&apos;s behalf.
              </p>
            </div>
          </section>
        )}

        {/* ── Already paid, kept well away from the outstanding list ──── */}
        {report.settled.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Settled
            </h2>
            <ul
              className="overflow-hidden rounded-2xl"
              style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}
            >
              {report.settled.map((r, i) => (
                <li
                  key={`${r.from}-${r.to}-${r.date}-${i}`}
                  className="flex items-center gap-3 border-b border-[var(--border)]/40 px-4 py-3 last:border-b-0"
                >
                  <Check
                    size={14}
                    className="shrink-0"
                    style={{ color: 'var(--green, #16a34a)' }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-[var(--text)]">
                      {labelFor(r.from)} <span className="text-[var(--muted)]">to</span> {labelFor(r.to)}
                    </p>
                    <p className="text-[12px] text-[var(--muted)]">{fmtDay(r.date)}</p>
                  </div>
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums text-[var(--muted)]">
                    {formatCents(r.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── All transactions — collapsed, because the ledger is context,
               not the answer. ───────────────────────────────────────────── */}
        {report.expenses.length > 0 && (
          <section className="mb-6">
            <button
              onClick={() => setShowLedger((v) => !v)}
              aria-expanded={showLedger}
              /* Press only. This opens the browsing layer — see the note on
                 `toggle` for why the haptics stop here. */
              className="pressable-selection flex w-full min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 text-left active:bg-[var(--hover-bg)]"
              style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}
            >
              <span>
                <span className="block text-[14px] font-semibold text-[var(--text)]">
                  All transactions
                </span>
                <span className="block text-[12px] text-[var(--muted)]">
                  {report.expenses.length} shared {report.expenses.length === 1 ? 'expense' : 'expenses'} this season
                </span>
              </span>
              <ChevronDown
                size={16}
                className="shrink-0 text-[var(--muted)] transition-transform"
                style={{ transform: showLedger ? 'rotate(180deg)' : 'none' }}
                aria-hidden
              />
            </button>

            {showLedger && (
              <ul
                className="mt-2 overflow-hidden rounded-2xl"
                style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}
              >
                {report.expenses.map((e, i) => {
                  const key = `${e.label}-${e.date}-${i}`;
                  const open = openExpense.has(key);
                  return (
                    <li key={key} className="border-b border-[var(--border)]/40 last:border-b-0">
                      <button
                        onClick={() =>
                          setOpenExpense((prev) => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          })
                        }
                        aria-expanded={open}
                        /* No haptic: up to 28 of these on a full season. */
                        className="pressable-selection flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left active:bg-[var(--hover-bg)]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] text-[var(--text)]">{e.label}</p>
                          <p className="text-[12px] text-[var(--muted)]">
                            {e.paidBy} paid · {fmtDay(e.date)}
                            {e.shares.length > 0 && (
                              <> · split {e.shares.length} {e.shares.length === 1 ? 'way' : 'ways'}</>
                            )}
                          </p>
                        </div>
                        <span className="shrink-0 text-[14px] font-semibold tabular-nums text-[var(--text)]">
                          {formatCents(e.amountCents)}
                        </span>
                        {e.shares.length > 0 && (
                          <ChevronDown
                            size={14}
                            className="shrink-0 text-[var(--muted)] transition-transform"
                            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
                            aria-hidden
                          />
                        )}
                      </button>

                      {/* Who was actually in it, and for how much. */}
                      {open && e.shares.length > 0 && (
                        <div className="px-4 pb-3">
                          <ul className="rounded-xl px-3 py-2" style={{ background: 'var(--hover-bg)' }}>
                            {e.shares.map((sh, j) => (
                              <li
                                key={`${sh.name}-${j}`}
                                className="flex items-baseline justify-between gap-3 py-1"
                              >
                                <span className="min-w-0 truncate text-[13px] text-[var(--text)]">
                                  {sh.name}
                                  {sh.name === e.paidBy && (
                                    <span className="ml-1.5 text-[11px] text-[var(--muted)]">paid</span>
                                  )}
                                </span>
                                <span className="shrink-0 text-[13px] tabular-nums text-[var(--muted)]">
                                  {formatCents(sh.amountCents)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* ── Share ───────────────────────────────────────────────────── */}
        <button
          onClick={() => void shareAction.run()}
          disabled={shareAction.pending}
          className="pressable flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition-opacity active:opacity-80 disabled:opacity-70"
          style={{ background: 'var(--cricket)', color: 'var(--cricket-on)' }}
          aria-live="polite"
        >
          {copied
            ? <Check size={17} className="animate-tactile-check" />
            : canShare ? <Share2 size={17} /> : <Copy size={17} />}
          {copied ? 'Link copied' : 'Share settlement report'}
        </button>

        <p className="mt-4 text-center text-[12px] text-[var(--muted)]">
          This is a read-only settlement report.
        </p>
      </div>
    </main>
  );
}
