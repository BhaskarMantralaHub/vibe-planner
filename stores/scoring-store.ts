import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  MatchHistoryItem,
  LeaderboardEntry,
  ScoringAction,
  RetiredPlayer,
} from '@/types/scoring';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import { toast } from 'sonner';

let leaderboardRequestCounter = 0;

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
    retired_players: [],
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

/** Translate client player ID to server player ID for DB writes */
function toServerId(idMap: Record<string, string>, clientId: string): string {
  return idMap[clientId] ?? clientId;
}

/** Fire-and-forget Supabase call with error logging */
function syncToDb(label: string, fn: () => Promise<{ error: unknown }>) {
  fn().then(({ error }) => {
    if (error) {
      console.error(`[scoring] ${label} failed:`, error);
      toast.error(`Sync failed: ${label}`);
    }
  });
}

/** Serialize retired_players for DB sync (client IDs to server IDs) */
function serializeRetiredPlayers(
  retired: RetiredPlayer[],
  idMap: Record<string, string>,
): string {
  return JSON.stringify(retired.map((r) => ({
    ...r,
    playerId: toServerId(idMap, r.playerId),
    replacedById: toServerId(idMap, r.replacedById),
  })));
}

type ScorecardRpc = {
  match: Record<string, unknown> | null;
  players: Record<string, unknown>[];
  innings: Record<string, unknown>[];
  balls: Record<string, unknown>[];
};

/** Hydrate match/innings/balls from DB scorecard RPC into client-side types */
function hydrateMatchFromDb(sc: ScorecardRpc): {
  match: ScoringMatch;
  innings: [ScoringInnings, ScoringInnings];
  balls: ScoringBall[];
  idMap: Record<string, string>;
} | null {
  const dbMatch = sc.match;
  if (!dbMatch) return null;

  const idMap: Record<string, string> = {};
  const reverseMap: Record<string, string> = {};
  const teamAPlayers: ScoringPlayer[] = [];
  const teamBPlayers: ScoringPlayer[] = [];

  for (const p of sc.players) {
    const clientId = genId();
    idMap[clientId] = p.id as string;
    reverseMap[p.id as string] = clientId;
    const sp: ScoringPlayer = {
      id: clientId, name: p.name as string, jersey_number: p.jersey_number as number | null,
      player_id: (p.player_id as string) ?? null, is_guest: p.is_guest as boolean,
    };
    if (p.team === 'team_a') teamAPlayers.push(sp); else teamBPlayers.push(sp);
  }

  const toClient = (sid: string | null): string | null => sid ? (reverseMap[sid] ?? sid) : null;

  const match: ScoringMatch = {
    id: genId(), title: dbMatch.title as string,
    team_a: { name: dbMatch.team_a_name as string, captain_id: null, players: teamAPlayers },
    team_b: { name: dbMatch.team_b_name as string, captain_id: null, players: teamBPlayers },
    overs_per_innings: dbMatch.overs_per_innings as number, match_date: dbMatch.match_date as string,
    toss_winner: dbMatch.toss_winner as TeamSide | null, toss_decision: dbMatch.toss_decision as TossDecision | null,
    status: dbMatch.status as ScoringMatch['status'], current_innings: dbMatch.current_innings as number,
    scorer_id: null, scorer_name: dbMatch.scorer_name as string | null,
    active_scorer_id: dbMatch.active_scorer_id as string | null,
    result_summary: dbMatch.result_summary as string | null, mvp_player_id: null,
  };

  const innings: [ScoringInnings, ScoringInnings] = [makeEmptyInnings('team_a'), makeEmptyInnings('team_b')];
  for (const di of sc.innings) {
    const i = di.innings_number as 0 | 1;
    const rawRetired = di.retired_players;
    const dbRetired: RetiredPlayer[] = Array.isArray(rawRetired) ? rawRetired
      : typeof rawRetired === 'string' ? JSON.parse(rawRetired) : [];
    const retiredPlayers: RetiredPlayer[] = dbRetired.map((r) => ({
      playerId: reverseMap[r.playerId] ?? r.playerId,
      replacedById: reverseMap[r.replacedById] ?? r.replacedById,
      runs: r.runs, balls: r.balls, returned: r.returned,
    }));

    innings[i] = {
      batting_team: di.batting_team as TeamSide, total_runs: di.total_runs as number,
      total_wickets: di.total_wickets as number, total_overs: parseFloat(String(di.total_overs)),
      extras: { wide: di.extras_wide as number, no_ball: di.extras_no_ball as number, bye: di.extras_bye as number, leg_bye: di.extras_leg_bye as number },
      striker_id: toClient(di.striker_id as string | null), non_striker_id: toClient(di.non_striker_id as string | null),
      bowler_id: toClient(di.bowler_id as string | null), is_completed: di.is_completed as boolean, target: di.target as number | null,
      retired_players: retiredPlayers,
    };
  }

  const balls: ScoringBall[] = sc.balls.map((b) => ({
    id: genId(), innings: b.innings_number as number, sequence: b.sequence as number,
    over_number: b.over_number as number, ball_in_over: b.ball_in_over as number,
    striker_id: reverseMap[b.striker_id as string] ?? (b.striker_id as string),
    non_striker_id: reverseMap[b.non_striker_id as string] ?? (b.non_striker_id as string),
    bowler_id: reverseMap[b.bowler_id as string] ?? (b.bowler_id as string),
    runs_bat: b.runs_bat as number, runs_extras: b.runs_extras as number,
    extras_type: b.extras_type as ExtrasType | null, is_wicket: b.is_wicket as boolean,
    wicket_type: b.wicket_type as WicketType | null,
    dismissed_id: b.dismissed_id ? (reverseMap[b.dismissed_id as string] ?? (b.dismissed_id as string)) : null,
    fielder_id: b.fielder_id ? (reverseMap[b.fielder_id as string] ?? (b.fielder_id as string)) : null,
    is_legal: b.is_legal as boolean, is_free_hit: b.is_free_hit as boolean,
  }));

  return { match, innings, balls, idMap };
}

