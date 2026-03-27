import { create } from 'zustand';
import type {
  ScoringMatch,
  ScoringInnings,
  ScoringBall,
  ScoringTeam,
  ScoringPlayer,
  TeamSide,
  TossDecision,
  ExtrasType,
  WicketType,
  BattingStats,
  BowlingStats,
} from '@/types/scoring';

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function makeEmptyInnings(battingTeam: TeamSide): ScoringInnings {
  return {
    batting_team: battingTeam,
    total_runs: 0,
    total_wickets: 0,
    total_overs: 0,
    extras: { wide: 0, no_ball: 0, bye: 0, leg_bye: 0 },
    striker_id: null,
    non_striker_id: null,
    bowler_id: null,
    is_completed: false,
    target: null,
  };
}

/** Convert ball count to display overs e.g. 7 legal balls = 1.1 overs */
function ballsToOvers(legalBalls: number): number {
  const completedOvers = Math.floor(legalBalls / 6);
  const remainingBalls = legalBalls % 6;
  return parseFloat(`${completedOvers}.${remainingBalls}`);
}

/** Convert overs display (e.g. 3.2) to total legal ball count */
function oversToLegalBalls(overs: number): number {
  const str = overs.toFixed(1);
  const [whole, frac] = str.split('.');
  return parseInt(whole, 10) * 6 + parseInt(frac, 10);
}

function formatOvers(legalBalls: number): string {
  const completedOvers = Math.floor(legalBalls / 6);
  const remainingBalls = legalBalls % 6;
  return `${completedOvers}.${remainingBalls}`;
}

interface ScoringState {
  // Match data
  match: ScoringMatch | null;
  innings: [ScoringInnings, ScoringInnings];
  balls: ScoringBall[];

  // Setup wizard state
  wizardStep: number; // 1-6

  // Scoring state
  isFreeHit: boolean;
  lastBallId: string | null;

  // Redo stack
  redoStack: ScoringBall[];

  // Actions - Setup
  setWizardStep: (step: number) => void;
  createMatch: (data: {
    title: string;
    overs: number;
    date: string;
    teamA: ScoringTeam;
    teamB: ScoringTeam;
    tossWinner: TeamSide;
    tossDecision: TossDecision;
    scorerName: string;
  }) => void;
  setOpeners: (strikerId: string, nonStrikerId: string, bowlerId: string) => void;
  startMatch: () => void;

  // Actions - Scoring
  recordBall: (data: {
    runs_bat: number;
    extras_type?: ExtrasType;
    runs_extras?: number;
    is_wicket?: boolean;
    wicket_type?: WicketType;
    dismissed_id?: string;
    fielder_id?: string;
  }) => void;
  undoLastBall: () => void;
  redoLastBall: () => void;
  swapStrike: () => void;
  setBowler: (playerId: string) => void;
  setNextBatsman: (playerId: string) => void;

  // Actions - Innings
  endInnings: () => void;
  startSecondInnings: (strikerId: string, nonStrikerId: string, bowlerId: string) => void;
  endMatch: () => void;

  // Actions - Handoff
  handOffTo: (playerName: string, playerId: string) => void;

  // Computed
  getCurrentInnings: () => ScoringInnings;
  getCurrentOverBalls: () => ScoringBall[];
  getBattingStats: (inningsIdx: number) => BattingStats[];
  getBowlingStats: (inningsIdx: number) => BowlingStats[];
  getBattingTeamPlayers: () => ScoringPlayer[];
  getBowlingTeamPlayers: () => ScoringPlayer[];
  getYetToBat: () => ScoringPlayer[];
  getAvailableBowlers: () => ScoringPlayer[];

  // Reset
  reset: () => void;
}

const initialInnings: [ScoringInnings, ScoringInnings] = [
  makeEmptyInnings('team_a'),
  makeEmptyInnings('team_b'),
];

