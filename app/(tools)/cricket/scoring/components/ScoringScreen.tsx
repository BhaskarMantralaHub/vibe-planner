'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Button, SegmentedControl, Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter, RefreshButton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { PageFooter } from '@/components/PageFooter';
import { MdSportsCricket } from 'react-icons/md';
import { GiTennisBall } from 'react-icons/gi';
import { useScoringStore } from '@/stores/scoring-store';
import { useCricketStore } from '@/stores/cricket-store';
import { isCloudMode, getSupabaseClient } from '@/lib/supabase/client';
import { Scoreboard } from './Scoreboard';
import { OverTimeline } from './OverTimeline';
import { ButtonGrid } from './ButtonGrid';
import { FreeHitBanner } from './FreeHitBanner';
import PlayerPickerRow from '@/app/(tools)/cricket/components/PlayerPickerRow';
import { WicketSheet } from './WicketSheet';
import { RetireSheet } from './RetireSheet';
import { AddPlayerSheet } from './AddPlayerSheet';
import { ExtrasSheet, type ExtrasType } from './ExtrasSheet';
import { EndOfOverSheet } from './EndOfOverSheet';
import { BallByBallLog } from './BallByBallLog';
import { FullScorecard } from './FullScorecard';
import type { WicketType, TeamSide, ScoringBall } from '@/types/scoring';
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
  onRefresh?: () => Promise<void>;
  readOnly?: boolean;
}

