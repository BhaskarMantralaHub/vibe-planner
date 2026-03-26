'use client';

import { useState, useCallback } from 'react';
import { Text, Button, SegmentedControl } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Scoreboard } from './Scoreboard';
import { OverTimeline } from './OverTimeline';
import { ButtonGrid } from './ButtonGrid';
import { FreeHitBanner } from './FreeHitBanner';
import { WicketSheet } from './WicketSheet';
import { ExtrasSheet, type ExtrasType } from './ExtrasSheet';
import { EndOfOverSheet, type BowlerFigures } from './EndOfOverSheet';
import { BallByBallLog } from './BallByBallLog';
import { FullScorecard } from './FullScorecard';
import type { BallResult } from './OverTimeline';

/* ── Mock data for visual testing ── */
const MOCK_BATSMEN = {
  striker: { id: '1', name: 'Bhaskar', runs: 34, balls: 22, fours: 4, sixes: 1, sr: '154.5' },
  nonStriker: { id: '2', name: 'Venkat', runs: 18, balls: 14, fours: 2, sixes: 0, sr: '128.6' },
};

const MOCK_BOWLER = {
  id: 'b1',
  name: 'Ravi',
  overs: '2.3',
  maidens: 0,
  runs: 18,
  wickets: 1,
  economy: '7.20',
};

const MOCK_BALLS: BallResult[] = [
  { type: '1' },
  { type: '4' },
  { type: 'dot' },
  { type: '2' },
  { type: '6' },
];

const MOCK_BOWLERS: BowlerFigures[] = [
  { id: 'b1', name: 'Ravi', overs: '3.0', maidens: 0, runs: 22, wickets: 1, economy: '7.33', justBowled: true },
  { id: 'b2', name: 'Suresh', overs: '2.0', maidens: 0, runs: 14, wickets: 0, economy: '7.00' },
  { id: 'b3', name: 'Kiran', overs: '1.0', maidens: 1, runs: 0, wickets: 1, economy: '0.00' },
];

const MOCK_BATTING_TEAM = [
  { id: '1', name: 'Bhaskar' },
  { id: '2', name: 'Venkat' },
  { id: '3', name: 'Sunil' },
  { id: '4', name: 'Arun' },
  { id: '5', name: 'Prasad' },
];

const MOCK_BOWLING_TEAM = [
  { id: 'b1', name: 'Ravi' },
  { id: 'b2', name: 'Suresh' },
  { id: 'b3', name: 'Kiran' },
  { id: 'b4', name: 'Deepak' },
];

interface ScoringScreenProps {
  onBack?: () => void;
  onPause?: () => void;
  onHandoff?: () => void;
}

