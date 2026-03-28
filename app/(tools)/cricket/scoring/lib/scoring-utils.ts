/**
 * Type conversion utilities between the scoring Zustand store
 * (ScoringBall, BattingStats, BowlingStats) and the display
 * component types (BallResult, BallEntry, BatsmanScore, etc.).
 *
 * Single source of truth for all store → UI adaptations.
 */

import type {
  ScoringBall,
  ScoringPlayer,
  ScoringTeam,
  ScoringInnings,
  ScoringMatch,
  BattingStats,
  BowlingStats,
  WicketType,
} from '@/types/scoring';
import type { BallResult, BallType } from '../components/OverTimeline';
import type { BallEntry, OverSummary, TimelineEntry } from '../components/BallByBallLog';
import type { BatsmanScore, BowlerFigure, ExtrasBreakdown, InningsSummary } from '../components/FullScorecard';
import type { BowlerFigures } from '../components/EndOfOverSheet';

/* ── Display name: appends (G) for guest players ── */
export function displayName(player: ScoringPlayer): string {
  return player.is_guest ? `${player.name} (G)` : player.name;
}

/* ── Player map ── */

export function buildPlayerMap(match: ScoringMatch): Map<string, ScoringPlayer> {
  const map = new Map<string, ScoringPlayer>();
  for (const p of match.team_a.players) map.set(p.id, p);
  for (const p of match.team_b.players) map.set(p.id, p);
  return map;
}

/* ── Dismissal text ── */

export function constructDismissalText(
  wicketType: WicketType | null,
  bowlerName?: string,
  fielderName?: string,
  verbose = false,
): string {
  if (!wicketType) return 'out';
  switch (wicketType) {
    case 'bowled':     return verbose ? `b ${bowlerName ?? '?'}` : 'bowled';
    case 'caught':     return verbose ? `c ${fielderName ?? '?'} b ${bowlerName ?? '?'}` : `caught by ${fielderName ?? '?'}`;
    case 'lbw':        return verbose ? `lbw b ${bowlerName ?? '?'}` : `lbw, bowled ${bowlerName ?? '?'}`;
    case 'run_out':    return `run out by ${fielderName ?? '?'}`;
    case 'stumped':    return verbose ? `st ${fielderName ?? '?'} b ${bowlerName ?? '?'}` : `stumped by ${fielderName ?? '?'}`;
    case 'hit_wicket': return verbose ? `hit wicket b ${bowlerName ?? '?'}` : 'hit wicket';
    case 'retired':    return 'retired';
    default:           return 'out';
  }
}

/* ── Overs formatting ── */

export function formatOversDisplay(overs: number): string {
  const str = overs.toFixed(1);
  return str;
}

/* ── OverTimeline: ScoringBall → BallResult ── */

export function scoringBallToBallResult(ball: ScoringBall): BallResult {
  const totalRuns = ball.runs_bat + ball.runs_extras;

  // Wicket — show runs if any were scored (e.g. run out with completed runs)
  if (ball.is_wicket) {
    return ball.runs_bat > 0
      ? { type: 'W', label: `W+${ball.runs_bat}` }
      : { type: 'W' };
  }

  // Wide — always show total runs (1 penalty + additional)
  if (ball.extras_type === 'wide') {
    return { type: 'Wd', label: `${totalRuns}wd` };
  }

  // No Ball — always show total (1 penalty + bat runs)
  if (ball.extras_type === 'no_ball') {
    return { type: 'NB', label: `${totalRuns}nb` };
  }

  // Bye — always show runs
  if (ball.extras_type === 'bye') {
    return { type: 'B', label: `${ball.runs_extras}b` };
  }

  // Leg Bye — always show runs
  if (ball.extras_type === 'leg_bye') {
    return { type: 'LB', label: `${ball.runs_extras}lb` };
  }

  if (ball.runs_bat === 0) return { type: 'dot' };
  return { type: String(ball.runs_bat) as BallType };
}

