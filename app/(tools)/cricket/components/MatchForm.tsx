'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Drawer, DrawerHandle, DrawerTitle, DrawerBody } from '@/components/ui';
import { Alert } from '@/components/ui';
import type { Match } from './MatchSchedule';

type MatchType = 'league' | 'practice';

interface MatchFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Match, 'id' | 'status'>, keepOpen?: boolean) => void;
  initialData?: Match;
}

export default function MatchForm({ open, onClose, onSubmit, initialData }: MatchFormProps) {
  const [opponent, setOpponent] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [matchTime, setMatchTime] = useState('10:00');
  const [venue, setVenue] = useState('');
  const matchType: MatchType = 'league';
  const overs = '20';
  const [isHome, setIsHome] = useState<boolean | null>(null);
  const [umpire, setUmpire] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  // Populate form when editing
  useEffect(() => {
    if (open && initialData) {
      setOpponent(initialData.opponent);
      setMatchDate(initialData.match_date);
      setMatchTime(initialData.match_time);
      setVenue(initialData.venue);
      setIsHome(initialData.is_home ?? null);
      setUmpire(initialData.umpire || '');
      setNotes(initialData.notes || '');
      setFormError('');
    } else if (open && !initialData) {
      setOpponent('');
      setMatchDate('');
      setMatchTime('10:00');
      setVenue('');
      setIsHome(null);
      setUmpire('');
      setNotes('');
      setFormError('');
      setAddedCount(0);
    }
  }, [open, initialData]);

  const [addedCount, setAddedCount] = useState(0);

  const validate = (): Omit<Match, 'id' | 'status'> | null => {
    if (!opponent.trim()) { setFormError('Opponent name is required.'); return null; }
    if (!matchDate) { setFormError('Match date is required.'); return null; }
    if (!venue.trim()) { setFormError('Venue is required.'); return null; }
    const parsedOvers = parseInt(overs, 10);
    if (isNaN(parsedOvers) || parsedOvers <= 0) { setFormError('Overs must be a positive number.'); return null; }
    setFormError('');
    return {
      opponent: opponent.trim(),
      match_date: matchDate,
      match_time: matchTime,
      venue: venue.trim(),
      match_type: matchType,
      overs: parsedOvers,
      is_home: isHome ?? undefined,
      umpire: umpire.trim() || undefined,
      notes: notes.trim() || undefined,
    };
  };

  const handleSubmit = () => {
    const data = validate();
    if (!data) return;
    onSubmit(data);
    setAddedCount(0);
  };

  const handleSubmitAndAnother = () => {
    const data = validate();
    if (!data) return;
    onSubmit(data, true);
    // Reset form but keep venue, time (likely same for season fixtures)
    setOpponent('');
    setMatchDate('');
    setIsHome(null);
    setUmpire('');
    setNotes('');
    setFormError('');
    setAddedCount((c) => c + 1);
  };

  const inputClass = 'w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors placeholder:text-[var(--dim)]';

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerHandle />
      <DrawerTitle>{initialData ? 'Edit Match' : 'Schedule Match'}</DrawerTitle>

      <div className="px-5 py-3">
        <h2 className="text-[17px] font-bold text-[var(--text)]">
          {initialData ? 'Edit Match' : 'Schedule Match'}
        </h2>
        <p className="text-[12px] text-[var(--muted)] mt-0.5">
          {initialData ? 'Update match details' : 'Add a new match to the schedule'}
        </p>
      </div>
      <div className="h-px" style={{ background: 'var(--border)' }} />

      <DrawerBody>
        {formError && (
          <Alert variant="error">
            {formError}
          </Alert>
        )}

        {/* Opponent */}
        <div>
          <label className="text-[12px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">
            Opponent *
          </label>
          <input
            type="text"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="e.g. Chennai Warriors"
            className={inputClass}
          />
        </div>

        {/* Date + Time */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[12px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">
              Date *
            </label>
            <input
              type="date"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="w-[120px]">
            <label className="text-[12px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">
              Time
            </label>
            <input
              type="time"
              value={matchTime}
              onChange={(e) => setMatchTime(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Venue */}
        <div>
          <label className="text-[12px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">
            Venue *
          </label>
          <input
            type="text"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="e.g. Cloverleaf Park"
            className={inputClass}
          />
        </div>

        {/* Home / Away */}
        <div>
          <label className="text-[12px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">
            Home / Away <span className="font-normal normal-case">(optional)</span>
          </label>
          <div className="flex gap-2">
            {([
              { key: true, label: 'Home', color: 'var(--green)' },
              { key: false, label: 'Away', color: 'var(--blue)' },
            ] as const).map((opt) => {
              const active = isHome === opt.key;
              return (
                <button
                  key={String(opt.key)}
                  onClick={() => setIsHome(active ? null : opt.key)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold cursor-pointer border transition-all active:scale-95"
                  style={{
                    backgroundColor: active ? `color-mix(in srgb, ${opt.color} 15%, transparent)` : 'transparent',
                    borderColor: active ? opt.color : 'var(--border)',
                    color: active ? opt.color : 'var(--muted)',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Umpire */}
        <div>
          <label className="text-[12px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">
            Umpire <span className="font-normal normal-case">(optional)</span>
          </label>
          <input
            type="text"
            value={umpire}
            onChange={(e) => setUmpire(e.target.value)}
            placeholder="e.g. Phantoms"
            className={inputClass}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-[12px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">
            Notes <span className="font-normal normal-case">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Wear blue jersey, arrive by 9 AM"
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Submit */}
        {addedCount > 0 && (
          <p className="text-[12px] font-medium text-center" style={{ color: 'var(--green)' }}>
            {addedCount} match{addedCount !== 1 ? 'es' : ''} added this session
          </p>
        )}
        <div className="flex gap-2">
          {!initialData && (
            <Button variant="secondary" className="flex-1" onClick={handleSubmitAndAnother}>
              + Add & Next
            </Button>
          )}
          <Button variant="primary" brand="cricket" className="flex-1" onClick={handleSubmit}>
            {initialData ? 'Update Match' : addedCount > 0 ? 'Done' : 'Schedule Match'}
          </Button>
        </div>
      </DrawerBody>
    </Drawer>
  );
}
