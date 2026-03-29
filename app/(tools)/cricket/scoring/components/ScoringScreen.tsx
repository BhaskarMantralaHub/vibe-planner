'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Button, SegmentedControl, Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from '@/components/ui';
import { cn } from '@/lib/utils';
import { PageFooter } from '@/components/PageFooter';
import { useScoringStore } from '@/stores/scoring-store';
import { useCricketStore } from '@/stores/cricket-store';
import { Scoreboard } from './Scoreboard';
import { OverTimeline } from './OverTimeline';
import { ButtonGrid } from './ButtonGrid';
import { FreeHitBanner } from './FreeHitBanner';
import PlayerPickerRow from '@/app/(tools)/cricket/components/PlayerPickerRow';
import { WicketSheet } from './WicketSheet';
import { ExtrasSheet, type ExtrasType } from './ExtrasSheet';
import { EndOfOverSheet } from './EndOfOverSheet';
import { BallByBallLog } from './BallByBallLog';
import { FullScorecard } from './FullScorecard';
import type { WicketType } from '@/types/scoring';
import {
  buildPlayerMap,
  displayName,
  scoringBallToBallResult,
  buildTimeline,
  buildInningsSummary,
  bowlingStatsToBowlerFigures,
  computePartnership,
  computePreviousOverRuns,
  formatOversDisplay,
} from '../lib/scoring-utils';

interface ScoringScreenProps {
  onBack?: () => void;
  onHandoff?: () => void;
}