/* ── BallByBallLog: ScoringBall → BallEntry ── */

function scoringBallToEntryType(ball: ScoringBall): BallEntry['type'] {
  if (ball.is_wicket) return 'wicket';
  if (ball.extras_type === 'wide') return 'wide';
  if (ball.extras_type === 'no_ball') return 'noball';
  if (ball.extras_type === 'bye') return 'bye';
  if (ball.extras_type === 'leg_bye') return 'legbye';
  if (ball.runs_bat === 0) return 'dot';
  if (ball.runs_bat === 1) return 'single';
  if (ball.runs_bat === 2) return 'double';
  if (ball.runs_bat === 3) return 'triple';
  if (ball.runs_bat === 4) return 'four';
  if (ball.runs_bat === 6) return 'six';
  return 'single';
}

export function scoringBallToBallEntry(
  ball: ScoringBall,
  playerMap: Map<string, ScoringPlayer>,
): BallEntry {
  const bowler = playerMap.get(ball.bowler_id);
  const batter = playerMap.get(ball.striker_id);
  const fielder = ball.fielder_id ? playerMap.get(ball.fielder_id) : undefined;

  let wicketText: string | undefined;
  if (ball.is_wicket) {
    wicketText = constructDismissalText(
      ball.wicket_type,
      bowler ? displayName(bowler) : undefined,
      fielder ? displayName(fielder) : undefined,
    );
  }

  return {
    overBall: `${ball.over_number}.${ball.ball_in_over + 1}`,
    bowler: bowler ? displayName(bowler) : '?',
    batter: batter ? displayName(batter) : '?',
    runs: ball.runs_bat + ball.runs_extras,
    type: scoringBallToEntryType(ball),
    wicketText,
    timestamp: '',
  };
}

/* ── BallByBallLog: Full timeline with over summaries ── */

export function buildTimeline(
  inningsIdx: number,
  balls: ScoringBall[],
  innings: ScoringInnings,
  match: ScoringMatch,
  playerMap: Map<string, ScoringPlayer>,
): TimelineEntry[] {
  const inningsBalls = balls.filter((b) => b.innings === inningsIdx);
  if (inningsBalls.length === 0) return [];

  const teamName = innings.batting_team === 'team_a' ? match.team_a.name : match.team_b.name;
  const timeline: TimelineEntry[] = [];

  // Group balls by over_number
  const overGroups = new Map<number, ScoringBall[]>();
  for (const b of inningsBalls) {
    if (!overGroups.has(b.over_number)) overGroups.set(b.over_number, []);
    overGroups.get(b.over_number)!.push(b);
  }

  let runningTotal = 0;
  let runningWickets = 0;

  for (const [overNum, overBalls] of overGroups) {
    // Emit ball entries for this over
    for (const b of overBalls) {
      timeline.push({ kind: 'ball', data: scoringBallToBallEntry(b, playerMap) });
      runningTotal += b.runs_bat + b.runs_extras;
      if (b.is_wicket) runningWickets++;
    }

    // Emit over summary if over is complete (6 legal balls)
    const legalInOver = overBalls.filter((b) => b.is_legal).length;
    if (legalInOver === 6) {
      const overRuns = overBalls.reduce((s, b) => s + b.runs_bat + b.runs_extras, 0);
      const bowlerP = playerMap.get(overBalls[0].bowler_id);
      const bowlerName = bowlerP ? displayName(bowlerP) : '?';

      // Batsmen who faced in this over
      const batsmenInOver = new Map<string, { runs: number; balls: number }>();
      for (const b of overBalls) {
        const id = b.striker_id;
        const existing = batsmenInOver.get(id) ?? { runs: 0, balls: 0 };
        existing.runs += b.runs_bat;
        if (b.is_legal || b.extras_type === 'no_ball') existing.balls++;
        batsmenInOver.set(id, existing);
      }

      const batsmen = Array.from(batsmenInOver.entries()).map(([id, stats]) => ({
        name: (() => { const p = playerMap.get(id); return p ? displayName(p) : '?'; })(),
        runs: stats.runs,
        balls: stats.balls,
      }));

      const completedOvers = overNum + 1;
      const summary: OverSummary = {
        overNumber: completedOvers,
        totalRuns: overRuns,
        batsmen,
        bowlerName,
        bowlerFigures: '', // simplified — not shown prominently
        runRate: completedOvers > 0 ? (runningTotal / completedOvers).toFixed(2) : '0.00',
        teamName,
        teamScore: `${runningTotal}/${runningWickets}`,
      };
      timeline.push({ kind: 'overSummary', data: summary });
    }
  }

  return timeline;
}