function ScoringScreen({ onBack, onPause, onHandoff }: ScoringScreenProps) {
  const [wicketOpen, setWicketOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [extrasType, setExtrasType] = useState<ExtrasType>('wide');
  const [endOfOverOpen, setEndOfOverOpen] = useState(false);
  const [freeHit, setFreeHit] = useState(false);
  const [activeTab, setActiveTab] = useState<'scoring' | 'ballbyball' | 'scorecard'>('scoring');

  const handleScore = useCallback((type: string, value?: number) => {
    if (type === 'wicket') {
      setWicketOpen(true);
      return;
    }
    if (type === 'wide' || type === 'noball' || type === 'bye') {
      setExtrasType(type);
      setExtrasOpen(true);
      return;
    }
    // For demo: toggle free hit on 6, show end-of-over sheet on 5
    if (value === 6) setFreeHit((f) => !f);
    if (value === 5) setEndOfOverOpen(true);
    // In real usage, dispatch to scoring store
    setActiveTab('scoring');
  }, []);

  const handleUndo = useCallback(() => {
    // Will dispatch to scoring store
  }, []);

  const handleRedo = useCallback(() => {
    // Will dispatch to scoring store
  }, []);

  const handleSwapStrike = useCallback(() => {
    // Will dispatch to scoring store
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--bg)' }}
    >
      {/* ── Top Bar (48px) ── */}
      <div className="flex items-center justify-between px-3" style={{ height: 48 }}>
        <button
          onClick={onBack}
          className="flex items-center gap-1 cursor-pointer active:scale-[0.92] transition-all"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)]">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <Text size="md" weight="medium" color="muted">Back</Text>
        </button>

        <Text size="md" weight="semibold">
          SUN vs OPP
        </Text>

        <div className="flex items-center gap-2">
          <button
            onClick={onPause}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--muted)] hover:bg-[var(--hover-bg)] cursor-pointer active:scale-[0.92] transition-all"
            aria-label="Pause"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          </button>
          <button
            onClick={onHandoff}
            className={cn(
              'px-3 py-1.5 rounded-lg cursor-pointer',
              'border border-[var(--cricket)]/30',
              'active:scale-[0.92] transition-all hover:bg-[var(--cricket)]/10',
            )}
          >
            <Text size="xs" weight="medium" color="cricket">Handoff</Text>
          </button>
        </div>
      </div>

      {/* ── Scoreboard (88px) ── */}
      <Scoreboard
        teamName="SUN"
        runs={78}
        wickets={3}
        overs="6.2"
        runRate="12.3"
        target={156}
      />

      {/* ── Batsmen Section ── */}
      <div className="mx-4 mt-2 rounded-xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--surface)' }}>
        {/* Section header */}
        <div className="px-3 pt-2 pb-1">
          <Text size="2xs" weight="semibold" color="muted" uppercase tracking="wider">
            Batting
          </Text>
        </div>

        {/* Striker row — full width, accent border, tinted bg */}
        <button
          type="button"
          onClick={handleSwapStrike}
          className="w-full text-left px-3 py-2 border-l-4 cursor-pointer active:scale-[0.98] transition-all"
          style={{
            borderLeftColor: 'var(--cricket)',
            background: 'color-mix(in srgb, var(--cricket) 6%, transparent)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <Text size="sm" weight="semibold" truncate>
                {MOCK_BATSMEN.striker.name}
              </Text>
              <Text size="xs" weight="bold" color="cricket">*</Text>
            </div>
            <Text size="lg" weight="bold" tabular>
              {MOCK_BATSMEN.striker.runs}
              <Text size="sm" weight="normal" color="muted" tabular>
                {' '}({MOCK_BATSMEN.striker.balls})
              </Text>
            </Text>
          </div>
          <div className="flex items-center gap-4 mt-0.5">
            <Text size="xs" weight="medium" tabular>4s: {MOCK_BATSMEN.striker.fours}</Text>
            <Text size="xs" weight="medium" tabular>6s: {MOCK_BATSMEN.striker.sixes}</Text>
            <Text size="xs" weight="medium" color="muted" tabular>SR: {MOCK_BATSMEN.striker.sr}</Text>
          </div>
        </button>

        {/* Divider */}
        <div className="mx-3 border-t border-[var(--border)]" />

        {/* Non-striker row — full width, no accent */}
        <button
          type="button"
          onClick={handleSwapStrike}
          className="w-full text-left px-3 py-2 pl-[calc(0.75rem+4px)] cursor-pointer active:scale-[0.98] transition-all"
        >
          <div className="flex items-center justify-between">
            <Text size="sm" weight="medium" color="muted" truncate>
              {MOCK_BATSMEN.nonStriker.name}
            </Text>
            <Text size="md" weight="semibold" color="muted" tabular>
              {MOCK_BATSMEN.nonStriker.runs}
              <Text size="sm" weight="normal" color="dim" tabular>
                {' '}({MOCK_BATSMEN.nonStriker.balls})
              </Text>
            </Text>
          </div>
          <div className="flex items-center gap-4 mt-0.5">
            <Text size="xs" weight="medium" color="muted" tabular>4s: {MOCK_BATSMEN.nonStriker.fours}</Text>
            <Text size="xs" weight="medium" color="muted" tabular>6s: {MOCK_BATSMEN.nonStriker.sixes}</Text>
            <Text size="xs" weight="medium" color="dim" tabular>SR: {MOCK_BATSMEN.nonStriker.sr}</Text>
          </div>
        </button>
      </div>

      {/* ── Bowler Section ── */}
      <div
        className="mx-4 mt-2 rounded-xl border border-[var(--border)] px-3 py-2 flex items-center gap-3"
        style={{ background: 'var(--surface)' }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Text size="2xs" weight="semibold" color="muted" uppercase tracking="wider" className="flex-shrink-0">
            Bowl
          </Text>
          <Text size="sm" weight="semibold" truncate>
            {MOCK_BOWLER.name}
          </Text>
        </div>
        <div className="flex items-center gap-3 ml-auto flex-shrink-0">
          <div className="text-center">
            <Text size="2xs" color="dim" uppercase tracking="wider">O</Text>
            <Text as="div" size="sm" weight="semibold" tabular>{MOCK_BOWLER.overs}</Text>
          </div>
          <div className="text-center">
            <Text size="2xs" color="dim" uppercase tracking="wider">W</Text>
            <Text as="div" size="sm" weight="semibold" tabular>{MOCK_BOWLER.wickets}</Text>
          </div>
          <div className="text-center">
            <Text size="2xs" color="dim" uppercase tracking="wider">R</Text>
            <Text as="div" size="sm" weight="semibold" tabular>{MOCK_BOWLER.runs}</Text>
          </div>
          <div className="text-center">
            <Text size="2xs" color="dim" uppercase tracking="wider">ER</Text>
            <Text as="div" size="sm" weight="semibold" tabular>{MOCK_BOWLER.economy}</Text>
          </div>
        </div>
      </div>

      {/* ── Over Timeline ── */}
      <div className="mt-2">
        <OverTimeline balls={MOCK_BALLS} />
      </div>

      {/* ── Free Hit Banner ── */}
      <div className="mt-1">
        <FreeHitBanner visible={freeHit} />
      </div>

      {/* ── Info Strip ── */}
      <div className="flex items-center justify-center gap-3 px-4 py-2">
        <Text size="xs" weight="medium" color="muted" tabular>
          Partnership: <Text size="xs" weight="semibold" tabular>45</Text> (28 balls)
        </Text>
        <Text size="xs" color="dim">|</Text>
        <Text size="xs" weight="medium" color="muted" tabular>
          Prev Over: 12 runs (Ravi)
        </Text>
      </div>

      {/* ── Segmented Control ── */}
      <SegmentedControl
        options={[
          { key: 'scoring', label: 'Scoring' },
          { key: 'ballbyball', label: 'Ball by Ball' },
          { key: 'scorecard', label: 'Scorecard' },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as 'scoring' | 'ballbyball' | 'scorecard')}
        className="mx-4 mb-2"
      />

      {/* ── Tab Content ── */}
      {activeTab === 'scoring' && <ButtonGrid onScore={handleScore} />}
      {activeTab === 'ballbyball' && <BallByBallLog />}
      {activeTab === 'scorecard' && <FullScorecard />}

      {/* ── Action Bar ── */}
      <div className="flex gap-2 px-4 py-2" style={{ height: 60 }}>
        <button
          onClick={handleUndo}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 rounded-xl cursor-pointer select-none',
            'border border-[var(--border)]',
            'transition-all duration-150 active:scale-[0.92]',
            'hover:bg-[var(--hover-bg)]',
          )}
          style={{ height: 44 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)]">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
          <Text size="sm" weight="medium" color="muted">Undo</Text>
        </button>
        <button
          onClick={handleRedo}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 rounded-xl cursor-pointer select-none',
            'border border-[var(--border)]',
            'transition-all duration-150 active:scale-[0.92]',
            'hover:bg-[var(--hover-bg)]',
          )}
          style={{ height: 44 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)]">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
          </svg>
          <Text size="sm" weight="medium" color="muted">Redo</Text>
        </button>
      </div>

      {/* Safe area bottom padding */}
      <div className="pb-[env(safe-area-inset-bottom)]" />

      {/* ── Sheets ── */}
      <WicketSheet
        open={wicketOpen}
        onOpenChange={setWicketOpen}
        battingTeam={MOCK_BATTING_TEAM}
        bowlingTeam={MOCK_BOWLING_TEAM}
        currentBatsmen={[MOCK_BATTING_TEAM[0], MOCK_BATTING_TEAM[1]]}
        onConfirm={(data) => {
          // Will dispatch to scoring store
          setWicketOpen(false);
        }}
      />

      <ExtrasSheet
        open={extrasOpen}
        onOpenChange={setExtrasOpen}
        type={extrasType}
        onConfirm={(type, additionalRuns, subType) => {
          // Will dispatch to scoring store
          if (type === 'noball') setFreeHit(true);
        }}
      />

      <EndOfOverSheet
        open={endOfOverOpen}
        onOpenChange={setEndOfOverOpen}
        overNumber={7}
        overRuns={12}
        bowlers={MOCK_BOWLERS}
        onSelectBowler={(id) => {
          // Will dispatch to scoring store
          setEndOfOverOpen(false);
        }}
      />
    </div>
  );
}

export { ScoringScreen };
export type { ScoringScreenProps };
