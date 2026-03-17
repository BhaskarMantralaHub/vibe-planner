export type ExpenseCategory = 'ground' | 'equipment' | 'tournament' | 'food' | 'other';
export type SeasonType = 'spring' | 'summer' | 'fall';
export type PlayerRole = 'batsman' | 'bowler' | 'all-rounder' | 'keeper';
export type BattingStyle = 'right' | 'left';
export type BowlingStyle = 'pace' | 'medium' | 'spin' | '';

export type CricketPlayer = {
  id: string;
  user_id: string;
  name: string;
  jersey_number: number | null;
  phone: string | null;
  player_role: PlayerRole | null;
  batting_style: BattingStyle | null;
  bowling_style: BowlingStyle | null;
  cricclub_id: string | null;
  shirt_size: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CricketSeason = {
  id: string;
  user_id: string;
  name: string;
  year: number;
  season_type: SeasonType;
  share_token: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CricketExpense = {
  id: string;
  user_id: string;
  season_id: string;
  paid_by: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expense_date: string;
  created_at: string;
  updated_at: string;
};

export type CricketExpenseSplit = {
  id: string;
  expense_id: string;
  player_id: string;
  share_amount: number;
};

export type CricketSettlement = {
  id: string;
  user_id: string;
  season_id: string;
  from_player: string;
  to_player: string;
  amount: number;
  settled_date: string;
  created_at: string;
};

export type PlayerBalance = {
  player_id: string;
  player_name: string;
  jersey_number: number | null;
  total_paid: number;
  total_owed: number;
  settlements_paid: number;
  settlements_received: number;
  net_balance: number;
};
