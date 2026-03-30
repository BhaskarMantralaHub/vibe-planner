'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, Text } from '@/components/ui';
import { cn } from '@/lib/utils';

interface BowlerFigures {
  id: string;
  name: string;
  overs: string;
  maidens: number;
  runs: number;
  wickets: number;
  economy: string;
  justBowled?: boolean;
}

interface EndOfOverSheetProps {
  open: boolean;
  overNumber: number;
  overRuns: number;
  bowlers: BowlerFigures[];
  onSelectBowler: (bowlerId: string) => void;
  onUndo?: () => void;
  onExit?: () => void;
}

function EndOfOverSheet({ open, overNumber, overRuns, bowlers, onSelectBowler, onUndo, onExit }: EndOfOverSheetProps) {
  const [undoing, setUndoing] = useState(false);
  return (
    <Dialog open={open} onOpenChange={() => { /* Prevent dismissal — must select a bowler */ }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" showClose={false} onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogTitle>End of Over {overNumber}</DialogTitle>

        <div className="flex flex-col gap-4">
          {/* Over summary */}
          <div className="text-center">
            <Text as="p" size="2xl" weight="bold" tabular>
              {overRuns} runs
            </Text>
          </div>

          {/* Bowling figures */}
          <div className="rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="grid grid-cols-6 gap-0 px-3 py-2 bg-[var(--surface)]">
              <Text size="xs" color="muted" weight="medium" className="col-span-2">Bowler</Text>
              <Text size="xs" color="muted" weight="medium" align="center">O</Text>
              <Text size="xs" color="muted" weight="medium" align="center">M</Text>
              <Text size="xs" color="muted" weight="medium" align="center">R</Text>
              <Text size="xs" color="muted" weight="medium" align="center">W</Text>
            </div>
            {bowlers.map((b) => (
              <div
                key={b.id}
                className={cn(
                  'grid grid-cols-6 gap-0 px-3 py-2 border-t border-[var(--border)]',
                  b.justBowled && 'bg-[var(--surface)]/50',
                )}
              >
                <Text size="sm" weight="medium" truncate className="col-span-2">
                  {b.name}
                  {b.justBowled && (
                    <Text as="span" size="2xs" color="muted" className="ml-1">(last)</Text>
                  )}
                </Text>
                <Text size="sm" tabular align="center">{b.overs}</Text>
                <Text size="sm" tabular align="center">{b.maidens}</Text>
                <Text size="sm" tabular align="center">{b.runs}</Text>
                <Text size="sm" tabular align="center" weight="semibold">{b.wickets}</Text>
              </div>
            ))}
          </div>

          {/* Next bowler selection */}
          <div className="flex flex-col gap-1.5">
            <Text size="sm" weight="medium" color="muted" uppercase tracking="wider">
              Select Next Bowler
            </Text>
            {bowlers.map((b) => (
              <button
                key={b.id}
                disabled={b.justBowled}
                onClick={() => onSelectBowler(b.id)}
                className={cn(
                  'flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer select-none',
                  'border border-[var(--border)] bg-[var(--surface)]',
                  'transition-all duration-150 active:scale-[0.96]',
                  'hover:border-[var(--cricket)]/50',
                  b.justBowled && 'opacity-40 cursor-not-allowed active:scale-100',
                )}
              >
                <Text size="md" weight="medium">{b.name}</Text>
                <Text size="xs" color="muted" tabular>
                  {b.overs}-{b.maidens}-{b.runs}-{b.wickets}
                </Text>
              </button>
            ))}
          </div>

          {/* Undo + Exit */}
          <div className="flex items-center justify-between pt-1">
            {onUndo ? (
              <button
                onClick={() => { if (undoing) return; setUndoing(true); onUndo(); }}
                disabled={undoing}
                className={cn('cursor-pointer', undoing && 'opacity-50 cursor-not-allowed')}
              >
                <Text size="xs" weight="medium" color="cricket" className="underline underline-offset-2">
                  {undoing ? 'Undoing...' : 'Undo Last Ball'}
                </Text>
              </button>
            ) : <span />}
            {onExit ? (
              <button onClick={onExit} className="cursor-pointer">
                <Text size="xs" weight="medium" color="muted" className="underline underline-offset-2">
                  Back to Home
                </Text>
              </button>
            ) : <span />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { EndOfOverSheet };
export type { EndOfOverSheetProps, BowlerFigures };
