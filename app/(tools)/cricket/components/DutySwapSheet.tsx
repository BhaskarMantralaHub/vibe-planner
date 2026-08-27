'use client';

import { useEffect, useMemo, useState } from 'react';
import { Drawer, DrawerHeader, DrawerTitle, DrawerBody, Button, Input, Label, Text, Badge } from '@/components/ui';
import { ArrowRight, Users, MapPin, Clock } from 'lucide-react';
import { useUmpiringStore } from '@/stores/umpiring-store';
import type { CricketUmpiringDuty } from '@/types/cricket';

/**
 * Records an offline duty swap.
 *
 * A swap is a TRADE, not a deletion, and it usually has two halves: we stop
 * covering one match, and often double up on another instead (two people to one
 * ground rather than one each to two). Doing those as separate admin actions
 * invites doing only the first, which silently loses an umpire.
 *
 * So this sheet performs both in one confirm:
 *   1. The duty being given up → cancelled, with the receiving team recorded.
 *      It stays VISIBLE (struck through) because MTCA still lists us for it.
 *   2. Optionally → an extra umpire slot on another match we already cover.
 */
interface DutySwapSheetProps {
  duty: CricketUmpiringDuty | null;
  /** Other upcoming duties, used to offer "we're covering this instead". */
  candidates: CricketUmpiringDuty[];
  adminName: string;
  onClose: () => void;
}

const shortTeam = (n: string) => n.replace(/^MTCA\s+/i, '').trim();

