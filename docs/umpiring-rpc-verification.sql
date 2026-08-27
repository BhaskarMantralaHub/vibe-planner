-- ============================================================
-- Umpiring — RPC & constraint verification
-- ============================================================
-- Exercises claim_umpiring_duty / release_umpiring_duty and every CHECK on
-- cricket_umpiring_duties, AS A REAL PLAYER, then throws it all away.
--
-- SAFE TO RUN ON PRODUCTION. Everything happens inside one transaction that
-- ends in ROLLBACK, so no row survives. It reads your real team, season and
-- roster (so it tests against real data shapes) but writes nothing permanent.
--
-- HOW THE IMPERSONATION WORKS: Supabase's auth.uid() resolves from
-- current_setting('request.jwt.claims'), so set_config(..., is_local => true)
-- lets us act as a specific signed-in player for the rest of the transaction.
-- Without this the RPCs would see auth.uid() = NULL and every check would
-- return 'no_player', testing nothing.
--
-- Run:  supabase db query --linked -f docs/umpiring-rpc-verification.sql
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
  v_team      uuid;
  v_season    uuid;
  v_player    uuid;
  v_user      uuid;
  v_other     uuid;
  d1          uuid;   -- slot 1, future
  d2          uuid;   -- slot 2, same fixture
  d_past      uuid;
  r           text;
  v_status    text;
  v_assignee  uuid;
  v_notes     text;

  PROCEDURE_MARKER int; -- placeholder so the DECLARE block reads cleanly
