export type ExpenseCategory = 'ground' | 'equipment' | 'tournament' | 'food' | 'other';
export type SplitCategory = 'snacks' | 'drinks' | 'food' | 'other';
export type SeasonType = 'spring' | 'summer' | 'fall';
export type PlayerRole = 'batsman' | 'bowler' | 'all-rounder' | 'keeper';
export type BattingStyle = 'right' | 'left';
export type BowlingStyle = 'pace' | 'medium' | 'spin' | '';

export type CricketPlayer = {
  id: string;
  user_id: string | null;
  name: string;
  jersey_number: number | null;
  phone: string | null;
  player_role: PlayerRole | null;
  batting_style: BattingStyle | null;
  bowling_style: BowlingStyle | null;
  cricclub_id: string | null;
  shirt_size: string | null;
  email: string | null;
  designation: 'captain' | 'vice-captain' | null;
  photo_url: string | null;
  is_active: boolean;
  is_guest: boolean;
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
  fee_amount: number;
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
  receipt_urls: string[] | null;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
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

export type CricketSeasonFee = {
  id: string;
  season_id: string;
  player_id: string;
  amount_paid: number;
  paid_date: string | null;
  marked_by: string | null;
  created_at: string;
};

export type CricketSponsorship = {
  id: string;
  season_id: string;
  sponsor_name: string;
  amount: number;
  sponsored_date: string;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
};

export type GalleryPost = {
  id: string;
  season_id: string;
  user_id: string;
  photo_url: string | null;
  photo_urls: string[] | null;
  caption: string | null;
  posted_by: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type GalleryTag = {
  id: string;
  post_id: string;
  player_id: string;
};

export type GalleryComment = {
  id: string;
  post_id: string;
  user_id: string;
  comment_by: string | null;
  text: string;
  created_at: string;
};

export type GalleryLike = {
  id: string;
  post_id: string;
  user_id: string;
  liked_by: string | null;
};

export type CommentReaction = {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
};

export type GalleryNotification = {
  id: string;
  user_id: string;
  post_id: string | null;  // null for non-gallery notifications (join_request, approval)
  type: 'tag' | 'comment' | 'like' | 'join_request' | 'approval';
  message: string;
  is_read: boolean;
  created_at: string;
};

export type PendingMember = {
  user_id: string;
  joined_at: string;
  name: string;
  email: string;
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


/* ── Umpiring duties ── */

/** open → claimed → completed | no_show. `cancelled` is terminal. */
export type DutyStatus = 'open' | 'claimed' | 'completed' | 'no_show' | 'cancelled';

/** 'mtca' published by MTCA · 'swap_in' taken over from another team offline · 'manual' admin-created. */
export type DutySource = 'mtca' | 'swap_in' | 'manual';

export type DutyCancelReason = 'admin' | 'mtca_removed';

/** Reason codes returned by claim_umpiring_duty / release_umpiring_duty. */
export type DutyClaimResult =
  | 'ok'
  | 'not_found'
  | 'not_member'
  | 'no_player'
  | 'not_open'
  | 'past'
  | 'duplicate_slot'
  | 'not_yours'
  | 'locked';

export type CricketUmpiringDuty = {
  id: string;
  team_id: string;
  season_id: string;

  cricclubs_fixture_id: number | null;   // null = not from MTCA (swap_in / manual)
  /** Which umpire position this duty is. MTCA publishes only 1 and 2 (its
   *  fixtures page has exactly two umpire columns); hand-added duties may use
   *  3-4 for an extra person MTCA has no column for. */
  role_slot: number;

  match_date: string;
  match_time: string | null;             // 'HH:MM' 24h
  venue: string | null;
  team_a: string;                        // the two sides playing (usually not us)
  team_b: string;
  /** No 'practice' — umpiring duties only come from MTCA league and playoff
   *  fixtures. Includes the playoff rounds, which MTCA does assign umpires on. */
  match_type: 'league' | 'semi_final' | 'final' | null;

  umpire_team_cricclubs_id: number | null;
  umpire_team_raw: string | null;

  source: DutySource;
  swap_team: string | null;

  assigned_player_id: string | null;     // null = open slot
  assigned_player_name: string | null;   // snapshot; survives a player hard-delete
  assigned_by: string | null;            // 'self' or an admin's name
  assigned_at: string | null;

  status: DutyStatus;
  cancelled_reason: DutyCancelReason | null;
  completed_by: string | null;
  completed_at: string | null;
  notes: string | null;

  /** Set by the sync when MTCA no longer names us for this slot. Admin reviews. */
  mtca_removed_at: string | null;

  deleted_at: string | null;             // tombstone: duty handed to another team
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CricketUmpiringSettings = {
  season_id: string;
  team_id: string;
  duty_target: number;
  cricclubs_team_id: number | null;
  created_at: string;
  updated_at: string;
};

/* ── Peer-to-peer Splits (completely separate from pool expenses) ── */

export type CricketSplit = {
  id: string;
  team_id: string;
  season_id: string;
  paid_by: string;
  category: SplitCategory;
  description: string;
  amount: number;
  split_date: string;
  receipt_urls: string[] | null;
  created_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CricketSplitShare = {
  id: string;
  split_id: string;
  player_id: string;
  share_amount: number;
};

export type CricketSplitSettlement = {
  id: string;
  team_id: string;
  season_id: string;
  from_player: string;
  to_player: string;
  amount: number;
  settled_date: string;
  created_at: string;
};
