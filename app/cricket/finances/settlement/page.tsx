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

import { useEffect, useState, useMemo } from 'react';
import { Share2, Copy, ArrowRight, ArrowDown, Check } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { playerLabels } from '@/app/(tools)/cricket/lib/player-labels';
import { formatCents } from '@/app/(tools)/cricket/lib/settlement';
import { toast } from 'sonner';

type SettlementRow = { from: string; to: string; amountCents: number };
type SettledRow = SettlementRow & { date: string };

type Report = {
  teamName: string | null;
  teamLogo: string | null;
  seasonName: string | null;
  updatedAt: string;
  totalOutstandingCents: number;
  paymentCount: number;
  membersInvolved: number;
  settlements: SettlementRow[];
  settled: SettledRow[];
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

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  useEffect(() => {
    document.title = 'Team Settlement Report';
    let done = false;

    const fail = () => { if (!done) { done = true; setState('unavailable'); } };
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS);

    (async () => {
      try {
        const token = tokenFromUrl();
        if (!token) return fail();
        const supabase = getSupabaseClient();
        if (!supabase) return fail();

        const { data, error } = await supabase.rpc('get_settlement_report', { p_token: token });
        if (done) return;
        // NULL is the server's single answer for invalid / expired / revoked.
        if (error || !data) return fail();

        done = true;
        clearTimeout(timer);
        setReport(data as Report);
        setState('ready');
      } catch {
        fail();
      }
    })();

    return () => clearTimeout(timer);
  }, []);

  // House naming convention: nickname or first name, surname added only when
  // that alone would point at two people on this page.
  const labelFor = useMemo(() => {
    if (!report) return (n: string) => n;
    const names = new Set<string>();
    for (const r of report.settlements) { names.add(r.from); names.add(r.to); }
    for (const r of report.settled) { names.add(r.from); names.add(r.to); }
    const labels = playerLabels([...names].map((n) => ({ id: n, name: n })));
    return (n: string) => {
      const l = labels.get(n);
      if (!l) return n;
      return l.secondary ? `${l.primary} ${l.secondary}` : l.primary;
    };
  }, [report]);

  const share = async () => {
    const url = window.location.href;
    const title = report ? `${report.teamName} settlement report` : 'Settlement report';
    if (canShare) {
      try { await navigator.share({ title, url }); return; } catch { /* dismissed */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Report link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

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
          {report.teamLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={report.teamLogo}
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
          <p className="mt-0.5 text-[12px] text-[var(--dim,var(--muted))]">
            Updated {fmtUpdated(report.updatedAt)}
          </p>
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

        {/* ── WHO PAYS WHOM — the point of the whole page ─────────────── */}
        {!allSettled && (
          <section className="mb-6">
            <h2 className="mb-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Who pays whom
            </h2>
            <ul
              className="overflow-hidden rounded-2xl"
              style={{ background: 'var(--card)', boxShadow: 'var(--card-shadow)' }}
            >
              {report.settlements.map((r, i) => (
                <li
                  key={`${r.from}-${r.to}-${i}`}
                  className="flex items-center gap-3 border-b border-[var(--border)]/40 px-4 py-3.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    {/* Stacked with a down arrow on phones, inline on wider
                        screens. Direction is carried by the arrow and the
                        word "to", never by colour alone. */}
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                      <span className="truncate text-[15px] font-semibold text-[var(--text)]">
                        {labelFor(r.from)}
                      </span>
                      <ArrowDown
                        size={13}
                        className="shrink-0 text-[var(--muted)] sm:hidden"
                        aria-hidden
                      />
                      <ArrowRight
                        size={14}
                        className="hidden shrink-0 text-[var(--muted)] sm:block"
                        aria-hidden
                      />
                      <span className="truncate text-[15px] text-[var(--text)]">
                        <span className="sr-only">pays </span>
                        {labelFor(r.to)}
                      </span>
                    </div>
                  </div>
                  <span
                    className="shrink-0 text-[15px] font-bold tabular-nums"
                    style={{ color: 'var(--red, #dc2626)' }}
                  >
                    {formatCents(r.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
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

        {/* ── Share ───────────────────────────────────────────────────── */}
        <button
          onClick={share}
          className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition-opacity active:opacity-80"
          style={{ background: 'var(--cricket)', color: 'var(--cricket-on)' }}
        >
          {copied ? <Check size={17} /> : canShare ? <Share2 size={17} /> : <Copy size={17} />}
          {copied ? 'Link copied' : 'Share settlement report'}
        </button>

        <p className="mt-4 text-center text-[12px] text-[var(--muted)]">
          This is a read-only settlement report.
        </p>
      </div>
    </main>
  );
}