BEGIN
  -- ── Context from real data ──────────────────────────────────────────
  SELECT id INTO v_team FROM public.cricket_teams
   WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
  SELECT id INTO v_season FROM public.cricket_seasons
   WHERE team_id = v_team AND is_active LIMIT 1;

  -- A player who is genuinely linked to a signed-in, approved team member.
  SELECT p.id, p.user_id INTO v_player, v_user
    FROM public.cricket_players p
    JOIN public.team_members tm
      ON tm.user_id = p.user_id AND tm.team_id = p.team_id AND tm.approved
   WHERE p.team_id = v_team AND p.is_active AND NOT p.is_guest
     AND p.user_id IS NOT NULL
   ORDER BY p.created_at
   LIMIT 1;

  IF v_team IS NULL OR v_season IS NULL OR v_player IS NULL THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('setup', 'resolve team/season/player', 'FAIL',
            format('team=%s season=%s player=%s', v_team, v_season, v_player));
    RETURN;
  END IF;
  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('setup', 'resolved real team, season and linked player', 'PASS', NULL);

  -- ── Two slots on one throwaway fixture, dated in the future ─────────
  INSERT INTO public.cricket_umpiring_duties
    (team_id, season_id, cricclubs_fixture_id, role_slot, match_date, match_time,
     venue, team_a, team_b, match_type, source, status)
  VALUES
    (v_team, v_season, 999999, 1, (now() + interval '30 days')::date, '10:45',
     'Verification Ground', 'MTCA Test A', 'MTCA Test B', 'league', 'mtca', 'open')
  RETURNING id INTO d1;

  INSERT INTO public.cricket_umpiring_duties
    (team_id, season_id, cricclubs_fixture_id, role_slot, match_date, match_time,
     venue, team_a, team_b, match_type, source, status)
  VALUES
    (v_team, v_season, 999999, 2, (now() + interval '30 days')::date, '10:45',
     'Verification Ground', 'MTCA Test A', 'MTCA Test B', 'league', 'mtca', 'open')
  RETURNING id INTO d2;

  INSERT INTO public.cricket_umpiring_duties
    (team_id, season_id, cricclubs_fixture_id, role_slot, match_date,
     team_a, team_b, source, status)
  VALUES
    (v_team, v_season, 999998, 1, (now() - interval '10 days')::date,
     'MTCA Test C', 'MTCA Test D', 'mtca', 'open')
  RETURNING id INTO d_past;

  -- team_id is derived by trigger, so confirm it ignored nothing and matched.
  SELECT team_id INTO v_assignee FROM public.cricket_umpiring_duties WHERE id = d1;
  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('trigger', 'team_id derived from season',
          CASE WHEN v_assignee = v_team THEN 'PASS' ELSE 'FAIL' END, NULL);

  -- ── Act as the player ───────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  r := public.claim_umpiring_duty(d1);
  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('rpc', 'claim an open future slot returns ok',
          CASE WHEN r = 'ok' THEN 'PASS' ELSE 'FAIL' END, r);

  SELECT status, assigned_player_id, assigned_player_name
    INTO v_status, v_assignee, v_notes
    FROM public.cricket_umpiring_duties WHERE id = d1;
  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('rpc', 'claim sets status=claimed and snapshots the name',
          CASE WHEN v_status = 'claimed' AND v_assignee IS NOT NULL AND v_notes IS NOT NULL
               THEN 'PASS' ELSE 'FAIL' END,
          format('status=%s name=%s', v_status, v_notes));

  r := public.claim_umpiring_duty(d1);
  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('rpc', 'claiming an already-taken slot returns not_open',
          CASE WHEN r = 'not_open' THEN 'PASS' ELSE 'FAIL' END, r);

  -- The guard that stops one person standing at both ends of one match.
  r := public.claim_umpiring_duty(d2);
  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('rpc', 'claiming the OTHER slot of the same match returns duplicate_slot',
          CASE WHEN r = 'duplicate_slot' THEN 'PASS' ELSE 'FAIL' END, r);

  r := public.claim_umpiring_duty(d_past);
  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('rpc', 'claiming a past match returns past',
          CASE WHEN r = 'past' THEN 'PASS' ELSE 'FAIL' END, r);

  r := public.release_umpiring_duty(d1);
  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('rpc', 'releasing your own claim returns ok',
          CASE WHEN r = 'ok' THEN 'PASS' ELSE 'FAIL' END, r);

  SELECT status, assigned_player_id INTO v_status, v_assignee
    FROM public.cricket_umpiring_duties WHERE id = d1;
  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('rpc', 'release returns the slot to open with no assignee',
          CASE WHEN v_status = 'open' AND v_assignee IS NULL THEN 'PASS' ELSE 'FAIL' END,
          format('status=%s assignee=%s', v_status, v_assignee));

  -- ── Act as somebody with no player row ──────────────────────────────
  v_other := gen_random_uuid();
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  r := public.claim_umpiring_duty(d1);
  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('rpc', 'a stranger cannot claim (not_member or no_player)',
          CASE WHEN r IN ('not_member', 'no_player') THEN 'PASS' ELSE 'FAIL' END, r);

  -- ── The freeze trigger, as the service role ─────────────────────────
  -- This is what stands between a buggy sync payload and every claim in the
  -- season being reset. Re-claim first so there is something to protect.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  PERFORM public.claim_umpiring_duty(d1);

  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'service_role')::text, true);
  UPDATE public.cricket_umpiring_duties
     SET venue = 'PATCHED BY SYNC',        -- an MTCA fact: must apply
         status = 'open',                   -- human-owned: must be ignored
         assigned_player_id = NULL,
         notes = 'sync should not write this'
   WHERE id = d1;

  SELECT status, assigned_player_id, notes INTO v_status, v_assignee, v_notes
    FROM public.cricket_umpiring_duties WHERE id = d1;
  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('trigger', 'service role CANNOT reset status/assignee/notes',
          CASE WHEN v_status = 'claimed' AND v_assignee IS NOT NULL AND v_notes IS NULL
               THEN 'PASS' ELSE 'FAIL' END,
          format('status=%s assignee=%s notes=%s', v_status, v_assignee, v_notes));

  SELECT venue INTO v_notes FROM public.cricket_umpiring_duties WHERE id = d1;
  INSERT INTO _results(area, check_name, status, detail)
  VALUES ('trigger', 'service role CAN still update MTCA facts (venue)',
          CASE WHEN v_notes = 'PATCHED BY SYNC' THEN 'PASS' ELSE 'FAIL' END, v_notes);

  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ── CHECK constraints ───────────────────────────────────────────────
  BEGIN
    UPDATE public.cricket_umpiring_duties
       SET status = 'open' WHERE id = d1;   -- still has an assignee
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('constraint', 'chk_umpiring_assignment rejects open-with-assignee', 'FAIL', 'update succeeded');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('constraint', 'chk_umpiring_assignment rejects open-with-assignee', 'PASS', SQLSTATE);
  END;

  BEGIN
    UPDATE public.cricket_umpiring_duties
       SET status = 'completed', completed_at = NULL WHERE id = d1;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('constraint', 'chk_umpiring_completed_at rejects completed w/o timestamp', 'FAIL', 'update succeeded');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('constraint', 'chk_umpiring_completed_at rejects completed w/o timestamp', 'PASS', SQLSTATE);
  END;

  BEGIN
    UPDATE public.cricket_umpiring_duties
       SET status = 'cancelled', cancelled_reason = NULL WHERE id = d1;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('constraint', 'chk_umpiring_cancelled_reason rejects cancelled w/o reason', 'FAIL', 'update succeeded');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('constraint', 'chk_umpiring_cancelled_reason rejects cancelled w/o reason', 'PASS', SQLSTATE);
  END;

  BEGIN
    UPDATE public.cricket_umpiring_duties
       SET match_time = '9:00 AM' WHERE id = d1;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('constraint', 'chk_umpiring_match_time rejects 12-hour text', 'FAIL', 'update succeeded');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('constraint', 'chk_umpiring_match_time rejects 12-hour text', 'PASS', SQLSTATE);
  END;

  BEGIN
    UPDATE public.cricket_umpiring_duties
       SET match_type = 'practice' WHERE id = d1;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('constraint', 'chk_umpiring_match_type rejects practice', 'FAIL', 'update succeeded');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('constraint', 'chk_umpiring_match_type rejects practice', 'PASS', SQLSTATE);
  END;

  -- Assignee must belong to the duty's own team.
  BEGIN
    UPDATE public.cricket_umpiring_duties
       SET assigned_player_id = gen_random_uuid() WHERE id = d2;
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('trigger', 'assignee must be a player on this team', 'FAIL', 'update succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('trigger', 'assignee must be a player on this team', 'PASS', SQLSTATE);
  END;

  -- ── The sync's upsert key must be inferrable ────────────────────────
  BEGIN
    INSERT INTO public.cricket_umpiring_duties
      (team_id, season_id, cricclubs_fixture_id, role_slot, match_date,
       team_a, team_b, source, status)
    VALUES
      (v_team, v_season, 999999, 1, (now() + interval '30 days')::date,
       'MTCA Test A', 'MTCA Test B', 'mtca', 'open')
    ON CONFLICT (team_id, season_id, cricclubs_fixture_id, role_slot)
      DO UPDATE SET venue = 'upsert-worked';
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('index', 'sync upsert key is inferrable (no 42P10)', 'PASS', NULL);
  EXCEPTION WHEN others THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('index', 'sync upsert key is inferrable (no 42P10)', 'FAIL', SQLSTATE || ' ' || SQLERRM);
  END;

  -- Manual duties (NULL fixture id) must stay freely insertable.
  BEGIN
    INSERT INTO public.cricket_umpiring_duties
      (team_id, season_id, cricclubs_fixture_id, role_slot, match_date,
       team_a, team_b, source, status)
    VALUES
      (v_team, v_season, NULL, 1, (now() + interval '31 days')::date,
       'MTCA Manual X', 'MTCA Manual Y', 'manual', 'open'),
      (v_team, v_season, NULL, 2, (now() + interval '31 days')::date,
       'MTCA Manual X', 'MTCA Manual Y', 'manual', 'open');
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('index', 'two manual slots on one match are insertable', 'PASS', NULL);
  EXCEPTION WHEN others THEN
    INSERT INTO _results(area, check_name, status, detail)
    VALUES ('index', 'two manual slots on one match are insertable', 'FAIL', SQLSTATE || ' ' || SQLERRM);
  END;
END $$;

SELECT area, check_name, status, coalesce(detail, '') AS detail
  FROM _results ORDER BY seq;

SELECT
  count(*) FILTER (WHERE status = 'PASS') AS passed,
  count(*) FILTER (WHERE status = 'FAIL') AS failed
FROM _results;

-- Nothing above is kept.
ROLLBACK;