/* ── FullScorecard: Build InningsSummary ── */

export function buildInningsSummary(
  inningsIdx: number,
  match: ScoringMatch,
  innings: ScoringInnings,
  battingStats: BattingStats[],
  bowlingStats: BowlingStats[],
  balls: ScoringBall[],
  playerMap: Map<string, ScoringPlayer>,
): InningsSummary {
  const teamName = innings.batting_team === 'team_a' ? match.team_a.name : match.team_b.name;
  const battingTeam = innings.batting_team === 'team_a' ? match.team_a : match.team_b;
  const inningsBalls = balls.filter((b) => b.innings === inningsIdx);

  // Batsmen who have batted
  const battedIds = new Set(battingStats.map((s) => s.player.id));

  const batsmen: BatsmanScore[] = battingStats.map((bs) => {
    let dismissal = 'not out';
    if (bs.is_out) {
      const wicketBall = inningsBalls.find((b) => b.is_wicket && b.dismissed_id === bs.player.id);
      if (wicketBall) {
        const bowler = playerMap.get(wicketBall.bowler_id);
        const fielder = wicketBall.fielder_id ? playerMap.get(wicketBall.fielder_id) : undefined;
        dismissal = constructDismissalText(wicketBall.wicket_type, bowler ? displayName(bowler) : undefined, fielder ? displayName(fielder) : undefined, true);
      } else {
        dismissal = bs.how_out ?? 'out';
      }
    }

    return {
      name: displayName(bs.player),
      isStriker: bs.player.id === innings.striker_id,
      dismissal,
      runs: bs.runs,
      balls: bs.balls,
      fours: bs.fours,
      sixes: bs.sixes,
      sr: bs.strike_rate.toFixed(1),
    };
  });

  // Did not bat
  const didNotBat = battingTeam.players
    .filter((p) => !battedIds.has(p.id))
    .map((p) => displayName(p));

  // Bowler figures
  const bowlers: BowlerFigure[] = bowlingStats.map((bs) => {
    // Count dots for this bowler
    const bowlerBalls = inningsBalls.filter((b) => b.bowler_id === bs.player.id);
    const dots = bowlerBalls.filter((b) => b.is_legal && b.runs_bat === 0 && !b.is_wicket && !b.extras_type).length;

    const extrasStr = formatBowlerExtras(bs.wides, bs.no_balls);
    return {
      name: displayName(bs.player),
      overs: bs.overs,
      maidens: bs.maidens,
      dots,
      runs: bs.runs,
      wickets: bs.wickets,
      economy: bs.economy.toFixed(2),
      extras: extrasStr || undefined,
    };
  });

  // Extras breakdown
  const extras: ExtrasBreakdown = {
    wides: innings.extras.wide,
    noBalls: innings.extras.no_ball,
    byes: innings.extras.bye,
    legByes: innings.extras.leg_bye,
    total: innings.extras.wide + innings.extras.no_ball + innings.extras.bye + innings.extras.leg_bye,
  };

  // Fall of wickets
  const fallOfWickets = computeFallOfWickets(inningsBalls, playerMap);

  return {
    teamName,
    target: innings.target ?? undefined,
    batsmen,
    didNotBat,
    extras,
    totalRuns: innings.total_runs,
    totalWickets: innings.total_wickets,
    totalOvers: formatOversDisplay(innings.total_overs),
    bowlers,
    fallOfWickets,
  };
}

