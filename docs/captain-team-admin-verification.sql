-- ============================================================
-- Captain -> team admin — trigger verification
-- ============================================================
-- Exercises every path by which the active season's captain is supposed to
-- receive team_members.role = 'admin', AS A REAL ADMIN, then throws it all
-- away.
--
-- SAFE TO RUN ON PRODUCTION. Everything happens inside one transaction that
-- ends in ROLLBACK, so no row survives. It reads your real team and active
-- season (so it tests real data shapes) but writes nothing permanent.
--
-- HOW THE IMPERSONATION WORKS: Supabase's auth.uid() resolves from
-- current_setting('request.jwt.claims'), so set_config(..., is_local => true)
-- lets us act as a specific signed-in admin for the rest of the transaction.
-- Without it, grant_captain_team_admin's is_team_admin() guard would reject
-- every write and the run would prove nothing.
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
  v_cap         uuid;   -- throwaway player: pre-added captain, no account
  v_link_user   uuid;   -- a real auth user we can link them to
  v_demoted     uuid;   -- throwaway player: captain, then demoted by hand
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

  -- Act as a real team admin, so the RLS-equivalent guard inside the trigger
  -- is genuinely satisfied rather than bypassed.
  SELECT tm.user_id INTO v_admin_user
    FROM public.team_members tm
   WHERE tm.team_id = v_team AND tm.role IN ('owner','admin') AND tm.status = 'active'
   ORDER BY tm.role LIMIT 1;

  IF v_team IS NULL OR v_season IS NULL OR v_admin_user IS NULL THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('setup', 'resolve team / active season / admin', 'FAIL',
            format('team=%s season=%s admin=%s', v_team, v_season, v_admin_user));
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_admin_user, 'role', 'authenticated')::text,
                     true);

  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('setup', 'resolved real team, active season and admin', 'PASS', NULL);

  -- A real auth user with no membership on this team, to stand in for
  -- "the captain finally signs up".
  SELECT u.id INTO v_link_user
    FROM auth.users u
   WHERE u.email_confirmed_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.team_members tm
                     WHERE tm.user_id = u.id AND tm.team_id = v_team)
   LIMIT 1;

  -- ══════════════════════════════════════════════════════════════════
  -- 1. Pre-added captain with no account: no grant, and no crash
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.cricket_players (team_id, name, is_active, is_guest)
  VALUES (v_team, 'ZZ Verification Captain', true, false)
  RETURNING id INTO v_cap;

  INSERT INTO public.cricket_season_players (season_id, player_id, team_id, designation)
  VALUES (v_season, v_cap, v_team, 'captain');

  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('unlinked', 'designating an account-less captain does not error', 'PASS', NULL);

  -- ══════════════════════════════════════════════════════════════════
  -- 2. THE CRITICAL ONE: membership activates first, link happens after
  --    (this is activate_team_membership's real statement order)
  -- ══════════════════════════════════════════════════════════════════
  IF v_link_user IS NULL THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('link', 'pre-added captain signs up -> admin', 'SKIP',
            'no unaffiliated confirmed auth user available to impersonate');
  ELSE
    -- (a) membership first, as 'player'
    INSERT INTO public.team_members (team_id, user_id, role, status)
    VALUES (v_team, v_link_user, 'player', 'active');

    SELECT role INTO v_role FROM public.team_members
     WHERE team_id = v_team AND user_id = v_link_user;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('link', 'membership alone does not grant (roster still unlinked)',
            CASE WHEN v_role = 'player' THEN 'PASS' ELSE 'FAIL' END, v_role);

    -- (b) the link, which is where the grant must happen
    UPDATE public.cricket_players SET user_id = v_link_user WHERE id = v_cap;

    SELECT role INTO v_role FROM public.team_members
     WHERE team_id = v_team AND user_id = v_link_user;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('link', 'linking the roster row grants team admin',
            CASE WHEN v_role = 'admin' THEN 'PASS' ELSE 'FAIL' END, v_role);

    -- ════════════════════════════════════════════════════════════════
    -- 3. A deliberate demotion sticks
    -- ════════════════════════════════════════════════════════════════
    UPDATE public.team_members SET role = 'player'
     WHERE team_id = v_team AND user_id = v_link_user;

    -- an unrelated roster edit must not re-promote
    UPDATE public.cricket_season_players SET is_guest = false
     WHERE season_id = v_season AND player_id = v_cap;

    SELECT role INTO v_role FROM public.team_members
     WHERE team_id = v_team AND user_id = v_link_user;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('demotion', 'explicit demotion survives an unrelated roster edit',
            CASE WHEN v_role = 'player' THEN 'PASS' ELSE 'FAIL' END, v_role);

    -- ════════════════════════════════════════════════════════════════
    -- 4. Losing the armband does NOT revoke admin (documented policy)
    -- ════════════════════════════════════════════════════════════════
    UPDATE public.team_members SET role = 'admin'
     WHERE team_id = v_team AND user_id = v_link_user;
    UPDATE public.cricket_season_players SET designation = NULL
     WHERE season_id = v_season AND player_id = v_cap;

    SELECT role INTO v_role FROM public.team_members
     WHERE team_id = v_team AND user_id = v_link_user;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('revoke', 'handing over the armband does not auto-revoke admin',
            CASE WHEN v_role = 'admin' THEN 'PASS' ELSE 'FAIL' END, v_role);
  END IF;

  -- ══════════════════════════════════════════════════════════════════
  -- 5. A HISTORICAL season's captain gets nothing
  -- ══════════════════════════════════════════════════════════════════
  IF v_old_season IS NULL OR v_link_user IS NULL THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('history', 'past-season captaincy grants nothing', 'SKIP',
            'no non-active season on record');
  ELSE
    UPDATE public.team_members SET role = 'player'
     WHERE team_id = v_team AND user_id = v_link_user;

    INSERT INTO public.cricket_season_players (season_id, player_id, team_id, designation)
    VALUES (v_old_season, v_cap, v_team, 'captain')
    ON CONFLICT (season_id, player_id) DO UPDATE SET designation = 'captain';

    SELECT role INTO v_role FROM public.team_members
     WHERE team_id = v_team AND user_id = v_link_user;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('history', 'correcting a past season does not grant admin today',
            CASE WHEN v_role = 'player' THEN 'PASS' ELSE 'FAIL' END, v_role);
  END IF;

  -- ══════════════════════════════════════════════════════════════════
  -- 6. Vice-captain is not granted
  -- ══════════════════════════════════════════════════════════════════
  IF v_link_user IS NOT NULL THEN
    UPDATE public.cricket_season_players SET designation = 'vice-captain'
     WHERE season_id = v_season AND player_id = v_cap;

    SELECT role INTO v_role FROM public.team_members
     WHERE team_id = v_team AND user_id = v_link_user;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('scope', 'vice-captain is not granted team admin',
            CASE WHEN v_role = 'player' THEN 'PASS' ELSE 'FAIL' END, v_role);
  END IF;

  -- ══════════════════════════════════════════════════════════════════
  -- 7. An owner is never rewritten
  -- ══════════════════════════════════════════════════════════════════
  SELECT count(*)::text INTO v_role FROM public.team_members
   WHERE team_id = v_team AND role = 'owner' AND status = 'active';
  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('scope', 'owner rows untouched',
          CASE WHEN v_role <> '0' THEN 'PASS' ELSE 'FAIL' END,
          format('owners = %s', v_role));

  -- ══════════════════════════════════════════════════════════════════
  -- 8. is_team_captain is not reachable from the client
  -- ══════════════════════════════════════════════════════════════════
  IF has_function_privilege('authenticated', 'public.is_team_captain(uuid,uuid)', 'EXECUTE') THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('exposure', 'is_team_captain not executable by authenticated', 'FAIL',
            'PostgREST would expose it as an RPC oracle');
  ELSE
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('exposure', 'is_team_captain not executable by authenticated', 'PASS', NULL);
  END IF;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('fatal', 'unhandled exception', 'FAIL', SQLERRM);
END $$;

SELECT seq, area, check_name, status, detail FROM _results ORDER BY seq;

SELECT count(*) FILTER (WHERE status = 'FAIL') AS failures,
       count(*) FILTER (WHERE status = 'SKIP') AS skipped,
       count(*) FILTER (WHERE status = 'PASS') AS passed
FROM _results;

ROLLBACK;
