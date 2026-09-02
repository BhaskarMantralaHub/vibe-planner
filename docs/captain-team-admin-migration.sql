-- ============================================================================
-- THE SEASON'S CAPTAIN GETS TEAM ADMIN BY DEFAULT
-- ============================================================================
-- Run in the Supabase SQL editor. Run this BEFORE
-- docs/admin-roles-migration.sql so no captain is left mid-flight without a
-- way to manage the team (that file removes the global-admin grant captains
-- have been leaning on).
--
-- Verification script: docs/captain-team-admin-verification.sql (run it after;
-- it impersonates real users and ROLLBACKs).
--
-- WHY
-- ---
-- Captaincy is a season fact (cricket_season_players.designation) and team
-- authority is a membership fact (team_members.role). They were unrelated, so
-- every new captain needed a second, manual step that nobody remembers — and
-- the failure is silent: the captain simply finds the management controls
-- missing and assumes the app is broken.
--
-- WHAT "CAPTAIN" MEANS HERE
-- -------------------------
-- Captain OF THE ACTIVE SEASON, never "captain at some point in history".
-- This is the same line set_season_designation already draws when it refuses
-- to touch the record-level mirror for a non-active season ("historical
-- corrections stay historical"). Correcting who captained 2024 must not hand
-- that person authority today.
--
-- The record-level mirror (cricket_players.designation) is a genuine FALLBACK,
-- consulted only when the active season has no roster rows — matching
-- lib/season-roster.ts. That case is not exotic: addSeason inserts no roster
-- rows, so a newly created season starts there, and the store writes the
-- mirror directly rather than calling the RPC (cricket-store.ts:797-807).
--
-- A DEFAULT, NOT A BINDING
-- ------------------------
-- Team admin is granted at the moment someone becomes captain. It is never
-- continuously enforced and never revoked automatically:
--
--   * Handing the armband to someone new does NOT strip the old captain's
--     admin. Mid-season that would silently remove management ability from
--     the person who has been doing it, with no message and no audit line.
--     Removing admin stays a deliberate act on the Players screen.
--   * An admin who demotes a sitting captain to player wins — nothing
--     re-promotes them while their membership stays active. Known limit: if
--     that person is later removed and re-approved, the activation grant fires
--     again and they return as admin. Making that stick needs a "role pinned"
--     column; at this club's size, re-approving someone is rare and visible
--     enough that the extra column is not worth it. Written down rather than
--     silently wrong.
--
-- SCOPE
-- -----
--   * Captain only. Vice-captains are unaffected — grant by hand if wanted.
--     (Both sitting vice-captains already have it; nobody loses anything.)
--   * 'player' -> 'admin' only. An owner is never touched.
--   * Deactivated players and guests are never granted.
--   * Team-scoped: this grants is_team_admin(), never is_global_admin().
--
-- AUDIT NOTE
-- ----------
-- trg_audit_team_members records actor_id = auth.uid(). For a grant that
-- happens during signup, that actor is the new member themselves, so the audit
-- feed reads as someone promoting themselves. The authorising act is the
-- earlier designation write by an admin, not this row.
-- ============================================================================


-- ============================================================
-- 1. Is this account the captain of this team's active season?
-- ============================================================
-- Identity is resolved by user_id OR confirmed email, the same way
-- claim_umpiring_duty and 8+ other places do it — only ~16/18 players carry a
-- user_id, and a user_id-only lookup silently skips the rest.
--
-- SECURITY DEFINER because it is called from triggers running as whoever is
-- writing: a member activating their own membership cannot necessarily SELECT
-- the roster under RLS, and a false negative here is a silently skipped grant.
--
-- Deliberately NOT granted to authenticated. It takes arbitrary
-- (team_id, user_id) and bypasses RLS, so exposing it over PostgREST would let
-- any logged-in user probe captaincy across every team. Only the DEFINER
-- functions below call it, and they run as the owner, who keeps EXECUTE.
-- (For the same reason the callers must stay SECURITY DEFINER — an INVOKER
-- caller would hit permission denied here.)

CREATE OR REPLACE FUNCTION public.is_team_captain(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_team_id IS NOT NULL AND p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.cricket_players p
    WHERE p.team_id = p_team_id
      -- IS NOT FALSE, not "= true": is_active is nullable, and a legacy NULL
      -- means "never deactivated", not "gone".
      AND p.is_active IS NOT FALSE
      AND p.is_guest IS NOT TRUE
      AND (
        p.user_id = p_user_id
        OR (p.user_id IS NULL
            AND p.email IS NOT NULL
            AND lower(p.email) = (
              SELECT lower(u.email) FROM auth.users u
              WHERE u.id = p_user_id AND u.email_confirmed_at IS NOT NULL))
      )
      AND (
        -- Captain of the active season.
        EXISTS (
          SELECT 1
          FROM public.cricket_season_players sp
          JOIN public.cricket_seasons s ON s.id = sp.season_id
          WHERE sp.player_id = p.id
            AND sp.left_at IS NULL
            AND sp.designation = 'captain'
            AND s.team_id = p_team_id
            AND s.is_active
        )
        -- Fallback: the active season has no roster at all, so the record-level
        -- mirror is the only statement of who captains.
        OR (
          p.designation = 'captain'
          AND NOT EXISTS (
            SELECT 1
            FROM public.cricket_season_players sp2
            JOIN public.cricket_seasons s2 ON s2.id = sp2.season_id
            WHERE s2.team_id = p_team_id AND s2.is_active AND sp2.left_at IS NULL
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_team_captain(UUID, UUID) FROM anon, authenticated, public;


-- ============================================================
-- 2. The single grant statement
-- ============================================================
-- One definition of the rule. Every trigger and the backfill call this, so
-- they cannot drift apart.

CREATE OR REPLACE FUNCTION public.apply_captain_team_admin(p_team_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_team_id IS NULL OR p_user_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.is_team_captain(p_team_id, p_user_id) THEN
    RETURN;
  END IF;

  UPDATE public.team_members
  SET role = 'admin'
  WHERE team_id = p_team_id
    AND user_id = p_user_id
    AND role = 'player'
    AND status = 'active';
END;
$$;

REVOKE ALL ON FUNCTION public.apply_captain_team_admin(UUID, UUID) FROM anon, authenticated, public;


-- ============================================================
-- 3. Becoming captain of the active season grants team admin
-- ============================================================
-- Fires only on the TRANSITION into sitting captain, so a later deliberate
-- demotion is not undone by an unrelated roster edit.

CREATE OR REPLACE FUNCTION public.grant_captain_team_admin()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NEW.designation IS DISTINCT FROM 'captain' OR NEW.left_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Nested, not ANDed: Postgres does not guarantee left-to-right evaluation,
  -- and touching OLD on an INSERT raises "record old is not assigned yet".
  IF TG_OP = 'UPDATE' THEN
    IF OLD.designation IS NOT DISTINCT FROM 'captain' AND OLD.left_at IS NULL THEN
      RETURN NEW;  -- already a sitting captain; nothing transitioned
    END IF;
  END IF;

  -- History stays history — mirrors set_season_designation's own mirror rule.
  IF NOT EXISTS (
    SELECT 1 FROM public.cricket_seasons s WHERE s.id = NEW.season_id AND s.is_active
  ) THEN
    RETURN NEW;
  END IF;

  -- Defense in depth. Writing a designation already requires team admin under
  -- RLS, so this changes nothing today — it is here so that a future
  -- SECURITY DEFINER RPC that writes the roster on a member's behalf (a
  -- "self-enrol in this season" feature, say) cannot turn into an escalation
  -- path without anyone editing this file. It also stops a service-role
  -- restore replay from mass-granting: auth.uid() is NULL there, and section 5
  -- is the intended way to reconcile real state.
  IF NOT (public.is_team_admin(NEW.team_id) OR public.is_global_admin()) THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO v_user_id
  FROM public.cricket_players p
  WHERE p.id = NEW.player_id
    AND p.team_id = NEW.team_id
    AND p.is_active IS NOT FALSE
    AND p.is_guest IS NOT TRUE;

  IF v_user_id IS NULL THEN
    RETURN NEW;  -- no account yet; section 4 catches them when they link
  END IF;

  PERFORM public.apply_captain_team_admin(NEW.team_id, v_user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_captain_team_admin ON public.cricket_season_players;
CREATE TRIGGER trg_grant_captain_team_admin
  AFTER INSERT OR UPDATE OF designation, left_at ON public.cricket_season_players
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_captain_team_admin();


-- ============================================================
-- 4. A captain who links an account, or is named on the mirror
-- ============================================================
-- This is the case the ordering inside activate_team_membership breaks:
--   (a) INSERT team_members ... status = 'active'   <- membership exists
--   (b) UPDATE cricket_players SET user_id = ...    <- roster link happens HERE
-- A trigger on team_members alone runs at (a), when the roster row is still
-- unlinked, finds no captain, and grants nothing. Nothing revisits it. So the
-- grant has to hang off (b) — the moment the player row acquires an account.
-- That also covers claim_umpiring_duty's user_id backfill.
--
-- The same trigger watches `designation`, which covers the other write path:
-- when the active season has no roster rows the store writes the record-level
-- mirror directly and section 3 never fires.

CREATE OR REPLACE FUNCTION public.grant_captain_team_admin_on_player()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.user_id IS NOT DISTINCT FROM NEW.user_id
       AND OLD.designation IS NOT DISTINCT FROM NEW.designation THEN
      RETURN NEW;  -- neither the link nor the armband moved
    END IF;
  END IF;

  -- No admin guard here, deliberately: at the link moment the writer is the
  -- new member themselves (or handle_new_user with auth.uid() NULL). The grant
  -- is safe because it is predicated on a designation only an admin can write —
  -- enforce_player_self_edit_columns blocks `designation` on every self-edit.
  PERFORM public.apply_captain_team_admin(NEW.team_id, NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_captain_team_admin_on_player ON public.cricket_players;
CREATE TRIGGER trg_grant_captain_team_admin_on_player
  AFTER INSERT OR UPDATE OF user_id, designation ON public.cricket_players
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_captain_team_admin_on_player();


-- ============================================================
-- 4b. Belt and braces at the activation moment
-- ============================================================
-- Covers an already-linked captain whose membership goes active (re-approval),
-- where section 4's trigger does not fire because nothing on the player row
-- changed.
--
-- Named trg_zz_* deliberately: Postgres fires triggers in NAME order, and this
-- must run after trg_sync_team_member_status has settled NEW.status. The
-- COALESCE below means it stays correct even if that trigger is ever renamed —
-- a silent skip is exactly the failure mode this file exists to remove.

CREATE OR REPLACE FUNCTION public.default_captain_to_team_admin()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status TEXT;
BEGIN
  v_status := COALESCE(
    NEW.status,
    CASE WHEN COALESCE(NEW.approved, false) THEN 'active' ELSE 'pending' END);

  IF v_status IS DISTINCT FROM 'active' OR NEW.role IS DISTINCT FROM 'player' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'active' THEN
    RETURN NEW;  -- not the activation moment; a deliberate demotion stands
  END IF;

  IF public.is_team_captain(NEW.team_id, NEW.user_id) THEN
    -- MUST remain 'admin'. This trigger sorts after trg_no_owner_escalation,
    -- so whatever is written here is never re-checked by that guard.
    NEW.role := 'admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_captain_default_team_admin ON public.team_members;
CREATE TRIGGER trg_zz_captain_default_team_admin
  BEFORE INSERT OR UPDATE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.default_captain_to_team_admin();


-- ============================================================
-- 5. Backfill — run ONCE
-- ============================================================
-- Re-running would re-promote anyone an admin has deliberately demoted since,
-- so this is not a statement to replay casually. It reuses is_team_captain, so
-- it cannot disagree with the triggers about who qualifies.
--
-- Expect 0 rows today: both sitting captains already hold team_members.role =
-- 'admin'. That is the fact that makes admin-roles-migration.sql safe to run
-- next — confirm it here rather than assuming it.

DO $$
DECLARE
  v_n INTEGER;
BEGIN
  UPDATE public.team_members tm
  SET role = 'admin'
  WHERE tm.role = 'player'
    AND tm.status = 'active'
    AND public.is_team_captain(tm.team_id, tm.user_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Captains promoted to team admin: %', v_n;
END $$;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 6. Verification (read-only)
-- ============================================================
-- Every captain on record, and whether they can manage the team:
--   SELECT s.name AS season, s.is_active, pl.name AS captain, tm.role, tm.status
--   FROM cricket_season_players sp
--   JOIN cricket_players pl ON pl.id = sp.player_id
--   JOIN cricket_seasons s  ON s.id = sp.season_id
--   LEFT JOIN team_members tm
--     ON tm.user_id = pl.user_id AND tm.team_id = pl.team_id
--   WHERE sp.designation = 'captain' AND sp.left_at IS NULL
--   ORDER BY s.year DESC, s.name;
--   -- expected: role 'admin' or 'owner' for the ACTIVE season's captain.
--   -- A past season's captain may legitimately read 'player'.
--
-- Everyone who can manage the team, and why:
--   SELECT p.email, tm.role, public.is_team_captain(tm.team_id, tm.user_id) AS is_captain
--   FROM team_members tm JOIN profiles p ON p.id = tm.user_id
--   WHERE tm.role IN ('owner','admin') ORDER BY tm.role, p.email;


-- ============================================================
-- 7. Rollback
-- ============================================================
-- Removes the automation. Grants already made are NOT reversed — revoke those
-- by hand on the Players screen, deliberately, one person at a time.
--
--   DROP TRIGGER IF EXISTS trg_zz_captain_default_team_admin ON public.team_members;
--   DROP TRIGGER IF EXISTS trg_grant_captain_team_admin_on_player ON public.cricket_players;
--   DROP TRIGGER IF EXISTS trg_grant_captain_team_admin ON public.cricket_season_players;
--   DROP FUNCTION IF EXISTS public.default_captain_to_team_admin();
--   DROP FUNCTION IF EXISTS public.grant_captain_team_admin_on_player();
--   DROP FUNCTION IF EXISTS public.grant_captain_team_admin();
--   DROP FUNCTION IF EXISTS public.apply_captain_team_admin(UUID, UUID);
--   DROP FUNCTION IF EXISTS public.is_team_captain(UUID, UUID);
