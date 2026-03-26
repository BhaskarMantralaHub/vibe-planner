'use client';

import { useState } from 'react';
import { Drawer, DrawerHandle, DrawerTitle, DrawerBody, Button, Text } from '@/components/ui';
import { cn } from '@/lib/utils';

type DismissalType = 'bowled' | 'caught' | 'lbw' | 'run_out' | 'stumped' | 'hit_wicket' | 'retired';

interface Player {
  id: string;
  name: string;
}

interface WicketSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  battingTeam: Player[];
  bowlingTeam: Player[];
  currentBatsmen: [Player, Player]; // striker, non-striker
  onConfirm: (data: {
    dismissal: DismissalType;
    batsmanOut: string;
    fielder?: string;
    newBatsman: string;
    runsCompleted?: number;
  }) => void;
}

const dismissalTypes: { key: DismissalType; label: string; emoji: string }[] = [
  { key: 'bowled', label: 'Bowled', emoji: '\uD83C\uDFCF' },
  { key: 'caught', label: 'Caught', emoji: '\uD83E\uDD1E' },
  { key: 'lbw', label: 'LBW', emoji: '\uD83E\uDDB5' },
  { key: 'run_out', label: 'Run Out', emoji: '\uD83C\uDFC3' },
  { key: 'stumped', label: 'Stumped', emoji: '\u26A1' },
  { key: 'hit_wicket', label: 'Hit Wicket', emoji: '\uD83D\uDCA5' },
  { key: 'retired', label: 'Retired', emoji: '\uD83D\uDEAA' },
];

function WicketSheet({ open, onOpenChange, battingTeam, bowlingTeam, currentBatsmen, onConfirm }: WicketSheetProps) {
  const [step, setStep] = useState<'dismissal' | 'fielder' | 'run_out' | 'new_batsman'>('dismissal');
  const [dismissal, setDismissal] = useState<DismissalType | null>(null);
  const [batsmanOut, setBatsmanOut] = useState<string | null>(null);
  const [fielder, setFielder] = useState<string | null>(null);
  const [runsCompleted, setRunsCompleted] = useState(0);
  const [newBatsman, setNewBatsman] = useState<string | null>(null);

  const resetState = () => {
    setStep('dismissal');
    setDismissal(null);
    setBatsmanOut(null);
    setFielder(null);
    setRunsCompleted(0);
    setNewBatsman(null);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetState();
    onOpenChange(v);
  };

  const handleDismissalSelect = (type: DismissalType) => {
    setDismissal(type);
    if (type === 'caught' || type === 'stumped') {
      setStep('fielder');
    } else if (type === 'run_out') {
      setStep('run_out');
    } else {
      setStep('new_batsman');
    }
  };

  const handleFielderSelect = (playerId: string) => {
    setFielder(playerId);
    setStep('new_batsman');
  };

  const handleRunOutDetails = (batId: string, fId: string, runs: number) => {
    setBatsmanOut(batId);
    setFielder(fId);
    setRunsCompleted(runs);
    setStep('new_batsman');
  };

  const handleNewBatsman = (playerId: string) => {
    setNewBatsman(playerId);
    if (dismissal) {
      onConfirm({
        dismissal,
        batsmanOut: batsmanOut ?? currentBatsmen[0].id,
        fielder: fielder ?? undefined,
        newBatsman: playerId,
        runsCompleted: dismissal === 'run_out' ? runsCompleted : undefined,
      });
    }
    handleOpenChange(false);
  };

  const handleBack = () => {
    if (step === 'new_batsman') {
      if (dismissal === 'caught' || dismissal === 'stumped') setStep('fielder');
      else if (dismissal === 'run_out') setStep('run_out');
      else setStep('dismissal');
    } else if (step === 'fielder' || step === 'run_out') {
      setStep('dismissal');
    }
  };

  // Filter out current batsmen for "yet to bat" list
  const yetToBat = battingTeam.filter(
    (p) => !currentBatsmen.some((b) => b.id === p.id),
  );

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerHandle />
      <DrawerTitle>Record Wicket</DrawerTitle>
      <DrawerBody>
        {/* Back button for non-first steps */}
        {step !== 'dismissal' && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1 mb-2 cursor-pointer active:scale-[0.96] transition-all"
          >
            <Text size="sm" weight="medium" color="muted">
              <span aria-hidden>&larr;</span> Back
            </Text>
          </button>
        )}

        {/* Step 1: Dismissal type */}
        {step === 'dismissal' && (
          <div className="flex flex-col gap-1.5">
            <Text size="lg" weight="semibold" className="mb-2">How out?</Text>
            {dismissalTypes.map((d) => (
              <button
                key={d.key}
                onClick={() => handleDismissalSelect(d.key)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer select-none',
                  'border border-[var(--border)] bg-[var(--surface)]',
                  'transition-all duration-150 active:scale-[0.96]',
                  'hover:border-[var(--cricket)]/50',
                )}
              >
                <span className="text-[18px]">{d.emoji}</span>
                <Text size="md" weight="medium">{d.label}</Text>
              </button>
            ))}
          </div>
        )}

        {/* Step 2a: Fielder selection (Caught/Stumped) */}
        {step === 'fielder' && (
          <div className="flex flex-col gap-1.5">
            <Text size="lg" weight="semibold" className="mb-2">
              {dismissal === 'caught' ? 'Caught by?' : 'Stumped by?'}
            </Text>
            {bowlingTeam.map((p) => (
              <button
                key={p.id}
                onClick={() => handleFielderSelect(p.id)}
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
          </div>
        )}

        {/* Step 2b: Run Out details */}
        {step === 'run_out' && (
          <RunOutStep
            currentBatsmen={currentBatsmen}
            bowlingTeam={bowlingTeam}
            onConfirm={handleRunOutDetails}
          />
        )}

        {/* Step 3: New batsman */}
        {step === 'new_batsman' && (
          <div className="flex flex-col gap-1.5">
            <Text size="lg" weight="semibold" className="mb-2">New Batsman</Text>
            {yetToBat.length === 0 ? (
              <Text size="sm" color="muted">No batsmen remaining — all out.</Text>
            ) : (
              yetToBat.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleNewBatsman(p.id)}
                  className={cn(
                    'flex items-center px-4 py-3 rounded-xl cursor-pointer select-none',
                    'border border-[var(--border)] bg-[var(--surface)]',
                    'transition-all duration-150 active:scale-[0.96]',
                    'hover:border-[var(--cricket)]/50',
                  )}
                >
                  <Text size="md" weight="medium">{p.name}</Text>
                </button>
              ))
            )}
          </div>
        )}
      </DrawerBody>
    </Drawer>
  );
}

