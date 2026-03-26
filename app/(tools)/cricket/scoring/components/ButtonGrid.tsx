'use client';

import { Text } from '@/components/ui';
import { cn } from '@/lib/utils';

interface ButtonGridProps {
  onScore: (type: string, value?: number) => void;
}

interface ScoringButton {
  label: string;
  type: string;
  value?: number;
  /** Background/border classes only — text color inherited by Text component */
  bgClassName: string;
  /** Color for the Text component inside */
  textColor?: 'default' | 'danger' | 'success' | 'cricket';
  /** Custom text className override for non-standard colors */
  textClassName?: string;
}

function ButtonGrid({ onScore }: ButtonGridProps) {
  const runButtons: ScoringButton[] = [
    { label: '0', type: 'runs', value: 0, bgClassName: 'border border-[var(--border)] bg-[var(--surface)]', textColor: 'default' },
    { label: '1', type: 'runs', value: 1, bgClassName: 'border border-[var(--border)] bg-[var(--surface)]', textColor: 'default' },
    { label: '2', type: 'runs', value: 2, bgClassName: 'border border-[var(--border)] bg-[var(--surface)]', textColor: 'default' },
    { label: '3', type: 'runs', value: 3, bgClassName: 'border border-[var(--border)] bg-[var(--surface)]', textColor: 'default' },
  ];

  const runButtons2: ScoringButton[] = [
    { label: '4', type: 'runs', value: 4, bgClassName: 'bg-[var(--blue)]/15 border border-[var(--blue)]/30', textClassName: 'text-[var(--blue)]' },
    { label: '6', type: 'runs', value: 6, bgClassName: 'bg-[var(--green)]/15 border border-[var(--green)]/30', textColor: 'success' },
    { label: 'WKT', type: 'wicket', bgClassName: 'bg-[var(--red)]/15 border border-[var(--red)]/30', textColor: 'danger' },
  ];

  const extraButtons: ScoringButton[] = [
    { label: 'Wide', type: 'wide', bgClassName: 'bg-amber-500/15 border border-amber-500/30', textClassName: 'text-amber-400' },
    { label: 'No Ball', type: 'noball', bgClassName: 'bg-orange-500/15 border border-orange-500/30', textClassName: 'text-orange-400' },
    { label: 'Bye / LBye', type: 'bye', bgClassName: 'bg-purple-500/15 border border-purple-500/30', textClassName: 'text-purple-400' },
  ];

  return (
    <div className="flex flex-col gap-2.5 px-4">
      {/* Row 1: 0, 1, 2, 3 */}
      <div className="grid grid-cols-4 gap-2">
        {runButtons.map((btn) => (
          <button
            key={btn.label}
            onClick={() => onScore(btn.type, btn.value)}
            className={cn(
              'flex items-center justify-center rounded-xl cursor-pointer select-none',
              'transition-all duration-150 active:scale-[0.92]',
              btn.bgClassName,
            )}
            style={{ height: 44 }}
          >
            <Text size="lg" weight="bold" color={btn.textColor} tabular>{btn.label}</Text>
          </button>
        ))}
      </div>

      {/* Row 2: 4, 5, 6, WKT */}
      <div className="grid grid-cols-4 gap-2">
        {runButtons2.map((btn) => (
          <button
            key={btn.label}
            onClick={() => onScore(btn.type, btn.value)}
            className={cn(
              'flex items-center justify-center rounded-xl cursor-pointer select-none',
              'transition-all duration-150 active:scale-[0.92]',
              btn.bgClassName,
            )}
            style={{ height: 44 }}
          >
            <Text
              size={btn.label === 'WKT' ? 'md' : 'lg'}
              weight="bold"
              color={btn.textColor}
              className={btn.textClassName}
              tabular={btn.label !== 'WKT'}
            >
              {btn.label}
            </Text>
          </button>
        ))}
      </div>

      {/* Row 3: Wide, No Ball, Bye/LBye */}
      <div className="grid grid-cols-3 gap-2">
        {extraButtons.map((btn) => (
          <button
            key={btn.label}
            onClick={() => onScore(btn.type)}
            className={cn(
              'flex items-center justify-center rounded-xl cursor-pointer select-none',
              'transition-all duration-150 active:scale-[0.92]',
              btn.bgClassName,
            )}
            style={{ height: 40 }}
          >
            <Text size="md" weight="bold" className={btn.textClassName}>{btn.label}</Text>
          </button>
        ))}
      </div>
    </div>
  );
}

export { ButtonGrid };
export type { ButtonGridProps };
