export type MatchStatus = 'setup' | 'toss' | 'scoring' | 'innings_break' | 'completed';
export type TeamSide = 'team_a' | 'team_b';
export type TossDecision = 'bat' | 'bowl';
export type ExtrasType = 'wide' | 'no_ball' | 'bye' | 'leg_bye';
export type WicketType = 'bowled' | 'caught' | 'lbw' | 'run_out' | 'stumped' | 'hit_wicket' | 'retired';

export type ScoringPlayer = {
  id: string;
  name: string;
  jersey_number: number | null;
  player_id: string | null; // link to cricket_players, null for guests
  is_guest: boolean;
};

export type ScoringTeam = {
  name: string;
  captain_id: string | null;
  players: ScoringPlayer[];
};

export type ScoringBall = {
  id: string;
  innings: number; // 0 or 1
  sequence: number;
  over_number: number;
  ball_in_over: number;
  striker_id: string;
  non_striker_id: string;
  bowler_id: string;
  runs_bat: number;
  runs_extras: number;
  extras_type: ExtrasType | null;
  is_wicket: boolean;
  wicket_type: WicketType | null;
  dismissed_id: string | null;
  fielder_id: string | null;
  is_legal: boolean;
  is_free_hit: boolean;
};

export type ScoringInnings = {
  batting_team: TeamSide;
  total_runs: number;
  total_wickets: number;
  total_overs: number; // e.g., 6.3
  extras: { wide: number; no_ball: number; bye: number; leg_bye: number };
  striker_id: string | null;
  non_striker_id: string | null;
  bowler_id: string | null;
  is_completed: boolean;
  target: number | null; // set for 2nd innings
};

export type ScoringMatch = {
  id: string;
  title: string;
  team_a: ScoringTeam;
  team_b: ScoringTeam;
  overs_per_innings: number;
  match_date: string;
  toss_winner: TeamSide | null;
  toss_decision: TossDecision | null;
  status: MatchStatus;
  current_innings: number; // 0 or 1
  scorer_id: string | null;
  scorer_name: string | null;
  active_scorer_id: string | null;
  result_summary: string | null;
  mvp_player_id: string | null;
};

export type BattingStats = {
  player: ScoringPlayer;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strike_rate: number;
  is_out: boolean;
  how_out: string | null; // e.g., "c Anil b Sanjay"
};

export type BowlingStats = {
  player: ScoringPlayer;
  overs: string; // "3.2"
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
  wides: number;
  no_balls: number;
};
