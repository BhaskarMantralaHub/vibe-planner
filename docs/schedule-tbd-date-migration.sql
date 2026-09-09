-- ============================================================
-- Schedule TBD Date Migration
-- ============================================================
-- Allows match_date to be NULL for fixtures where cricclubs
-- has not yet confirmed the date (shown as "TBD").
--
-- Run this migration in Supabase SQL Editor.
-- ============================================================

-- 1. Allow NULL match_date
ALTER TABLE cricket_schedule_matches
  ALTER COLUMN match_date DROP NOT NULL;

-- 2. Add a comment explaining the semantics
COMMENT ON COLUMN cricket_schedule_matches.match_date IS
  'Match date in YYYY-MM-DD format. NULL means "TBD" — date not yet confirmed by the league.';

-- ============================================================
-- Verification
-- ============================================================
-- After running, verify with:
--
--   SELECT column_name, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'cricket_schedule_matches'
--     AND column_name = 'match_date';
--
-- Expected: is_nullable = 'YES'