function ScoringScreen({ onBack, onRefresh, readOnly = false }: ScoringScreenProps) {
  const router = useRouter();

  /* ── Store state — spectator reads from separate fields ── */
  const match = useScoringStore(readOnly ? (s) => s.spectatorMatch : (s) => s.match);
  const innings = useScoringStore(readOnly ? (s) => s.spectatorInnings : (s) => s.innings);
  const balls = useScoringStore(readOnly ? (s) => s.spectatorBalls : (s) => s.balls);
  const isFreeHit = useScoringStore((s) => readOnly ? false : s.isFreeHit);

  // Stable empty references for readOnly mode (avoids infinite re-render from new [] each call)
  const actionStack = useScoringStore((s) => s.actionStack);
  const redoActionStack = useScoringStore((s) => s.redoActionStack);
  const takenOverBy = useScoringStore((s) => s.takenOverBy);
  const redoStack = useScoringStore((s) => s.redoStack);
  // In readOnly mode, these values are ignored — the Scoring tab + ButtonGrid are hidden

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
    getRetiredBatsmen,
    retireBatsman,
    addPlayerToMatch,
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
  const [retireOpen, setRetireOpen] = useState(false);
  const [addPlayerOpen, setAddPlayerOpen] = useState<TeamSide | null>(null);
  const [removePlayerConfirm, setRemovePlayerConfirm] = useState<{ id: string; name: string; teamSide: TeamSide } | null>(null);
  const [changeBowlerOpen, setChangeBowlerOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [extrasType, setExtrasType] = useState<ExtrasType>('wide');
  const [endOfOverOpen, setEndOfOverOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'scoring' | 'ballbyball' | 'scorecard' | 'squads'>(readOnly ? 'ballbyball' : 'scoring');
  const [endMatchOpen, setEndMatchOpen] = useState(false);
  const [inningsBreak, setInningsBreak] = useState(false);
  const [inn2Striker, setInn2Striker] = useState<string | null>(null);
  const [inn2NonStriker, setInn2NonStriker] = useState<string | null>(null);
  const [inn2Bowler, setInn2Bowler] = useState<string | null>(null);

  /* ── Derived data — computed from match/innings/balls (works for both scorer + spectator) ── */
  const idx = match?.current_innings ?? 0;
  const currentInnings = useMemo(() => innings[idx], [innings, idx]);

  const playerMap = useMemo(() => {
    if (!match) return new Map();
    return buildPlayerMap(match);
  }, [match]);

  // Over timeline balls — computed locally (not via store getter that reads main state)
  const currentOverBalls = useMemo(() => {
    if (!match) return [];
    const inningsBalls = balls.filter((b) => b.innings === idx);
    const legalBalls = inningsBalls.filter((b) => b.is_legal).length;
    const currentOverNum = Math.floor(legalBalls / 6);
    if (legalBalls > 0 && legalBalls % 6 === 0 && innings[idx].bowler_id) {
      return inningsBalls.filter((b) => b.over_number === currentOverNum).map(scoringBallToBallResult);
    }
    return inningsBalls.filter((b) => b.over_number === (legalBalls > 0 ? currentOverNum : 0)).map(scoringBallToBallResult);
  }, [balls, match, idx, innings]);

  // Helper: compute batting stats from local data (spectator-safe, no store getters)
  const localBattingStats_ = useCallback((innIdx: number) => {
    if (!match) return [];
    const inn = innings[innIdx];
    const battingTeam = inn.batting_team === 'team_a' ? match.team_a : match.team_b;
    const ib = balls.filter((b: ScoringBall) => b.innings === innIdx);
    const bIds = new Set<string>();
    for (const b of ib) bIds.add(b.striker_id);
    if (inn.striker_id) bIds.add(inn.striker_id);
    if (inn.non_striker_id) bIds.add(inn.non_striker_id);
    return battingTeam.players.filter((p) => bIds.has(p.id)).map((player) => {
      let runs = 0, bf = 0, fours = 0, sixes = 0, isOut = false;
      let howOut: string | null = null;
      for (const b of ib) {
        if (b.striker_id === player.id) { runs += b.runs_bat; if (b.is_legal) bf++; if (b.extras_type === 'no_ball') bf++; if (b.runs_bat === 4) fours++; if (b.runs_bat === 6) sixes++; }
        if (b.is_wicket && b.wicket_type !== 'retired' && b.dismissed_id === player.id) { isOut = true; howOut = b.wicket_type ?? 'out'; }
      }
      const isRetired = !isOut && inn.retired_players.some((r) => r.playerId === player.id && !r.returned);
      return { player, runs, balls: bf, fours, sixes, strike_rate: bf > 0 ? parseFloat(((runs / bf) * 100).toFixed(1)) : 0, is_out: isOut, how_out: isRetired ? 'retired' : howOut };
    });
  }, [match, innings, balls]);

  const localBowlingStats_ = useCallback((innIdx: number) => {
    if (!match) return [];
    const inn = innings[innIdx];
    const bowlingTeam = inn.batting_team === 'team_a' ? match.team_b : match.team_a;
    const ib = balls.filter((b: ScoringBall) => b.innings === innIdx);
    const bIds = new Set<string>();
    for (const b of ib) bIds.add(b.bowler_id);
    if (inn.bowler_id) bIds.add(inn.bowler_id);
    return bowlingTeam.players.filter((p) => bIds.has(p.id)).map((player) => {
      let rc = 0, w = 0, lb = 0, wd = 0, nb = 0, maidens = 0;
      const or = new Map<number, number>();
      for (const b of ib) {
        if (b.bowler_id !== player.id) continue;
        rc += b.runs_bat + b.runs_extras; if (b.is_wicket && b.wicket_type !== 'retired') w++; if (b.is_legal) lb++; if (b.extras_type === 'wide') wd++; if (b.extras_type === 'no_ball') nb++;
        if (b.is_legal) or.set(b.over_number, (or.get(b.over_number) ?? 0) + b.runs_bat + b.runs_extras);
      }
      for (const [, r] of or) { if (r === 0) maidens++; }
      return { player, overs: `${Math.floor(lb / 6)}.${lb % 6}`, maidens, runs: rc, wickets: w, economy: lb > 0 ? (rc / lb) * 6 : 0, wides: wd, no_balls: nb };
    });
  }, [match, innings, balls]);

  const battingStats = useMemo(() => readOnly ? localBattingStats_(idx) : getBattingStats(idx), [balls, idx, innings, readOnly, localBattingStats_]);
  const bowlingStats = useMemo(() => readOnly ? localBowlingStats_(idx) : getBowlingStats(idx), [balls, idx, innings, readOnly, localBowlingStats_]);

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

  /* ── Proactive scorer check — detect takeover on mount/resume ── */
  useEffect(() => {
    if (!match || match.status === 'completed' || takenOverBy || readOnly) return;
    const { dbMatchId } = useScoringStore.getState();
    if (!dbMatchId || !isCloudMode()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    // Check if we're still the active scorer
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from('practice_matches')
          .select('active_scorer_id, scorer_name')
          .eq('id', dbMatchId)
          .single() as { data: { active_scorer_id: string | null; scorer_name: string | null } | null };
        if (data?.active_scorer_id && data.active_scorer_id !== user.id) {
          useScoringStore.setState({ takenOverBy: data.scorer_name || 'Another player' });
        }
      } catch (err) { console.error('[scoring] proactive scorer check failed:', err); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── End of over detection ── */
  const legalBallCount = useMemo(() => {
    return balls.filter((b) => b.innings === idx && b.is_legal).length;
  }, [balls, idx]);

  const prevLegalBallCountRef = useRef(legalBallCount);
  const mountedRef = useRef(false);

  useEffect(() => {
    const prev = prevLegalBallCountRef.current;
    prevLegalBallCountRef.current = legalBallCount;

    if (!mountedRef.current) {
      mountedRef.current = true;
      // On mount: if at an over boundary and bowler hasn't been changed yet,
      // re-show the selection (handles page refresh before bowler was chosen)
      if (
        match?.status === 'scoring' &&
        legalBallCount > 0 &&
        legalBallCount % 6 === 0 &&
        !currentInnings.is_completed
      ) {
        // Check if the current bowler is the same as the last over's bowler
        // If so, the user hasn't selected a new bowler yet — show the modal
        const lastOverNum = Math.floor((legalBallCount - 1) / 6);
        const lastOverBowler = balls.find(
          (b) => b.innings === idx && b.is_legal && b.over_number === lastOverNum
        )?.bowler_id;
        if (lastOverBowler && currentInnings.bowler_id === lastOverBowler) {
          setEndOfOverOpen(true);
        }
      }
      return;
    }

    // Normal flow: detect legal balls crossing a multiple of 6
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
    // Close any open sheets — undo may reverse end-of-over, wicket, or retirement
    setWicketOpen(false);
    setRetireOpen(false);
    setExtrasOpen(false);
    setEndOfOverOpen(false);
  }, [undoLastBall]);

  const handleRedo = useCallback(() => {
    redoLastBall();
  }, [redoLastBall]);

  const handleRetireConfirm = useCallback((retiredId: string, replacementId: string) => {
    const retiredName = playerMap.get(retiredId);
    const replacementName = playerMap.get(replacementId);
    retireBatsman(retiredId, replacementId);
    setRetireOpen(false);
    toast.success(`${retiredName ? displayName(retiredName) : 'Batsman'} retired. ${replacementName ? displayName(replacementName) : 'Replacement'} now batting.`);
  }, [retireBatsman, playerMap]);

  const handleEndMatch = useCallback(() => {
    setEndMatchOpen(true);
  }, []);

  const confirmEndMatch = useCallback(async () => {
    setShowResultScreen(true);
    setEndMatchOpen(false);
    await endMatch();
  }, [endMatch]);

  const handleSelectBowler = useCallback((bowlerId: string) => {
    setBowler(bowlerId);
    setEndOfOverOpen(false);
  }, [setBowler]);

  const handleSwapStrike = useCallback(() => {
    useScoringStore.getState().swapStrike();
  }, []);

  /* ── Hooks that need to run regardless of `match` — must stay above the
      `if (!match) return null` guard to keep React's hook order stable.
      Each handles `!match` internally. ── */
  const [showResultScreen, setShowResultScreen] = useState(true);

  const scorecardInn1 = useMemo(() => {
    if (!match) return null;
    const bs1 = readOnly ? localBattingStats_(0) : getBattingStats(0);
    const bw1 = readOnly ? localBowlingStats_(0) : getBowlingStats(0);
    return buildInningsSummary(0, match, innings[0], bs1, bw1, balls, playerMap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, innings, balls, playerMap, readOnly, localBattingStats_, localBowlingStats_]);

  const scorecardInn2 = useMemo(() => {
    if (!match || !innings[1].total_overs) return null;
    const bs2 = readOnly ? localBattingStats_(1) : getBattingStats(1);
    const bw2 = readOnly ? localBowlingStats_(1) : getBowlingStats(1);
    return buildInningsSummary(1, match, innings[1], bs2, bw2, balls, playerMap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, innings, balls, playerMap, readOnly, localBattingStats_, localBowlingStats_]);

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
  const retiredBatsmen = getRetiredBatsmen().map((p) => ({
    id: p.id, name: displayName(p), retiredRuns: p.retiredRuns, retiredBalls: p.retiredBalls,
  }));

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

  // Safety valve: if ALL bowlers are justBowled (tiny team), allow all to prevent stuck modal
  if (allBowlerFigures.length > 0 && allBowlerFigures.every((b) => b.justBowled)) {
    allBowlerFigures.forEach((b) => { b.justBowled = false; });
  }

  // Completed over number for sheet title
  const completedOverNumber = legalBallCount > 0 ? Math.ceil(legalBallCount / 6) : 0;
  const lastOverBalls = balls.filter((b) => b.innings === idx && b.over_number === completedOverNumber - 1);
  const lastOverRuns = lastOverBalls.reduce((s, b) => s + b.runs_bat + b.runs_extras, 0);

  /* ── Match Completed Screen — hooks already declared above the guard ── */

  if (match.status === 'completed' && showResultScreen) {
    const inn1 = innings[0];
    const inn2 = innings[1];
    const team1Name = inn1.batting_team === 'team_a' ? match.team_a.name : match.team_b.name;
    const team2Name = inn2.batting_team === 'team_a' ? match.team_a.name : match.team_b.name;
    const isWin = match.result_summary?.includes('won');
    const isTie = match.result_summary?.includes('tied');

    return (
      <div className="min-h-[100dvh]" style={{ background: 'var(--bg)' }}>
        {/* Gradient hero — taller with glow */}
        <div
          className="relative px-4 pt-16 pb-6 text-center"
          style={{
            background: 'linear-gradient(180deg, var(--cricket-deep, #1B3A6B) 0%, var(--cricket) 70%, color-mix(in srgb, var(--cricket) 80%, white) 100%)',
          }}
        >
          {/* Back + Refresh buttons */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
            <button
              onClick={() => { useScoringStore.getState().reset(); if (onBack) onBack(); }}
              className="flex items-center gap-1 cursor-pointer active:scale-[0.92] transition-all"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              <Text size="sm" weight="medium" color="white" className="opacity-70">Back</Text>
            </button>
            {onRefresh && (
              <RefreshButton onRefresh={onRefresh} variant="glass" title="Refresh scores" />
            )}
          </div>
          <Text as="p" size="xs" weight="bold" color="white" uppercase tracking="wider" className="opacity-60 mb-3">
            Match Result
          </Text>
          <Text as="h1" size="xl" weight="bold" color="white" className="leading-snug mb-6">
            {match.result_summary ?? 'Match Complete'}
          </Text>

          {/* Score card — inside the hero gradient, white card */}
          <div className="rounded-2xl overflow-hidden text-left mx-auto max-w-md" style={{ background: 'var(--card)', boxShadow: '0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 0 var(--inner-glow)' }}>
            {/* 1st innings */}
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Text size="md" weight="bold">{team1Name}</Text>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase" style={{ background: 'color-mix(in srgb, var(--cricket) 10%, var(--surface))', color: 'var(--dim)' }}>1st</span>
              </div>
              <div className="flex items-baseline gap-0.5">
                <Text size="2xl" weight="bold" tabular>{inn1.total_runs}</Text>
                <Text size="md" weight="medium" color="dim" tabular>/{inn1.total_wickets}</Text>
                <Text size="xs" weight="normal" color="dim" tabular className="ml-1.5">({formatOversDisplay(inn1.total_overs)})</Text>
              </div>
            </div>
            <div className="mx-5" style={{ borderTop: '1px solid color-mix(in srgb, var(--cricket) 8%, var(--border))' }} />
            {/* 2nd innings */}
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Text size="md" weight="bold">{team2Name}</Text>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase" style={{ background: 'color-mix(in srgb, var(--cricket) 10%, var(--surface))', color: 'var(--dim)' }}>2nd</span>
              </div>
              <div className="flex items-baseline gap-0.5">
                <Text size="2xl" weight="bold" tabular>{inn2.total_runs}</Text>
                <Text size="md" weight="medium" color="dim" tabular>/{inn2.total_wickets}</Text>
                <Text size="xs" weight="normal" color="dim" tabular className="ml-1.5">({formatOversDisplay(inn2.total_overs)})</Text>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 mt-5">

          {/* Match Highlights */}
          {(() => {
            const allBatting = [...getBattingStats(0), ...getBattingStats(1)];
            const allBowling = [...getBowlingStats(0), ...getBowlingStats(1)];
            const topScorer = allBatting.length > 0 ? allBatting.reduce((a, b) => a.runs > b.runs ? a : b) : null;
            const bestBowler = allBowling.filter((b) => b.wickets > 0).length > 0
              ? allBowling.filter((b) => b.wickets > 0).reduce((a, b) => a.wickets > b.wickets ? a : (a.wickets === b.wickets && parseFloat(String(a.economy)) < parseFloat(String(b.economy)) ? a : b))
              : null;
            const totalFours = allBatting.reduce((s, b) => s + b.fours, 0);
            const totalSixes = allBatting.reduce((s, b) => s + b.sixes, 0);
            const totalBalls = balls.filter((b) => b.is_legal).length;

            return (topScorer || bestBowler) ? (
              <div className="mt-5 space-y-3">
                <Text size="xs" weight="bold" color="dim" uppercase tracking="wider" className="px-1">Match Highlights</Text>

                <div className="grid grid-cols-2 gap-3">
                  {/* Top Scorer */}
                  {topScorer && (
                    <div className="rounded-xl px-4 py-4" style={{ background: 'color-mix(in srgb, var(--cricket) 8%, var(--card))', border: '1px solid color-mix(in srgb, var(--cricket) 15%, var(--border))' }}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <MdSportsCricket size={16} style={{ color: 'var(--cricket)' }} />
                        <Text size="xs" weight="bold" color="cricket" uppercase tracking="wider">Top Scorer</Text>
                      </div>
                      <Text as="p" size="md" weight="bold" truncate>{displayName(topScorer.player)}</Text>
                      <div className="flex items-baseline gap-1.5 mt-1.5">
                        <Text size="2xl" weight="bold" tabular>{topScorer.runs}</Text>
                        <Text size="sm" color="muted" tabular>({topScorer.balls}b)</Text>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <Text size="xs" weight="medium" color="muted" tabular>SR {topScorer.strike_rate.toFixed(1)}</Text>
                        {topScorer.fours > 0 && <Text size="xs" weight="semibold" tabular style={{ color: '#2563EB' }}>4s: {topScorer.fours}</Text>}
                        {topScorer.sixes > 0 && <Text size="xs" weight="semibold" tabular style={{ color: '#7C3AED' }}>6s: {topScorer.sixes}</Text>}
                      </div>
                    </div>
                  )}

                  {/* Best Bowler */}
                  {bestBowler && (
                    <div className="rounded-xl px-4 py-4" style={{ background: 'color-mix(in srgb, #3B82F6 8%, var(--card))', border: '1px solid color-mix(in srgb, #3B82F6 15%, var(--border))' }}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <GiTennisBall size={15} style={{ color: '#3B82F6' }} />
                        <Text size="xs" weight="bold" uppercase tracking="wider" style={{ color: '#3B82F6' }}>Best Bowler</Text>
                      </div>
                      <Text as="p" size="md" weight="bold" truncate>{displayName(bestBowler.player)}</Text>
                      <div className="flex items-baseline gap-1.5 mt-1.5">
                        <Text size="2xl" weight="bold" tabular>{bestBowler.wickets}</Text>
                        <Text size="sm" color="muted" tabular>/ {bestBowler.runs}</Text>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <Text size="xs" weight="medium" color="muted" tabular>{bestBowler.overs} ov</Text>
                        <Text size="xs" weight="medium" color="muted" tabular>Econ {bestBowler.economy}</Text>
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick stats row */}
                <div className="grid grid-cols-4 rounded-xl py-3.5" style={{ background: 'color-mix(in srgb, var(--surface) 60%, var(--card))', border: '1px solid color-mix(in srgb, var(--border) 40%, transparent)' }}>
                  <div className="flex flex-col items-center gap-0.5">
                    <Text size="xl" weight="bold" tabular style={{ color: '#2563EB' }}>{totalFours}</Text>
                    <Text size="2xs" weight="semibold" color="dim" uppercase>Fours</Text>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 border-l" style={{ borderColor: 'color-mix(in srgb, var(--border) 40%, transparent)' }}>
                    <Text size="xl" weight="bold" tabular style={{ color: '#7C3AED' }}>{totalSixes}</Text>
                    <Text size="2xs" weight="semibold" color="dim" uppercase>Sixes</Text>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 border-l" style={{ borderColor: 'color-mix(in srgb, var(--border) 40%, transparent)' }}>
                    <Text size="xl" weight="bold" tabular>{totalBalls}</Text>
                    <Text size="2xs" weight="semibold" color="dim" uppercase>Balls</Text>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 border-l" style={{ borderColor: 'color-mix(in srgb, var(--border) 40%, transparent)' }}>
                    <Text size="xl" weight="bold" tabular>{inn1.total_runs + inn2.total_runs}</Text>
                    <Text size="2xs" weight="semibold" color="dim" uppercase>Runs</Text>
                  </div>
                </div>
              </div>
            ) : null;
          })()}

          {/* Actions */}
          <div className="flex flex-col gap-3 mt-6">
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
          {onRefresh && (
            <RefreshButton onRefresh={onRefresh} variant="bordered" title="Refresh scores" />
          )}
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
      <div className="mx-4 mt-3 rounded-xl overflow-hidden" style={{ background: 'var(--card)', boxShadow: '0 2px 12px rgba(0,0,0,0.06), inset 0 1px 0 0 var(--inner-glow)', border: '1px solid color-mix(in srgb, var(--cricket) 10%, var(--border))' }}>
        {/* Striker */}
        {strikerPlayer ? (
          <button
            type="button"
            onClick={!currentInnings.is_completed ? handleSwapStrike : undefined}
            className="w-full text-left px-4 py-3 border-l-[3px] cursor-pointer active:scale-[0.98] transition-all"
            style={{
              borderLeftColor: 'var(--cricket)',
              background: 'color-mix(in srgb, var(--cricket) 6%, var(--card))',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 min-w-0 flex-1">
                <Text size="md" weight="bold" truncate>{displayName(strikerPlayer)}</Text>
                {!currentInnings.is_completed && <Text size="sm" weight="bold" color="cricket" className="flex-shrink-0">*</Text>}
                {currentInnings.is_completed && <Text size="2xs" weight="medium" color="success" className="flex-shrink-0 ml-1">not out</Text>}
              </div>
              <div className="flex items-baseline gap-0.5 flex-shrink-0">
                <Text size="xl" weight="bold" tabular>{strikerStats?.runs ?? 0}</Text>
                <Text size="xs" weight="normal" color="muted" tabular>({strikerStats?.balls ?? 0})</Text>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <Text size="xs" weight="medium" color="muted" tabular>4s: {strikerStats?.fours ?? 0}</Text>
              <Text size="xs" weight="medium" color="muted" tabular>6s: {strikerStats?.sixes ?? 0}</Text>
              <Text size="xs" weight="medium" color="dim" tabular>SR: {strikerStats?.strike_rate?.toFixed(1) ?? '0.0'}</Text>
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

        {/* Bowler — tappable to change before first ball of the over */}
        {(() => {
          const inningsBallCount = balls.filter((b) => b.innings === idx).length;
          const canChangeBowler = !currentInnings.is_completed && inningsBallCount === 0;
          return (
            <button
              type="button"
              onClick={canChangeBowler ? () => setChangeBowlerOpen(true) : undefined}
              className={cn(
                'w-full px-4 py-2.5 flex items-center gap-2',
                canChangeBowler && 'cursor-pointer active:scale-[0.98] transition-all',
              )}
              style={{ borderTop: '1px solid color-mix(in srgb, var(--border) 40%, transparent)', background: 'color-mix(in srgb, var(--surface) 50%, var(--card))' }}
            >
              <Text size="2xs" weight="bold" color="dim" uppercase tracking="wider" className="flex-shrink-0">Bowl</Text>
              <Text size="sm" weight="semibold" truncate className="min-w-0">{bowlerPlayer ? displayName(bowlerPlayer) : 'TBD'}</Text>
              {canChangeBowler && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: 'var(--muted)' }}>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              )}
              <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                <Text size="xs" color="muted" tabular>{currentBowlerStats?.overs ?? '0.0'}ov</Text>
                <Text size="xs" weight="semibold" tabular>{currentBowlerStats?.wickets ?? 0}w</Text>
                <Text size="xs" color="muted" tabular>{currentBowlerStats?.runs ?? 0}r</Text>
                <Text size="xs" color="muted" tabular>{currentBowlerStats ? currentBowlerStats.economy.toFixed(1) : '0.0'}er</Text>
              </div>
            </button>
          );
        })()}
      </div>

      {/* ── Over Timeline ── */}
      <div className="mt-1.5">
        <OverTimeline balls={currentOverBalls} overNumber={Math.floor(currentInnings.total_overs)} />
      </div>

      {/* ── Free Hit Banner ── */}
      {isFreeHit && <div className="mt-1"><FreeHitBanner visible /></div>}

      {/* ── Info Strip ── */}
      <div className="flex items-center justify-center gap-3 px-4 py-1.5">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--cricket) 6%, var(--surface))' }}>
          <Text size="2xs" weight="medium" color="dim">P&apos;ship</Text>
          <Text size="xs" weight="bold" tabular>{partnership.runs}</Text>
          <Text size="2xs" weight="normal" color="dim" tabular>({partnership.balls}b)</Text>
        </div>
        {prevOver && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--surface) 80%, var(--border))' }}>
            <Text size="2xs" weight="medium" color="dim">Prev</Text>
            <Text size="xs" weight="bold" tabular>{prevOver.runs}r</Text>
            <Text size="2xs" weight="normal" color="dim" truncate>({prevOver.bowlerName})</Text>
          </div>
        )}
      </div>

      {/* ── Segmented Control ── */}
      <SegmentedControl
        options={[
          ...(match.status !== 'completed' && !readOnly ? [{ key: 'scoring', label: 'Scoring' }] : []),
          { key: 'ballbyball', label: 'Ball by Ball' },
          { key: 'scorecard', label: 'Scorecard' },
          { key: 'squads', label: 'Squads' },
        ]}
        active={(match.status === 'completed' || readOnly) && activeTab === 'scoring' ? 'ballbyball' : activeTab}
        onChange={(key) => setActiveTab(key as 'scoring' | 'ballbyball' | 'scorecard' | 'squads')}
        className="mx-4 mb-2"
      />

      {/* ── Tab Content ── */}
      {activeTab === 'scoring' && !readOnly && (
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
                  onClick={async () => {
                    setShowResultScreen(true);
                    await useScoringStore.getState().endMatch();
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
              onRetire={canScore ? () => setRetireOpen(true) : undefined}
              /* canUndo must check balls.length too — actionStack is cleared on page refresh/resumeMatch
                 but balls persist. Without this, undo is disabled after refresh even with balls to undo. */
              canUndo={actionStack.length > 0 || balls.length > 0}
              canRedo={redoStack.length > 0 || redoActionStack.length > 0}
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
          {[match.team_a, match.team_b].map((team, tidx) => {
            const teamSide: TeamSide = tidx === 0 ? 'team_a' : 'team_b';
            const isBatting = innings[match.current_innings].batting_team === teamSide;
            const isActive = match.status === 'scoring' || match.status === 'innings_break';
            return (
              <div key={teamSide} className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid color-mix(in srgb, var(--cricket) 12%, var(--border))', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                <div className="px-4 py-3 flex items-center justify-between"
                  style={{
                    background: 'linear-gradient(135deg, var(--cricket-deep, #1B3A6B) 0%, var(--cricket) 60%, color-mix(in srgb, var(--cricket) 80%, white) 100%)',
                    boxShadow: '0 2px 8px color-mix(in srgb, var(--cricket) 20%, transparent)',
                  }}>
                  <Text size="sm" weight="bold" color="white">{team.name}</Text>
                  <div className="flex items-center gap-2">
                    {isActive && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: isBatting ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', color: 'white' }}>
                        {isBatting ? 'Batting' : 'Bowling'}
                      </span>
                    )}
                    <Text size="2xs" color="white" weight="medium" className="opacity-70">{team.players.length} players</Text>
                  </div>
                </div>
                <div className="px-2 py-2 space-y-1">
                  {[...team.players].sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
                    const removable = isActive && useScoringStore.getState().canRemovePlayer(p.id);
                    const rosterPlayer = p.player_id ? rosterPlayers.find((rp) => rp.id === p.player_id) : null;
                    return (
                      <div key={p.id} className="flex items-center gap-1">
                        <div className="flex-1">
                          <PlayerPickerRow
                            player={{
                              ...p,
                              photo_url: p.player_id ? photoMap.get(p.player_id) ?? null : null,
                              player_role: rosterPlayer?.player_role ?? null,
                            }}
                            selected={false}
                            onToggle={() => {}}
                            mode="highlight"
                            badge={team.captain_id === p.id ? 'C' : undefined}
                          />
                        </div>
                        {removable && !readOnly && (
                          <button
                            onClick={() => setRemovePlayerConfirm({ id: p.id, name: displayName(p), teamSide })}
                            className="flex-shrink-0 p-1.5 rounded-lg cursor-pointer transition-all active:scale-[0.9] hover:bg-[var(--red)]/10"
                            title="Remove player"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--red)' }}>
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {isActive && !readOnly && (
                  <div className="px-3 py-2.5" style={{ borderTop: '1px solid color-mix(in srgb, var(--border) 30%, transparent)' }}>
                    <button
                      onClick={() => setAddPlayerOpen(teamSide)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 transition-all cursor-pointer active:scale-[0.98]"
                      style={{
                        border: '1.5px dashed color-mix(in srgb, var(--cricket) 30%, var(--border))',
                        background: 'color-mix(in srgb, var(--cricket) 3%, var(--surface))',
                        color: 'var(--cricket)',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      <Text size="xs" weight="semibold" color="cricket">Add Player</Text>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Player Sheet */}
      {addPlayerOpen && (
        <AddPlayerSheet
          open={!!addPlayerOpen}
          onOpenChange={(v) => { if (!v) setAddPlayerOpen(null); }}
          teamSide={addPlayerOpen}
          teamName={addPlayerOpen === 'team_a' ? match.team_a.name : match.team_b.name}
          existingPlayerIds={new Set([
            ...match.team_a.players.map((p) => p.player_id).filter(Boolean) as string[],
            ...match.team_b.players.map((p) => p.player_id).filter(Boolean) as string[],
          ])}
          rosterPlayers={rosterPlayers.filter((p) => p.is_active).map((p) => ({
            id: p.id, name: p.name, jersey_number: p.jersey_number ?? null,
            photo_url: p.photo_url ?? null, is_guest: p.is_guest ?? false,
          }))}
          guestSuggestions={useScoringStore.getState().guestSuggestions}
          onAddPlayer={addPlayerToMatch}
        />
      )}

      {/* Change Bowler Dialog */}
      <Dialog open={changeBowlerOpen} onOpenChange={setChangeBowlerOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto" showClose>
          <DialogTitle>Change Opening Bowler</DialogTitle>
          <div className="flex flex-col gap-1.5 mt-1">
            {getBowlingTeamPlayers().map((p) => {
              const isCurrentBowler = p.id === currentInnings.bowler_id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setBowler(p.id);
                    setChangeBowlerOpen(false);
                    toast.success(`${displayName(p)} will bowl`);
                  }}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer select-none',
                    'border transition-all duration-150 active:scale-[0.96]',
                    isCurrentBowler
                      ? 'border-[var(--cricket)] bg-[var(--cricket)]/10'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--cricket)]/50',
                  )}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                    style={{
                      background: isCurrentBowler ? 'var(--cricket)' : 'color-mix(in srgb, var(--cricket) 15%, var(--card))',
                      color: isCurrentBowler ? 'white' : 'var(--cricket)',
                    }}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <Text size="sm" weight={isCurrentBowler ? 'bold' : 'medium'}>{displayName(p)}</Text>
                  {isCurrentBowler && <Text size="2xs" color="cricket" className="ml-auto">Current</Text>}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Player Confirmation */}
      {removePlayerConfirm && (
        <Dialog open={!!removePlayerConfirm} onOpenChange={(v) => { if (!v) setRemovePlayerConfirm(null); }}>
          <DialogContent showClose>
            <DialogHeader>
              <DialogTitle>Remove {removePlayerConfirm.name}?</DialogTitle>
              <DialogDescription>
                This player hasn&apos;t participated yet. You can remove them or move to the other team.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2.5 mt-3">
              <Button
                variant="primary"
                brand="cricket"
                size="lg"
                fullWidth
                onClick={() => {
                  const { id, teamSide: fromTeam } = removePlayerConfirm;
                  const toTeam: TeamSide = fromTeam === 'team_a' ? 'team_b' : 'team_a';
                  const team = fromTeam === 'team_a' ? match.team_a : match.team_b;
                  const player = team.players.find((p) => p.id === id);
                  setRemovePlayerConfirm(null);
                  if (!player) return;
                  useScoringStore.getState().removePlayerFromMatch(fromTeam, id).then(async (ok) => {
                    if (!ok) return;
                    const addOk = await useScoringStore.getState().addPlayerToMatch(toTeam, { ...player, id: crypto.randomUUID() });
                    if (!addOk) {
                      // Recovery: add back to original team
                      await useScoringStore.getState().addPlayerToMatch(fromTeam, { ...player, id: crypto.randomUUID() });
                      toast.error('Move failed — player restored to original team');
                    }
                  });
                }}
              >
                Move to {removePlayerConfirm.teamSide === 'team_a' ? match.team_b.name : match.team_a.name}
              </Button>
              <div className="flex items-center gap-2 w-full">
                <Button
                  variant="secondary"
                  size="lg"
                  className="flex-1"
                  onClick={() => setRemovePlayerConfirm(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="lg"
                  className="flex-1"
                  onClick={() => {
                    const { teamSide, id } = removePlayerConfirm;
                    setRemovePlayerConfirm(null);
                    useScoringStore.getState().removePlayerFromMatch(teamSide, id);
                  }}
                >
                  Remove
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Undo is now integrated into ButtonGrid's extras row */}

      {/* Separator + footer */}
      <div className="mx-4 mt-8 border-t border-[var(--border)]/40" />
      <PageFooter className="mt-4" />

      {/* Safe area bottom padding */}
      <div className="pb-[max(env(safe-area-inset-bottom),20px)]" />

      {/* ── Sheets (use portals, render to document.body) ── */}
      {currentBatsmen && (
        <>
          <WicketSheet
            open={wicketOpen}
            onOpenChange={setWicketOpen}
            battingTeam={[...yetToBat, ...currentBatsmen]}
            bowlingTeam={bowlingTeamPlayers}
            currentBowlerId={currentInnings.bowler_id ?? undefined}
            currentBatsmen={currentBatsmen}
            retiredBatsmen={retiredBatsmen}
            onConfirm={handleWicketConfirm}
          />
          <RetireSheet
            open={retireOpen}
            onOpenChange={setRetireOpen}
            striker={currentBatsmen[0]}
            nonStriker={currentBatsmen[1]}
            yetToBat={yetToBat}
            retiredBatsmen={retiredBatsmen}
            onConfirm={handleRetireConfirm}
          />
        </>
      )}

      <ExtrasSheet
        open={extrasOpen}
        onOpenChange={setExtrasOpen}
        type={extrasType}
        onConfirm={handleExtrasConfirm}
      />

      <EndOfOverSheet
        open={endOfOverOpen}
        overNumber={completedOverNumber}
        overRuns={lastOverRuns}
        bowlers={allBowlerFigures}
        onSelectBowler={handleSelectBowler}
        onUndo={handleUndo}
        onExit={onBack}
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

      {/* Scorer Takeover Detection — another player claimed scoring rights */}
      <Dialog open={!!takenOverBy} onOpenChange={() => { /* Non-dismissable */ }}>
        <DialogContent showClose={false} onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Scoring Taken Over</DialogTitle>
            <DialogDescription>
              <Text as="span" weight="semibold" style={{ color: 'var(--cricket)' }}>{takenOverBy}</Text> has taken over scoring for this match. Your changes since the takeover may not have been saved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="primary" brand="cricket" fullWidth onClick={async () => {
              useScoringStore.setState({ takenOverBy: null });
              useScoringStore.getState().reset();
              // Await refresh so landing page shows current DB state (not stale cache)
              await useScoringStore.getState().loadMatchHistory();
              if (onBack) onBack();
            }}>
              Back to Home
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
