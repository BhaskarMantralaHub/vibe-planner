'use client';

import { useEffect, useState } from 'react';
import { ComposerModal, Input, Label, Button, Text, SegmentedControl, Alert } from '@/components/ui';
import { Check } from 'lucide-react';
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
  const { addManualDuty, updateDuty } = useUmpiringStore();

  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [venue, setVenue] = useState('');
  const [swapTeam, setSwapTeam] = useState('');
  const [notes, setNotes] = useState('');
  const [matchDate, setMatchDate] = useState(todayPT());
  const [matchTime, setMatchTime] = useState('10:45');
  /** One duty row per selected position. Kept sorted so slot 1 is created
   *  before slot 2, matching the order the board renders them. */
  const [roleSlots, setRoleSlots] = useState<string[]>(['1']);
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
      setRoleSlots([String(editing.role_slot)]);
      setKind(editing.source === 'swap_in' ? 'swap_in' : 'manual');
    } else {
      setTeamA('');
      setTeamB('');
      setVenue('');
      setSwapTeam('');
      setNotes('');
      setMatchDate(todayPT());
      setMatchTime('10:45');
      setRoleSlots(['1']);
      setKind('swap_in');
    }
  }, [open, editing]);

  // match_time is stored as 24h 'HH:MM' and the DB enforces that shape, so an
  // <input type="time"> is the right control — it can't produce '9:00 AM'.
  const canSave =
    teamA.trim().length > 0
    && teamB.trim().length > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(matchDate)
    // At least one position, or there is no duty to create. Only applies when
    // adding — editing keeps whatever slot the duty already has.
    && (editing !== null || roleSlots.length > 0)
    && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (editing) {
        await updateDuty(editing.id, {
          match_date: matchDate,
          match_time: matchTime || null,
          venue: venue.trim() || null,
          team_a: teamA.trim(),
          team_b: teamB.trim(),
          match_type: editing.match_type,
          swap_team: kind === 'swap_in' ? (swapTeam.trim() || null) : null,
          notes: notes.trim() || null,
        });
        onClose();
        return;
      }
      // One row per selected position. Sequential rather than Promise.all:
      // these are independent inserts and the store reloads the season after
      // each, so firing them together would race that reload.
      for (const slot of roleSlots) {
        await addManualDuty(seasonId, {
          match_date: matchDate,
          match_time: matchTime || null,
          venue: venue.trim() || null,
          team_a: teamA.trim(),
          team_b: teamB.trim(),
          role_slot: Number(slot),
          // A named other club marks this as a swap we took on, which the board
          // badges differently from an admin-invented duty.
          swap_team: kind === 'swap_in' ? (swapTeam.trim() || null) : null,
          notes: notes.trim() || null,
          match_type: 'league',
        });
      }
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
        {/* An mtca-sourced duty has its date/time/venue refreshed from the
            fixture page every sync run, so an edit that disagrees with MTCA
            gets reverted. Better to say so than to let the change quietly
            vanish on Saturday morning. */}
        {editing?.source === 'mtca' && (
          <Alert variant="warning">
            MTCA publishes this match. If you change the date, time or ground
            here, the weekly sync will set it back to whatever MTCA says.
          </Alert>
        )}

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

        {/* Tap-only controls BELOW the text inputs. Hidden for MTCA duties:
            their source is owned by the sync, not the admin. */}
        {editing?.source !== 'mtca' && (
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
        )}

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

        {!editing && (
        <div className="space-y-1.5">
          <Label>Umpire positions</Label>
          {/* MULTI-select, not a segmented control.
              MTCA regularly gives us both umpire slots on one fixture, and a
              single-choice picker meant filling this entire form twice to
              record that — same teams, same ground, same date, retyped. Each
              position selected becomes its own duty row, which is what the
              board and the fairness count need; the form just stops making you
              say it twice. */}
          <div className="flex gap-2">
            {([
              { slot: '1', label: 'Umpire 1' },
              { slot: '2', label: 'Umpire 2' },
              { slot: '3', label: 'Extra' },
            ] as const).map(({ slot, label }) => {
              const on = roleSlots.includes(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => setRoleSlots((prev) => (
                    prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot].sort()
                  ))}
                  className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] px-2 text-[13px] font-bold transition-all active:scale-[0.97]"
                  style={on
                    ? {
                      background: 'var(--cricket)',
                      borderColor: 'var(--cricket)',
                      color: '#fff',
                    }
                    : {
                      background: 'var(--surface)',
                      borderColor: 'var(--border)',
                      color: 'var(--muted)',
                    }}
                >
                  {on && <Check size={13} aria-hidden />}
                  {label}
                </button>
              );
            })}
          </div>
          <Text as="p" size="2xs" color="dim">
            {roleSlots.length > 1
              ? `Creates ${roleSlots.length} duties — one per person needed.`
              : 'Pick more than one if we owe more than one umpire at this match.'}
          </Text>
        </div>
        )}

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
