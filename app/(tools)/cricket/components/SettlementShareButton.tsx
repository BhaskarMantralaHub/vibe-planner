'use client';

/**
 * Admin control for the public team settlement report link.
 *
 * The link is scoped to the season that is SELECTED right now, not to whatever
 * becomes the current season later — sharing Spring must keep showing Spring
 * after the club rolls over to Fall.
 *
 * One live link per team+season, enforced in the database by a partial unique
 * index. "Refresh" rotates: the old link stops working the moment the new one
 * exists, which is why it asks first.
 */

import { useState } from 'react';
import { Share2, Copy, Check, RefreshCw, Ban, Link2 } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  Button, Text, Dialog, DialogContent, DialogTitle, DialogDescription,
} from '@/components/ui';
import { toast } from 'sonner';

type Share = { token: string; expires_at: string; created_at: string; created_by_name: string | null };

/**
 * Query string, not a path segment: the static export has no file at
 * /cricket/finances/settlement/<token>/, and the wildcard rewrite that would
 * serve one does not fire on Cloudflare Pages. See the note in the public page.
 */
function reportUrl(token: string): string {
  return `${window.location.origin}/cricket/finances/settlement/?t=${token}`;
}

function daysLeft(expiresAt: string): number {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
}

export function SettlementShareButton({
  seasonId,
  seasonName,
}: {
  seasonId: string | null;
  seasonName: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<Share | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [copied, setCopied] = useState(false);

  const openSheet = async () => {
    if (!seasonId) { toast.error('Pick a season first'); return; }
    setOpen(true);
    setLoaded(false);
    const supabase = getSupabaseClient();
    if (!supabase) { setLoaded(true); return; }
    const { data, error } = await supabase.rpc('get_settlement_share', { p_season_id: seasonId });
    if (!error && data?.success) setShare(data.share ?? null);
    setLoaded(true);
  };

  const generate = async () => {
    if (!seasonId) return;
    setBusy(true);
    const supabase = getSupabaseClient();
    if (!supabase) { setBusy(false); return; }
    const { data, error } = await supabase.rpc('generate_settlement_share', { p_season_id: seasonId });
    setBusy(false);
    setConfirmRefresh(false);
    if (error || !data?.success) {
      toast.error("Couldn't create the link");
      return;
    }
    setShare({
      token: data.token,
      expires_at: data.expires_at,
      created_at: new Date().toISOString(),
      created_by_name: null,
    });
    toast.success('Settlement report link ready');
  };

  const revoke = async () => {
    if (!seasonId) return;
    setBusy(true);
    const supabase = getSupabaseClient();
    if (!supabase) { setBusy(false); return; }
    const { data, error } = await supabase.rpc('revoke_settlement_share', { p_season_id: seasonId });
    setBusy(false);
    if (error || !data?.success) { toast.error("Couldn't revoke the link"); return; }
    setShare(null);
    toast.success('Link revoked. It no longer opens.');
  };

  const doShare = async () => {
    if (!share) return;
    const url = reportUrl(share.token);
    const title = `${seasonName} settlement report`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try { await navigator.share({ title, url }); return; } catch { /* dismissed */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Settlement report link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const copy = async () => {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(reportUrl(share.token));
      setCopied(true);
      toast.success('Settlement report link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <>
      <Button
        onClick={openSheet}
        variant="secondary"
        size="md"
        className="gap-1.5 flex-shrink-0"
        aria-label="Share settlement report"
      >
        <Share2 size={16} />
        <span className="hidden sm:inline">Share</span>
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirmRefresh(false); }}>
        <DialogContent className="max-w-sm">
          {/* ── Rotate confirmation, deliberately a separate screen ──── */}
          {confirmRefresh ? (
            <>
              <DialogTitle className="text-[16px]">Refresh settlement link?</DialogTitle>
              <DialogDescription className="mt-1 text-[13px]">
                The current link will stop working. A new link will be generated.
              </DialogDescription>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" size="md" className="flex-1"
                  onClick={() => setConfirmRefresh(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="primary" brand="cricket" size="md" className="flex-1"
                  onClick={generate} disabled={busy}>
                  {busy ? 'Refreshing…' : 'Refresh link'}
                </Button>
              </div>
            </>
          ) : !loaded ? (
            <div className="py-6 text-center">
              <Text size="sm" color="muted">Checking…</Text>
            </div>
          ) : !share ? (
            /* ── First time: say plainly what the link exposes ───────── */
            <>
              <DialogTitle className="text-[16px]">Share team settlement report?</DialogTitle>
              <DialogDescription className="mt-1 text-[13px] leading-relaxed">
                Anyone with this link can view the team&apos;s current settlement
                balances for {seasonName}. The link expires in 30 days and you can
                revoke it at any time.
              </DialogDescription>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" size="md" className="flex-1"
                  onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="primary" brand="cricket" size="md" className="flex-1"
                  onClick={generate} disabled={busy}>
                  {busy ? 'Creating…' : 'Generate link'}
                </Button>
              </div>
            </>
          ) : (
            /* ── Live link ───────────────────────────────────────────── */
            <>
              <DialogTitle className="text-[16px]">Settlement report link</DialogTitle>
              <DialogDescription className="mt-1 text-[13px]">
                {seasonName} · expires in {daysLeft(share.expires_at)} days
              </DialogDescription>

              <div
                className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5"
                style={{ background: 'var(--hover-bg)' }}
              >
                <Link2 size={14} className="shrink-0 text-[var(--muted)]" />
                <Text size="xs" color="muted" className="truncate">
                  {/* Host only. The token is never rendered — a screenshot of
                      this dialog must not hand over the report. */}
                  {typeof window !== 'undefined' ? window.location.host : ''}/cricket/finances/settlement/…
                </Text>
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="primary" brand="cricket" size="md" className="flex-1 gap-1.5"
                  onClick={doShare}>
                  {copied ? <Check size={15} /> : <Share2 size={15} />}
                  {copied ? 'Copied' : 'Share'}
                </Button>
                <Button variant="secondary" size="md" className="gap-1.5" onClick={copy}
                  aria-label="Copy report link">
                  <Copy size={15} />
                </Button>
              </div>

              <div className="mt-2 flex gap-2">
                <Button variant="ghost" size="sm" className="flex-1 gap-1.5"
                  onClick={() => setConfirmRefresh(true)} disabled={busy}>
                  <RefreshCw size={13} />
                  Refresh link
                </Button>
                <Button variant="ghost" size="sm" className="flex-1 gap-1.5"
                  onClick={revoke} disabled={busy}
                  style={{ color: 'var(--red, #dc2626)' }}>
                  <Ban size={13} />
                  Revoke
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