interface ScoringState {
  // Match data
  match: ScoringMatch | null;
  innings: [ScoringInnings, ScoringInnings];
  balls: ScoringBall[];

  // Setup wizard state
  wizardStep: number;

  // Scoring state
  isFreeHit: boolean;
  lastBallId: string | null;

  // Unified action stack (balls + retirements) for undo/redo
  actionStack: ScoringAction[];
  redoStack: ScoringBall[];
  redoActionStack: ScoringAction[];

  // Cloud sync state
  dbMatchId: string | null;
  idMap: Record<string, string>;  // clientPlayerId -> serverPlayerId
  matchHistory: MatchHistoryItem[];

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
  }) => Promise<void>;
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
  retireBatsman: (retiredId: string, replacementId: string) => void;

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
  getRetiredBatsmen: () => (ScoringPlayer & { retiredRuns: number; retiredBalls: number })[];
  getAvailableBowlers: () => ScoringPlayer[];

  // Cloud
  revertMatch: (matchId: string) => Promise<boolean>;
  deleteMatch: (matchId: string, deleterName: string) => Promise<boolean>;
  restoreMatch: (matchId: string) => Promise<boolean>;
  permanentDeleteMatch: (matchId: string) => Promise<boolean>;
  loadMatchHistory: (loadMore?: boolean, fromDate?: string, toDate?: string) => Promise<void>;
  loadDeletedMatches: () => Promise<void>;
  resumeMatch: (matchId: string) => Promise<boolean>;
  viewScorecard: (matchId: string) => Promise<boolean>;

  // Deleted matches (admin)
  deletedMatches: MatchHistoryItem[];
  historyLoading: boolean;

  // Guest suggestions
  guestSuggestions: { id: string; name: string }[];
  fetchGuestSuggestions: () => Promise<void>;

  // Leaderboard
  leaderboard: Record<string, LeaderboardEntry[]>;
  leaderboardLoading: boolean;
  leaderboardMatchLimit: number | null;
  setLeaderboardMatchLimit: (limit: number | null) => void;
  fetchLeaderboard: (category: string) => Promise<void>;

  // Reset
  reset: () => void;
}

const initialInnings: [ScoringInnings, ScoringInnings] = [
  makeEmptyInnings('team_a'),
  makeEmptyInnings('team_b'),
];

