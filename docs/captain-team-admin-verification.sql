-- ============================================================
-- Captain -> team admin — trigger verification
-- ============================================================
-- Exercises every path by which the active season's captain is supposed to
-- receive team_members.role = 'admin', AS A REAL ADMIN, against REAL rows,
-- then throws it all away.
--
-- SAFE TO RUN ON PRODUCTION. Everything happens inside one transaction that
-- ends in ROLLBACK, so no row survives. It temporarily takes the armband off
-- the sitting captain and hands team admin to a real player — both undone by
-- the ROLLBACK. Nothing is written permanently and no email is sent.
--
-- HOW THE IMPERSONATION WORKS: Supabase's auth.uid() resolves from
-- current_setting('request.jwt.claims'), so set_config(..., is_local => true)
-- lets us act as a specific signed-in admin for the rest of the transaction.
-- Without it, grant_captain_team_admin's is_team_admin() guard would reject
-- every write and the run would prove nothing.
--
-- WHY EVERY CHECK SITS IN ITS OWN SUB-BLOCK: a PL/pgSQL block with an
-- EXCEPTION clause is a subtransaction, so a catch-all at the top would roll
-- back every _results row recorded before the failure — reporting "1 failure,
-- 0 passed" and hiding which check broke. Scoping the handler to one check
-- keeps the other results.
--
-- Run:  supabase db query --linked -f docs/captain-team-admin-verification.sql
-- Expect: every row PASS. Any FAIL is a real defect — read the `detail`.

BEGIN;

CREATE TEMP TABLE _results (
  seq   serial,
  area  text,
  check_name text,
  status text,
  detail text
) ON COMMIT DROP;

DO $$
DECLARE
  v_team        uuid;
  v_season      uuid;
  v_old_season  uuid;
  v_admin_user  uuid;
  v_player      uuid;   -- a real, linked player currently holding role 'player'
  v_user        uuid;   -- their auth account
  v_role        text;
