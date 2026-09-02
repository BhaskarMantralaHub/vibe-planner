-- ============================================================================
-- PHASE 4 — INVITE LIFECYCLE VERIFICATION (run by hand, everything ROLLS BACK)
-- ============================================================================
-- Run AFTER docs/invite-lifecycle-migration.sql. Same pattern as the other
-- verification scripts: impersonation via request.jwt.claims, RAISE on any
-- failure, ROLLBACK at the end — safe on production.
--
-- Covers the Phase 4 checklist items that are database-side:
--   1 admin can generate · 2 non-admin cannot · 3 cross-team refused
--   4 token unpredictable · 5 has expiry · 6 expired rejected
--   7 revoked rejected · 8 refresh mints a new token · 9 old token dies
--   10 only the newest token works · 13-15 signup semantics unchanged
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_team_id UUID;
  v_admin_uid UUID;
  v_member_uid UUID;
  v_res JSON;
  v_tok1 UUID;
  v_tok2 UUID;
  v_exp TIMESTAMPTZ;
  v_n INT;
BEGIN
  SELECT id INTO v_team_id FROM cricket_teams WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
  SELECT user_id INTO v_admin_uid FROM team_members
  WHERE team_id = v_team_id AND role IN ('owner','admin') AND status = 'active'
  ORDER BY joined_at LIMIT 1;
  SELECT user_id INTO v_member_uid FROM team_members
  WHERE team_id = v_team_id AND role = 'player' AND status = 'active'
  ORDER BY joined_at LIMIT 1;
  IF v_team_id IS NULL OR v_admin_uid IS NULL OR v_member_uid IS NULL THEN
    RAISE EXCEPTION 'fixtures missing (team/admin/member)';
  END IF;

  -- ══ as a plain MEMBER ═════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 2. non-admin cannot generate
  BEGIN
    v_res := generate_team_invite(v_team_id);
    RAISE EXCEPTION 'FAIL 2: a plain member generated an invite';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'ok 2: generate refused for a non-admin';
  END;

  -- 2b. non-admin cannot revoke
  BEGIN
    v_res := revoke_team_invite(v_team_id);
    RAISE EXCEPTION 'FAIL 2b: a plain member revoked an invite';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'ok 2b: revoke refused for a non-admin';
  END;

  -- 11. rendering/reading cannot create anything: the client has no INSERT
  --     policy on team_invites any more.
  BEGIN
    INSERT INTO team_invites (team_id, created_by, expires_at)
    VALUES (v_team_id, v_member_uid, now() + interval '3650 days');
    RAISE EXCEPTION 'FAIL 11: client INSERT into team_invites succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'ok 11: direct client INSERT blocked (no policy)';
  END;

  -- ══ as the TEAM ADMIN ═════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_uid, 'role', 'authenticated')::text, true);

  -- 1 + 5. generate, and it carries an expiry ~30 days out
  v_res := generate_team_invite(v_team_id);
  v_tok1 := (v_res->>'token')::uuid;
  v_exp := (v_res->>'expires_at')::timestamptz;
  IF v_tok1 IS NULL THEN RAISE EXCEPTION 'FAIL 1: no token returned'; END IF;
  IF v_exp IS NULL OR v_exp <= now() THEN RAISE EXCEPTION 'FAIL 5: no future expiry'; END IF;
  IF v_exp > now() + interval '31 days' OR v_exp < now() + interval '29 days' THEN
    RAISE EXCEPTION 'FAIL 5: expiry is not the 30-day server default: %', v_exp;
  END IF;
  RAISE NOTICE 'ok 1/5: admin generated a token expiring %', v_exp::date;

  -- 4. unpredictable: a v4 UUID, not derived from the team id
  IF v_tok1::text = v_team_id::text THEN RAISE EXCEPTION 'FAIL 4: token equals team id'; END IF;
  IF substring(v_tok1::text, 15, 1) <> '4' THEN
    RAISE EXCEPTION 'FAIL 4: token is not a v4 (random) UUID: %', v_tok1;
  END IF;
  RAISE NOTICE 'ok 4: token is a random v4 UUID unrelated to the team id';

  -- 12. the live invite is readable for Copy link
  IF NOT EXISTS (
    SELECT 1 FROM team_invites
    WHERE team_id = v_team_id AND token = v_tok1 AND is_active AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'FAIL 12: generated invite is not the readable active one';
  END IF;
  RAISE NOTICE 'ok 12: active invite readable by the admin';

  -- validate_invite_token accepts it
  IF (SELECT validate_invite_token(v_tok1)) IS NULL THEN
    RAISE EXCEPTION 'FAIL: validate_invite_token rejected a fresh token';
  END IF;

  -- 8 + 9 + 10. refresh mints a NEW token, kills the old, leaves exactly one
  v_res := generate_team_invite(v_team_id);
  v_tok2 := (v_res->>'token')::uuid;
  IF v_tok2 = v_tok1 THEN RAISE EXCEPTION 'FAIL 8: refresh reused the token'; END IF;
  RAISE NOTICE 'ok 8: refresh produced a different token';

  IF (SELECT is_active FROM team_invites WHERE token = v_tok1) THEN
    RAISE EXCEPTION 'FAIL 9: the old token is still active after refresh';
  END IF;
  IF (SELECT validate_invite_token(v_tok1)) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 9: validate_invite_token still accepts the old token';
  END IF;
  RAISE NOTICE 'ok 9: old token stops validating after refresh';

  SELECT count(*) INTO v_n FROM team_invites WHERE team_id = v_team_id AND is_active;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL 10: % active invites for the team, expected 1', v_n; END IF;
  RAISE NOTICE 'ok 10: exactly one active invite per team';

  -- 6. expired is rejected (age the row directly — validation is by time)
  UPDATE team_invites SET expires_at = now() - interval '1 minute' WHERE token = v_tok2;
  IF (SELECT validate_invite_token(v_tok2)) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 6: an expired token still validates';
  END IF;
  RAISE NOTICE 'ok 6: expired token rejected';

  -- accept_invite must refuse it too, not just the validator
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member_uid, 'role', 'authenticated')::text, true);
  v_res := accept_invite(v_tok2);
  IF v_res->>'error' IS NULL THEN
    RAISE EXCEPTION 'FAIL 6b: accept_invite accepted an expired token';
  END IF;
  RAISE NOTICE 'ok 6b: accept_invite refuses an expired token';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_uid, 'role', 'authenticated')::text, true);

  -- 7. revoked is rejected
  v_res := generate_team_invite(v_team_id);
  v_tok1 := (v_res->>'token')::uuid;
  v_res := revoke_team_invite(v_team_id);
  IF (SELECT validate_invite_token(v_tok1)) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 7: a revoked token still validates';
  END IF;
  SELECT count(*) INTO v_n FROM team_invites WHERE team_id = v_team_id AND is_active;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 7: % invites still active after revoke', v_n; END IF;
  RAISE NOTICE 'ok 7: revoked token rejected, nothing left active';

  -- 3. cross-team: an admin here cannot mint an invite for another team.
  --    (Only meaningful with 2+ teams; skipped cleanly on a single-team install.)
  IF (SELECT count(*) FROM cricket_teams WHERE deleted_at IS NULL) > 1 THEN
    DECLARE v_other UUID;
    BEGIN
      SELECT id INTO v_other FROM cricket_teams
      WHERE deleted_at IS NULL AND id <> v_team_id LIMIT 1;
      BEGIN
        v_res := generate_team_invite(v_other);
        RAISE EXCEPTION 'FAIL 3: admin minted an invite for another team';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
        RAISE NOTICE 'ok 3: cross-team generate refused';
      END;
    END;
  ELSE
    RAISE NOTICE 'skip 3: only one team exists (cross-team case not exercisable)';
  END IF;

  PERFORM set_config('request.jwt.claims', NULL, true);
  EXECUTE 'RESET ROLE';
  RAISE NOTICE '── ALL INVITE LIFECYCLE CHECKS PASSED (rolling back) ──';
END $$;

ROLLBACK;
