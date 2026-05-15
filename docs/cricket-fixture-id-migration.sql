-- ============================================================
-- Cricket schedule: cricclubs fixture-id link
-- ============================================================
-- Adds cricclubs_fixture_id to cricket_schedule_matches so the
-- cricclubs-sync GitHub Action can refresh schedule changes
-- (date, time, venue, umpire) for upcoming matches even when
-- cricclubs reschedules them — which breaks the previous
-- opponent+date join.
--
-- Idempotent: safe to re-run.
-- Nullable: existing rows stay unlinked until the sync's
-- opponent+nearest-date fallback backfills them on first run.
-- ============================================================

BEGIN;

ALTER TABLE cricket_schedule_matches
  ADD COLUMN IF NOT EXISTS cricclubs_fixture_id BIGINT;

-- Partial unique index: many NULLs allowed, but a given cricclubs
-- fixture maps to at most one schedule row per team. Scoping by
-- team_id matches the multi-tenant RLS pattern.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cricket_schedule_cricclubs_fixture
  ON cricket_schedule_matches (team_id, cricclubs_fixture_id)
  WHERE cricclubs_fixture_id IS NOT NULL;

COMMIT;
