'use client';

import { useState } from 'react';
import { Drawer, DrawerHandle, DrawerTitle, DrawerBody, Text } from '@/components/ui';
import { SegmentedControl } from '@/components/ui';
import { cn } from '@/lib/utils';

type ExtrasType = 'wide' | 'noball' | 'bye';

interface ExtrasSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ExtrasType;
  onConfirm: (type: ExtrasType, additionalRuns: number, subType?: 'bye' | 'legbye') => void;
}

function ExtrasSheet({ open, onOpenChange, type, onConfirm }: ExtrasSheetProps) {
  const [byeSubType, setByeSubType] = useState<'bye' | 'legbye'>('bye');

  const handleSelect = (runs: number) => {
    onConfirm(type, runs, type === 'bye' ? byeSubType : undefined);
    onOpenChange(false);
  };

  const config = {
    wide: {
      title: 'Wide Ball',
      subtitle: '+1 extra run',
      buttons: [0, 1, 2, 3, 4],
      color: 'amber',
      bgClass: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
      activeClass: 'bg-amber-500/30 border-amber-400 text-amber-300',
    },
    noball: {
      title: 'No Ball',
      subtitle: '+1 extra run \u26A1 Free Hit next',
      buttons: [0, 1, 2, 3, 4, 6],
      color: 'orange',
      bgClass: 'bg-orange-500/15 border-orange-500/30 text-orange-400',
      activeClass: 'bg-orange-500/30 border-orange-400 text-orange-300',
    },
    bye: {
      title: 'Byes',
      subtitle: 'No runs to batsman',
      buttons: [1, 2, 3, 4],
      color: 'purple',
      bgClass: 'bg-purple-500/15 border-purple-500/30 text-purple-400',
      activeClass: 'bg-purple-500/30 border-purple-400 text-purple-300',
    },
  };

  const c = config[type];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerHandle />
      <DrawerTitle>{c.title}</DrawerTitle>
      <DrawerBody>
        <div className="flex flex-col items-center gap-4">
          <div className="text-center">
            <Text size="lg" weight="semibold">{c.title}</Text>
            <Text as="p" size="sm" color="muted" className="mt-1">
              {c.subtitle}
            </Text>
          </div>

          {/* Bye/Leg Bye toggle */}
          {type === 'bye' && (
            <SegmentedControl
              options={[
                { key: 'bye', label: 'Bye' },
                { key: 'legbye', label: 'Leg Bye' },
              ]}
              active={byeSubType}
              onChange={(k) => setByeSubType(k as 'bye' | 'legbye')}
              className="w-full"
            />
          )}

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
                  'border transition-all duration-150 active:scale-[0.92]',
                  c.bgClass,
                )}
                style={{ width: 50, height: 50 }}
              >
                <Text size="lg" weight="bold" tabular>{runs}</Text>
              </button>
            ))}
          </div>
        </div>
      </DrawerBody>
    </Drawer>
  );
}

export { ExtrasSheet };
export type { ExtrasSheetProps, ExtrasType };