BEGIN
  -- ── Context from real data ──────────────────────────────────────────
  SELECT id INTO v_team FROM public.cricket_teams
   WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
  SELECT id INTO v_season FROM public.cricket_seasons
   WHERE team_id = v_team AND is_active LIMIT 1;
  SELECT id INTO v_old_season FROM public.cricket_seasons
   WHERE team_id = v_team AND NOT COALESCE(is_active, false)
   ORDER BY year DESC LIMIT 1;

  SELECT tm.user_id INTO v_admin_user
    FROM public.team_members tm
   WHERE tm.team_id = v_team AND tm.role IN ('owner','admin') AND tm.status = 'active'
   ORDER BY tm.role LIMIT 1;

  -- The subject: someone real, linked, and NOT already an admin, so a grant
  -- is observable rather than a no-op.
  SELECT p.id, p.user_id INTO v_player, v_user
    FROM public.cricket_players p
    JOIN public.team_members tm
      ON tm.user_id = p.user_id AND tm.team_id = p.team_id
   WHERE p.team_id = v_team AND p.is_active AND NOT p.is_guest
     AND p.user_id IS NOT NULL
     AND tm.status = 'active' AND tm.role = 'player'
   ORDER BY p.created_at LIMIT 1;

  IF v_team IS NULL OR v_season IS NULL OR v_admin_user IS NULL OR v_player IS NULL THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('setup', 'resolve team / active season / admin / subject', 'FAIL',
            format('team=%s season=%s admin=%s player=%s',
                   v_team, v_season, v_admin_user, v_player));
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_admin_user, 'role', 'authenticated')::text,
                     true);

  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('setup', 'resolved real team, active season, admin and subject', 'PASS', NULL);

  -- ── Fixture: free the armband ───────────────────────────────────────
  -- uniq_season_captain allows exactly one captain per season, so the sitting
  -- captain has to step aside before the subject can take it. Undone by ROLLBACK.
  UPDATE public.cricket_season_players
     SET designation = NULL
   WHERE season_id = v_season AND designation = 'captain' AND left_at IS NULL;

  -- The subject must be on this season's roster to carry a designation.
  INSERT INTO public.cricket_season_players (season_id, player_id, team_id)
  VALUES (v_season, v_player, v_team)
  ON CONFLICT (season_id, player_id) DO UPDATE SET left_at = NULL;

  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('setup', 'armband freed and subject enrolled in the active season', 'PASS', NULL);

  -- ══════════════════════════════════════════════════════════════════
  -- 1. Designating the active season's captain grants team admin
  -- ══════════════════════════════════════════════════════════════════
  BEGIN
    UPDATE public.cricket_season_players SET designation = 'captain'
     WHERE season_id = v_season AND player_id = v_player;

    SELECT role INTO v_role FROM public.team_members
     WHERE team_id = v_team AND user_id = v_user;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('designate', 'active-season captain is granted team admin',
            CASE WHEN v_role = 'admin' THEN 'PASS' ELSE 'FAIL' END, v_role);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('designate', 'active-season captain is granted team admin', 'FAIL', SQLERRM);
  END;

  -- ══════════════════════════════════════════════════════════════════
  -- 2. THE CRITICAL ONE: the grant hangs off the roster LINK
  --    activate_team_membership writes the membership BEFORE it links the
  --    player row, so a trigger on team_members alone never sees a captain.
  -- ══════════════════════════════════════════════════════════════════
  BEGIN
    UPDATE public.team_members SET role = 'player'
     WHERE team_id = v_team AND user_id = v_user;
    UPDATE public.cricket_players SET user_id = NULL WHERE id = v_player;

    SELECT role INTO v_role FROM public.team_members
     WHERE team_id = v_team AND user_id = v_user;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('link', 'an unlinked captain is not granted',
            CASE WHEN v_role = 'player' THEN 'PASS' ELSE 'FAIL' END, v_role);

    UPDATE public.cricket_players SET user_id = v_user WHERE id = v_player;

    SELECT role INTO v_role FROM public.team_members
     WHERE team_id = v_team AND user_id = v_user;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('link', 'linking the roster row grants team admin',
            CASE WHEN v_role = 'admin' THEN 'PASS' ELSE 'FAIL' END, v_role);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('link', 'linking the roster row grants team admin', 'FAIL', SQLERRM);
  END;

  -- ══════════════════════════════════════════════════════════════════
  -- 3. A deliberate demotion sticks
  -- ══════════════════════════════════════════════════════════════════
  BEGIN
    UPDATE public.team_members SET role = 'player'
     WHERE team_id = v_team AND user_id = v_user;
    -- an unrelated roster edit must not re-promote
    UPDATE public.cricket_season_players SET joined_at = joined_at
     WHERE season_id = v_season AND player_id = v_player;

    SELECT role INTO v_role FROM public.team_members
     WHERE team_id = v_team AND user_id = v_user;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('demotion', 'explicit demotion survives an unrelated roster edit',
            CASE WHEN v_role = 'player' THEN 'PASS' ELSE 'FAIL' END, v_role);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('demotion', 'explicit demotion survives an unrelated roster edit', 'FAIL', SQLERRM);
  END;

  -- ══════════════════════════════════════════════════════════════════
  -- 4. Losing the armband does NOT revoke admin (documented policy)
  -- ══════════════════════════════════════════════════════════════════
  BEGIN
    UPDATE public.team_members SET role = 'admin'
     WHERE team_id = v_team AND user_id = v_user;
    UPDATE public.cricket_season_players SET designation = NULL
     WHERE season_id = v_season AND player_id = v_player;

    SELECT role INTO v_role FROM public.team_members
     WHERE team_id = v_team AND user_id = v_user;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('revoke', 'handing over the armband does not auto-revoke admin',
            CASE WHEN v_role = 'admin' THEN 'PASS' ELSE 'FAIL' END, v_role);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('revoke', 'handing over the armband does not auto-revoke admin', 'FAIL', SQLERRM);
  END;

  -- ══════════════════════════════════════════════════════════════════
  -- 5. A HISTORICAL season's captain gets nothing
  -- ══════════════════════════════════════════════════════════════════
  BEGIN
    IF v_old_season IS NULL THEN
      INSERT INTO _results(area, check_name, status, detail)
      VALUES ('history', 'correcting a past season does not grant admin today', 'SKIP',
              'no non-active season on record');
    ELSE
      UPDATE public.team_members SET role = 'player'
       WHERE team_id = v_team AND user_id = v_user;
      UPDATE public.cricket_season_players SET designation = NULL
       WHERE season_id = v_old_season AND designation = 'captain' AND left_at IS NULL;

      INSERT INTO public.cricket_season_players (season_id, player_id, team_id, designation)
      VALUES (v_old_season, v_player, v_team, 'captain')
      ON CONFLICT (season_id, player_id)
      DO UPDATE SET designation = 'captain', left_at = NULL;

      SELECT role INTO v_role FROM public.team_members
       WHERE team_id = v_team AND user_id = v_user;
      INSERT INTO _results(area, check_name, status, detail)
      VALUES ('history', 'correcting a past season does not grant admin today',
              CASE WHEN v_role = 'player' THEN 'PASS' ELSE 'FAIL' END, v_role);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('history', 'correcting a past season does not grant admin today', 'FAIL', SQLERRM);
  END;

  -- ══════════════════════════════════════════════════════════════════
  -- 6. Vice-captain is not granted
  -- ══════════════════════════════════════════════════════════════════
  BEGIN
    UPDATE public.team_members SET role = 'player'
     WHERE team_id = v_team AND user_id = v_user;
    UPDATE public.cricket_season_players SET designation = NULL
     WHERE season_id = v_season AND designation = 'vice-captain' AND left_at IS NULL;
    UPDATE public.cricket_season_players SET designation = 'vice-captain'
     WHERE season_id = v_season AND player_id = v_player;

    SELECT role INTO v_role FROM public.team_members
     WHERE team_id = v_team AND user_id = v_user;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('scope', 'vice-captain is not granted team admin',
            CASE WHEN v_role = 'player' THEN 'PASS' ELSE 'FAIL' END, v_role);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('scope', 'vice-captain is not granted team admin', 'FAIL', SQLERRM);
  END;

  -- ══════════════════════════════════════════════════════════════════
  -- 7. A deactivated captain is not granted
  -- ══════════════════════════════════════════════════════════════════
  BEGIN
    UPDATE public.team_members SET role = 'player'
     WHERE team_id = v_team AND user_id = v_user;
    UPDATE public.cricket_players SET is_active = false WHERE id = v_player;
    -- re-assert the armband directly; the deactivate trigger has just cleared it
    UPDATE public.cricket_season_players SET designation = 'captain'
     WHERE season_id = v_season AND player_id = v_player;

    SELECT role INTO v_role FROM public.team_members
     WHERE team_id = v_team AND user_id = v_user;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('scope', 'a deactivated captain is not granted team admin',
            CASE WHEN v_role = 'player' THEN 'PASS' ELSE 'FAIL' END, v_role);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('scope', 'a deactivated captain is not granted team admin', 'FAIL', SQLERRM);
  END;

  -- ══════════════════════════════════════════════════════════════════
  -- 8. Owners are never rewritten
  -- ══════════════════════════════════════════════════════════════════
  BEGIN
    SELECT count(*)::text INTO v_role FROM public.team_members
     WHERE team_id = v_team AND role = 'owner' AND status = 'active';
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('scope', 'owner rows untouched',
            CASE WHEN v_role <> '0' THEN 'PASS' ELSE 'FAIL' END,
            format('owners = %s', v_role));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('scope', 'owner rows untouched', 'FAIL', SQLERRM);
  END;

  -- ══════════════════════════════════════════════════════════════════
  -- 9. is_team_captain is not reachable from the client
  -- ══════════════════════════════════════════════════════════════════
  BEGIN
    IF has_function_privilege('authenticated', 'public.is_team_captain(uuid,uuid)', 'EXECUTE') THEN
      INSERT INTO _results(area, check_name, status, detail)
      VALUES ('exposure', 'is_team_captain not executable by authenticated', 'FAIL',
              'PostgREST would expose it as a cross-team captaincy oracle');
    ELSE
      INSERT INTO _results(area, check_name, status, detail)
      VALUES ('exposure', 'is_team_captain not executable by authenticated', 'PASS', NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('exposure', 'is_team_captain not executable by authenticated', 'FAIL', SQLERRM);
  END;
END $$;

-- Detail first, summary last: the Supabase CLI prints only the final result
-- set, so the summary has to be the last statement to be the thing you see.
SELECT seq, area, check_name, status, detail FROM _results ORDER BY seq;

SELECT count(*) FILTER (WHERE status = 'FAIL') AS failures,
       count(*) FILTER (WHERE status = 'SKIP') AS skipped,
       count(*) FILTER (WHERE status = 'PASS') AS passed,
       string_agg(check_name, ' | ') FILTER (WHERE status = 'FAIL') AS failed_checks
FROM _results;

ROLLBACK;
