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

        {/* Who is retiring? */}
        <Text size="xs" weight="medium" color="muted" className="mb-2">Who is retiring?</Text>
        <div className="flex items-stretch gap-2 mb-4">
          {/* Striker card */}
          <button
            onClick={() => setSelectedBatsman('striker')}
            className={cn(
              'flex-1 flex flex-col items-center gap-1 px-3 py-3 rounded-xl cursor-pointer select-none',
              'transition-all duration-150 active:scale-[0.96]',
              'border',
              selectedBatsman === 'striker'
                ? 'border-[var(--cricket)] bg-[var(--cricket)]/10 shadow-[0_0_12px_color-mix(in_srgb,var(--cricket)_20%,transparent)]'
                : 'border-[var(--border)] bg-[var(--surface)]',
            )}
          >
            <Text size="2xs" weight="semibold" color={selectedBatsman === 'striker' ? 'cricket' : 'muted'} uppercase>
              Striker
            </Text>
            <Text size="sm" weight="bold" truncate className="max-w-full">
              {striker.name}
            </Text>
          </button>

          {/* Non-striker card */}
          <button
            onClick={() => setSelectedBatsman('non_striker')}
            className={cn(
              'flex-1 flex flex-col items-center gap-1 px-3 py-3 rounded-xl cursor-pointer select-none',
              'transition-all duration-150 active:scale-[0.96]',
              'border',
              selectedBatsman === 'non_striker'
                ? 'border-[var(--cricket)] bg-[var(--cricket)]/10 shadow-[0_0_12px_color-mix(in_srgb,var(--cricket)_20%,transparent)]'
                : 'border-[var(--border)] bg-[var(--surface)]',
            )}
          >
            <Text size="2xs" weight="semibold" color={selectedBatsman === 'non_striker' ? 'cricket' : 'muted'} uppercase>
              Non-striker
            </Text>
            <Text size="sm" weight="bold" truncate className="max-w-full">
              {nonStriker.name}
            </Text>
          </button>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--border)]/40 mb-3" />

        {/* Replacement heading */}
        <Text size="xs" weight="medium" color="muted" className="mb-2">Select replacement</Text>

        {!hasReplacements ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <Text size="sm" color="muted">No replacement available</Text>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {availableYetToBat.length > 0 && (
              <>
                {/* Only show section label if there are also retired batsmen */}
                {availableRetired.length > 0 && (
                  <Text size="2xs" weight="semibold" color="muted" uppercase className="mb-0.5">Yet to Bat</Text>
                )}
                {availableYetToBat.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p.id)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer select-none',
                      'border border-[var(--border)] bg-[var(--surface)]',
                      'transition-all duration-150 active:scale-[0.96]',
                      'hover:border-[var(--cricket)]/50',
                    )}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                      style={{
                        background: 'color-mix(in srgb, var(--cricket) 15%, var(--card))',
                        color: 'var(--cricket)',
                      }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <Text size="sm" weight="medium">{p.name}</Text>
                  </button>
                ))}
              </>
            )}
            {availableRetired.length > 0 && (
              <>
                <Text size="2xs" weight="semibold" color="muted" uppercase className="mt-2 mb-0.5">Can Return</Text>
                {availableRetired.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p.id)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer select-none',
                      'border border-amber-500/30 bg-amber-500/5',
                      'transition-all duration-150 active:scale-[0.96]',
                      'hover:border-amber-500/50',
                    )}
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold bg-amber-500/15 text-amber-500">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Text size="sm" weight="medium">{p.name}</Text>
                    </div>
                    <Text size="xs" color="muted" tabular className="flex-shrink-0">{p.retiredRuns}({p.retiredBalls})</Text>
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
