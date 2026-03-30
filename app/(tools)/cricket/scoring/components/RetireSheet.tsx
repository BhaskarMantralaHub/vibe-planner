'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, Text } from '@/components/ui';
import { cn } from '@/lib/utils';

interface Player {
  id: string;
  name: string;
}

interface RetiredOption {
  id: string;
  name: string;
  retiredRuns: number;
  retiredBalls: number;
}

interface RetireSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  striker: Player;
  nonStriker: Player;
  yetToBat: Player[];
  retiredBatsmen: RetiredOption[];
  onConfirm: (retiredId: string, replacementId: string) => void;
}

function RetireSheet({ open, onOpenChange, striker, nonStriker, yetToBat, retiredBatsmen, onConfirm }: RetireSheetProps) {
  const [selectedBatsman, setSelectedBatsman] = useState<'striker' | 'non_striker'>('striker');

  const resetState = () => {
    setSelectedBatsman('striker');
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetState();
    onOpenChange(v);
  };

  const retiredId = selectedBatsman === 'striker' ? striker.id : nonStriker.id;
  const retiredName = selectedBatsman === 'striker' ? striker.name : nonStriker.name;

  // Filter out the batsman being retired from the replacement lists
  const availableYetToBat = yetToBat.filter((p) => p.id !== retiredId);
  const availableRetired = retiredBatsmen.filter((p) => p.id !== retiredId);
  const hasReplacements = availableYetToBat.length > 0 || availableRetired.length > 0;

  const handleSelect = (replacementId: string) => {
    onConfirm(retiredId, replacementId);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" showClose>
        <DialogTitle>Retire Batsman</DialogTitle>

        {/* Batsman selector — default to striker, toggle to non-striker */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setSelectedBatsman('striker')}
            className={cn(
              'flex-1 px-3 py-2.5 rounded-xl cursor-pointer select-none transition-all active:scale-[0.96]',
              'border text-center',
              selectedBatsman === 'striker'
                ? 'border-[var(--cricket)]/50 bg-[var(--cricket)]/10'
                : 'border-[var(--border)] bg-[var(--surface)]',
            )}
          >
            <Text size="sm" weight={selectedBatsman === 'striker' ? 'bold' : 'medium'}>
              {striker.name}
            </Text>
            <Text size="2xs" color="muted">Striker</Text>
          </button>
          <button
            onClick={() => setSelectedBatsman('non_striker')}
            className={cn(
              'flex-1 px-3 py-2.5 rounded-xl cursor-pointer select-none transition-all active:scale-[0.96]',
              'border text-center',
              selectedBatsman === 'non_striker'
                ? 'border-[var(--cricket)]/50 bg-[var(--cricket)]/10'
                : 'border-[var(--border)] bg-[var(--surface)]',
            )}
          >
            <Text size="sm" weight={selectedBatsman === 'non_striker' ? 'bold' : 'medium'}>
              {nonStriker.name}
            </Text>
            <Text size="2xs" color="muted">Non-striker</Text>
          </button>
        </div>

        {/* Replacement selection */}
        <Text size="xs" weight="semibold" color="muted" uppercase className="mb-1.5">
          Retire {retiredName} — select replacement
        </Text>

        {!hasReplacements ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <Text size="sm" color="muted">No replacement available</Text>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {availableYetToBat.length > 0 && (
              <>
                <Text size="xs" weight="semibold" color="muted" uppercase className="mt-1">Yet to Bat</Text>
                {availableYetToBat.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p.id)}
                    className={cn(
                      'flex items-center px-4 py-3 rounded-xl cursor-pointer select-none',
                      'border border-[var(--border)] bg-[var(--surface)]',
                      'transition-all duration-150 active:scale-[0.96]',
                      'hover:border-[var(--cricket)]/50',
                    )}
                  >
                    <Text size="md" weight="medium">{p.name}</Text>
                  </button>
                ))}
              </>
            )}
            {availableRetired.length > 0 && (
              <>
                <Text size="xs" weight="semibold" color="muted" uppercase className="mt-2">Can Return</Text>
                {availableRetired.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p.id)}
                    className={cn(
                      'flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer select-none',
                      'border border-amber-500/30 bg-amber-500/5',
                      'transition-all duration-150 active:scale-[0.96]',
                      'hover:border-amber-500/50',
                    )}
                  >
                    <Text size="md" weight="medium">{p.name}</Text>
                    <Text size="xs" color="muted" tabular>{p.retiredRuns}({p.retiredBalls})</Text>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { RetireSheet };
export type { RetireSheetProps };
