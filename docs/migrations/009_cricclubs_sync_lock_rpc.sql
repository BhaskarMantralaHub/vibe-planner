-- ============================================================================
-- Migration 009: SECURITY DEFINER lock acquisition + ownership-checked release
-- ============================================================================
-- Why (DBA/SQL review findings, 2026-05-18):
--   The previous client-side `UPDATE … WHERE id=1 AND (is_running=false OR
--   started_at<X)` used the supabase-js `.or()` chain. Two independent
--   reviewers flagged two problems:
--     1. Interpolating an ISO timestamp into the .or() filter string
--        risks PostgREST parser confusion (colons inside the timestamp).
--     2. The release path had no ownership check — a stale-overridden lock
--        could be re-released by the original (now-zombie) sync, racing
--        whoever just acquired it.
--
--   This migration adds two SECURITY DEFINER functions that handle both
--   acquire and release atomically with no string interpolation, plus a
--   `lock_token uuid` column so release verifies the caller actually owns
--   the current lock.
-- ============================================================================

BEGIN;

-- One-time prep: prevent accidental multi-row drift from manual debugging.
DELETE FROM cricclubs_sync_state WHERE id <> 1;

-- Lock token — opaque uuid handed back at acquire, required at release.
ALTER TABLE cricclubs_sync_state
  ADD COLUMN IF NOT EXISTS lock_token UUID;

-- ── acquire_cricclubs_sync_lock ─────────────────────────────────────────────
-- Returns: the new lock_token UUID on success; NULL if another sync is
-- currently holding the lock (and it's not yet stale).
-- Stale threshold: 5 minutes since started_at. Tunable here.
CREATE OR REPLACE FUNCTION acquire_cricclubs_sync_lock(p_triggered_by TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token   UUID := gen_random_uuid();
  v_updated INT;
BEGIN
  -- Atomic: UPDATE only succeeds if the row is free (is_running=false) or
  -- the existing lock is stale. PostgreSQL row locks serialize concurrent
  -- callers; one wins, others see the post-update row and don't match.
  UPDATE cricclubs_sync_state
  SET
    is_running   = true,
    started_at   = now(),
    triggered_by = p_triggered_by,
    lock_token   = v_token
  WHERE id = 1
    AND (
      is_running = false
      OR started_at < now() - interval '5 minutes'
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 1 THEN
    RETURN v_token;
  ELSE
    RETURN NULL;
  END IF;
END;
$$;

-- ── release_cricclubs_sync_lock ─────────────────────────────────────────────
-- Releases the lock ONLY if the supplied token matches the current lock_token.
-- Prevents a stale/zombie sync from clobbering the lock state of whoever took
-- it over after a stale-recovery acquisition.
-- Returns: true if release happened, false if token mismatch (caller no
-- longer owns the lock — somebody else acquired it via stale-recovery).
CREATE OR REPLACE FUNCTION release_cricclubs_sync_lock(
  p_token   UUID,
  p_summary TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE cricclubs_sync_state
  SET
    is_running   = false,
    started_at   = NULL,
    triggered_by = NULL,
    lock_token   = NULL,
    last_run_at  = now(),
    last_summary = LEFT(COALESCE(p_summary, ''), 1000)
  WHERE id = 1
    AND lock_token = p_token;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Only service_role should ever call these — Edge Function uses the service
-- role JWT. Authenticated browser clients have no business touching the lock
-- directly (they go through the Edge Function instead).
REVOKE ALL ON FUNCTION acquire_cricclubs_sync_lock(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION release_cricclubs_sync_lock(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acquire_cricclubs_sync_lock(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION release_cricclubs_sync_lock(UUID, TEXT) TO service_role;

COMMIT;
