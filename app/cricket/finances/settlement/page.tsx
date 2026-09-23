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
import { SegmentedControl } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';

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
 * NOTE for anyone reaching for `position: sticky` on this page (or anywhere
 * under this app's <main>): it does not work, and it fails silently. Both
 * <html> and <body> carry an app-wide `overflow-x-hidden` class to stop
 * horizontal bounce, and per the CSS Overflow spec, declaring overflow-x
 * forces overflow-y to compute as 'auto' too — which makes <body> the sticky
 * reference container instead of <html> (the element that actually scrolls),
 * and <body> has no internal scroll room of its own (confirmed:
 * document.scrollingElement is <html>, body.scrollHeight ===
 * body.clientHeight). A sticky element anchored to a box that never scrolls
 * never appears to stick. The sticky table header this page used to have
 * only worked because its table sat in a bounded-height internal scroller;
 * the card layout needs neither.
 */

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
  const [tab, setTab] = useState<'payments' | 'settled' | 'ledger'>('payments');
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

  const filteredSettled = useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    return q
      ? report.settled.filter(
          (r) => r.from.toLowerCase().includes(q) || r.to.toLowerCase().includes(q),
        )
      : report.settled;
  }, [report, query]);

  const filteredExpenses = useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    return q
      ? report.expenses.filter(
          (e) =>
            // "Find your name" means names — same rule as the Payments
            // (Owes/To) and Settled (From/To) tabs. e.label is the expense's
            // free-text description ("Tea and samosas post semifinals"), not
            // a person, and matching it made the placeholder's promise untrue
            // on this one tab only.
            e.paidBy.toLowerCase().includes(q)
            || e.shares.some((s) => s.name.toLowerCase().includes(q)),
        )
      : report.expenses;
  }, [report, query]);

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

  const totalCount =
    tab === 'payments' ? report.paymentCount
    : tab === 'settled' ? report.settled.length
    : report.expenses.length;
  const matchCount =
    tab === 'payments' ? groups.reduce((n, g) => n + g.rows.length, 0)
    : tab === 'settled' ? filteredSettled.length
    : filteredExpenses.length;

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
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-bold leading-tight text-[var(--text)]">
              {report.teamName}
            </p>
            <p className="truncate text-[13px] text-[var(--muted)]">{report.seasonName}</p>
          </div>
          <ThemeToggle />
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

        {/* ── Report sections, as tabs — was three stacked sections that
               made a 15-person season an unbroken scroll. Same three concepts
               (what's owed, what's been settled, the raw ledger), same
               tap-to-expand invoices, just switched instead of stacked.
               Design-reviewed against the Apple HIG foundations (a web app,
               so principles/foundations apply, not native chrome) — see the
               five fixes below, each tied to a specific finding. */}
        <section className="mb-6">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">
              {tab === 'payments' ? 'Payments to make' : tab === 'settled' ? 'Settled' : 'All transactions'}
            </h2>
            {/* Always shown now, not just while searching — this is also
                where the tab count moved FROM (see SegmentedControl below):
                `tab-bars.md › Best practices` — "Use single words whenever
                possible" for tab labels. "Payments to make (28)" wrapped to
                two lines on a 390px phone; the count belongs here instead. */}
            <span className="text-[12px] text-[var(--muted)]">
              {query.trim() !== '' ? `${matchCount} of ${totalCount}` : totalCount}
            </span>
          </div>

          {/* Find yourself. With 15 people involved, scrolling a wall to
              answer "what do I owe?" is the whole complaint. Applies across
              all three tabs, not just Payments — the same question ("am I in
              this?") is worth answering on the ledger and the settled log too. */}
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

          <SegmentedControl
            options={[
              { key: 'payments', label: 'Payments' },
              { key: 'settled', label: 'Settled' },
              { key: 'ledger', label: 'All' },
            ]}
            active={tab}
            onChange={(k) => setTab(k as 'payments' | 'settled' | 'ledger')}
            className="mb-3"
            ariaLabel="Report section"
          />

          {/* No table, no bounded-height scroller, no sticky header — all
              three were scaffolding the TABLE needed and none of it survives
              the move to cards. Each card carries its own surface and the
              page just scrolls; there are no columns to keep aligned and no
              header to keep on screen. */}

              {/* ── Payments to make ──────────────────────────────────── */}
              {tab === 'payments' && (
                allSettled ? (
                  <p className="px-4 py-6 text-center text-[14px] text-[var(--muted)]">
                    No payments are currently needed.
                  </p>
                ) : groups.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[14px] text-[var(--muted)]">
                    No payments involve &ldquo;{query.trim()}&rdquo;.
                  </p>
                ) : (
                  /* CARDS, not a table. The table fought this data the whole
                     way: names wrapped unpredictably, the Amount column fell
                     off a 375px screen, and a merged payer cell miscounted
                     its own rows the moment one expanded. A card per payer
                     has no columns to misalign — the name and total sit in
                     the card head, each payment is a flex row, and the
                     breakdown opens inside the card. */
                  <div className="flex flex-col gap-3">
                    {groups.map((g) => (
                      <div
                        key={g.from}
                        className="overflow-hidden rounded-2xl border border-[var(--border)]"
                        style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}
                      >
                        <div className="px-4 pb-3 pt-3.5">
                          <p className="break-words text-[16px] font-bold tracking-tight text-[var(--text)]">
                            {labelFor(g.from)}
                          </p>
                          {/* Only when there is more than one payment to add
                              up — a total identical to the single row below
                              it is noise. */}
                          {g.rows.length > 1 && (
                            <div className="mt-1.5 flex items-baseline gap-3">
                              <span className="flex-1 text-[13px] text-[var(--muted)]">Total to pay</span>
                              <span
                                className="shrink-0 text-[16px] font-bold tabular-nums"
                                style={{ color: 'var(--red, #dc2626)' }}
                              >
                                {formatCents(g.totalCents)}
                              </span>
                            </div>
                          )}
                        </div>

                        {g.rows.map((r) => {
                          const key = `${r.from}->${r.to}`;
                          const open = expanded.has(key);
                          return (
                            <div key={key} className="border-t border-[var(--border)]">
                              {/* One button per row, so the whole row is the
                                  tap target AND screen readers get a single
                                  correctly-labeled control. */}
                              <button
                                type="button"
                                onClick={() => toggle(key)}
                                aria-expanded={open}
                                aria-label={`${open ? 'Hide' : 'Show'} breakdown of ${formatCents(r.amountCents)} owed to ${labelFor(r.to)}`}
                                className="pressable-selection flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left active:bg-[var(--hover-bg)]"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block break-words text-[14px] font-medium text-[var(--text)]">
                                    Pay {labelFor(r.to)}
                                  </span>
                                  <span className="mt-0.5 block text-[12px] text-[var(--muted)]">
                                    {r.why.length === 1 ? '1 transaction' : `${r.why.length} transactions`}
                                  </span>
                                </span>
                                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--text)]">
                                  {formatCents(r.amountCents)}
                                </span>
                                <ChevronDown
                                  size={15}
                                  className="shrink-0 text-[var(--muted)] transition-transform"
                                  style={{ transform: open ? 'rotate(180deg)' : 'none' }}
                                  aria-hidden
                                />
                              </button>

                              {/* The invoice behind the number. These lines
                                  sum to the amount above — the database
                                  asserts it. Label, date and amount are three
                                  columns: the date and amount are fixed-width
                                  and right-aligned so they stack into clean
                                  columns instead of being shoved around by
                                  whatever amount follows them. The label
                                  WRAPS rather than truncating — the expense
                                  name is the whole reason the line is there. */}
                              {open && (
                                <div className="px-3 pb-3">
                                  <ul className="rounded-xl px-3 py-1.5" style={{ background: 'var(--hover-bg)' }}>
                                    {r.why.map((w, wi) => (
                                      <li key={`${w.label}-${wi}`} className="flex items-baseline gap-3 py-2">
                                        <span className="min-w-0 flex-1 break-words text-[13px] leading-[1.4] text-[var(--text)]">
                                          {w.label}
                                        </span>
                                        {w.date && (
                                          <span className="w-[46px] shrink-0 text-right text-[11px] tabular-nums text-[var(--muted)]">
                                            {fmtDay(w.date)}
                                          </span>
                                        )}
                                        <span
                                          className="w-[64px] shrink-0 text-right text-[13px] tabular-nums"
                                          style={{ color: w.amountCents < 0 ? 'var(--credit-text)' : 'var(--muted)' }}
                                        >
                                          {w.amountCents < 0 ? '−' : ''}
                                          {formatCents(Math.abs(w.amountCents))}
                                        </span>
                                      </li>
                                    ))}
                                    <li className="mt-0.5 flex items-baseline gap-3 border-t border-[var(--border)]/60 py-2">
                                      <span className="flex-1 text-[13px] font-semibold text-[var(--text)]">
                                        Owed to {labelFor(r.to)}
                                      </span>
                                      <span className="w-[64px] shrink-0 text-right text-[13px] font-bold tabular-nums text-[var(--text)]">
                                        {formatCents(r.amountCents)}
                                      </span>
                                    </li>
                                  </ul>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* ── Settled ────────────────────────────────────────────── */}
              {tab === 'settled' && (
                filteredSettled.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[14px] text-[var(--muted)]">
                    {query.trim()
                      ? <>No settled payments involve &ldquo;{query.trim()}&rdquo;.</>
                      : 'No settled payments yet.'}
                  </p>
                ) : (
                  <div
                    className="overflow-hidden rounded-2xl border border-[var(--border)]"
                    style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}
                  >
                    <ul>
                      {filteredSettled.map((r, i) => (
                        <li
                          key={`${r.from}-${r.to}-${r.date}-${i}`}
                          className="flex items-center gap-3 border-t border-[var(--border)] px-4 py-3 first:border-t-0"
                        >
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                            style={{ background: 'color-mix(in srgb, var(--green, #16a34a) 14%, transparent)' }}
                          >
                            <Check size={13} style={{ color: 'var(--credit-text)' }} aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-[14px] text-[var(--text)]">
                              {labelFor(r.from)} <span className="text-[var(--muted)]">paid</span> {labelFor(r.to)}
                            </span>
                            <span className="mt-0.5 block text-[12px] text-[var(--muted)]">{fmtDay(r.date)}</span>
                          </span>
                          <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--muted)]">
                            {formatCents(r.amountCents)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}

              {/* ── All transactions ──────────────────────────────────── */}
              {tab === 'ledger' && (
                filteredExpenses.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[14px] text-[var(--muted)]">
                    {query.trim()
                      ? <>No expenses involve &ldquo;{query.trim()}&rdquo;.</>
                      : 'No expenses recorded yet.'}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {filteredExpenses.map((e, i) => {
                      const key = `${e.label}-${e.date}-${i}`;
                      const open = openExpense.has(key);
                      const expandable = e.shares.length > 0;
                      const toggleExpense = () => {
                        if (!expandable) return;
                        setOpenExpense((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        });
                      };
                      const head = (
                        <>
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-[14px] font-medium text-[var(--text)]">{e.label}</span>
                            <span className="mt-0.5 block text-[12px] text-[var(--muted)]">
                              {e.paidBy} paid · {fmtDay(e.date)}
                              {expandable && <> · split {e.shares.length} {e.shares.length === 1 ? 'way' : 'ways'}</>}
                            </span>
                          </span>
                          <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--text)]">
                            {formatCents(e.amountCents)}
                          </span>
                        </>
                      );
                      return (
                        <div
                          key={key}
                          className="overflow-hidden rounded-2xl border border-[var(--border)]"
                          style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}
                        >
                          {expandable ? (
                            <button
                              type="button"
                              onClick={toggleExpense}
                              aria-expanded={open}
                              aria-label={`${open ? 'Hide' : 'Show'} who split ${e.label}`}
                              className="pressable-selection flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left active:bg-[var(--hover-bg)]"
                            >
                              {head}
                              <ChevronDown
                                size={15}
                                className="shrink-0 text-[var(--muted)] transition-transform"
                                style={{ transform: open ? 'rotate(180deg)' : 'none' }}
                                aria-hidden
                              />
                            </button>
                          ) : (
                            <div className="flex min-h-14 items-center gap-3 px-4 py-3">{head}</div>
                          )}

                          {/* Who was actually in it, and for how much. */}
                          {open && expandable && (
                            <div className="px-3 pb-3">
                              <ul className="rounded-xl px-3 py-1.5" style={{ background: 'var(--hover-bg)' }}>
                                {e.shares.map((sh, j) => (
                                  <li key={`${sh.name}-${j}`} className="flex items-baseline gap-3 py-2">
                                    <span className="min-w-0 flex-1 break-words text-[13px] leading-[1.4] text-[var(--text)]">
                                      {sh.name}
                                      {sh.name === e.paidBy && (
                                        <span className="ml-1.5 text-[11px] text-[var(--muted)]">paid</span>
                                      )}
                                    </span>
                                    <span className="w-[64px] shrink-0 text-right text-[13px] tabular-nums text-[var(--muted)]">
                                      {formatCents(sh.amountCents)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}

          {/* Explains the Payments tab's numbers specifically — does NOT
              simplify debts across the group, so it only belongs next to the
              tab it's explaining. */}
          {tab === 'payments' && !allSettled && (
            <p className="mt-3 rounded-2xl px-4 py-3.5 text-[13px] leading-relaxed text-[var(--muted)]" style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}>
              During the season some players paid for things the whole team
              shared. Each payment above is settled directly between two
              people: your share of what they paid, minus anything you have
              already paid them back. Nobody is asked to pay a third person
              on someone else&apos;s behalf.
            </p>
          )}
        </section>

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
