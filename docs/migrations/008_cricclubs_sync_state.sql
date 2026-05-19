-- ============================================================================
-- Migration 008: cricclubs_sync_state singleton table
-- ============================================================================
-- Why:
--   The new cricclubs-ingest Edge Function (full-sync route) can be triggered
--   from the web app's "Sync Now" button, from pg_cron, from the iOS Shortcut,
--   and from GH Actions. Without a lock, simultaneous triggers would re-fetch
--   the same scorecards concurrently — wasting Apify credit and racing on
--   upserts.
--
--   This table provides a singleton lock that all sync paths consult before
--   starting work. Acquisition is a conditional UPDATE that succeeds only when
--   the lock is free (or stale).
--
-- Shape:
--   Single-row table (CHECK id=1) so SELECT and UPDATE both target id=1.
--   is_running:   true while a sync is in progress.
--   started_at:   when the current sync started; null when idle.
--   triggered_by: free-form label ('button:user@email', 'cron', 'shortcut',
--                 'gh-action') for audit / debugging.
--
-- Stale-lock recovery:
--   If a sync crashes before unlocking, the row stays locked. The Edge
--   Function's acquire-lock query accepts `started_at < now() - interval
--   '5 minutes'` as an override condition, so a crashed sync auto-clears
--   within 5 min. Sync runs typically complete in 30-60s, so 5 min is a
--   comfortable buffer.
--
-- RLS:
--   Anyone (any authenticated user) can SELECT — the UI needs to display the
--   button state ("Syncing..." if locked). Service-role writes only.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cricclubs_sync_state (
  id            INT          PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_running    BOOLEAN      NOT NULL    DEFAULT false,
  started_at    TIMESTAMPTZ,
  triggered_by  TEXT,
  last_run_at   TIMESTAMPTZ,
  last_summary  TEXT,                                 -- last sync's outcome (success or error)
  CONSTRAINT cricclubs_sync_state_singleton CHECK (id = 1)
);

-- Seed the single row.
INSERT INTO cricclubs_sync_state (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE cricclubs_sync_state ENABLE ROW LEVEL SECURITY;

-- Read: any signed-in user can see sync state (button UI consults it).
DROP POLICY IF EXISTS "Authenticated can read sync state" ON cricclubs_sync_state;
CREATE POLICY "Authenticated can read sync state"
  ON cricclubs_sync_state
  FOR SELECT
  TO authenticated
  USING (true);

-- Write: service-role only (Edge Function uses service-role JWT).
-- No CREATE POLICY needed for service-role; it bypasses RLS.

COMMIT;
