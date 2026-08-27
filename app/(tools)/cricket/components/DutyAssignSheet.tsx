'use client';

import { useEffect, useMemo, useState } from 'react';
import { Drawer, DrawerHeader, DrawerTitle, DrawerBody, Button, Text, Input } from '@/components/ui';
import PlayerPickerRow from './PlayerPickerRow';
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
        <DrawerTitle>{isClosedOut ? 'Who stood?' : 'Assign this duty'}</DrawerTitle>
        {duty && (
          <Text as="p" size="2xs" color="muted" className="mt-0.5">
            {shortTeam(duty.team_a)} v {shortTeam(duty.team_b)} · {duty.match_date}
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

        <div className="max-h-[46vh] space-y-1.5 overflow-y-auto overscroll-contain">
          {roster.length === 0 ? (
            <Text as="p" size="sm" color="muted" align="center" className="py-6">
              No players match “{query}”.
            </Text>
          ) : (
            roster.map((p) => (
              <PlayerPickerRow
                key={p.id}
                player={p}
                mode="radio"
                selected={selected === p.id}
                onToggle={() => setSelected(p.id)}
                badge={p.is_guest ? 'Guest' : undefined}
              />
            ))
          )}
        </div>

        {isClosedOut && (
          <Text as="p" size="2xs" color="dim" className="mt-3">
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
            {isClosedOut ? 'Update umpire' : 'Assign'}
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
