'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Drawer, DrawerHandle, DrawerTitle, DrawerBody } from '@/components/ui';
import type { Match } from './MatchSchedule';

type Result = 'won' | 'lost' | 'draw';

const RESULTS: { key: Result; label: string; color: string }[] = [
  { key: 'won', label: 'Win', color: '#4ADE80' },
  { key: 'draw', label: 'Draw', color: '#9CA3AF' },
  { key: 'lost', label: 'Lost', color: '#F87171' },
];

interface ResultFormProps {
  open: boolean;
  match: Match | null;
  onClose: () => void;
  onSubmit: (matchId: string, data: { result: Result }) => void;
}

export default function ResultForm({ open, match, onClose, onSubmit }: ResultFormProps) {
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (open) setResult(match?.result as Result ?? null);
  }, [open, match]);

  const handleSubmit = () => {
    if (!result || !match) return;
    onSubmit(match.id, { result });
  };

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerHandle />
      <DrawerTitle>Record Result</DrawerTitle>

      <DrawerBody className="px-5 pb-6">
        {match && (
          <p className="text-[13px] font-medium mb-4" style={{ color: 'var(--muted)' }}>
            vs {match.opponent} · {new Date(match.match_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
        )}

        <div className="flex gap-2 mb-6">
          {RESULTS.map((r) => {
            const active = result === r.key;
            return (
              <button
                key={r.key}
                onClick={() => setResult(r.key)}
                className="flex-1 py-3.5 rounded-xl text-[15px] font-bold cursor-pointer border-2 transition-all active:scale-95"
                style={{
                  backgroundColor: active ? `${r.color}20` : 'transparent',
                  borderColor: active ? r.color : 'var(--border)',
                  color: active ? r.color : 'var(--muted)',
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        <Button variant="primary" brand="cricket" fullWidth onClick={handleSubmit} disabled={!result}>
          Save Result
        </Button>
      </DrawerBody>
    </Drawer>
  );
}
