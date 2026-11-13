-- ============================================================================
-- Migration 010: add player_of_match to cricclubs_matches
-- ============================================================================
-- Why:
--   The completed-match card wants to show cricclubs' "Player of the Match".
--   It lives only on the scorecard's Info tab (info.do), a separate page the
--   sync never fetched.
--
-- What it does:
--   Adds a nullable TEXT column holding the raw cricclubs player name
--   (e.g. "Bhaskar Baachi"). NULL until the Scriptable sync reads the Info
--   page; it re-checks NULL rows on every run, so existing matches backfill
--   on the next normal sync.
--
-- Safety:
--   Nullable, no default → metadata-only ALTER. Existing RLS covers it.
-- ============================================================================

ALTER TABLE cricclubs_matches
  ADD COLUMN IF NOT EXISTS player_of_match TEXT;
