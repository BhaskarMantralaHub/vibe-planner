-- ============================================================
-- Performance: Missing Indexes
-- Run in Supabase SQL Editor
-- ============================================================

-- Player user_id lookup (profile sync, suggestions, player linking)
CREATE INDEX IF NOT EXISTS idx_cricket_players_user_id
  ON cricket_players(user_id) WHERE user_id IS NOT NULL;

-- Expense splits by expense_id (junction table, queried for every expense display)
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense
  ON cricket_expense_splits(expense_id);

-- Leaderboard: completed matches per team (avoids seq scan on practice_matches)
CREATE INDEX IF NOT EXISTS idx_practice_matches_team_completed
  ON practice_matches(team_id, season_id)
  WHERE status = 'completed' AND deleted_at IS NULL;

-- Profiles access GIN (for is_global_admin() which runs on every RLS check)
CREATE INDEX IF NOT EXISTS idx_profiles_access
  ON profiles USING GIN (access);
