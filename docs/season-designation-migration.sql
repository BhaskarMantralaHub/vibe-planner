-- ============================================================================
-- SEASON-SCOPED CAPTAIN / VICE-CAPTAIN
-- ============================================================================
-- Run in the Supabase SQL editor. Idempotent — safe to re-run (the backfill
-- deliberately runs only while NO designation has ever been written, see §3).
--
-- Council-reviewed (DBA / RLS-architecture / SQL-correctness, 2026-09-01);
-- all CRITICAL and HIGH findings fixed: target validated and locked BEFORE
-- any write, mirror clear scoped by team not roster, backfill gated,
-- unique_violation mapped to a reason code, is_active NULL-safe,
-- search_path pinned.
--
-- THE BUG THIS FIXES
-- ------------------
-- `cricket_players.designation` is a field on the permanent identity record,
-- so there is exactly ONE captain fact for all time. Promote a new captain for
-- Fall 2026 and every screen — including ones scoped to Spring 2026 by the
-- season pill — shows the new name. History is silently rewritten. Same for
-- the vice-captain, which lives in the same column.
--
-- THE MODEL (same playbook as is_guest — TWO facts, not one duplicated fact)
-- --------------------------------------------------------------------------
--  * `cricket_season_players.designation`  (NEW)  = who wore the armband in
--    THIS season. Season-scoped screens read this via the roster join.
--  * `cricket_players.designation`        (KEPT) = the CURRENT designation.
--    Still needed by: the team-wide fallback when a season has no roster rows
--    (un-seeded season, local mode), and the cross-team RPC payloads in
--    docs/cricket-schema.sql / multi-team-*.sql that already return it.
--    The write RPC below keeps it in sync whenever an ACTIVE season's
--    designation changes; editing a historical season touches only that
--    season's row.
--    KNOWN AMBIGUITY, accepted: `is_active` can be true on two seasons at
--    once (Fall active for fee collection while Spring is still played —
--    CLAUDE.md documents the real case). There is one mirror, so it follows
--    whichever active season was edited last. At this team's scale that is
--    the admin's own most recent intent, which is acceptable.
--
-- WHY PARTIAL UNIQUE INDEXES
-- --------------------------
-- "One captain per season" becomes structural instead of a convention the UI
-- must remember. The `left_at IS NULL` filter matters: a captain who leaves
-- mid-season (Remove from Season) keeps `designation = 'captain'` on their
-- departed row — history: they WERE captain — while freeing the slot for a
-- successor.
--
-- DEACTIVATION (trigger in §5): deactivating a player, or moving them to
-- guest, clears their designation on every LIVE season row. Without this, a
-- deactivated captain (is_active = false, left_at NULL — the app's delete
-- flows deactivate, they never stamp left_at) would occupy the unique slot
-- forever and no successor could be appointed. Trade-off, stated plainly:
-- this erases "was captain" from seasons still in flight for a player removed
-- mid-season without "Remove from Season" first; seasons they properly left
-- (left_at set) keep the history.
-- ============================================================================


-- ============================================================
-- 1. Column
-- ============================================================
-- Rerun note: if the column already exists, Postgres skips the WHOLE clause,
-- CHECK included — no duplicate constraint. (If the column was ever created
-- out-of-band without the CHECK, this will not add it.)

ALTER TABLE public.cricket_season_players
  ADD COLUMN IF NOT EXISTS designation TEXT
  CHECK (designation IN ('captain', 'vice-captain'));


-- ============================================================
-- 2. One captain, one vice-captain per season (current members only)
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uniq_season_captain
  ON public.cricket_season_players (season_id)
  WHERE designation = 'captain' AND left_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_season_vice_captain
  ON public.cricket_season_players (season_id)
  WHERE designation = 'vice-captain' AND left_at IS NULL;


