-- ============================================================
-- Review fixes for docs/season-roster-migration.sql
-- ============================================================
-- Three independent reviews (SQL specialist, DBA, QA) of the applied migration
-- converged on the same two database-level HIGH findings. Both are in the
-- RECOVERY path — nothing user-facing is wrong — which is precisely why they
-- would not have been noticed until the day they mattered most.
--
-- ── FIX 1: opening_balance must be nullable ────────────────────────────────
-- It was added NOT NULL DEFAULT 0. That is fine for live inserts, but
-- .github/workflows/restore.yml rebuilds rows with
--     json_populate_recordset(null::cricket_seasons, …)
-- and that function does NOT apply column defaults — a key absent from the JSON
-- becomes NULL. Every backup taken before 2026-08-27 has no opening_balance key.
--
-- So a restore from any pre-migration backup hits a not-null violation on
-- cricket_seasons — a PARENT table. Seasons never land, and every child insert
-- (expenses, fees, splits, duties, schedule) has nothing to attach to. The
-- restore fails completely, discovered at the exact moment it is needed.
--
-- Dropping NOT NULL is one non-blocking catalog change. The app must therefore
-- treat NULL as zero — `season.opening_balance ?? 0` — which it needs to do
-- anyway for a season row that predates the column.
--
-- Chosen over patching restore.yml to coalesce, because that patch would have to
-- be repeated for every future NOT NULL column and would silently rot.
--
-- ── FIX 2: the player leg must RESTRICT, not CASCADE ───────────────────────
-- The roster table exists to stop a departing player retroactively rewriting a
-- closed season. ON DELETE CASCADE on the player leg does exactly that instead:
-- deleting a player erases their roster row in EVERY season.
--
-- And the app really does hard-delete. cricket_players has no deleted_at column,
-- so delete is the only removal path, and PlayerManager.tsx:1527 runs
--     .delete().eq('id', p.id).eq('team_id', teamId)
-- on any player. Its own confirmation dialog (line 1508) tells the admin "this
-- will deactivate their player record (kept for audit)" — which is not what the
-- code does. So an admin triggers the cascade believing history is safe.
--
-- The neighbouring tables were deliberately built to survive this event:
--     cricket_umpiring_duties.assigned_player_id  ON DELETE SET NULL
--                                                + assigned_player_name snapshot
--     cricket_splits.paid_by                      ON DELETE RESTRICT
--     cricket_settlements                         ON DELETE RESTRICT
-- Leaving the roster on CASCADE makes it the one table that forgets, producing a
-- surviving duty row asserting "X stood in Spring" while X is on no Spring
-- roster — the umpiring denominator drops while the numerator keeps the duty.
--
-- RESTRICT makes the delete fail loudly and forces an explicit un-enrol. It
-- matches splits and settlements. SET NULL is not available here: player_id is
-- half the primary key.
--
-- The SEASON leg stays CASCADE — deleting a season SHOULD take its roster, and
-- that already matches every other season-scoped table.
--
-- Run:  supabase db query --linked -f docs/season-roster-fixes.sql

ALTER TABLE public.cricket_seasons
  ALTER COLUMN opening_balance DROP NOT NULL;

ALTER TABLE public.cricket_season_players
  DROP CONSTRAINT cricket_season_players_player_id_team_id_fkey;

ALTER TABLE public.cricket_season_players
  ADD CONSTRAINT cricket_season_players_player_id_team_id_fkey
  FOREIGN KEY (player_id, team_id)
  REFERENCES public.cricket_players (id, team_id) ON DELETE RESTRICT;