export const useScoringStore = create<ScoringState>((set, get) => ({
  match: null,
  innings: [makeEmptyInnings('team_a'), makeEmptyInnings('team_b')],
  balls: [],
  wizardStep: 1,
  isFreeHit: false,
  lastBallId: null,
  redoStack: [],

  setWizardStep: (step) => set({ wizardStep: step }),

  createMatch: ({ title, overs, date, teamA, teamB, tossWinner, tossDecision, scorerName }) => {
    // Determine batting order from toss
    const battingFirst: TeamSide =
      (tossWinner === 'team_a' && tossDecision === 'bat') ||
      (tossWinner === 'team_b' && tossDecision === 'bowl')
        ? 'team_a'
        : 'team_b';
    const battingSecond: TeamSide = battingFirst === 'team_a' ? 'team_b' : 'team_a';

    const match: ScoringMatch = {
      id: genId(),
      title,
      team_a: teamA,
      team_b: teamB,
      overs_per_innings: overs,
      match_date: date,
      toss_winner: tossWinner,
      toss_decision: tossDecision,
      status: 'setup',
      current_innings: 0,
      scorer_id: null,
      scorer_name: scorerName,
      active_scorer_id: null,
      result_summary: null,
      mvp_player_id: null,
    };

    set({
      match,
      innings: [makeEmptyInnings(battingFirst), makeEmptyInnings(battingSecond)],
      balls: [],
      isFreeHit: false,
      lastBallId: null,
    });
  },

  setOpeners: (strikerId, nonStrikerId, bowlerId) => {
    const { innings, match } = get();
    if (!match) return;
    const idx = match.current_innings;
    const updated = [...innings] as [ScoringInnings, ScoringInnings];
    updated[idx] = {
      ...updated[idx],
      striker_id: strikerId,
      non_striker_id: nonStrikerId,
      bowler_id: bowlerId,
    };
    set({ innings: updated });
  },

  startMatch: () => {
    const { match } = get();
    if (!match) return;
    set({ match: { ...match, status: 'scoring' } });
  },

  recordBall: (data) => {
    const { match, innings, balls, isFreeHit } = get();
    if (!match) return;
    const idx = match.current_innings;
    const inn = innings[idx];
    if (inn.is_completed || !inn.striker_id || !inn.non_striker_id || !inn.bowler_id) return;

    const extrasType = data.extras_type ?? null;
    const runsExtras = data.runs_extras ?? (extrasType === 'wide' || extrasType === 'no_ball' ? 1 : 0);
    const isLegal = extrasType !== 'wide' && extrasType !== 'no_ball';
    const runsBat = data.runs_bat;

    // Count legal balls in current innings so far
    const inningsBalls = balls.filter((b) => b.innings === idx);
    const legalBallsSoFar = inningsBalls.filter((b) => b.is_legal).length;
    const currentOver = Math.floor(legalBallsSoFar / 6);
    const currentBallInOver = isLegal ? (legalBallsSoFar % 6) : (legalBallsSoFar % 6); // ball position for display

    const ball: ScoringBall = {
      id: genId(),
      innings: idx,
      sequence: inningsBalls.length,
      over_number: currentOver,
      ball_in_over: currentBallInOver,
      striker_id: inn.striker_id,
      non_striker_id: inn.non_striker_id,
      bowler_id: inn.bowler_id,
      runs_bat: runsBat,
      runs_extras: runsExtras,
      extras_type: extrasType,
      is_wicket: data.is_wicket ?? false,
      wicket_type: data.wicket_type ?? null,
      dismissed_id: data.dismissed_id ?? null,
      fielder_id: data.fielder_id ?? null,
      is_legal: isLegal,
      is_free_hit: isFreeHit,
    };

    const newBalls = [...balls, ball];

    // Update innings totals
    const totalRuns = inn.total_runs + runsBat + runsExtras;
    const totalWickets = inn.total_wickets + (ball.is_wicket ? 1 : 0);
    const newLegalBalls = legalBallsSoFar + (isLegal ? 1 : 0);
    const totalOvers = ballsToOvers(newLegalBalls);

    // Update extras
    const extras = { ...inn.extras };
    if (extrasType) {
      extras[extrasType] += runsExtras;
    }

    // Determine if strike should swap
    // Strike swaps on: odd bat runs, end of over (handled separately)
    const totalRunsForStrike = runsBat + (extrasType === 'bye' || extrasType === 'leg_bye' ? runsExtras : 0);
    const shouldSwap = totalRunsForStrike % 2 === 1;

    let strikerId: string | null = inn.striker_id;
    let nonStrikerId: string | null = inn.non_striker_id;

    if (shouldSwap && !ball.is_wicket) {
      [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
    }

    // End of over swap (after 6 legal balls in this over)
    const isEndOfOver = isLegal && (newLegalBalls % 6 === 0);
    if (isEndOfOver && !ball.is_wicket) {
      [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
    }

    // If wicket, clear striker (next batsman needed)
    if (ball.is_wicket) {
      const dismissedId = ball.dismissed_id ?? inn.striker_id;
      if (dismissedId === strikerId) {
        strikerId = null;
      } else if (dismissedId === nonStrikerId) {
        nonStrikerId = null;
      }
      // Run out of non-striker: apply swap logic first, then clear
      if (dismissedId === inn.non_striker_id && shouldSwap) {
        // After swap, the non-striker is actually the old striker
        strikerId = inn.non_striker_id === strikerId ? null : strikerId;
        nonStrikerId = inn.striker_id;
        if (dismissedId === nonStrikerId) {
          nonStrikerId = null;
        }
      }
    }

    // Check if innings is completed
    const maxOvers = match.overs_per_innings;
    const maxWickets = (idx === 0 ? match.team_a : match.team_b).players.length - 1;
    const battingTeamSize = inn.batting_team === 'team_a' ? match.team_a.players.length : match.team_b.players.length;
    const allOut = totalWickets >= battingTeamSize - 1;
    const oversComplete = newLegalBalls >= maxOvers * 6;
    const targetReached = inn.target !== null && totalRuns >= inn.target;
    const isCompleted = allOut || oversComplete || targetReached;

    // Free hit: next ball is free hit if current ball was a no_ball
    const nextFreeHit = extrasType === 'no_ball';

    const updated = [...innings] as [ScoringInnings, ScoringInnings];
    updated[idx] = {
      ...inn,
      total_runs: totalRuns,
      total_wickets: totalWickets,
      total_overs: totalOvers,
      extras,
      striker_id: strikerId,
      non_striker_id: nonStrikerId,
      is_completed: isCompleted,
    };

    // Update match status if innings completed
    let matchStatus = match.status;
    let resultSummary = match.result_summary;
    if (isCompleted) {
      if (idx === 0) {
        matchStatus = 'innings_break';
      } else {
        matchStatus = 'completed';
        // Compute result
        const firstInnings = innings[0];
        const secondTotal = totalRuns;
        const firstTotal = firstInnings.total_runs;
        if (secondTotal > firstTotal) {
          const wicketsLeft = battingTeamSize - 1 - totalWickets;
          const winnerTeam = inn.batting_team === 'team_a' ? match.team_a.name : match.team_b.name;
          resultSummary = `${winnerTeam} won by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}`;
        } else if (secondTotal === firstTotal) {
          resultSummary = 'Match tied';
        } else {
          const runDiff = firstTotal - secondTotal;
          const winnerTeam = firstInnings.batting_team === 'team_a' ? match.team_a.name : match.team_b.name;
          resultSummary = `${winnerTeam} won by ${runDiff} run${runDiff !== 1 ? 's' : ''}`;
        }
      }
    }

    set({
      balls: newBalls,
      innings: updated,
      match: { ...match, status: matchStatus, result_summary: resultSummary },
      isFreeHit: nextFreeHit,
      lastBallId: ball.id,
      redoStack: [], // new ball invalidates redo history
    });
  },

  undoLastBall: () => {
    const { match, innings, balls, redoStack } = get();
    if (!match || balls.length === 0) return;

    const lastBall = balls[balls.length - 1];
    const idx = lastBall.innings;
    const inn = innings[idx];

    const newBalls = balls.slice(0, -1);

    // Recompute innings from remaining balls for this innings
    const inningsBalls = newBalls.filter((b) => b.innings === idx);
    const legalBalls = inningsBalls.filter((b) => b.is_legal).length;

    let totalRuns = 0;
    let totalWickets = 0;
    const extras = { wide: 0, no_ball: 0, bye: 0, leg_bye: 0 };

    for (const b of inningsBalls) {
      totalRuns += b.runs_bat + b.runs_extras;
      if (b.is_wicket) totalWickets++;
      if (b.extras_type) extras[b.extras_type] += b.runs_extras;
    }

    const updated = [...innings] as [ScoringInnings, ScoringInnings];
    updated[idx] = {
      ...inn,
      total_runs: totalRuns,
      total_wickets: totalWickets,
      total_overs: ballsToOvers(legalBalls),
      extras,
      striker_id: lastBall.striker_id,
      non_striker_id: lastBall.non_striker_id,
      bowler_id: lastBall.bowler_id,
      is_completed: false,
    };

    // Check if previous ball was no_ball for free hit state
    const prevBall = newBalls.length > 0 ? newBalls[newBalls.length - 1] : null;
    const wasFreeHit = prevBall?.extras_type === 'no_ball';

    set({
      balls: newBalls,
      innings: updated,
      match: { ...match, status: idx === 0 && match.status === 'innings_break' ? 'scoring' : match.status, result_summary: match.status === 'completed' ? null : match.result_summary },
      isFreeHit: wasFreeHit,
      lastBallId: prevBall?.id ?? null,
      redoStack: [...redoStack, lastBall],
    });
  },

  redoLastBall: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;

    const ball = redoStack[redoStack.length - 1];
    // Re-record the ball with its original data
    get().recordBall({
      runs_bat: ball.runs_bat,
      extras_type: ball.extras_type ?? undefined,
      runs_extras: ball.runs_extras,
      is_wicket: ball.is_wicket,
      wicket_type: ball.wicket_type ?? undefined,
      dismissed_id: ball.dismissed_id ?? undefined,
      fielder_id: ball.fielder_id ?? undefined,
    });

    // recordBall clears redoStack, so restore it minus the last item
    set({ redoStack: redoStack.slice(0, -1) });
  },

  swapStrike: () => {
    const { match, innings } = get();
    if (!match) return;
    const idx = match.current_innings;
    const inn = innings[idx];
    const updated = [...innings] as [ScoringInnings, ScoringInnings];
    updated[idx] = {
      ...inn,
      striker_id: inn.non_striker_id,
      non_striker_id: inn.striker_id,
    };
    set({ innings: updated });
  },

  setBowler: (playerId) => {
    const { match, innings } = get();
    if (!match) return;
    const idx = match.current_innings;
    const updated = [...innings] as [ScoringInnings, ScoringInnings];
    updated[idx] = { ...updated[idx], bowler_id: playerId };
    set({ innings: updated });
  },

  setNextBatsman: (playerId) => {
    const { match, innings } = get();
    if (!match) return;
    const idx = match.current_innings;
    const inn = innings[idx];
    const updated = [...innings] as [ScoringInnings, ScoringInnings];
    if (!inn.striker_id) {
      updated[idx] = { ...inn, striker_id: playerId };
    } else if (!inn.non_striker_id) {
      updated[idx] = { ...inn, non_striker_id: playerId };
    }
    set({ innings: updated });
  },

  endInnings: () => {
    const { match, innings } = get();
    if (!match) return;
    const idx = match.current_innings;
    const updated = [...innings] as [ScoringInnings, ScoringInnings];
    updated[idx] = { ...updated[idx], is_completed: true };
    // Set target for 2nd innings
    if (idx === 0) {
      updated[1] = { ...updated[1], target: updated[0].total_runs + 1 };
    }
    set({
      innings: updated,
      match: { ...match, status: idx === 0 ? 'innings_break' : 'completed' },
    });
  },

  startSecondInnings: (strikerId, nonStrikerId, bowlerId) => {
    const { match, innings } = get();
    if (!match) return;
    const updated = [...innings] as [ScoringInnings, ScoringInnings];
    updated[1] = {
      ...updated[1],
      target: updated[0].total_runs + 1,
      striker_id: strikerId,
      non_striker_id: nonStrikerId,
      bowler_id: bowlerId,
    };
    set({
      innings: updated,
      match: { ...match, current_innings: 1, status: 'scoring' },
      isFreeHit: false,
      lastBallId: null,
    });
  },

  endMatch: () => {
    const { match, innings } = get();
    if (!match) return;
    const first = innings[0];
    const second = innings[1];
    let resultSummary = match.result_summary;
    if (!resultSummary) {
      const firstTotal = first.total_runs;
      const secondTotal = second.total_runs;
      if (secondTotal > firstTotal) {
        const batTeamSize = second.batting_team === 'team_a' ? match.team_a.players.length : match.team_b.players.length;
        const wicketsLeft = batTeamSize - 1 - second.total_wickets;
        const winner = second.batting_team === 'team_a' ? match.team_a.name : match.team_b.name;
        resultSummary = `${winner} won by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}`;
      } else if (secondTotal === firstTotal) {
        resultSummary = 'Match tied';
      } else {
        const runDiff = firstTotal - secondTotal;
        const winner = first.batting_team === 'team_a' ? match.team_a.name : match.team_b.name;
        resultSummary = `${winner} won by ${runDiff} run${runDiff !== 1 ? 's' : ''}`;
      }
    }
    set({ match: { ...match, status: 'completed', result_summary: resultSummary } });
  },

  handOffTo: (playerName, playerId) => {
    const { match } = get();
    if (!match) return;
    set({ match: { ...match, active_scorer_id: playerId, scorer_name: playerName } });
  },

  getCurrentInnings: () => {
    const { match, innings } = get();
    const idx = match?.current_innings ?? 0;
    return innings[idx];
  },

  getCurrentOverBalls: () => {
    const { match, balls } = get();
    if (!match) return [];
    const idx = match.current_innings;
    const inningsBalls = balls.filter((b) => b.innings === idx);
    const legalBalls = inningsBalls.filter((b) => b.is_legal).length;
    const currentOver = legalBalls === 0 ? 0 : (legalBalls % 6 === 0 ? Math.floor(legalBalls / 6) - 1 : Math.floor(legalBalls / 6));
    // If we just finished an over (legalBalls % 6 === 0), show the completed over
    // Otherwise show the in-progress over
    const overNum = legalBalls % 6 === 0 && legalBalls > 0 ? currentOver : Math.floor(legalBalls / 6);
    return inningsBalls.filter((b) => b.over_number === overNum);
  },

  getBattingStats: (inningsIdx) => {
    const { match, balls } = get();
    if (!match) return [];
    const inn = get().innings[inningsIdx];
    const battingTeam = inn.batting_team === 'team_a' ? match.team_a : match.team_b;
    const inningsBalls = balls.filter((b) => b.innings === inningsIdx);

    // Determine which players have batted
    const batterIds = new Set<string>();
    for (const b of inningsBalls) {
      batterIds.add(b.striker_id);
    }

    const stats: BattingStats[] = [];
    for (const player of battingTeam.players) {
      if (!batterIds.has(player.id)) continue;
      let runs = 0, ballsFaced = 0, fours = 0, sixes = 0;
      let isOut = false;
      let howOut: string | null = null;

      for (const b of inningsBalls) {
        if (b.striker_id === player.id) {
          runs += b.runs_bat;
          if (b.is_legal) ballsFaced++;
          // Also count no_ball as ball faced if striker
          if (b.extras_type === 'no_ball') ballsFaced++;
          if (b.runs_bat === 4) fours++;
          if (b.runs_bat === 6) sixes++;
        }
        if (b.is_wicket && b.dismissed_id === player.id) {
          isOut = true;
          howOut = b.wicket_type ?? 'out';
        }
      }

      stats.push({
        player,
        runs,
        balls: ballsFaced,
        fours,
        sixes,
        strike_rate: ballsFaced > 0 ? parseFloat(((runs / ballsFaced) * 100).toFixed(1)) : 0,
        is_out: isOut,
        how_out: howOut,
      });
    }
    return stats;
  },

  getBowlingStats: (inningsIdx) => {
    const { match, balls } = get();
    if (!match) return [];
    const inn = get().innings[inningsIdx];
    const bowlingTeam = inn.batting_team === 'team_a' ? match.team_b : match.team_a;
    const inningsBalls = balls.filter((b) => b.innings === inningsIdx);

    const bowlerIds = new Set<string>();
    for (const b of inningsBalls) {
      bowlerIds.add(b.bowler_id);
    }

    const stats: BowlingStats[] = [];
    for (const player of bowlingTeam.players) {
      if (!bowlerIds.has(player.id)) continue;
      let runsConceded = 0, wickets = 0, legalBalls = 0, wides = 0, noBalls = 0, maidens = 0;

      // Group by over for maiden calculation
      const overRuns = new Map<number, number>();

      for (const b of inningsBalls) {
        if (b.bowler_id !== player.id) continue;
        runsConceded += b.runs_bat + b.runs_extras;
        if (b.is_wicket) wickets++;
        if (b.is_legal) legalBalls++;
        if (b.extras_type === 'wide') wides++;
        if (b.extras_type === 'no_ball') noBalls++;

        if (b.is_legal) {
          const overKey = b.over_number;
          overRuns.set(overKey, (overRuns.get(overKey) ?? 0) + b.runs_bat + b.runs_extras);
        }
      }

      // Count maidens (overs with 0 runs and 6 legal balls)
      for (const [_, runs] of overRuns) {
        if (runs === 0) maidens++;
      }

      stats.push({
        player,
        overs: formatOvers(legalBalls),
        maidens,
        runs: runsConceded,
        wickets,
        economy: legalBalls > 0 ? parseFloat(((runsConceded / legalBalls) * 6).toFixed(2)) : 0,
        wides,
        no_balls: noBalls,
      });
    }
    return stats;
  },

  getBattingTeamPlayers: () => {
    const { match, innings } = get();
    if (!match) return [];
    const idx = match.current_innings;
    const inn = innings[idx];
    return inn.batting_team === 'team_a' ? match.team_a.players : match.team_b.players;
  },

  getBowlingTeamPlayers: () => {
    const { match, innings } = get();
    if (!match) return [];
    const idx = match.current_innings;
    const inn = innings[idx];
    return inn.batting_team === 'team_a' ? match.team_b.players : match.team_a.players;
  },

  getYetToBat: () => {
    const { match, innings, balls } = get();
    if (!match) return [];
    const idx = match.current_innings;
    const inn = innings[idx];
    const battingTeam = inn.batting_team === 'team_a' ? match.team_a : match.team_b;
    const inningsBalls = balls.filter((b) => b.innings === idx);

    const haveBatted = new Set<string>();
    for (const b of inningsBalls) {
      haveBatted.add(b.striker_id);
    }
    // Also include current batsmen
    if (inn.striker_id) haveBatted.add(inn.striker_id);
    if (inn.non_striker_id) haveBatted.add(inn.non_striker_id);

    // Exclude dismissed players
    const dismissed = new Set<string>();
    for (const b of inningsBalls) {
      if (b.is_wicket && b.dismissed_id) dismissed.add(b.dismissed_id);
    }

    return battingTeam.players.filter(
      (p) => !haveBatted.has(p.id) && !dismissed.has(p.id)
    );
  },

  getAvailableBowlers: () => {
    const { match, innings, balls } = get();
    if (!match) return [];
    const idx = match.current_innings;
    const inn = innings[idx];
    const bowlingTeam = inn.batting_team === 'team_a' ? match.team_b : match.team_a;
    const inningsBalls = balls.filter((b) => b.innings === idx);

    // Can't bowl same bowler consecutive overs
    const legalBalls = inningsBalls.filter((b) => b.is_legal).length;
    if (legalBalls === 0) return bowlingTeam.players;

    const lastOverNum = Math.floor((legalBalls - 1) / 6);
    const lastOverBalls = inningsBalls.filter((b) => b.over_number === lastOverNum && b.is_legal);
    const lastBowler = lastOverBalls.length > 0 ? lastOverBalls[0].bowler_id : null;

    // Only filter out last bowler if we are at the start of a new over
    if (legalBalls % 6 === 0) {
      return bowlingTeam.players.filter((p) => p.id !== lastBowler);
    }

    return bowlingTeam.players;
  },

  reset: () => {
    set({
      match: null,
      innings: [makeEmptyInnings('team_a'), makeEmptyInnings('team_b')],
      balls: [],
      wizardStep: 1,
      isFreeHit: false,
      lastBallId: null,
      redoStack: [],
    });
  },
}));