function ScoringScreen({ onBack, onHandoff }: ScoringScreenProps) {
  const router = useRouter();

  /* ── Store state ── */
  const match = useScoringStore((s) => s.match);
  const innings = useScoringStore((s) => s.innings);
  const balls = useScoringStore((s) => s.balls);
  const isFreeHit = useScoringStore((s) => s.isFreeHit);

  const redoStack = useScoringStore((s) => s.redoStack);

  const {
    recordBall,
    undoLastBall,
    redoLastBall,
    endMatch,
    setBowler,
    setNextBatsman,
    getCurrentInnings,
    getCurrentOverBalls,
    getBattingStats,
    getBowlingStats,
    getBattingTeamPlayers,
    getBowlingTeamPlayers,
    getYetToBat,
    getAvailableBowlers,
  } = useScoringStore.getState();

  // Photo lookup: player_id → photo_url from cricket_players roster
  const rosterPlayers = useCricketStore((s) => s.players);
  const photoMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of rosterPlayers) {
      if (p.photo_url) map.set(p.id, p.photo_url);
    }
    return map;
  }, [rosterPlayers]);

  /* ── Local UI state ── */
  const [wicketOpen, setWicketOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [extrasType, setExtrasType] = useState<ExtrasType>('wide');
  const [endOfOverOpen, setEndOfOverOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'scoring' | 'ballbyball' | 'scorecard' | 'squads'>('scoring');
  const [endMatchOpen, setEndMatchOpen] = useState(false);
  const [inningsBreak, setInningsBreak] = useState(false);
  const [inn2Striker, setInn2Striker] = useState<string | null>(null);
  const [inn2NonStriker, setInn2NonStriker] = useState<string | null>(null);
  const [inn2Bowler, setInn2Bowler] = useState<string | null>(null);

  /* ── Derived data ── */
  const idx = match?.current_innings ?? 0;
  const currentInnings = useMemo(() => getCurrentInnings(), [innings, match]);

  const playerMap = useMemo(() => {
    if (!match) return new Map();
    return buildPlayerMap(match);
  }, [match]);

  // Over timeline balls
  const currentOverBalls = useMemo(() => {
    return getCurrentOverBalls().map(scoringBallToBallResult);
  }, [balls, match]);

  // Batting stats for display
  const battingStats = useMemo(() => getBattingStats(idx), [balls, idx]);
  const bowlingStats = useMemo(() => getBowlingStats(idx), [balls, idx]);

  // Striker / non-striker display data
  const strikerStats = useMemo(
    () => battingStats.find((s) => s.player.id === currentInnings.striker_id),
    [battingStats, currentInnings.striker_id],
  );
  const nonStrikerStats = useMemo(
    () => battingStats.find((s) => s.player.id === currentInnings.non_striker_id),
    [battingStats, currentInnings.non_striker_id],
  );

  // Current bowler
  const currentBowlerStats = useMemo(
    () => bowlingStats.find((s) => s.player.id === currentInnings.bowler_id),
    [bowlingStats, currentInnings.bowler_id],
  );

  // Bowling team name + batting team name
  const battingTeamName = useMemo(() => {
    if (!match) return '';
    return currentInnings.batting_team === 'team_a' ? match.team_a.name : match.team_b.name;
  }, [match, currentInnings.batting_team]);

  // Run rate
  const runRate = useMemo(() => {
    const inningsBalls = balls.filter((b) => b.innings === idx);
    const legalBalls = inningsBalls.filter((b) => b.is_legal).length;
    if (legalBalls === 0) return '0.00';
    return ((currentInnings.total_runs / legalBalls) * 6).toFixed(2);
  }, [balls, idx, currentInnings.total_runs]);

  // Partnership
  const partnership = useMemo(() => computePartnership(idx, balls), [balls, idx]);

  // Previous over
  const prevOver = useMemo(() => computePreviousOverRuns(idx, balls, playerMap), [balls, idx, playerMap]);

  // Ball-by-ball timeline
  // Ball-by-ball timeline — show current innings during play, both innings after completion
  const timeline = useMemo(() => {
    if (!match) return [];
    if (match.status === 'completed' || match.status === 'innings_break' || idx === 1) {
      const t1 = buildTimeline(0, balls, innings[0], match, playerMap);
      const t2 = buildTimeline(1, balls, innings[1], match, playerMap);
      const team1Name = innings[0].batting_team === 'team_a' ? match.team_a.name : match.team_b.name;
      const team2Name = innings[1].batting_team === 'team_a' ? match.team_a.name : match.team_b.name;

      const inningsBreakEntry = {
        kind: 'inningsBreak' as const,
        data: {
          teamName: team1Name,
          totalRuns: innings[0].total_runs,
          totalWickets: innings[0].total_wickets,
          totalOvers: formatOversDisplay(innings[0].total_overs),
          target: innings[0].total_runs + 1,
        },
      };

      const entries = [...t1, inningsBreakEntry, ...t2];

      // Add match result card at the end if completed
      if (match.status === 'completed' && match.result_summary) {
        entries.push({
          kind: 'matchResult' as const,
          data: {
            result: match.result_summary,
            team1: { name: team1Name, runs: innings[0].total_runs, wickets: innings[0].total_wickets, overs: formatOversDisplay(innings[0].total_overs) },
            team2: { name: team2Name, runs: innings[1].total_runs, wickets: innings[1].total_wickets, overs: formatOversDisplay(innings[1].total_overs) },
          },
        });
      }

      return entries;
    }
    return buildTimeline(idx, balls, currentInnings, match, playerMap);
  }, [balls, idx, match, currentInnings, innings, playerMap]);

  // Full scorecard
  const scorecardData = useMemo(() => {
    if (!match) return null;
    return buildInningsSummary(idx, match, currentInnings, battingStats, bowlingStats, balls, playerMap);
  }, [idx, match, currentInnings, battingStats, bowlingStats, balls, playerMap]);

  /* ── End of over detection ── */
  const legalBallCount = useMemo(() => {
    return balls.filter((b) => b.innings === idx && b.is_legal).length;
  }, [balls, idx]);

  const prevLegalBallCountRef = useRef(legalBallCount);

  useEffect(() => {
    const prev = prevLegalBallCountRef.current;
    prevLegalBallCountRef.current = legalBallCount;

    // Detect: legal balls crossed a multiple of 6
    if (
      legalBallCount > 0 &&
      legalBallCount % 6 === 0 &&
      prev % 6 !== 0 &&
      !currentInnings.is_completed
    ) {
      setEndOfOverOpen(true);
    }
  }, [legalBallCount, currentInnings.is_completed]);

  /* ── Handlers ── */

  // Check if scoring is possible (guards same as store's recordBall)
  const canScore = match?.status === 'scoring' &&
    !currentInnings.is_completed &&
    !!currentInnings.striker_id &&
    !!currentInnings.non_striker_id &&
    !!currentInnings.bowler_id;

  const handleScore = useCallback((type: string, value?: number) => {
    if (type === 'wicket') {
      setWicketOpen(true);
      return;
    }
    if (type === 'wide' || type === 'noball' || type === 'bye') {
      setExtrasType(type as ExtrasType);
      setExtrasOpen(true);
      return;
    }
    if (type === 'runs' && value !== undefined) {
      recordBall({ runs_bat: value });
    }
  }, [recordBall]);

  const handleWicketConfirm = useCallback((data: {
    dismissal: string;
    batsmanOut: string;
    fielder?: string;
    newBatsman: string;
    runsCompleted?: number;
  }) => {
    const runsBat = data.dismissal === 'run_out' ? (data.runsCompleted ?? 0) : 0;

    recordBall({
      runs_bat: runsBat,
      is_wicket: true,
      wicket_type: data.dismissal as WicketType,
      dismissed_id: data.batsmanOut,
      fielder_id: data.fielder,
    });

    // Set replacement batsman (recordBall already cleared the dismissed slot)
    // If newBatsman is empty, it's an all-out scenario — skip setNextBatsman
    if (data.newBatsman) {
      setNextBatsman(data.newBatsman);
    }
    setWicketOpen(false);
  }, [recordBall, setNextBatsman]);

  const handleExtrasConfirm = useCallback((
    type: ExtrasType,
    additionalRuns: number,
    subType?: 'bye' | 'legbye',
  ) => {
    if (type === 'wide') {
      recordBall({
        runs_bat: 0,
        extras_type: 'wide',
        runs_extras: 1 + additionalRuns,
      });
    } else if (type === 'noball') {
      recordBall({
        runs_bat: additionalRuns,
        extras_type: 'no_ball',
        runs_extras: 1,
      });
    } else if (type === 'bye') {
      const storeType = subType === 'legbye' ? 'leg_bye' : 'bye';
      recordBall({
        runs_bat: 0,
        extras_type: storeType,
        runs_extras: additionalRuns,
      });
    }
    setExtrasOpen(false);
  }, [recordBall]);

  const handleUndo = useCallback(() => {
    undoLastBall();
    // Close any open sheets — undo may reverse end-of-over or wicket
    setWicketOpen(false);
    setExtrasOpen(false);
    setEndOfOverOpen(false);
  }, [undoLastBall]);

  const handleRedo = useCallback(() => {
    redoLastBall();
  }, [redoLastBall]);

  const handleEndMatch = useCallback(() => {
    setEndMatchOpen(true);
  }, []);

  const confirmEndMatch = useCallback(() => {
    setShowResultScreen(true);
    endMatch();
    setEndMatchOpen(false);
  }, [endMatch]);

  const handleSelectBowler = useCallback((bowlerId: string) => {
    setBowler(bowlerId);
    setEndOfOverOpen(false);
  }, [setBowler]);

  const handleSwapStrike = useCallback(() => {
    useScoringStore.getState().swapStrike();
  }, []);

  /* ── Guard: no match ── */
  if (!match) return null;

  /* ── Resolve player names for display ── */
  const strikerPlayer = currentInnings.striker_id ? playerMap.get(currentInnings.striker_id) : null;
  const nonStrikerPlayer = currentInnings.non_striker_id ? playerMap.get(currentInnings.non_striker_id) : null;
  const bowlerPlayer = currentInnings.bowler_id ? playerMap.get(currentInnings.bowler_id) : null;

  /* ── Data for sheets ── */
  const battingTeamPlayers = getBattingTeamPlayers().map((p) => ({ id: p.id, name: displayName(p) }));
  const bowlingTeamPlayers = getBowlingTeamPlayers().map((p) => ({ id: p.id, name: displayName(p) }));
  const yetToBat = getYetToBat().map((p) => ({ id: p.id, name: displayName(p) }));

  const currentBatsmen: [{ id: string; name: string }, { id: string; name: string }] | null =
    strikerPlayer && nonStrikerPlayer
      ? [
          { id: strikerPlayer.id, name: displayName(strikerPlayer) },
          { id: nonStrikerPlayer.id, name: displayName(nonStrikerPlayer) },
        ]
      : null;

  // EndOfOverSheet data
  const endOfOverBowlers = bowlingStatsToBowlerFigures(
    bowlingStats,
    currentInnings.bowler_id ?? undefined,
  );

  // Also include available bowlers who haven't bowled yet (so they appear in the sheet)
  const availableBowlerIds = new Set(getAvailableBowlers().map((p) => p.id));
  const allBowlerFigures = [
    ...endOfOverBowlers,
    ...getBowlingTeamPlayers()
      .filter((p) => !endOfOverBowlers.some((b) => b.id === p.id))
      .map((p) => ({
        id: p.id,
        name: displayName(p),
        overs: '0.0',
        maidens: 0,
        runs: 0,
        wickets: 0,
        economy: '0.00',
        justBowled: false,
      })),
  ].map((b) => ({
    ...b,
    // Mark as justBowled if NOT in available list (can't bowl consecutive overs)
    justBowled: !availableBowlerIds.has(b.id),
  }));

  // Completed over number for sheet title
  const completedOverNumber = legalBallCount > 0 ? Math.ceil(legalBallCount / 6) : 0;
  const lastOverBalls = balls.filter((b) => b.innings === idx && b.over_number === completedOverNumber - 1);
  const lastOverRuns = lastOverBalls.reduce((s, b) => s + b.runs_bat + b.runs_extras, 0);

  /* ── Match Completed Screen ── */
  const [showResultScreen, setShowResultScreen] = useState(true);

  // Build scorecard for both innings (for post-match view)
  const scorecardInn1 = useMemo(() => {
    if (!match) return null;
    const bs1 = getBattingStats(0);
    const bw1 = getBowlingStats(0);
    return buildInningsSummary(0, match, innings[0], bs1, bw1, balls, playerMap);
  }, [match, innings, balls, playerMap]);

  const scorecardInn2 = useMemo(() => {
    if (!match || !innings[1].total_overs) return null;
    const bs2 = getBattingStats(1);
    const bw2 = getBowlingStats(1);
    return buildInningsSummary(1, match, innings[1], bs2, bw2, balls, playerMap);
  }, [match, innings, balls, playerMap]);

  if (match.status === 'completed' && showResultScreen) {
    const inn1 = innings[0];
    const inn2 = innings[1];
    const team1Name = inn1.batting_team === 'team_a' ? match.team_a.name : match.team_b.name;
    const team2Name = inn2.batting_team === 'team_a' ? match.team_a.name : match.team_b.name;
    const isWin = match.result_summary?.includes('won');
    const isTie = match.result_summary?.includes('tied');

    return (
      <div className="min-h-[100dvh]" style={{ background: 'var(--bg)' }}>
        {/* Gradient hero */}
        <div
          className="px-4 pt-12 pb-8 text-center"
          style={{ background: 'linear-gradient(180deg, var(--cricket-deep, #1B3A6B), var(--cricket))' }}
        >
          <Text as="p" size="xs" weight="semibold" color="white" uppercase tracking="wider" className="opacity-70 mb-3">
            Match Result
          </Text>
          <Text as="h1" size="2xl" weight="bold" color="white">
            {match.result_summary ?? 'Match Complete'}
          </Text>
        </div>

        <div className="px-4 -mt-4">
          {/* Score card */}
          <div className="rounded-2xl border border-[var(--border)] overflow-hidden shadow-lg" style={{ background: 'var(--card)' }}>
            {/* 1st innings */}
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Text size="md" weight="semibold">{team1Name}</Text>
                <Text size="2xs" color="dim" weight="medium">(1st)</Text>
              </div>
              <Text size="lg" weight="bold" tabular>
                {inn1.total_runs}/{inn1.total_wickets}
                <Text size="xs" weight="normal" color="muted" tabular> ({formatOversDisplay(inn1.total_overs)})</Text>
              </Text>
            </div>
            <div className="mx-4 border-t border-[var(--border)]/30" />
            {/* 2nd innings */}
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Text size="md" weight="semibold">{team2Name}</Text>
                <Text size="2xs" color="dim" weight="medium">(2nd)</Text>
              </div>
              <Text size="lg" weight="bold" tabular>
                {inn2.total_runs}/{inn2.total_wickets}
                <Text size="xs" weight="normal" color="muted" tabular> ({formatOversDisplay(inn2.total_overs)})</Text>
              </Text>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 mt-6">
            <Button
              variant="primary"
              brand="cricket"
              size="lg"
              fullWidth
              onClick={() => {
                setActiveTab('scorecard');
                setShowResultScreen(false);
              }}
            >
              View Full Scorecard
            </Button>
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onClick={() => router.push('/cricket/scoring/leaderboard')}
            >
              Practice Stats
            </Button>
            <Button
              variant="link"
              size="lg"
              fullWidth
              brand="cricket"
              onClick={() => {
                useScoringStore.getState().reset();
                if (onBack) onBack();
              }}
            >
              Done
            </Button>
          </div>

          <PageFooter />
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh]"
      style={{ background: 'var(--bg)' }}
    >
      {/* ── Top Bar (48px) — sticky at top ── */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-3 backdrop-blur-md" style={{ height: 48, background: 'color-mix(in srgb, var(--bg) 90%, transparent)' }}>
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
          {match.team_a.name} vs {match.team_b.name}
        </Text>

        <div className="flex items-center gap-2">
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

      {/* ── Scoreboard (72px) ── */}
      <Scoreboard
        teamName={battingTeamName}
        runs={currentInnings.total_runs}
        wickets={currentInnings.total_wickets}
        overs={formatOversDisplay(currentInnings.total_overs)}
        runRate={runRate}
        target={currentInnings.target ?? undefined}
      />

      {/* ── Batsmen + Bowler ── */}
      <div className="mx-4 mt-2 rounded-xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--surface)' }}>
        {/* Striker */}
        {strikerPlayer ? (
          <button
            type="button"
            onClick={!currentInnings.is_completed ? handleSwapStrike : undefined}
            className="w-full text-left px-3 py-2.5 border-l-[3px] cursor-pointer active:scale-[0.98] transition-all"
            style={{
              borderLeftColor: 'var(--cricket)',
              background: 'color-mix(in srgb, var(--cricket) 6%, transparent)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-0.5 min-w-0 flex-1">
                <Text size="sm" weight="bold" truncate>{displayName(strikerPlayer)}</Text>
                {!currentInnings.is_completed && <Text size="xs" weight="bold" color="cricket" className="flex-shrink-0">*</Text>}
                {currentInnings.is_completed && <Text size="2xs" weight="medium" color="success" className="flex-shrink-0 ml-1">not out</Text>}
              </div>
              <Text size="lg" weight="bold" tabular className="flex-shrink-0">
                {strikerStats?.runs ?? 0}
                <Text size="xs" weight="normal" color="muted" tabular> ({strikerStats?.balls ?? 0})</Text>
              </Text>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <Text size="xs" weight="medium" tabular>4s: {strikerStats?.fours ?? 0}</Text>
              <Text size="xs" weight="medium" tabular>6s: {strikerStats?.sixes ?? 0}</Text>
              <Text size="xs" weight="medium" color="muted" tabular>SR: {strikerStats?.strike_rate?.toFixed(1) ?? '0.0'}</Text>
            </div>
          </button>
        ) : currentInnings.is_completed ? null : (
          <div className="px-3 py-2.5 border-l-[3px]" style={{ borderLeftColor: 'var(--cricket)' }}>
            <Text size="sm" color="muted">Waiting for striker...</Text>
          </div>
        )}

        {/* Non-striker — hide when innings complete and slot is empty */}
        {nonStrikerPlayer ? (
          <>
            <div className="mx-3 border-t border-[var(--border)]/40" />
            <button
              type="button"
              onClick={!currentInnings.is_completed ? handleSwapStrike : undefined}
              className="w-full text-left px-3 py-2 pl-[calc(0.75rem+3px)] cursor-pointer active:scale-[0.98] transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  <Text size="sm" weight="medium" color="muted" truncate>{displayName(nonStrikerPlayer)}</Text>
                  {currentInnings.is_completed && <Text size="2xs" weight="medium" color="success" className="flex-shrink-0">not out</Text>}
                </div>
                <Text size="md" weight="semibold" color="muted" tabular className="flex-shrink-0">
                  {nonStrikerStats?.runs ?? 0}
                  <Text size="xs" weight="normal" color="dim" tabular> ({nonStrikerStats?.balls ?? 0})</Text>
                </Text>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <Text size="xs" weight="medium" color="muted" tabular>4s: {nonStrikerStats?.fours ?? 0}</Text>
                <Text size="xs" weight="medium" color="muted" tabular>6s: {nonStrikerStats?.sixes ?? 0}</Text>
                <Text size="xs" weight="medium" color="dim" tabular>SR: {nonStrikerStats?.strike_rate?.toFixed(1) ?? '0.0'}</Text>
              </div>
            </button>
          </>
        ) : currentInnings.is_completed ? null : (
          <>
            <div className="mx-3 border-t border-[var(--border)]/40" />
            <div className="px-3 py-2 pl-[calc(0.75rem+3px)]">
              <Text size="sm" color="dim">Waiting for non-striker...</Text>
            </div>
          </>
        )}

        <div className="mx-3 border-t border-[var(--border)]/40" />

        {/* Bowler */}
        <div className="px-3 py-2 flex items-center gap-2">
          <Text size="2xs" weight="semibold" color="muted" uppercase className="flex-shrink-0">Bowl</Text>
          <Text size="sm" weight="semibold" truncate className="min-w-0">{bowlerPlayer ? displayName(bowlerPlayer) : 'TBD'}</Text>
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            <Text size="xs" color="muted" tabular>{currentBowlerStats?.overs ?? '0.0'}ov</Text>
            <Text size="xs" weight="semibold" tabular>{currentBowlerStats?.wickets ?? 0}w</Text>
            <Text size="xs" color="muted" tabular>{currentBowlerStats?.runs ?? 0}r</Text>
            <Text size="xs" color="muted" tabular>{currentBowlerStats ? currentBowlerStats.economy.toFixed(1) : '0.0'}er</Text>
          </div>
        </div>
      </div>

      {/* ── Over Timeline ── */}
      <div className="mt-1.5">
        <OverTimeline balls={currentOverBalls} overNumber={Math.floor(currentInnings.total_overs)} />
      </div>

      {/* ── Free Hit Banner ── */}
      {isFreeHit && <div className="mt-1"><FreeHitBanner visible /></div>}

      {/* ── Info Strip ── */}
      <div className="flex items-center justify-center gap-2 px-4 py-1">
        <Text size="2xs" weight="medium" color="muted" tabular>
          P&apos;ship: <Text size="2xs" weight="semibold" tabular>{partnership.runs}</Text>({partnership.balls}b)
        </Text>
        {prevOver && (
          <>
            <Text size="2xs" color="dim">|</Text>
            <Text size="2xs" weight="medium" color="muted" tabular>
              Prev: {prevOver.runs}r ({prevOver.bowlerName})
            </Text>
          </>
        )}
      </div>

      {/* ── Segmented Control ── */}
      <SegmentedControl
        options={[
          ...(match.status !== 'completed' ? [{ key: 'scoring', label: 'Scoring' }] : []),
          { key: 'ballbyball', label: 'Ball by Ball' },
          { key: 'scorecard', label: 'Scorecard' },
          { key: 'squads', label: 'Squads' },
        ]}
        active={match.status === 'completed' && activeTab === 'scoring' ? 'scorecard' : activeTab}
        onChange={(key) => setActiveTab(key as 'scoring' | 'ballbyball' | 'scorecard' | 'squads')}
        className="mx-4 mb-2"
      />

      {/* ── Tab Content ── */}
      {activeTab === 'scoring' && (
        currentInnings.is_completed ? (
          /* ── Innings Complete Card ── */
          <div className="mx-4 rounded-2xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--surface)' }}>
            <div className="px-4 pt-6 pb-4 flex flex-col items-center gap-2 text-center">
              <Text as="h2" size="2xl" weight="bold">
                Innings Over
              </Text>
              <Text as="p" size="xl" weight="bold" tabular color="cricket">
                {battingTeamName} {currentInnings.total_runs}/{currentInnings.total_wickets}
                <Text as="span" size="sm" weight="medium" color="muted" tabular>
                  {' '}({formatOversDisplay(currentInnings.total_overs)} ov)
                </Text>
              </Text>
              <Text as="p" size="xs" weight="semibold" color="muted" uppercase tracking="wider" className="mt-1">
                {currentInnings.total_wickets >= (getBattingTeamPlayers().length - 1)
                  ? 'All Out'
                  : currentInnings.target && currentInnings.total_runs >= currentInnings.target
                  ? 'Target Reached'
                  : 'Overs Complete'}
              </Text>
            </div>

            <div className="px-4 pb-4 flex flex-col gap-3">
              {/* Primary action */}
              {idx === 0 ? (
                <Button
                  variant="primary"
                  brand="cricket"
                  size="xl"
                  fullWidth
                  onClick={() => {
                    useScoringStore.getState().endInnings();
                    setInningsBreak(true);
                    setInn2Striker(null);
                    setInn2NonStriker(null);
                    setInn2Bowler(null);
                  }}
                >
                  Start 2nd Innings
                </Button>
              ) : (
                <Button
                  variant="primary"
                  brand="cricket"
                  size="xl"
                  fullWidth
                  onClick={() => {
                    setShowResultScreen(true);
                    useScoringStore.getState().endMatch();
                  }}
                >
                  View Match Result
                </Button>
              )}

              {/* Secondary action */}
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onClick={() => setActiveTab('scorecard')}
              >
                View Scorecard
              </Button>

              {/* Utility actions — only show when match is still in progress */}
              {match.status !== 'completed' && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleUndo}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 cursor-pointer select-none',
                    'border border-[var(--border)] transition-all active:scale-[0.96]',
                  )}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)' }}>
                    <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                  </svg>
                  <Text size="xs" weight="medium" color="muted">Undo</Text>
                </button>
                <button
                  onClick={handleEndMatch}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 cursor-pointer select-none',
                    'border border-[var(--red)]/30 transition-all active:scale-[0.96]',
                  )}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--red)' }}>
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  <Text size="xs" weight="medium" color="danger">End Match</Text>
                </button>
              </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Active Scoring ── */
          <>
            {!canScore && match?.status === 'scoring' && (
              <div className="mx-4 mb-2 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/8">
                <Text size="xs" weight="medium" className="text-amber-500">
                  {!currentInnings.striker_id ? 'Select a new batsman to continue scoring' :
                   !currentInnings.bowler_id ? 'Select a bowler to continue scoring' :
                   'Cannot score right now'}
                </Text>
              </div>
            )}
            <ButtonGrid
              onScore={handleScore}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onEndMatch={handleEndMatch}
              canUndo={balls.length > 0}
              canRedo={redoStack.length > 0}
            />
          </>
        )
      )}
      {activeTab === 'ballbyball' && <BallByBallLog timeline={timeline} />}
      {activeTab === 'scorecard' && (
        match.status === 'completed' ? (
          <div className="px-4 space-y-4 pb-4">
            {match.status === 'completed' && !showResultScreen && (
              <button onClick={() => setShowResultScreen(true)} className="flex items-center gap-1 cursor-pointer active:scale-[0.96] transition-all mb-2">
                <Text size="sm" weight="medium" color="cricket">&larr; Back to Result</Text>
              </button>
            )}
            {scorecardInn1 && <FullScorecard innings={scorecardInn1} />}
            {scorecardInn2 && <FullScorecard innings={scorecardInn2} />}
          </div>
        ) : (
          <FullScorecard innings={scorecardData} />
        )
      )}

      {activeTab === 'squads' && (
        <div className="px-4 space-y-4 pb-4">
          {[match.team_a, match.team_b].map((team, idx) => {
            const teamSide = idx === 0 ? 'team_a' : 'team_b';
            const isBatting = innings[match.current_innings].batting_team === teamSide;
            return (
              <div key={teamSide} className="rounded-2xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--surface)' }}>
                <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--border)]/50"
                  style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--cricket) 6%, transparent), transparent)' }}>
                  <Text size="sm" weight="bold">{team.name}</Text>
                  <div className="flex items-center gap-2">
                    {isBatting && match.status === 'scoring' && (
                      <Text size="2xs" weight="bold" color="cricket" uppercase>Batting</Text>
                    )}
                    <Text size="2xs" color="muted">{team.players.length} players</Text>
                  </div>
                </div>
                <div className="px-2 py-1.5 space-y-1">
                  {[...team.players].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                    <PlayerPickerRow
                      key={p.id}
                      player={{ ...p, photo_url: p.player_id ? photoMap.get(p.player_id) ?? null : null }}
                      selected={false}
                      onToggle={() => {}}
                      mode="highlight"
                      badge={team.captain_id === p.id ? 'C' : undefined}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Undo is now integrated into ButtonGrid's extras row */}

      {/* Separator + footer */}
      <div className="mx-4 mt-8 border-t border-[var(--border)]/40" />
      <PageFooter className="mt-4" />

      {/* Safe area bottom padding */}
      <div className="pb-[max(env(safe-area-inset-bottom),20px)]" />

      {/* ── Sheets (use portals, render to document.body) ── */}
      {currentBatsmen && (
        <WicketSheet
          open={wicketOpen}
          onOpenChange={setWicketOpen}
          battingTeam={[...yetToBat, ...currentBatsmen]}
          bowlingTeam={bowlingTeamPlayers}
          currentBowlerId={currentInnings.bowler_id ?? undefined}
          currentBatsmen={currentBatsmen}
          onConfirm={handleWicketConfirm}
        />
      )}

      <ExtrasSheet
        open={extrasOpen}
        onOpenChange={setExtrasOpen}
        type={extrasType}
        onConfirm={handleExtrasConfirm}
      />

      <EndOfOverSheet
        open={endOfOverOpen}
        onOpenChange={setEndOfOverOpen}
        overNumber={completedOverNumber}
        overRuns={lastOverRuns}
        bowlers={allBowlerFigures}
        onSelectBowler={handleSelectBowler}
      />

      {/* End Match Confirmation */}
      <Dialog open={endMatchOpen} onOpenChange={setEndMatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End Match?</DialogTitle>
            <DialogDescription>
              This will end the match at the current score. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEndMatchOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmEndMatch}>
              End Match
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2nd Innings Setup */}
      <Dialog open={inningsBreak} onOpenChange={setInningsBreak}>
        <DialogContent className="max-h-[85vh] overflow-y-auto" showClose>
          <DialogTitle>2nd Innings Setup</DialogTitle>
          <div className="flex flex-col gap-4">
            {/* Target info */}
            <div className="text-center rounded-xl px-3 py-3" style={{ background: 'color-mix(in srgb, var(--cricket) 8%, var(--surface))' }}>
              <Text size="sm" color="muted">Target</Text>
              <Text as="p" size="xl" weight="bold" color="cricket" tabular>
                {(innings[0]?.total_runs ?? 0) + 1}
              </Text>
            </div>

            {/* Opening batsmen — team batting 2nd */}
            <div>
              <Text size="xs" weight="semibold" color="muted" uppercase tracking="wider" className="mb-2">
                Opening Batsmen
              </Text>
              <div className="flex flex-col gap-1">
                {(() => {
                  const secondBattingTeam = innings[1]?.batting_team === 'team_a' ? match.team_a : match.team_b;
                  return secondBattingTeam.players.map((p) => {
                    const isStriker = inn2Striker === p.id;
                    const isNonStriker = inn2NonStriker === p.id;
                    const isSelected = isStriker || isNonStriker;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          if (isStriker) { setInn2Striker(null); return; }
                          if (isNonStriker) { setInn2NonStriker(null); return; }
                          if (!inn2Striker) { setInn2Striker(p.id); return; }
                          if (!inn2NonStriker) { setInn2NonStriker(p.id); return; }
                        }}
                        className={cn(
                          'flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer select-none',
                          'border transition-all duration-150 active:scale-[0.96]',
                          isSelected
                            ? 'border-[var(--cricket)]/50 bg-[var(--cricket)]/10'
                            : 'border-[var(--border)] bg-[var(--surface)]',
                        )}
                      >
                        <Text size="sm" weight={isSelected ? 'semibold' : 'medium'}>{displayName(p)}</Text>
                        {isStriker && <Text size="2xs" weight="bold" color="cricket">Striker</Text>}
                        {isNonStriker && <Text size="2xs" weight="bold" color="cricket">Non-Striker</Text>}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Opening bowler — team bowling 2nd */}
            <div>
              <Text size="xs" weight="semibold" color="muted" uppercase tracking="wider" className="mb-2">
                Opening Bowler
              </Text>
              <div className="flex flex-col gap-1">
                {(() => {
                  const secondBowlingTeam = innings[1]?.batting_team === 'team_a' ? match.team_b : match.team_a;
                  return secondBowlingTeam.players.map((p) => {
                    const isSelected = inn2Bowler === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setInn2Bowler(isSelected ? null : p.id)}
                        className={cn(
                          'flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer select-none',
                          'border transition-all duration-150 active:scale-[0.96]',
                          isSelected
                            ? 'border-[var(--cricket)]/50 bg-[var(--cricket)]/10'
                            : 'border-[var(--border)] bg-[var(--surface)]',
                        )}
                      >
                        <Text size="sm" weight={isSelected ? 'semibold' : 'medium'}>{displayName(p)}</Text>
                        {isSelected && <Text size="2xs" weight="bold" color="cricket">Bowler</Text>}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Start button */}
            <Button
              variant="primary"
              brand="cricket"
              size="lg"
              fullWidth
              disabled={!inn2Striker || !inn2NonStriker || !inn2Bowler || inn2Striker === inn2NonStriker}
              onClick={() => {
                if (inn2Striker && inn2NonStriker && inn2Bowler) {
                  useScoringStore.getState().startSecondInnings(inn2Striker, inn2NonStriker, inn2Bowler);
                  setInningsBreak(false);
                  setActiveTab('scoring');
                }
              }}
            >
              Start 2nd Innings
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { ScoringScreen };
export type { ScoringScreenProps };