/* ── Run Out sub-step: which batsman, fielder, runs completed ── */
function RunOutStep({
  currentBatsmen,
  bowlingTeam,
  onConfirm,
}: {
  currentBatsmen: [Player, Player];
  bowlingTeam: Player[];
  onConfirm: (batsmanOut: string, fielder: string, runs: number) => void;
}) {
  const [batId, setBatId] = useState<string | null>(null);
  const [fId, setFId] = useState<string | null>(null);
  const [runs, setRuns] = useState(0);

  if (!batId) {
    return (
      <div className="flex flex-col gap-1.5">
        <Text size="lg" weight="semibold" className="mb-2">Which batsman is out?</Text>
        {currentBatsmen.map((b) => (
          <button
            key={b.id}
            onClick={() => setBatId(b.id)}
            className={cn(
              'flex items-center px-4 py-3 rounded-xl cursor-pointer select-none',
              'border border-[var(--border)] bg-[var(--surface)]',
              'transition-all duration-150 active:scale-[0.96]',
            )}
          >
            <Text size="md" weight="medium">{b.name}</Text>
          </button>
        ))}
      </div>
    );
  }

  if (!fId) {
    return (
      <div className="flex flex-col gap-1.5">
        <Text size="lg" weight="semibold" className="mb-2">Run out by?</Text>
        {bowlingTeam.map((p) => (
          <button
            key={p.id}
            onClick={() => setFId(p.id)}
            className={cn(
              'flex items-center px-4 py-3 rounded-xl cursor-pointer select-none',
              'border border-[var(--border)] bg-[var(--surface)]',
              'transition-all duration-150 active:scale-[0.96]',
            )}
          >
            <Text size="md" weight="medium">{p.name}</Text>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Text size="lg" weight="semibold">Runs completed</Text>
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((r) => (
          <button
            key={r}
            onClick={() => setRuns(r)}
            className={cn(
              'flex-1 flex items-center justify-center rounded-xl cursor-pointer select-none',
              'transition-all duration-150 active:scale-[0.92]',
              runs === r
                ? 'bg-[var(--cricket)]/20 border border-[var(--cricket)]/40'
                : 'border border-[var(--border)] bg-[var(--surface)]',
            )}
            style={{ height: 48 }}
          >
            <Text size="lg" weight="bold" color={runs === r ? 'cricket' : 'default'} tabular>{r}</Text>
          </button>
        ))}
      </div>
      <Button
        brand="cricket"
        fullWidth
        onClick={() => onConfirm(batId, fId, runs)}
      >
        Confirm Run Out
      </Button>
    </div>
  );
}

export { WicketSheet };
export type { WicketSheetProps, DismissalType };