function formatTime(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export default function DutySwapSheet({ duty, candidates, adminName, onClose }: DutySwapSheetProps) {
  const { swapAwayDuty, addSlotToMatch } = useUmpiringStore();
  const [swapTeam, setSwapTeam] = useState('');
  const [coverInstead, setCoverInstead] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSwapTeam(duty?.swap_team ?? '');
    setCoverInstead(null);
  }, [duty]);

  /**
   * Candidate matches to double up on. One duty per MATCH — offering the same
   * match twice because it has two slots would be meaningless, and the target
   * match must not be the one being given away.
   */
  const options = useMemo(() => {
    if (!duty) return [];
    const seen = new Set<string>();
    const out: CricketUmpiringDuty[] = [];
    for (const d of candidates) {
      if (d.id === duty.id) continue;
      const key = d.cricclubs_fixture_id !== null
        ? `f:${d.cricclubs_fixture_id}`
        : `m:${d.match_date}|${[d.team_a, d.team_b].sort().join('|')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
    }
    return out.sort((a, b) =>
      a.match_date.localeCompare(b.match_date) || (a.match_time ?? '').localeCompare(b.match_time ?? ''),
    );
  }, [candidates, duty]);

  const handleConfirm = async () => {
    if (!duty) return;
    setSaving(true);
    try {
      // Order matters: add the replacement slot FIRST, so a failure on the
      // second step never leaves us having dropped a duty without gaining one.
      if (coverInstead) await addSlotToMatch(coverInstead, swapTeam.trim());
      await swapAwayDuty(duty.id, swapTeam.trim(), adminName);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={duty !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerHeader>
        <DrawerTitle>Swap this duty</DrawerTitle>
        <Text as="p" size="2xs" color="muted" className="mt-0.5">
          Records an offline swap. The duty stays visible, so nobody thinks the app is out of date.
        </Text>
      </DrawerHeader>

      <DrawerBody>
        {duty && (
          <div
            className="rounded-2xl p-3"
            style={{
              background: 'color-mix(in srgb, var(--red) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)',
            }}
          >
            <Text size="2xs" color="danger" weight="bold" uppercase tracking="wider">
              Giving up
            </Text>
            <Text size="sm" weight="bold" className="mt-1">
              {shortTeam(duty.team_a)} v {shortTeam(duty.team_b)}
            </Text>
            <Text as="p" size="2xs" color="muted">
              {formatDate(duty.match_date)}
              {duty.match_time ? ` · ${formatTime(duty.match_time)}` : ''}
              {duty.venue ? ` · ${duty.venue}` : ''}
            </Text>
            {duty.assigned_player_name && (
              <Text as="p" size="2xs" color="dim" className="mt-1">
                {duty.assigned_player_name} was down for this — they&apos;ll be unassigned.
              </Text>
            )}
          </div>
        )}

        {/* Text input first so the keyboard doesn't cover it. */}
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="swap-team">Handed to which team?</Label>
          <Input
            id="swap-team"
            value={swapTeam}
            onChange={(e) => setSwapTeam(e.target.value)}
            placeholder="e.g. MTCA Power Stars (optional)"
            autoComplete="off"
          />
        </div>

        {options.length > 0 && (
          <div className="mt-4">
            <Label>Covering another match instead?</Label>
            <Text as="p" size="2xs" color="dim" className="mb-2">
              Adds a second umpire slot there, so two of you go to one ground.
            </Text>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setCoverInstead(null)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left"
                style={{
                  background: coverInstead === null ? 'color-mix(in srgb, var(--cricket) 10%, transparent)' : 'var(--surface)',
                  border: `1.5px solid ${coverInstead === null ? 'color-mix(in srgb, var(--cricket) 45%, transparent)' : 'var(--border)'}`,
                }}
              >
                <Radio on={coverInstead === null} />
                <Text size="sm" weight="medium">No — just handing it over</Text>
              </button>

              {options.map((o) => {
                const on = coverInstead === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setCoverInstead(o.id)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left"
                    style={{
                      background: on ? 'color-mix(in srgb, var(--cricket) 10%, transparent)' : 'var(--surface)',
                      border: `1.5px solid ${on ? 'color-mix(in srgb, var(--cricket) 45%, transparent)' : 'var(--border)'}`,
                    }}
                  >
                    <Radio on={on} />
                    <div className="min-w-0 flex-1">
                      <Text size="sm" weight="medium" truncate>
                        {shortTeam(o.team_a)} v {shortTeam(o.team_b)}
                      </Text>
                      <div className="flex flex-wrap items-center gap-x-2.5">
                        <span className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
                          <Clock size={10} /> {formatTime(o.match_time) ?? 'TBD'}
                        </span>
                        {o.venue && (
                          <span className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
                            <MapPin size={10} /> {o.venue}
                          </span>
                        )}
                      </div>
                    </div>
                    {on && <Badge variant="green" size="sm">+1 umpire</Badge>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Plain-language summary of exactly what the button will do. */}
        {duty && (
          <div className="mt-4 rounded-2xl bg-[var(--surface)] p-3">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-[var(--muted)]" />
              <Text size="2xs" weight="semibold" color="muted" uppercase tracking="wider">
                What happens
              </Text>
            </div>
            <div className="mt-1.5 space-y-1">
              <div className="flex items-start gap-1.5">
                <ArrowRight size={12} className="mt-0.5 shrink-0 text-[var(--red)]" />
                <Text size="2xs" color="muted">
                  {shortTeam(duty.team_a)} v {shortTeam(duty.team_b)} marked as swapped away
                  {swapTeam.trim() ? ` to ${swapTeam.trim()}` : ''} — kept on the list, not deleted
                </Text>
              </div>
              {coverInstead && (() => {
                const t = options.find((o) => o.id === coverInstead);
                return t ? (
                  <div className="flex items-start gap-1.5">
                    <ArrowRight size={12} className="mt-0.5 shrink-0 text-[var(--green)]" />
                    <Text size="2xs" color="muted">
                      A second umpire slot opens on {shortTeam(t.team_a)} v {shortTeam(t.team_b)}
                    </Text>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        )}

        <Button
          variant="primary" brand="cricket" size="lg" fullWidth className="mt-4"
          loading={saving}
          onClick={handleConfirm}
        >
          Confirm swap
        </Button>
      </DrawerBody>
    </Drawer>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
      style={{ borderColor: on ? 'var(--cricket)' : 'var(--dim)' }}
    >
      {on && <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--cricket)' }} />}
    </span>
  );
}