/* ── Fall of Wickets ── */

function computeFallOfWickets(
  inningsBalls: ScoringBall[],
  playerMap: Map<string, ScoringPlayer>,
): { wicketNum: number; playerName: string; score: number; over: string }[] {
  const fow: { wicketNum: number; playerName: string; score: number; over: string }[] = [];
  let runningScore = 0;
  let wicketCount = 0;

  for (const b of inningsBalls) {
    runningScore += b.runs_bat + b.runs_extras;
    if (b.is_wicket) {
      wicketCount++;
      const dismissed = b.dismissed_id ? playerMap.get(b.dismissed_id) : playerMap.get(b.striker_id);
      fow.push({
        wicketNum: wicketCount,
        playerName: dismissed ? displayName(dismissed) : '?',
        score: runningScore,
        over: `${b.over_number}.${b.ball_in_over + 1}`,
      });
    }
  }

  return fow;
}

/* ── Bowler extras string ── */

function formatBowlerExtras(wides: number, noBalls: number): string {
  const parts: string[] = [];
  if (wides > 0) parts.push(`${wides}w`);
  if (noBalls > 0) parts.push(`${noBalls}nb`);
  return parts.length > 0 ? `(${parts.join(', ')})` : '';
}

/* ── EndOfOverSheet: BowlingStats → BowlerFigures ── */

export function bowlingStatsToBowlerFigures(
  stats: BowlingStats[],
  justBowledId?: string,
): BowlerFigures[] {
  return stats.map((bs) => ({
    id: bs.player.id,
    name: displayName(bs.player),
    overs: bs.overs,
    maidens: bs.maidens,
    runs: bs.runs,
    wickets: bs.wickets,
    economy: bs.economy.toFixed(2),
    justBowled: bs.player.id === justBowledId,
  }));
}

/* ── Partnership computation ── */

export function computePartnership(
  inningsIdx: number,
  balls: ScoringBall[],
): { runs: number; balls: number } {
  const inningsBalls = balls.filter((b) => b.innings === inningsIdx);

  // Find last wicket
  let lastWicketIdx = -1;
  for (let i = inningsBalls.length - 1; i >= 0; i--) {
    if (inningsBalls[i].is_wicket) {
      lastWicketIdx = i;
      break;
    }
  }

  const partnershipBalls = inningsBalls.slice(lastWicketIdx + 1);
  const runs = partnershipBalls.reduce((s, b) => s + b.runs_bat + b.runs_extras, 0);
  const legalBalls = partnershipBalls.filter((b) => b.is_legal).length;
  return { runs, balls: legalBalls };
}

/* ── Previous over runs ── */

export function computePreviousOverRuns(
  inningsIdx: number,
  balls: ScoringBall[],
  playerMap: Map<string, ScoringPlayer>,
): { runs: number; bowlerName: string } | null {
  const inningsBalls = balls.filter((b) => b.innings === inningsIdx);
  const legalBalls = inningsBalls.filter((b) => b.is_legal).length;
  if (legalBalls < 6) return null; // no completed over yet

  const currentOverNum = Math.floor(legalBalls / 6);
  // If we're at ball 0 of a new over, previous = currentOverNum - 1
  // If mid-over, previous = currentOverNum - 1
  const prevOverNum = legalBalls % 6 === 0 ? currentOverNum - 1 : currentOverNum - 1;
  if (prevOverNum < 0) return null;

  const prevOverBalls = inningsBalls.filter((b) => b.over_number === prevOverNum);
  if (prevOverBalls.length === 0) return null;

  const runs = prevOverBalls.reduce((s, b) => s + b.runs_bat + b.runs_extras, 0);
  const bowlerName = playerMap.get(prevOverBalls[0].bowler_id)?.name ?? '?';
  return { runs, bowlerName };
}
