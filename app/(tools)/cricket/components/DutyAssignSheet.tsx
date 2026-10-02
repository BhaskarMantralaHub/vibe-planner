'use client';

import { useEffect, useMemo, useState } from 'react';
import { Drawer, DrawerHeader, DrawerTitle, DrawerBody, Button, Text, Input } from '@/components/ui';
import { Check } from 'lucide-react';
import PlayerAvatar from './PlayerAvatar';
import { ROLE_META } from '../lib/player-roles';
import { useUmpiringStore } from '@/stores/umpiring-store';
import type { CricketPlayer, CricketUmpiringDuty } from '@/types/cricket';

/**
 * Admin sheet for setting or correcting who holds a duty.
 *
 * Tap-only, so the shared vaul `Drawer` is fine here — the search box is the
 * one text input and it sits at the top where the keyboard won't cover the
 * list. (Forms whose primary interaction is typing must use ComposerModal
 * instead; see CLAUDE.md.)
 */
interface DutyAssignSheetProps {
  duty: CricketUmpiringDuty | null;
  players: CricketPlayer[];
  adminName: string;
  onClose: () => void;
}

const shortTeam = (n: string) => n.replace(/^MTCA\s+/i, '').trim();
const shortDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export default function DutyAssignSheet({ duty, players, adminName, onClose }: DutyAssignSheetProps) {
  const { assignDuty, clearAssignment } = useUmpiringStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(duty?.assigned_player_id ?? null);
    setQuery('');
  }, [duty]);

  const roster = useMemo(() => {
    const active = players.filter((p) => p.is_active);
    const q = query.trim().toLowerCase();
    const filtered = q ? active.filter((p) => p.name.toLowerCase().includes(q)) : active;
    // Guests last: they can hold a duty but don't count toward the target, so
    // they shouldn't be the first thing an admin's thumb lands on.
    return [...filtered].sort(
      (a, b) => Number(a.is_guest) - Number(b.is_guest) || a.name.localeCompare(b.name),
    );
  }, [players, query]);

  const isClosedOut = duty?.status === 'completed' || duty?.status === 'no_show';
  const title = isClosedOut ? 'Who stood?' : duty?.assigned_player_id ? 'Change umpire' : 'Assign umpire';

  const handleSave = async () => {
    if (!duty || !selected) return;
    setSaving(true);
    try {
      await assignDuty(duty.id, selected, adminName);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!duty) return;
    setSaving(true);
    try {
      await clearAssignment(duty.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={duty !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerHeader>
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        {/* Visible title: what you are doing, then which slot it is. */}
        <Text as="p" size="lg" weight="bold">{title}</Text>
        {duty && (
          <Text as="p" size="xs" color="muted" className="mt-0.5">
            {shortTeam(duty.team_a)} v {shortTeam(duty.team_b)} · {shortDate(duty.match_date)}
            {' · '}Umpire {duty.role_slot}
          </Text>
        )}
      </DrawerHeader>

      <DrawerBody>
        {/* Search first so it stays above the keyboard on a long roster. */}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players…"
          autoComplete="off"
          className="mb-3"
        />

        {/* iOS pick list: plain rows, inset hairlines, a checkmark on the
            chosen one. No radio, no tinted row, no colour — choosing is a
            selection, and the blue belongs to the Assign button. */}
        <ul role="listbox" aria-label="Players" className="max-h-[46vh] overflow-y-auto overscroll-contain">
          {roster.length === 0 ? (
            <li>
              <Text as="p" size="sm" color="muted" align="center" className="py-6">
                No players match “{query}”.
              </Text>
            </li>
          ) : (
            roster.map((p, i) => {
              const isSel = selected === p.id;
              const detail = [
                ROLE_META[p.player_role ?? '']?.label,
                p.jersey_number != null ? `#${p.jersey_number}` : null,
                p.is_guest ? 'Guest' : null,
              ].filter(Boolean).join(' · ');
              return (
                <li key={p.id} role="option" aria-selected={isSel}>
                  <button
                    type="button"
                    onClick={() => setSelected(p.id)}
                    className="flex w-full items-center gap-3 text-left cursor-pointer transition-colors active:bg-[var(--hover-bg)] rounded-lg"
                  >
                    <PlayerAvatar player={p} name={p.name} size={36} />
                    <span
                      className="flex min-h-[56px] min-w-0 flex-1 items-center gap-2 pr-1"
                      style={i > 0 ? { borderTop: '1px solid var(--border)' } : undefined}
                    >
                      <span className="min-w-0 flex-1 py-2">
                        <Text as="span" size="md" weight={isSel ? 'semibold' : 'medium'} className="block break-words">
                          {p.name}
                        </Text>
                        {detail && <Text as="span" size="xs" color="muted" className="block">{detail}</Text>}
                      </span>
                      <Check
                        size={20}
                        aria-hidden
                        className="shrink-0 text-[var(--text)] transition-opacity"
                        style={{ opacity: isSel ? 1 : 0 }}
                      />
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {isClosedOut && (
          <Text as="p" size="2xs" color="muted" className="mt-3">
            This duty is already marked done — changing the name keeps it that way.
          </Text>
        )}

        <div className="mt-4 space-y-2">
          <Button
            variant="primary" brand="cricket" size="lg" fullWidth
            loading={saving}
            disabled={!selected || selected === duty?.assigned_player_id}
            onClick={handleSave}
          >
            {isClosedOut ? 'Update umpire' : duty?.assigned_player_id ? 'Change umpire' : 'Assign'}
          </Button>
          {duty?.assigned_player_id && !isClosedOut && (
            <Button variant="secondary" size="md" fullWidth loading={saving} onClick={handleClear}>
              Clear this slot
            </Button>
          )}
        </div>
      </DrawerBody>
    </Drawer>
  );
}
