'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Drawer, DrawerHandle, DrawerTitle, DrawerBody } from '@/components/ui';
import { Alert } from '@/components/ui';
import type { Match } from './MatchSchedule';

/* ── Match Type Options ── */
const MATCH_TYPES = [
  { key: 'league', label: 'League', color: '#3B82F6' },
  { key: 'practice', label: 'Practice', color: '#16A34A' },
] as const;

type MatchType = (typeof MATCH_TYPES)[number]['key'];

interface MatchFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Match, 'id' | 'status'>) => void;
  initialData?: Match;
}

export default function MatchForm({ open, onClose, onSubmit, initialData }: MatchFormProps) {
  const [opponent, setOpponent] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [matchTime, setMatchTime] = useState('10:00');
  const [venue, setVenue] = useState('');
  const [matchType, setMatchType] = useState<MatchType>('league');
  const [overs, setOvers] = useState('20');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  // Populate form when editing
  useEffect(() => {
    if (open && initialData) {
      setOpponent(initialData.opponent);
      setMatchDate(initialData.match_date);
      setMatchTime(initialData.match_time);
      setVenue(initialData.venue);
      setMatchType(initialData.match_type);
      setOvers(String(initialData.overs));
      setNotes(initialData.notes || '');
      setFormError('');
    } else if (open && !initialData) {
      setOpponent('');
      setMatchDate('');
      setMatchTime('10:00');
      setVenue('');
      setMatchType('league');
      setOvers('20');
      setNotes('');
      setFormError('');
    }
  }, [open, initialData]);

  const handleSubmit = () => {
    if (!opponent.trim()) {
      setFormError('Opponent name is required.');
      return;
    }
    if (!matchDate) {
      setFormError('Match date is required.');
      return;
    }
    if (!venue.trim()) {
      setFormError('Venue is required.');
      return;
    }

    const parsedOvers = parseInt(overs, 10);
    if (isNaN(parsedOvers) || parsedOvers <= 0) {
      setFormError('Overs must be a positive number.');
      return;
    }

    setFormError('');
    onSubmit({
      opponent: opponent.trim(),
      match_date: matchDate,
      match_time: matchTime,
      venue: venue.trim(),
      match_type: matchType,
      overs: parsedOvers,
      notes: notes.trim() || undefined,
    });
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

        {/* Match Type — pill selector */}
        <div>
          <label className="text-[12px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">
            Match Type
          </label>
          <div className="flex flex-wrap gap-1.5">
            {MATCH_TYPES.map((t) => {
              const active = matchType === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setMatchType(t.key)}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-[12px] font-bold cursor-pointer border transition-all"
                  style={{
                    backgroundColor: active ? `${t.color}15` : 'transparent',
                    borderColor: active ? t.color : 'var(--border)',
                    color: active ? t.color : 'var(--muted)',
                  }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Overs */}
        <div>
          <label className="text-[12px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">
            Overs
          </label>
          <input
            type="number"
            value={overs}
            onChange={(e) => setOvers(e.target.value)}
            min="1"
            max="50"
            className={inputClass}
            style={{ width: '100px' }}
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
        <Button variant="primary" brand="cricket" fullWidth onClick={handleSubmit}>
          {initialData ? 'Update Match' : 'Schedule Match'}
        </Button>
      </DrawerBody>
    </Drawer>
  );
}
