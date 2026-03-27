'use client';

import { Dialog, DialogContent, DialogTitle, Text } from '@/components/ui';
import { cn } from '@/lib/utils';

type ExtrasType = 'wide' | 'noball' | 'bye';

interface ExtrasSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ExtrasType;
  onConfirm: (type: ExtrasType, additionalRuns: number, subType?: 'bye' | 'legbye') => void;
}

function ExtrasSheet({ open, onOpenChange, type, onConfirm }: ExtrasSheetProps) {
  const handleSelect = (runs: number) => {
    onConfirm(type, runs);
    onOpenChange(false);
  };

  const config = {
    wide: {
      title: 'Wide Ball',
      subtitle: '+1 extra run',
      buttons: [0, 1, 2, 3, 4],
    },
    noball: {
      title: 'No Ball',
      subtitle: '+1 extra run \u26A1 Free Hit next',
      buttons: [0, 1, 2, 3, 4, 6],
    },
    bye: {
      title: 'Byes',
      subtitle: 'No runs to batsman',
      buttons: [1, 2, 3, 4],
    },
  };

  const c = config[type];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose>
        <DialogTitle>{c.title}</DialogTitle>

        <div className="flex flex-col items-center gap-4">
          <Text as="p" size="sm" color="muted">
            {c.subtitle}
          </Text>

          {/* Bye type note */}

          {/* Additional runs buttons */}
          <Text size="xs" color="muted" uppercase tracking="wider" weight="medium">
            {type === 'bye' ? 'Runs' : 'Additional Runs'}
          </Text>
          <div className="flex gap-2 flex-wrap justify-center">
            {c.buttons.map((runs) => (
              <button
                key={runs}
                onClick={() => handleSelect(runs)}
                className={cn(
                  'flex items-center justify-center rounded-xl cursor-pointer select-none',
                  'border border-[var(--cricket)]/30 bg-[var(--cricket)]/8',
                  'transition-all duration-150 active:scale-[0.92]',
                  'hover:border-[var(--cricket)]/50 hover:bg-[var(--cricket)]/15',
                )}
                style={{ width: 50, height: 50 }}
              >
                <Text size="lg" weight="bold" color="cricket" tabular>{runs}</Text>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ExtrasSheet };
export type { ExtrasSheetProps, ExtrasType };
