-- ============================================================
-- CricClubs Team ID Migration
-- ============================================================
-- Adds cricclubs_team_id to cricket_teams (team-level, not per-season).
-- This is the numeric ID from CricClubs URLs (e.g., teamId=1109).
-- It's stable across seasons for a given team.

ALTER TABLE cricket_teams
  ADD COLUMN IF NOT EXISTS cricclubs_team_id BIGINT;

COMMENT ON COLUMN cricket_teams.cricclubs_team_id IS 'CricClubs numeric team ID from viewTeam.do?teamId=NNNN URLs';

-- Backfill for Sunrisers Manteca
UPDATE cricket_teams
SET cricclubs_team_id = 1109
WHERE id = '8284208d-fb02-44bf-bb8c-3c5411d35386';