-- ============================================================
-- 3. Backfill — FIRST RUN ONLY
-- ============================================================
-- Stamp the CURRENT designation onto every live season row the holder has.
-- This preserves exactly what every screen displays today (they all show the
-- current captain regardless of season), so the migration itself changes
-- nothing visible; the admin then corrects old seasons individually.
--
-- Gated on "no designation has ever been written to the roster table":
-- `designation IS NULL` is also the deliberate cleared state, so a naive
-- re-run after an admin corrected history would either re-crown the current
-- captain on a deliberately-cleared season or abort on uniq_season_captain.
-- Once anything has been set (including by this backfill), re-runs are no-ops.

UPDATE public.cricket_season_players sp
SET designation = p.designation
FROM public.cricket_players p
WHERE sp.player_id = p.id
  AND p.designation IS NOT NULL
  AND sp.designation IS NULL
  AND sp.left_at IS NULL
  AND p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.cricket_season_players x
    WHERE x.designation IS NOT NULL
  );


-- ============================================================
-- 4. Write path — one atomic RPC
-- ============================================================
-- Clear-then-set must be one transaction, AND the target must be validated
-- before anything is cleared: a reason-code RETURN is a normal exit that
-- COMMITS, so validating late would depose the sitting captain and appoint
-- nobody (council finding). SECURITY INVOKER on purpose — the caller's own
-- RLS (team admin on cricket_season_players AND cricket_players, identical
-- predicates today) authorises every row it touches; the function adds
-- atomicity, not privilege. If cricket_players' UPDATE policy is ever
-- narrowed, the mirror ROW_COUNT check below turns silent drift into a
-- loud rollback.
--
-- Returns a TEXT reason code (repo convention — umpiring RPCs do the same):
--   'ok'              — done
--   'bad_designation' — p_designation not 'captain' / 'vice-captain' / NULL
--   'no_season'       — season id unknown (or not visible under RLS)
--   'not_on_roster'   — player has no live row in that season (nothing written)
--   'conflict'        — lost a concurrent race for the same armband (rolled back)
-- NULL p_designation clears the player's designation for that season.

