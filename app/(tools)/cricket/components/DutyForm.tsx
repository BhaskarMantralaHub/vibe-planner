'use client';

import { useEffect, useState } from 'react';
import { ComposerModal, Input, Label, Button, Text, SegmentedControl } from '@/components/ui';
import { useUmpiringStore, todayPT } from '@/stores/umpiring-store';
import type { CricketUmpiringDuty } from '@/types/cricket';

/**
 * Admin form for a duty MTCA did not publish — either one we took over from
 * another club offline, or one we are tracking by hand.
 *
 * ComposerModal, NOT vaul Drawer: this form has text inputs, and vaul's
 * repositionInputs is broken (CLAUDE.md). Text inputs are placed FIRST so they
 * sit in the visible upper half when the iOS keyboard rises; the tap-only
 * widgets (slot, kind, date/time) sit below.
 */
interface DutyFormProps {
  open: boolean;
  onClose: () => void;
  seasonId: string;
  /** When set, the form edits this duty instead of creating one. */
  editing?: CricketUmpiringDuty | null;
}

type DutyKind = 'swap_in' | 'manual';

export default function DutyForm({ open, onClose, seasonId, editing }: DutyFormProps) {
  const { addManualDuty } = useUmpiringStore();

  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [venue, setVenue] = useState('');
  const [swapTeam, setSwapTeam] = useState('');
  const [notes, setNotes] = useState('');
  const [matchDate, setMatchDate] = useState(todayPT());
  const [matchTime, setMatchTime] = useState('10:45');
  const [roleSlot, setRoleSlot] = useState('1');
  const [kind, setKind] = useState<DutyKind>('swap_in');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTeamA(editing.team_a);
      setTeamB(editing.team_b);
      setVenue(editing.venue ?? '');
      setSwapTeam(editing.swap_team ?? '');
      setNotes(editing.notes ?? '');
      setMatchDate(editing.match_date);
      setMatchTime(editing.match_time ?? '10:45');
      setRoleSlot(String(editing.role_slot));
      setKind(editing.source === 'swap_in' ? 'swap_in' : 'manual');
    } else {
      setTeamA('');
      setTeamB('');
      setVenue('');
      setSwapTeam('');
      setNotes('');
      setMatchDate(todayPT());
      setMatchTime('10:45');
      setRoleSlot('1');
      setKind('swap_in');
    }
  }, [open, editing]);

  // match_time is stored as 24h 'HH:MM' and the DB enforces that shape, so an
  // <input type="time"> is the right control — it can't produce '9:00 AM'.
  const canSave =
    teamA.trim().length > 0 && teamB.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(matchDate) && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await addManualDuty(seasonId, {
        match_date: matchDate,
        match_time: matchTime || null,
        venue: venue.trim() || null,
        team_a: teamA.trim(),
        team_b: teamB.trim(),
        role_slot: Number(roleSlot),
        // A named other club marks this as a swap we took on, which the board
        // badges differently from an admin-invented duty.
        swap_team: kind === 'swap_in' ? (swapTeam.trim() || null) : null,
        notes: notes.trim() || null,
        match_type: 'league',
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ComposerModal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit duty' : 'Add duty'}
      rightAction={{
        label: saving ? 'Saving…' : 'Save',
        onClick: handleSave,
        disabled: !canSave,
        color: 'var(--cricket)',
      }}
    >
      <div className="space-y-4">
        {/* Text inputs FIRST — they must sit above the iOS keyboard. */}
        <div className="space-y-1.5">
          <Label htmlFor="duty-team-a">Teams playing</Label>
          <Input
            id="duty-team-a"
            value={teamA}
            onChange={(e) => setTeamA(e.target.value)}
            placeholder="Home team"
            autoComplete="off"
          />
          <Input
            value={teamB}
            onChange={(e) => setTeamB(e.target.value)}
            placeholder="Away team"
            autoComplete="off"
          />
          <Text as="p" size="2xs" color="dim">
            The two sides you are umpiring — usually not us.
          </Text>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="duty-venue">Ground</Label>
          <Input
            id="duty-venue"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="e.g. Hansen Park"
            autoComplete="off"
          />
        </div>

        {kind === 'swap_in' && (
          <div className="space-y-1.5">
            <Label htmlFor="duty-swap">Taken over from</Label>
            <Input
              id="duty-swap"
              value={swapTeam}
              onChange={(e) => setSwapTeam(e.target.value)}
              placeholder="e.g. MTCA Power Stars"
              autoComplete="off"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="duty-notes">Note</Label>
          <Input
            id="duty-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — visible to the whole team"
            autoComplete="off"
          />
        </div>

        {/* Tap-only controls BELOW the text inputs. */}
        <div className="space-y-1.5">
          <Label>Where this duty came from</Label>
          <SegmentedControl
            ariaLabel="Duty source"
            options={[
              { key: 'swap_in', label: 'Swapped in' },
              { key: 'manual', label: 'Added by hand' },
            ]}
            active={kind}
            onChange={(k) => setKind(k as DutyKind)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="duty-date">Date</Label>
            <Input
              id="duty-date"
              type="date"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="duty-time">Start time</Label>
            <Input
              id="duty-time"
              type="time"
              value={matchTime}
              onChange={(e) => setMatchTime(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Umpire position</Label>
          <SegmentedControl
            ariaLabel="Umpire position"
            options={[
              { key: '1', label: 'Umpire 1' },
              { key: '2', label: 'Umpire 2' },
              { key: '3', label: 'Extra' },
            ]}
            active={roleSlot}
            onChange={setRoleSlot}
          />
          <Text as="p" size="2xs" color="dim">
            Add one duty per person needed. Two spots on the same match means two duties.
          </Text>
        </div>

        {/* Footer button as well as the header action — the header one can be
            hidden behind the keyboard on short screens. */}
        <Button
          variant="primary"
          brand="cricket"
          size="lg"
          fullWidth
          loading={saving}
          disabled={!canSave}
          onClick={handleSave}
        >
          {editing ? 'Save changes' : 'Add duty'}
        </Button>
      </div>
    </ComposerModal>
  );
}
