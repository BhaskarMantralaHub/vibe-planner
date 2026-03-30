export type MatchStatus = 'setup' | 'scoring' | 'innings_break' | 'completed';
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

export type RetiredPlayer = {
  playerId: string;
  replacedById: string;
  runs: number;
  balls: number;
  returned: boolean;
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
  retired_players: RetiredPlayer[];
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

export type ScoringAction =
  | { type: 'ball'; ballId: string }
  | {
      type: 'retire';
      retiredId: string;
      replacedById: string;
      slot: 'striker' | 'non_striker';
      previousStrikerId: string | null;
      previousNonStrikerId: string | null;
      runs: number;
      balls: number;
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

export type LeaderboardEntry = {
  player_id: string;
  name: string;
  photo_url: string | null;
  is_guest?: boolean;
  matches?: number;
  // Batting
  total_runs?: number;
  balls_faced?: number;
  strike_rate?: number;
  fours?: number;
  sixes?: number;
  // Bowling
  total_wickets?: number;
  legal_balls?: number;
  runs_conceded?: number;
  economy?: number;
  wides?: number;
  no_balls?: number;
  // Fielding
  total_catches?: number;
  total_runouts?: number;
  total_stumpings?: number;
  total_dismissals?: number;
  // All-rounder
  score?: number;
};

export type MatchHistoryItem = {
  id: string;
  title: string;
  match_date: string;
  status: MatchStatus;
  overs_per_innings: number;
  team_a_name: string;
  team_b_name: string;
  result_summary: string | null;
  match_winner: string | null;
  scorer_name: string | null;
  share_token: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  first_innings: { batting_team: TeamSide; total_runs: number; total_wickets: number; total_overs: number } | null;
  second_innings: { batting_team: TeamSide; total_runs: number; total_wickets: number; total_overs: number } | null;
};
