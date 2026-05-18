-- ============================================================================
-- Migration 007: add toss columns to cricclubs_matches
-- ============================================================================
-- Why:
--   Cricclubs scorecard pages contain a "won the toss and elected to bat/bowl"
--   comment that we weren't capturing. The completed-match card in the cricket
--   schedule UI now wants to show "X won toss, chose to Y" alongside the
--   chased/defended outcome, but had no source for the data.
--
-- What it does:
--   1. Adds two nullable TEXT columns to cricclubs_matches:
--        - toss_winner    — raw cricclubs team name (e.g. "MTCA Sunrisers
--                           Manteca"). Nullable because older / abandoned
--                           matches sometimes omit the toss line in cricclubs.
--        - toss_decision  — 'bat' | 'bowl' (CHECK constraint).
--   2. After applying, re-run the cricclubs sync (GitHub Action or local CLI)
--      to backfill the columns for existing matches. The sync is idempotent
--      and only writes diffs.
--
-- Safety:
--   - Both columns are nullable with no default. Adding a nullable column to
--     PostgreSQL is metadata-only (no table rewrite, no row locks beyond a
--     brief AccessExclusiveLock on the catalog).
--   - The CHECK constraint on toss_decision is added with NOT VALID first so
--     it doesn't scan existing rows (all of which would satisfy it anyway
--     since they're NULL).
--   - No RLS policy changes needed — existing read/write policies cover all
--     columns on cricclubs_matches.
-- ============================================================================

BEGIN;

ALTER TABLE cricclubs_matches
  ADD COLUMN IF NOT EXISTS toss_winner   TEXT,
  ADD COLUMN IF NOT EXISTS toss_decision TEXT;

-- Validate decision values without scanning existing (all-NULL) rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cricclubs_matches_toss_decision_check'
  ) THEN
    ALTER TABLE cricclubs_matches
      ADD CONSTRAINT cricclubs_matches_toss_decision_check
      CHECK (toss_decision IS NULL OR toss_decision IN ('bat', 'bowl'))
      NOT VALID;
    ALTER TABLE cricclubs_matches
      VALIDATE CONSTRAINT cricclubs_matches_toss_decision_check;
  END IF;
END$$;

COMMIT;
