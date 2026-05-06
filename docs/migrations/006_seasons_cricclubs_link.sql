-- ============================================================================
-- Migration 006: link cricket_seasons to cricclubs leagues + auto-create from sync
-- ============================================================================
-- Why:
--   Today admins manually create seasons via a "+" button (Spring 2026,
--   Summer 2026, etc). Cricclubs already names leagues precisely
--   ("2026 MTCA Spring League · Division D"). This migration lets the
--   weekly scraper auto-create + activate matching cricket_seasons rows
--   so admins don't have to.
--
-- What it does:
--   1. Adds cricclubs metadata columns to cricket_seasons
--   2. Adds source column ('manual' | 'cricclubs') so future code can
--      distinguish auto-created seasons from manually-created ones
--   3. Adds a partial unique index on (team_id, cricclubs_league_id, division)
--      — only enforced for cricclubs-sourced rows
--   4. Adds cricclubs_league_id to cricclubs_matches (so we can definitively
--      tell which league a match belongs to). Backfills existing rows.
--
-- Notes:
--   - Existing FK relationships (expenses, schedule, fees, sponsorships) are
--     untouched. Only metadata columns are added.
--   - Section "STEP 5" is a one-time data migration for the Sunrisers team.
--     Update the team_id literal if applying for a different team.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. cricket_seasons — add cricclubs metadata columns
-- ----------------------------------------------------------------------------
ALTER TABLE cricket_seasons
  ADD COLUMN IF NOT EXISTS cricclubs_league_id    INTEGER,
  ADD COLUMN IF NOT EXISTS cricclubs_league_name  TEXT,
  ADD COLUMN IF NOT EXISTS division               TEXT,
  ADD COLUMN IF NOT EXISTS source                 TEXT NOT NULL DEFAULT 'manual';

-- Idempotent CHECK constraint add (Postgres has no `ADD CONSTRAINT IF NOT
-- EXISTS` form, so guard via pg_constraint lookup for safe re-runs).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_cricket_seasons_source'
      AND conrelid = 'cricket_seasons'::regclass
  ) THEN
    ALTER TABLE cricket_seasons
      ADD CONSTRAINT chk_cricket_seasons_source
      CHECK (source IN ('manual', 'cricclubs'));
  END IF;
END
$$;

-- Partial unique index — only enforced for rows linked to cricclubs.
-- Manual seasons can still share (team_id, year, season_type) freely.
-- NULLS NOT DISTINCT (PG15+) prevents two cricclubs leagues from co-existing
-- with the same league_id when both have division=NULL (some tournaments
-- aren't subdivided into divisions).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cricket_seasons_cricclubs
  ON cricket_seasons(team_id, cricclubs_league_id, division) NULLS NOT DISTINCT
  WHERE cricclubs_league_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. cricclubs_matches — add the league_id column
-- ----------------------------------------------------------------------------
-- Each match's league_id lets the scraper auto-find / auto-create the
-- corresponding cricket_seasons row without text-parsing league_name.
ALTER TABLE cricclubs_matches
  ADD COLUMN IF NOT EXISTS cricclubs_league_id INTEGER;

-- Backfill: every existing cricclubs match was scraped with LEAGUE_ID = 87
-- (hardcoded in scripts/cricclubs-sync/sync.ts at the time of this migration).
-- Scoped to the Sunrisers team_id so future teams onboarding to a different
-- league don't get silently mis-tagged.
UPDATE cricclubs_matches
SET cricclubs_league_id = 87
WHERE cricclubs_league_id IS NULL
  AND team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386'::uuid;

-- After backfill, make non-null going forward (defensive).
-- Defer this with a separate ALTER so existing tooling can transition.
-- (Skip NOT NULL for now — script will always populate; if a row sneaks in
-- without it, future debugging is preferable to a hard failure.)

-- ----------------------------------------------------------------------------
-- 3. One-time data migration for Sunrisers Manteca
-- ----------------------------------------------------------------------------
-- Promote the existing manually-created "Spring 2026" season to be a
-- cricclubs-managed season. All FKs (expenses, schedule, fees, sponsorships)
-- pointing at this season's id continue to work — only metadata changes.
-- ⚠️  ADJUST team_id and the matching predicate if applying for a different
-- team or season.
-- updated_at is handled by the existing set_cricket_seasons_updated_at trigger.
UPDATE cricket_seasons
SET name                  = '2026 MTCA Spring League · Division D',
    cricclubs_league_id   = 87,
    cricclubs_league_name = '2026 MTCA Spring League',
    division              = 'Division D',
    source                = 'cricclubs'
WHERE team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386'::uuid
  AND year = 2026
  AND season_type = 'spring'
  AND cricclubs_league_id IS NULL;  -- idempotent

COMMIT;

-- ============================================================================
-- VERIFICATION (read-only, run after the migration applies)
-- ============================================================================
-- Confirm the Sunrisers season is now cricclubs-linked:
SELECT id, name, year, season_type, cricclubs_league_id,
       cricclubs_league_name, division, source, is_active
FROM cricket_seasons
WHERE team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386'::uuid
ORDER BY year DESC, season_type;

-- Confirm the league_id backfill worked:
SELECT cricclubs_league_id, COUNT(*) AS matches
FROM cricclubs_matches
WHERE team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386'::uuid
GROUP BY cricclubs_league_id;