CREATE OR REPLACE FUNCTION public.set_season_designation(
  p_season_id   UUID,
  p_player_id   UUID,
  p_designation TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_active   BOOLEAN;
  v_team_id  UUID;
  v_touched  INTEGER;
BEGIN
  IF p_designation IS NOT NULL
     AND p_designation NOT IN ('captain', 'vice-captain') THEN
    RETURN 'bad_designation';
  END IF;

  -- FOR UPDATE serialises concurrent designation writes on the same season,
  -- so the unique index below is a backstop, not the arbiter of races.
  SELECT COALESCE(s.is_active, false), s.team_id
  INTO v_active, v_team_id
  FROM public.cricket_seasons s
  WHERE s.id = p_season_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'no_season';
  END IF;

  -- Validate AND lock the target row BEFORE any write — see header.
  PERFORM 1
  FROM public.cricket_season_players
  WHERE season_id = p_season_id
    AND player_id = p_player_id
    AND left_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_on_roster';
  END IF;

  -- Free the slot: whoever currently holds this designation in this season
  -- loses it (there is at most one, by the partial unique index). Only when
  -- actually assigning — clearing (NULL) displaces nobody.
  IF p_designation IS NOT NULL THEN
    UPDATE public.cricket_season_players
    SET designation = NULL
    WHERE season_id = p_season_id
      AND designation = p_designation
      AND left_at IS NULL
      AND player_id <> p_player_id;

    -- Keep the record-level "current" mirror honest for the active season.
    -- Scoped by TEAM, not by roster membership: a stale mirror holder with no
    -- roster row this season (legacy write, deactivated old captain) must be
    -- cleared too, or the team ends up with two record-level captains
    -- (council finding).
    IF v_active THEN
      UPDATE public.cricket_players p
      SET designation = NULL
      WHERE p.designation = p_designation
        AND p.id <> p_player_id
        AND p.team_id = v_team_id;
    END IF;
  END IF;

  UPDATE public.cricket_season_players
  SET designation = p_designation
  WHERE season_id = p_season_id
    AND player_id = p_player_id
    AND left_at IS NULL;
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  IF v_touched = 0 THEN
    -- The row was validated and locked above, so this cannot happen short of
    -- an RLS change mid-flight; raise so the displacement rolls back too.
    RAISE EXCEPTION 'set_season_designation: locked roster row vanished';
  END IF;

  -- Mirror to the identity record only for an ACTIVE season — that is what
  -- "current designation" means. Historical corrections stay historical.
  IF v_active THEN
    UPDATE public.cricket_players
    SET designation = p_designation
    WHERE id = p_player_id;
    GET DIAGNOSTICS v_touched = ROW_COUNT;
    IF v_touched = 0 THEN
      -- RLS on cricket_players no longer lets this caller write the mirror.
      -- A stale mirror served to the public dues RPC is worse than a failed
      -- save — roll the whole thing back.
      RAISE EXCEPTION 'set_season_designation: mirror update blocked';
    END IF;
  END IF;

  RETURN 'ok';

EXCEPTION
  WHEN unique_violation THEN
    -- Concurrent admin won the same armband between our clear and set.
    -- The transaction rolls back — nothing was changed.
    RETURN 'conflict';
END;
$$;

-- PostgREST exposure: authenticated only. RLS does the real gating (a
-- non-admin's locked SELECT sees the row, but every UPDATE inside matches
-- zero rows under RLS and the function raises/rolls back — it cannot write).
REVOKE ALL ON FUNCTION public.set_season_designation(UUID, UUID, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_season_designation(UUID, UUID, TEXT) TO authenticated;


-- ============================================================
-- 5. Deactivation / move-to-guest clears live-season designations
-- ============================================================
-- Every "delete" path in the app deactivates (is_active = false) and never
-- stamps left_at, so without this a deactivated captain occupies the unique
-- slot forever and no successor can be appointed. One trigger covers the
-- store's removePlayer, both direct PlayerManager deactivate paths, and
-- move-to-guest — including paths added later. Trade-off documented in the
-- header. SECURITY INVOKER semantics: the UPDATE inside runs as the caller,
-- and only admins can flip is_active/is_guest in the first place.

CREATE OR REPLACE FUNCTION public.clear_designation_on_deactivate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (NEW.is_active = false AND OLD.is_active = true)
     OR (NEW.is_guest = true AND OLD.is_guest = false) THEN
    UPDATE public.cricket_season_players
    SET designation = NULL
    WHERE player_id = NEW.id
      AND left_at IS NULL
      AND designation IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_designation_on_deactivate ON public.cricket_players;
CREATE TRIGGER trg_clear_designation_on_deactivate
  AFTER UPDATE OF is_active, is_guest ON public.cricket_players
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_designation_on_deactivate();


-- ============================================================
-- 6. Verify (read-only)
-- ============================================================
-- Season rows carrying an armband, newest season first:
--   SELECT s.name AS season, p.name AS player, sp.designation, sp.left_at
--   FROM cricket_season_players sp
--   JOIN cricket_seasons s ON s.id = sp.season_id
--   JOIN cricket_players p ON p.id = sp.player_id
--   WHERE sp.designation IS NOT NULL
--   ORDER BY s.year DESC, s.season_type, sp.designation;
--
-- The mirror should agree with each team's active season (is_active is
-- per-team unique, so this pairs each player with their OWN team's active
-- season):
--   SELECT p.name, p.designation AS current_mirror, sp.designation AS active_season
--   FROM cricket_players p
--   JOIN cricket_seasons s ON s.team_id = p.team_id AND s.is_active
--   LEFT JOIN cricket_season_players sp
--     ON sp.player_id = p.id AND sp.season_id = s.id AND sp.left_at IS NULL
--   WHERE p.designation IS NOT NULL OR sp.designation IS NOT NULL;