export const useScoringStore = create<ScoringState>()(
  persist(
    (set, get) => ({
  match: null,
  innings: [makeEmptyInnings('team_a'), makeEmptyInnings('team_b')],
  balls: [],
  wizardStep: 1,
  isFreeHit: false,
  lastBallId: null,
  actionStack: [],
  redoStack: [],
  redoActionStack: [],
  dbMatchId: null,
  idMap: {},
  matchHistory: [],
  deletedMatches: [],
  historyLoading: false,
  guestSuggestions: [],
  leaderboard: {},
  leaderboardLoading: false,
  leaderboardMatchLimit: null,

  setWizardStep: (step) => set({ wizardStep: step }),

  createMatch: async ({ title, overs, date, teamA, teamB, tossWinner, tossDecision, scorerName }) => {
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

    // Optimistic local set
    set({
      match,
      innings: [makeEmptyInnings(battingFirst), makeEmptyInnings(battingSecond)],
      balls: [],
      isFreeHit: false,
      lastBallId: null,
      dbMatchId: null,
      idMap: {},
    });

    // Cloud sync — AWAITED (need server player IDs before any ball can sync)
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const allPlayers = [
        ...teamA.players.map((p) => ({
          team: 'team_a',
          name: p.name,
          jersey_number: p.jersey_number,
          player_id: p.player_id ?? '',
          is_guest: p.is_guest,
        })),
        ...teamB.players.map((p) => ({
          team: 'team_b',
          name: p.name,
          jersey_number: p.jersey_number,
          player_id: p.player_id ?? '',
          is_guest: p.is_guest,
        })),
      ];

      const { data, error } = await supabase.rpc('create_practice_match', {
        p_title: title,
        p_match_date: date,
        p_overs: overs,
        p_team_a_name: teamA.name,
        p_team_b_name: teamB.name,
        p_toss_winner: tossWinner,
        p_toss_decision: tossDecision,
        p_scorer_name: scorerName,
        p_batting_first: battingFirst,
        p_players: allPlayers,
      });

      if (error) {
        console.error('[scoring] createMatch RPC failed:', error);
        return;
      }

      // Build ID map from RPC response
      const result = data as { match_id: string; player_map: { idx: number; db_id: string }[]; share_token: string };
      const clientPlayers = [...teamA.players, ...teamB.players];
      const newIdMap: Record<string, string> = {};
      for (const mapping of result.player_map) {
        const clientPlayer = clientPlayers[mapping.idx];
        if (clientPlayer) {
          newIdMap[clientPlayer.id] = mapping.db_id;
        }
      }

      set({ dbMatchId: result.match_id, idMap: newIdMap });
    }
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

    // Sync openers to DB
    const { dbMatchId, idMap } = get();
    if (isCloudMode() && dbMatchId) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      syncToDb('setOpeners', () => supabase.from('practice_innings').update({
        striker_id: toServerId(idMap, strikerId),
        non_striker_id: toServerId(idMap, nonStrikerId),
        bowler_id: toServerId(idMap, bowlerId),
      }).eq('match_id', dbMatchId).eq('innings_number', idx));
    }
  },

  startMatch: () => {
    const { match } = get();
    if (!match) return;
    set({ match: { ...match, status: 'scoring' } });
    // Note: create_practice_match RPC already sets status='scoring' and started_at
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
    // Strike swaps on: odd physical runs
    // - Bat runs (including runs off no-ball) count directly
    // - Bye/leg-bye extras are physical runs
    // - Wide: penalty (1 run) doesn't swap, but additional runs do (batsmen physically ran)
    const physicalRuns = runsBat
      + (extrasType === 'bye' || extrasType === 'leg_bye' ? runsExtras : 0)
      + (extrasType === 'wide' ? Math.max(0, runsExtras - 1) : 0);
    const shouldSwap = physicalRuns % 2 === 1;

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
    const battingTeamSize = inn.batting_team === 'team_a' ? match.team_a.players.length : match.team_b.players.length;
    // All-out when dismissed count means < 2 batsmen available (retired players who can return are NOT dismissed)
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

    const { actionStack } = get();
    set({
      balls: newBalls,
      innings: updated,
      match: { ...match, status: matchStatus, result_summary: resultSummary },
      isFreeHit: nextFreeHit,
      lastBallId: ball.id,
      actionStack: [...actionStack, { type: 'ball', ballId: ball.id }],
      redoStack: [],
      redoActionStack: [],
    });

    // Cloud sync — fire-and-forget
    const { dbMatchId, idMap } = get();
    if (isCloudMode() && dbMatchId) {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      // 1. Insert ball
      syncToDb('recordBall', () => supabase.from('practice_balls').insert({
        match_id: dbMatchId,
        innings_number: ball.innings,
        sequence: ball.sequence,
        over_number: ball.over_number,
        ball_in_over: ball.ball_in_over,
        striker_id: toServerId(idMap, ball.striker_id),
        non_striker_id: toServerId(idMap, ball.non_striker_id),
        bowler_id: toServerId(idMap, ball.bowler_id),
        runs_bat: ball.runs_bat,
        runs_extras: ball.runs_extras,
        extras_type: ball.extras_type,
        is_legal: ball.is_legal,
        is_free_hit: ball.is_free_hit,
        is_wicket: ball.is_wicket,
        wicket_type: ball.wicket_type,
        dismissed_id: ball.dismissed_id ? toServerId(idMap, ball.dismissed_id) : null,
        fielder_id: ball.fielder_id ? toServerId(idMap, ball.fielder_id) : null,
      }));

      // 2. Update innings totals
      const updInn = updated[idx];
      syncToDb('recordBall innings', () => supabase.from('practice_innings').update({
        total_runs: updInn.total_runs,
        total_wickets: updInn.total_wickets,
        total_overs: updInn.total_overs,
        legal_balls: newLegalBalls,
        extras_wide: updInn.extras.wide,
        extras_no_ball: updInn.extras.no_ball,
        extras_bye: updInn.extras.bye,
        extras_leg_bye: updInn.extras.leg_bye,
        striker_id: updInn.striker_id ? toServerId(idMap, updInn.striker_id) : null,
        non_striker_id: updInn.non_striker_id ? toServerId(idMap, updInn.non_striker_id) : null,
        bowler_id: updInn.bowler_id ? toServerId(idMap, updInn.bowler_id) : null,
        is_completed: updInn.is_completed,
      }).eq('match_id', dbMatchId).eq('innings_number', idx));

      // 3. Update match status if changed
      if (matchStatus !== match.status) {
        const matchUpdate: Record<string, unknown> = { status: matchStatus };
        if (matchStatus === 'completed') {
          matchUpdate.result_summary = resultSummary;
          matchUpdate.completed_at = new Date().toISOString();
        }
        syncToDb('recordBall match', () => supabase.from('practice_matches').update(matchUpdate).eq('id', dbMatchId));
      }
    }
  },

  undoLastBall: () => {
    const { match, innings, balls, redoStack, actionStack, redoActionStack } = get();
    if (!match) return;

    // If actionStack is empty but balls exist (e.g., after page refresh clears actionStack),
    // synthesize a ball action from the last ball so undo still works
    const lastAction: ScoringAction | undefined = actionStack.length > 0
      ? actionStack[actionStack.length - 1]
      : balls.length > 0 ? { type: 'ball', ballId: balls[balls.length - 1].id } : undefined;
    if (!lastAction) return;
    const newActionStack = actionStack.length > 0 ? actionStack.slice(0, -1) : [];

    // ── Undo a retirement ──
    if (lastAction.type === 'retire') {
      const idx = match.current_innings;
      const inn = innings[idx];
      const updated = [...innings] as [ScoringInnings, ScoringInnings];

      // Restore previous crease state and remove the retirement entry
      const newRetired = inn.retired_players.filter(
        (r) => !(r.playerId === lastAction.retiredId && r.replacedById === lastAction.replacedById),
      );
      updated[idx] = {
        ...inn,
        striker_id: lastAction.previousStrikerId,
        non_striker_id: lastAction.previousNonStrikerId,
        retired_players: newRetired,
      };

      set({
        innings: updated,
        actionStack: newActionStack,
        redoActionStack: [...redoActionStack, lastAction],
      });

      // Cloud sync — update innings crease + retired_players
      const { dbMatchId, idMap } = get();
      if (isCloudMode() && dbMatchId) {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const updInn = updated[idx];
        syncToDb('undo retire', () => supabase.from('practice_innings').update({
          striker_id: updInn.striker_id ? toServerId(idMap, updInn.striker_id) : null,
          non_striker_id: updInn.non_striker_id ? toServerId(idMap, updInn.non_striker_id) : null,
          retired_players: serializeRetiredPlayers(updInn.retired_players, idMap),
        }).eq('match_id', dbMatchId).eq('innings_number', idx));
      }
      return;
    }

    // ── Undo a ball (existing logic) ──
    if (balls.length === 0) return;
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
      if (b.is_wicket && b.wicket_type !== 'retired') totalWickets++;
      if (b.extras_type) extras[b.extras_type] += b.runs_extras;
    }

    // Clean up retired_players: if undo restores a player to the crease, remove their LAST retirement entry
    const restoredStrikerId = lastBall.striker_id;
    const restoredNonStrikerId = lastBall.non_striker_id;
    const playersToClean = new Set([restoredStrikerId, restoredNonStrikerId].filter(Boolean));
    const cleanedRetired: typeof inn.retired_players = [];
    const removedForPlayer = new Set<string>();
    // Iterate in reverse to remove only the LAST retirement per restored player
    for (let i = inn.retired_players.length - 1; i >= 0; i--) {
      const r = inn.retired_players[i];
      if (playersToClean.has(r.playerId) && !removedForPlayer.has(r.playerId)) {
        removedForPlayer.add(r.playerId);
        continue; // skip (remove) this entry
      }
      cleanedRetired.unshift(r); // preserve order
    }

    const updated = [...innings] as [ScoringInnings, ScoringInnings];
    updated[idx] = {
      ...inn,
      total_runs: totalRuns,
      total_wickets: totalWickets,
      total_overs: ballsToOvers(legalBalls),
      extras,
      striker_id: restoredStrikerId,
      non_striker_id: restoredNonStrikerId,
      bowler_id: lastBall.bowler_id,
      is_completed: false,
      retired_players: cleanedRetired,
    };

    // Check if previous ball was no_ball for free hit state
    const prevBall = newBalls.length > 0 ? newBalls[newBalls.length - 1] : null;
    const wasFreeHit = prevBall?.extras_type === 'no_ball';

    const revertedStatus = idx === 0 && match.status === 'innings_break' ? 'scoring' : match.status;
    set({
      balls: newBalls,
      innings: updated,
      match: { ...match, status: revertedStatus, result_summary: match.status === 'completed' ? null : match.result_summary },
      isFreeHit: wasFreeHit,
      lastBallId: prevBall?.id ?? null,
      actionStack: newActionStack,
      redoStack: [...redoStack, lastBall],
      redoActionStack: [...redoActionStack, lastAction],
    });

    // Cloud sync — soft-delete ball + update innings
    const { dbMatchId, idMap } = get();
    if (isCloudMode() && dbMatchId) {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      syncToDb('undo ball', () => supabase.from('practice_balls')
        .update({ deleted_at: new Date().toISOString() })
        .eq('match_id', dbMatchId)
        .eq('innings_number', lastBall.innings)
        .eq('sequence', lastBall.sequence)
        .is('deleted_at', null));

      const updInn = updated[idx];
      syncToDb('undo innings', () => supabase.from('practice_innings').update({
        total_runs: updInn.total_runs, total_wickets: updInn.total_wickets,
        total_overs: updInn.total_overs, legal_balls: legalBalls,
        extras_wide: updInn.extras.wide, extras_no_ball: updInn.extras.no_ball,
        extras_bye: updInn.extras.bye, extras_leg_bye: updInn.extras.leg_bye,
        striker_id: updInn.striker_id ? toServerId(idMap, updInn.striker_id) : null,
        non_striker_id: updInn.non_striker_id ? toServerId(idMap, updInn.non_striker_id) : null,
        bowler_id: updInn.bowler_id ? toServerId(idMap, updInn.bowler_id) : null,
        is_completed: false,
        retired_players: serializeRetiredPlayers(updInn.retired_players, idMap),
      }).eq('match_id', dbMatchId).eq('innings_number', idx));

      if (revertedStatus !== match.status) {
        syncToDb('undo match status', () => supabase.from('practice_matches')
          .update({ status: revertedStatus, result_summary: null, completed_at: null })
          .eq('id', dbMatchId));
      }
    }
  },

  redoLastBall: () => {
    const { redoActionStack } = get();
    if (redoActionStack.length === 0) return;

    const lastRedoAction = redoActionStack[redoActionStack.length - 1];
    const newRedoActionStack = redoActionStack.slice(0, -1);

    // ── Redo a retirement ──
    if (lastRedoAction.type === 'retire') {
      const { redoStack: currentRedoStack } = get();
      get().retireBatsman(lastRedoAction.retiredId, lastRedoAction.replacedById);
      // retireBatsman clears redo stacks, so restore them minus the last action
      set({ redoActionStack: newRedoActionStack, redoStack: currentRedoStack });
      return;
    }

    // ── Redo a ball ──
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

    // recordBall clears redoStack/redoActionStack, so restore them minus the last items
    set({ redoStack: redoStack.slice(0, -1), redoActionStack: newRedoActionStack });
  },

  swapStrike: () => {
    const { match, innings } = get();
    if (!match) return;
    const idx = match.current_innings;
    const inn = innings[idx];
    const updated = [...innings] as [ScoringInnings, ScoringInnings];
    updated[idx] = { ...inn, striker_id: inn.non_striker_id, non_striker_id: inn.striker_id };
    set({ innings: updated });
    // Sync
    const { dbMatchId, idMap } = get();
    if (isCloudMode() && dbMatchId) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      syncToDb('swapStrike', () => supabase.from('practice_innings').update({
        striker_id: updated[idx].striker_id ? toServerId(idMap, updated[idx].striker_id!) : null,
        non_striker_id: updated[idx].non_striker_id ? toServerId(idMap, updated[idx].non_striker_id!) : null,
      }).eq('match_id', dbMatchId).eq('innings_number', idx));
    }
  },

  setBowler: (playerId) => {
    const { match, innings } = get();
    if (!match) return;
    const idx = match.current_innings;
    const updated = [...innings] as [ScoringInnings, ScoringInnings];
    updated[idx] = { ...updated[idx], bowler_id: playerId };
    set({ innings: updated });
    const { dbMatchId, idMap } = get();
    if (isCloudMode() && dbMatchId) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      syncToDb('setBowler', () => supabase.from('practice_innings').update({
        bowler_id: toServerId(idMap, playerId),
      }).eq('match_id', dbMatchId).eq('innings_number', idx));
    }
  },

  setNextBatsman: (playerId) => {
    const { match, innings } = get();
    if (!match) return;
    const idx = match.current_innings;
    const inn = innings[idx];
    const updated = [...innings] as [ScoringInnings, ScoringInnings];

    // If a retired player is returning, mark them as returned
    const retiredPlayers = inn.retired_players.map((r) =>
      r.playerId === playerId && !r.returned ? { ...r, returned: true } : r,
    );

    if (!inn.striker_id) {
      updated[idx] = { ...inn, striker_id: playerId, retired_players: retiredPlayers };
    } else if (!inn.non_striker_id) {
      updated[idx] = { ...inn, non_striker_id: playerId, retired_players: retiredPlayers };
    }
    set({ innings: updated });
    const { dbMatchId, idMap } = get();
    if (isCloudMode() && dbMatchId) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      syncToDb('setNextBatsman', () => supabase.from('practice_innings').update({
        striker_id: updated[idx].striker_id ? toServerId(idMap, updated[idx].striker_id!) : null,
        non_striker_id: updated[idx].non_striker_id ? toServerId(idMap, updated[idx].non_striker_id!) : null,
        retired_players: serializeRetiredPlayers(updated[idx].retired_players, idMap),
      }).eq('match_id', dbMatchId).eq('innings_number', idx));
    }
  },

  retireBatsman: (retiredId, replacementId) => {
    const { match, innings, balls, actionStack } = get();
    if (!match) return;
    const idx = match.current_innings;
    const inn = innings[idx];

    // Determine which slot the retiring batsman is in
    const isStriker = inn.striker_id === retiredId;
    const isNonStriker = inn.non_striker_id === retiredId;
    if (!isStriker && !isNonStriker) return;

    // Compute runs/balls for the retiring batsman at this point
    const inningsBalls = balls.filter((b) => b.innings === idx);
    let runs = 0, ballsFaced = 0;
    for (const b of inningsBalls) {
      if (b.striker_id === retiredId) {
        runs += b.runs_bat;
        if (b.is_legal) ballsFaced++;
        if (b.extras_type === 'no_ball') ballsFaced++;
      }
    }

    // Mark previous retirements as returned: the retiring player (re-retirement) AND
    // the replacement player if they were previously retired (returning to crease)
    const existingRetired = inn.retired_players.map((r) => {
      if (!r.returned && (r.playerId === retiredId || r.playerId === replacementId)) {
        return { ...r, returned: true };
      }
      return r;
    });

    const newRetiredEntry: RetiredPlayer = {
      playerId: retiredId,
      replacedById: replacementId,
      runs,
      balls: ballsFaced,
      returned: false,
    };

    const updated = [...innings] as [ScoringInnings, ScoringInnings];
    updated[idx] = {
      ...inn,
      striker_id: isStriker ? replacementId : inn.striker_id,
      non_striker_id: isNonStriker ? replacementId : inn.non_striker_id,
      retired_players: [...existingRetired, newRetiredEntry],
    };

    const retireAction: ScoringAction = {
      type: 'retire',
      retiredId,
      replacedById: replacementId,
      slot: isStriker ? 'striker' : 'non_striker',
      previousStrikerId: inn.striker_id,
      previousNonStrikerId: inn.non_striker_id,
      runs,
      balls: ballsFaced,
    };

    set({
      innings: updated,
      actionStack: [...actionStack, retireAction],
      redoActionStack: [],
      redoStack: [],
    });

    // Cloud sync — update innings crease + retired_players
    const { dbMatchId, idMap } = get();
    if (isCloudMode() && dbMatchId) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const updInn = updated[idx];
      syncToDb('retireBatsman', () => supabase.from('practice_innings').update({
        striker_id: updInn.striker_id ? toServerId(idMap, updInn.striker_id) : null,
        non_striker_id: updInn.non_striker_id ? toServerId(idMap, updInn.non_striker_id) : null,
        retired_players: JSON.stringify(updInn.retired_players.map((r) => ({
          ...r, playerId: toServerId(idMap, r.playerId), replacedById: toServerId(idMap, r.replacedById),
        }))),
      }).eq('match_id', dbMatchId).eq('innings_number', idx));
    }
  },

  endInnings: () => {
    const { match, innings } = get();
    if (!match) return;
    const idx = match.current_innings;
    const updated = [...innings] as [ScoringInnings, ScoringInnings];
    updated[idx] = { ...updated[idx], is_completed: true };
    if (idx === 0) {
      updated[1] = { ...updated[1], target: updated[0].total_runs + 1 };
    }

    if (idx === 0) {
      // 1st innings over → innings break
      set({ innings: updated, match: { ...match, status: 'innings_break' } });
    } else {
      // 2nd innings over → compute result via endMatch (which handles result_summary + match_winner + DB sync)
      set({ innings: updated });
      get().endMatch();
      return; // endMatch handles DB sync
    }

    const { dbMatchId } = get();
    if (isCloudMode() && dbMatchId) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      syncToDb('endInnings', () => supabase.from('practice_innings').update({ is_completed: true })
        .eq('match_id', dbMatchId).eq('innings_number', idx));
      syncToDb('endInnings target', () => supabase.from('practice_innings')
        .update({ target: updated[0].total_runs + 1 }).eq('match_id', dbMatchId).eq('innings_number', 1));
      syncToDb('endInnings match', () => supabase.from('practice_matches')
        .update({ status: 'innings_break' }).eq('id', dbMatchId));
    }
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
    set({ innings: updated, match: { ...match, current_innings: 1, status: 'scoring' }, isFreeHit: false, lastBallId: null });

    const { dbMatchId, idMap } = get();
    if (isCloudMode() && dbMatchId) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      syncToDb('startSecondInnings', () => supabase.from('practice_innings').update({
        target: updated[0].total_runs + 1,
        striker_id: toServerId(idMap, strikerId),
        non_striker_id: toServerId(idMap, nonStrikerId),
        bowler_id: toServerId(idMap, bowlerId),
      }).eq('match_id', dbMatchId).eq('innings_number', 1));
      syncToDb('startSecondInnings match', () => supabase.from('practice_matches')
        .update({ current_innings: 1, status: 'scoring' }).eq('id', dbMatchId));
    }
  },

  endMatch: () => {
    const { match, innings, balls } = get();
    if (!match) return;
    const first = innings[0];
    const second = innings[1];
    let resultSummary = match.result_summary;
    let matchWinner: string | null = null;

    // Only compute result if both innings completed naturally
    // (2nd innings must be completed — all out, overs done, or target reached)
    const matchFinishedNaturally = first.is_completed && second.is_completed;

    if (!resultSummary) {
      if (!matchFinishedNaturally) {
        // Match ended early — aborted/abandoned before natural conclusion
        resultSummary = 'Match ended — No result';
        matchWinner = null;
      } else {
        const firstTotal = first.total_runs;
        const secondTotal = second.total_runs;
        if (secondTotal > firstTotal) {
          const batTeamSize = second.batting_team === 'team_a' ? match.team_a.players.length : match.team_b.players.length;
          const wicketsLeft = batTeamSize - 1 - second.total_wickets;
          const winner = second.batting_team === 'team_a' ? match.team_a.name : match.team_b.name;
          resultSummary = `${winner} won by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}`;
          matchWinner = second.batting_team;
        } else if (secondTotal === firstTotal) {
          resultSummary = 'Match tied';
          matchWinner = 'tied';
        } else {
          const runDiff = firstTotal - secondTotal;
          const winner = first.batting_team === 'team_a' ? match.team_a.name : match.team_b.name;
          resultSummary = `${winner} won by ${runDiff} run${runDiff !== 1 ? 's' : ''}`;
          matchWinner = first.batting_team;
        }
      }
    }

    // Always derive match_winner from scores (even if result_summary was pre-set by recordBall)
    if (!matchWinner && matchFinishedNaturally) {
      const firstTotal = first.total_runs;
      const secondTotal = second.total_runs;
      if (secondTotal > firstTotal) matchWinner = second.batting_team;
      else if (secondTotal < firstTotal) matchWinner = first.batting_team;
      else matchWinner = 'tied';
    }

    set({ match: { ...match, status: 'completed', result_summary: resultSummary }, leaderboard: {} });

    const { dbMatchId } = get();
    if (isCloudMode() && dbMatchId) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      syncToDb('endMatch', () => supabase.from('practice_matches').update({
        status: 'completed',
        result_summary: resultSummary,
        match_winner: matchWinner,
        completed_at: new Date().toISOString(),
      }).eq('id', dbMatchId));
    }
  },

  handOffTo: (playerName, playerId) => {
    const { match } = get();
    if (!match) return;
    set({ match: { ...match, active_scorer_id: playerId, scorer_name: playerName } });

    const { dbMatchId } = get();
    if (isCloudMode() && dbMatchId) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      syncToDb('claim_scorer', () => supabase.rpc('claim_scorer', {
        target_match_id: dbMatchId,
        scorer_display_name: playerName,
      }));
    }
  },

  getCurrentInnings: () => {
    const { match, innings } = get();
    const idx = match?.current_innings ?? 0;
    return innings[idx];
  },

  getCurrentOverBalls: () => {
    const { match, balls, innings } = get();
    if (!match) return [];
    const idx = match.current_innings;
    const inningsBalls = balls.filter((b) => b.innings === idx);
    const legalBalls = inningsBalls.filter((b) => b.is_legal).length;
    // Current over number = where the next ball will be bowled
    // If a new bowler has been selected (bowler_id set after over ends), show the new over
    const currentOverNum = Math.floor(legalBalls / 6);
    // Check if we're between overs (just completed, bowler selected for next)
    // If legalBalls is exactly on an over boundary AND bowler is set, show new (empty) over
    if (legalBalls > 0 && legalBalls % 6 === 0 && innings[idx].bowler_id) {
      return inningsBalls.filter((b) => b.over_number === currentOverNum);
    }
    // Mid-over or no balls yet — show current over's balls
    const overNum = legalBalls > 0 && legalBalls % 6 === 0 ? currentOverNum - 1 : currentOverNum;
    return inningsBalls.filter((b) => b.over_number === overNum);
  },

  getBattingStats: (inningsIdx) => {
    const { match, balls } = get();
    if (!match) return [];
    const inn = get().innings[inningsIdx];
    const battingTeam = inn.batting_team === 'team_a' ? match.team_a : match.team_b;
    const inningsBalls = balls.filter((b) => b.innings === inningsIdx);

    // Determine which players have batted (include current batsmen even if no balls faced yet)
    const batterIds = new Set<string>();
    for (const b of inningsBalls) {
      batterIds.add(b.striker_id);
    }
    if (inn.striker_id) batterIds.add(inn.striker_id);
    if (inn.non_striker_id) batterIds.add(inn.non_striker_id);

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
        if (b.is_wicket && b.wicket_type !== 'retired' && b.dismissed_id === player.id) {
          isOut = true;
          howOut = b.wicket_type ?? 'out';
        }
      }

      // Check if currently retired (not dismissed, not at crease)
      const isRetired = !isOut && inn.retired_players.some(
        (r) => r.playerId === player.id && !r.returned,
      );

      stats.push({
        player,
        runs,
        balls: ballsFaced,
        fours,
        sixes,
        strike_rate: ballsFaced > 0 ? parseFloat(((runs / ballsFaced) * 100).toFixed(1)) : 0,
        is_out: isOut,
        how_out: isRetired ? 'retired' : howOut,
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
        if (b.is_wicket && b.wicket_type !== 'retired') wickets++;
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

    // Exclude dismissed players (but NOT retired — they're tracked separately)
    const dismissed = new Set<string>();
    for (const b of inningsBalls) {
      if (b.is_wicket && b.wicket_type !== 'retired' && b.dismissed_id) dismissed.add(b.dismissed_id);
    }

    // Exclude currently retired players (they appear in getRetiredBatsmen instead)
    const currentlyRetired = new Set(
      inn.retired_players.filter((r) => !r.returned).map((r) => r.playerId),
    );

    return battingTeam.players.filter(
      (p) => !haveBatted.has(p.id) && !dismissed.has(p.id) && !currentlyRetired.has(p.id)
    );
  },

  getRetiredBatsmen: () => {
    const { match, innings } = get();
    if (!match) return [];
    const idx = match.current_innings;
    const inn = innings[idx];
    const battingTeam = inn.batting_team === 'team_a' ? match.team_a : match.team_b;

    // Return currently retired players (not yet returned) with their stats at retirement
    return inn.retired_players
      .filter((r) => !r.returned)
      .map((r) => {
        const player = battingTeam.players.find((p) => p.id === r.playerId);
        if (!player) return null;
        return { ...player, retiredRuns: r.runs, retiredBalls: r.balls };
      })
      .filter(Boolean) as (ScoringPlayer & { retiredRuns: number; retiredBalls: number })[];
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

  revertMatch: async (matchId: string) => {
    if (!isCloudMode()) return false;
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { data, error } = await supabase.rpc('revert_match_to_scoring', { target_match_id: matchId });
    if (error) { console.error('[scoring] revertMatch failed:', error); toast.error('Failed to revert'); return false; }
    if (!data) { toast.error('Not authorized — admin only'); return false; }
    toast.success('Match reverted — ready to score');
    await get().loadMatchHistory();
    return true;
  },

  deleteMatch: async (matchId: string, deleterName: string) => {
    if (!isCloudMode()) {
      // Local mode: remove from matchHistory directly
      set({ matchHistory: get().matchHistory.filter((m) => m.id !== matchId) });
      toast.success('Match deleted');
      return true;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { data, error } = await supabase.rpc('soft_delete_match', {
      target_match_id: matchId,
      deleter_name: deleterName,
    });
    if (error) {
      console.error('[scoring] deleteMatch failed:', error);
      toast.error('Failed to delete match');
      return false;
    }
    if (data === false) {
      toast.error('Not authorized to delete this match');
      return false;
    }
    toast.success('Match deleted');
    set({ leaderboard: {} }); // Clear cached stats
    await get().loadMatchHistory();
    await get().loadDeletedMatches();
    return true;
  },

  restoreMatch: async (matchId: string) => {
    if (!isCloudMode()) return false;
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { data, error } = await supabase.rpc('restore_match', { target_match_id: matchId });
    if (error) { console.error('[scoring] restoreMatch failed:', error); toast.error('Failed to restore'); return false; }
    if (!data) { toast.error('Not authorized'); return false; }
    toast.success('Match restored');
    set({ leaderboard: {} }); // Clear cached stats
    await get().loadMatchHistory();
    await get().loadDeletedMatches();
    return true;
  },

  permanentDeleteMatch: async (matchId: string) => {
    if (!isCloudMode()) return false;
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { data, error } = await supabase.rpc('permanent_delete_match', { target_match_id: matchId });
    if (error) { console.error('[scoring] permanentDelete failed:', error); toast.error('Failed to permanently delete'); return false; }
    if (!data) { toast.error('Not authorized — admin only'); return false; }
    toast.success('Match permanently deleted');
    set({ leaderboard: {} }); // Clear cached stats
    await get().loadDeletedMatches();
    return true;
  },

  loadDeletedMatches: async () => {
    if (!isCloudMode()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc('get_deleted_matches', { result_limit: 20 });
    if (error) { console.error('[scoring] loadDeletedMatches failed:', error); return; }
    set({ deletedMatches: (data ?? []) as MatchHistoryItem[] });
  },

  fetchGuestSuggestions: async () => {
    if (!isCloudMode()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc('get_guest_suggestions');
    if (error) { console.error('[scoring] fetchGuestSuggestions:', error); return; }
    set({ guestSuggestions: (data ?? []) as { id: string; name: string }[] });
  },

  setLeaderboardMatchLimit: (limit: number | null) => {
    set({ leaderboardMatchLimit: limit, leaderboard: {} });
  },

  fetchLeaderboard: async (category: string) => {
    if (!isCloudMode()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const requestId = ++leaderboardRequestCounter;
    set({ leaderboardLoading: true });
    const { leaderboardMatchLimit } = get();
    const rpcParams: Record<string, unknown> = { p_category: category };
    if (leaderboardMatchLimit !== null) rpcParams.p_match_limit = leaderboardMatchLimit;
    const { data, error } = await supabase.rpc('get_practice_leaderboard', rpcParams);
    if (requestId !== leaderboardRequestCounter) return; // stale
    if (error) { console.error('[scoring] fetchLeaderboard:', error); set({ leaderboardLoading: false }); return; }
    set((state) => ({
      leaderboard: { ...state.leaderboard, [category]: (data ?? []) as LeaderboardEntry[] },
      leaderboardLoading: false,
    }));
  },

  loadMatchHistory: async (loadMore = false, fromDate?: string, toDate?: string) => {
    if (!isCloudMode()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!loadMore) set({ historyLoading: true });
    const offset = loadMore ? get().matchHistory.length : 0;
    const { data, error } = await supabase.rpc('get_match_history', {
      match_status: null,
      result_limit: 10,
      result_offset: offset,
      from_date: fromDate ?? null,
      to_date: toDate ?? null,
    });
    if (error) { console.error('[scoring] loadMatchHistory failed:', error); set({ historyLoading: false }); return; }
    const items = (data ?? []) as MatchHistoryItem[];
    if (loadMore) {
      const existing = new Set(get().matchHistory.map((m) => m.id));
      set({ matchHistory: [...get().matchHistory, ...items.filter((m) => !existing.has(m.id))], historyLoading: false });
    } else {
      set({ matchHistory: items, historyLoading: false });
    }
  },

  resumeMatch: async (matchId: string) => {
    if (!isCloudMode()) return false;
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { data, error } = await supabase.rpc('get_match_scorecard', { target_match_id: matchId });
    if (error || !data) { console.error('[scoring] resumeMatch failed:', error); return false; }

    const sc = data as ScorecardRpc;
    const dbMatch = sc.match;

    // Match permanently deleted (CASCADE) — row is gone
    if (!dbMatch) { get().reset(); return false; }

    // Match completed or soft-deleted on another device — clear local state
    if (dbMatch.status === 'completed' || dbMatch.deleted_at) { get().reset(); return false; }

    const hydrated = hydrateMatchFromDb(sc);
    if (!hydrated) { get().reset(); return false; }

    const { match, innings, balls, idMap } = hydrated;
    const lastBall = balls.length > 0 ? balls[balls.length - 1] : null;
    set({ match, innings, balls, dbMatchId: matchId, idMap, isFreeHit: lastBall?.extras_type === 'no_ball', lastBallId: lastBall?.id ?? null, actionStack: [], redoStack: [], redoActionStack: [], wizardStep: 1 });

    // Claim scorer so RLS allows writes
    const scorerName = match.scorer_name ?? 'Scorer';
    supabase.rpc('claim_scorer', {
      target_match_id: matchId,
      scorer_display_name: scorerName,
    }).then(({ error }: { error: unknown }) => {
      if (error) console.error('[scoring] claim_scorer on resume failed:', error);
    });

    return true;
  },

  viewScorecard: async (matchId: string) => {
    if (!isCloudMode()) return false;
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { data, error } = await supabase.rpc('get_match_scorecard', { target_match_id: matchId });
    if (error || !data) { console.error('[scoring] viewScorecard failed:', error); return false; }

    const hydrated = hydrateMatchFromDb(data as ScorecardRpc);
    if (!hydrated) return false;

    const { match, innings, balls, idMap } = hydrated;
    set({ match, innings, balls, dbMatchId: matchId, idMap, isFreeHit: false, lastBallId: null, actionStack: [], redoStack: [], redoActionStack: [], wizardStep: 1 });
    return true;
  },

  reset: () => {
    set({
      match: null,
      innings: [makeEmptyInnings('team_a'), makeEmptyInnings('team_b')],
      balls: [],
      wizardStep: 1,
      isFreeHit: false,
      lastBallId: null,
      actionStack: [],
      redoStack: [],
      redoActionStack: [],
      dbMatchId: null,
      idMap: {},
    });
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('scoring-view');
    }
  },
}),
    {
      name: 'scoring-match',
      partialize: (state) => ({
        match: state.match,
        innings: state.innings,
        balls: state.balls,
        isFreeHit: state.isFreeHit,
        lastBallId: state.lastBallId,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
        redoActionStack: state.redoActionStack,
        wizardStep: state.wizardStep,
        dbMatchId: state.dbMatchId,
        idMap: state.idMap,
      }),
    },
  ),
);
