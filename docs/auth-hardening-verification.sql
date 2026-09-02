-- ============================================================================
-- AUTH HARDENING — VERIFICATION (run by hand, everything ROLLS BACK)
-- ============================================================================
-- Run in the Supabase SQL editor AFTER both:
--   docs/auth-hardening-migration.sql   (Phase A)
--   docs/membership-status-migration.sql (Phase B)
--
-- Pattern matches docs/umpiring-rpc-verification.sql: one transaction,
-- impersonation via set_config('request.jwt.claims', ..., is_local => true)
-- (which is what auth.uid() reads), RAISE EXCEPTION on any failed check,
-- ROLLBACK at the end — safe on production. Each check prints ok via NOTICE.
--
-- It creates throwaway fixtures inside the transaction: two fake auth users
-- (an attacker and a pre-added player), plus a pending membership. Nothing
-- survives.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_team_id UUID;
  v_admin_uid UUID;
  v_attacker UUID := gen_random_uuid();
  v_player_uid UUID := gen_random_uuid();
  v_pending_uid UUID := gen_random_uuid();
  v_invitee_uid UUID := gen_random_uuid();
  v_decoy_uid UUID := gen_random_uuid();
  v_player_row UUID;
  v_invitee_row UUID;
  v_invite_token UUID;
  v_before INT;
  v_after INT;
  v_res JSON;
  v_txt TEXT;
  v_posts INT;
BEGIN
  -- ── Fixtures: real team + its first active admin ──────────────────────
  SELECT id INTO v_team_id FROM cricket_teams WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
  IF v_team_id IS NULL THEN RAISE EXCEPTION 'no team found'; END IF;
  SELECT user_id INTO v_admin_uid FROM team_members
  WHERE team_id = v_team_id AND role IN ('owner','admin') AND status = 'active'
  ORDER BY joined_at LIMIT 1;
  IF v_admin_uid IS NULL THEN RAISE EXCEPTION 'no active team admin found'; END IF;

  -- Throwaway auth users (rolled back). The INSERT fires handle_new_user.
  -- attacker signs up requesting access='admin' — the A2 allowlist test.
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role, instance_id, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (v_attacker, 'attacker-' || v_attacker || '@test.local',
          jsonb_build_object('access', 'admin', 'full_name', 'Atta Cker'),
          '{}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', now(), now(), now());

  -- ── A2: signup cannot self-assign admin ───────────────────────────────
  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_attacker AND access @> '{admin}') THEN
    RAISE EXCEPTION 'FAIL A2: signup metadata access=admin produced an admin profile';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_attacker AND access = '{toolkit}') THEN
    RAISE EXCEPTION 'FAIL A2: attacker profile did not degrade to toolkit';
  END IF;
  RAISE NOTICE 'ok A2: access allowlist (admin metadata → toolkit)';

  -- ── A4 + B4: pre-added player signup links the unlinked matching row ──
  -- (When the advisory uniq_players_email_per_team index exists — clean data —
  -- two active rows can no longer share an email at all, so the "one linked +
  -- one unlinked, same email" ambiguity is structurally impossible. The
  -- never-steal property is proven separately below: a signup matching an
  -- ALREADY-LINKED row's email must land PENDING with the link untouched.)
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role, instance_id, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (v_decoy_uid, 'decoy-' || v_decoy_uid || '@test.local',
          jsonb_build_object('access', 'toolkit', 'full_name', 'Linked Decoy'),
          '{}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', now(), now(), now());
  -- Decoy roster row: linked to the throwaway account, with its OWN email
  -- (distinct from the decoy's auth email, so the steal-test signup below can
  -- reuse it without colliding in auth.users).
  INSERT INTO cricket_players (team_id, name, email, is_active, is_guest, user_id)
  VALUES (v_team_id, 'Linked Decoy', 'decoyrow-' || v_decoy_uid || '@test.local', true, false, v_decoy_uid);
  INSERT INTO cricket_players (team_id, name, email, is_active, is_guest)
  VALUES (v_team_id, 'Real Preadded', 'preadded-' || v_player_uid || '@test.local', true, false)
  RETURNING id INTO v_player_row;

  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role, instance_id, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (v_player_uid, 'preadded-' || v_player_uid || '@test.local',
          jsonb_build_object('access', 'cricket', 'full_name', 'Real Preadded',
                             'team_slug', (SELECT slug FROM cricket_teams WHERE id = v_team_id)),
          '{}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', now(), now(), now());

  IF (SELECT user_id FROM cricket_players WHERE id = v_player_row) IS DISTINCT FROM v_player_uid THEN
    RAISE EXCEPTION 'FAIL A4: unlinked pre-added row was not linked to the new signup';
  END IF;
  IF EXISTS (SELECT 1 FROM cricket_players
             WHERE team_id = v_team_id AND name = 'Linked Decoy' AND user_id IS DISTINCT FROM v_decoy_uid) THEN
    RAISE EXCEPTION 'FAIL A4: signup stole an already-linked player row';
  END IF;
  IF (SELECT status FROM team_members WHERE team_id = v_team_id AND user_id = v_player_uid) != 'active' THEN
    RAISE EXCEPTION 'FAIL B: pre-added signup did not yield an active membership';
  END IF;
  -- The UX flag must agree: a false here signs the user out into the
  -- "Pending Approval" screen even though they are fully active.
  IF (SELECT approved FROM profiles WHERE id = v_player_uid) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL B12: active member left with profiles.approved = false (Pending Approval screen)';
  END IF;
  RAISE NOTICE 'ok A4/B4: single null-guarded link + active membership on pre-added signup';

  -- ── K: welcome-post idempotency ───────────────────────────────────────
  SELECT count(*) INTO v_before FROM cricket_gallery
  WHERE team_id = v_team_id AND caption LIKE '%Real Preadded%';
  PERFORM activate_team_membership(v_team_id, v_player_uid);  -- replay
  PERFORM activate_team_membership(v_team_id, v_player_uid);  -- replay again
  SELECT count(*) INTO v_after FROM cricket_gallery
  WHERE team_id = v_team_id AND caption LIKE '%Real Preadded%';
  IF v_after != v_before THEN
    RAISE EXCEPTION 'FAIL K: activation replay created % extra welcome post(s)', v_after - v_before;
  END IF;
  IF (SELECT count(*) FROM team_members WHERE team_id = v_team_id AND user_id = v_player_uid) != 1 THEN
    RAISE EXCEPTION 'FAIL: activation replay duplicated the membership';
  END IF;
  IF v_after = 0 THEN
    RAISE NOTICE 'note K: zero welcome posts exist (team has no active season?) — idempotency held only vacuously';
  END IF;
  RAISE NOTICE 'ok K: activation is idempotent (one membership, one welcome)';

  -- ── Pending fixture + the NEVER-STEAL test ────────────────────────────
  -- This signup's email matches the decoy's ALREADY-LINKED roster row. The
  -- pre-added check requires user_id IS NULL, so this must land PENDING and
  -- must not re-point the decoy's link — the post-index steal scenario.
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role, instance_id, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (v_pending_uid, 'decoyrow-' || v_decoy_uid || '@test.local',
          jsonb_build_object('access', 'cricket', 'full_name', 'Pen Ding',
                             'team_slug', (SELECT slug FROM cricket_teams WHERE id = v_team_id)),
          '{}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', now(), now(), now());
  IF (SELECT status FROM team_members WHERE team_id = v_team_id AND user_id = v_pending_uid) != 'pending' THEN
    RAISE EXCEPTION 'FAIL A4: signup matching a LINKED roster email did not land pending';
  END IF;
  IF (SELECT user_id FROM cricket_players WHERE team_id = v_team_id AND name = 'Linked Decoy')
     IS DISTINCT FROM v_decoy_uid THEN
    RAISE EXCEPTION 'FAIL A4: signup stole an already-linked player row';
  END IF;
  RAISE NOTICE 'ok A4: linked-row email match lands pending, link untouched';

  -- ── Invitee fixtures: pre-added roster row, an existing toolkit account,
  --    and a live invite token (all inserted as postgres, pre-impersonation) ──
  INSERT INTO cricket_players (team_id, name, email, is_active, is_guest)
  VALUES (v_team_id, 'Invy Tee', 'invitee-' || v_invitee_uid || '@test.local', true, false)
  RETURNING id INTO v_invitee_row;

  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role, instance_id, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (v_invitee_uid, 'invitee-' || v_invitee_uid || '@test.local',
          jsonb_build_object('access', 'toolkit', 'full_name', 'Invy Tee'),
          '{}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', now(), now(), now());

  INSERT INTO team_invites (team_id, created_by, expires_at)
  VALUES (v_team_id, v_admin_uid, now() + interval '1 day')
  RETURNING token INTO v_invite_token;

  -- ══ Impersonate the INVITEE — the exact path the self-edit trigger once
  --    broke: accept_invite runs activate + the roster-link UPDATE with
  --    auth.uid() = the joining (non-admin) user ═══════════════════════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_invitee_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := accept_invite(v_invite_token);
  IF (v_res->>'success')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL C1: accept_invite failed for a pre-added invitee: %', v_res;
  END IF;
  IF (v_res->>'pending_approval')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL C1: pre-added invitee was not auto-approved: %', v_res;
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  EXECUTE 'RESET ROLE';
  IF (SELECT status FROM team_members WHERE team_id = v_team_id AND user_id = v_invitee_uid) IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FAIL C1: invite acceptance did not activate the membership';
  END IF;
  IF (SELECT user_id FROM cricket_players WHERE id = v_invitee_row) IS DISTINCT FROM v_invitee_uid THEN
    RAISE EXCEPTION 'FAIL C1: invite acceptance did not link the roster row';
  END IF;
  RAISE NOTICE 'ok C1: pre-added invitee accept_invite → active + linked (trigger permits system self-claim)';

  -- ══ Impersonate the ATTACKER (plain authenticated user) ══════════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_attacker, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- ── V: non-admin cannot reject_user ───────────────────────────────────
  BEGIN
    PERFORM reject_user(v_pending_uid);
    RAISE EXCEPTION 'FAIL V: non-admin executed reject_user';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'ok V: reject_user refused a non-admin (%)', SQLERRM;
  END;

  -- ── L/RLS: pending user data isolation is covered below; attacker (no
  --    membership) must see zero team rows ─────────────────────────────
  IF EXISTS (SELECT 1 FROM cricket_expenses WHERE team_id = v_team_id) THEN
    RAISE EXCEPTION 'FAIL L: non-member can read team expenses';
  END IF;
  RAISE NOTICE 'ok L: non-member sees no team data';

  -- ── M: client cannot spoof its own profile ────────────────────────────
  UPDATE profiles SET approved = true, access = '{admin}' WHERE id = v_attacker;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_attacker AND access @> '{admin}') THEN
    RAISE EXCEPTION 'FAIL M: user updated own profile to admin';
  END IF;
  RAISE NOTICE 'ok M: self profile update is a no-op under RLS';

  -- ── W: non-admin cannot approve members ───────────────────────────────
  BEGIN
    v_res := approve_team_member(v_team_id, v_pending_uid);
    RAISE EXCEPTION 'FAIL W: non-admin executed approve_team_member';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'ok W: approve_team_member refused a non-admin';
  END;

  -- ── A3: request_cricket_access acts only on the caller ────────────────
  v_txt := request_cricket_access();
  IF v_txt NOT IN ('ok', 'team_required') THEN
    RAISE EXCEPTION 'FAIL A3: unexpected result %', v_txt;
  END IF;
  IF EXISTS (SELECT 1 FROM team_members WHERE user_id = v_pending_uid AND rejected_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL A3: request touched another user';
  END IF;
  -- The caller keeps profiles.approved (no self-lockout, no third-party lockout).
  IF (SELECT approved FROM profiles WHERE id = v_attacker) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL A3: request_cricket_access flipped profiles.approved';
  END IF;
  RAISE NOTICE 'ok A3: request_cricket_access is self-scoped (%)', v_txt;

  -- ══ Impersonate the newly linked PLAYER ═══════════════════════════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_player_uid, 'role', 'authenticated')::text, true);

  -- ── A9: player cannot flip restricted columns on own row ──────────────
  BEGIN
    UPDATE cricket_players SET jersey_number = 99 WHERE id = v_player_row;
    RAISE EXCEPTION 'FAIL A9: player changed own jersey number';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'ok A9: restricted self-edit column rejected (%)', SQLERRM;
  END;
  UPDATE cricket_players SET shirt_size = 'L' WHERE id = v_player_row;
  IF (SELECT shirt_size FROM cricket_players WHERE id = v_player_row) != 'L' THEN
    RAISE EXCEPTION 'FAIL A9: allowed self-edit column was blocked';
  END IF;
  RAISE NOTICE 'ok A9: permitted self-edit column still works';

  -- ══ Impersonate the real TEAM ADMIN ═══════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_uid, 'role', 'authenticated')::text, true);

  -- ── A5: admin cannot move a membership to a foreign team ──────────────
  BEGIN
    UPDATE team_members SET team_id = gen_random_uuid()
    WHERE team_id = v_team_id AND user_id = v_pending_uid;
    -- Either an FK error or an RLS WITH CHECK violation is acceptable; a
    -- clean success is the failure. (FK fires first for a random id; the
    -- WITH CHECK is what stops a REAL other team.)
    RAISE EXCEPTION 'FAIL A5: membership row moved to another team';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'ok A5: cross-team membership rewrite blocked (%)', SQLERRM;
  END;

  -- ── U + T: team admin sees own queue; approval scopes to ONE team ─────
  IF NOT EXISTS (SELECT 1 FROM pending_members(v_team_id) pm WHERE pm.user_id = v_pending_uid) THEN
    RAISE EXCEPTION 'FAIL U: team admin cannot see own pending queue';
  END IF;
  RAISE NOTICE 'ok U: pending_members visible to team admin';

  v_res := approve_team_member(v_team_id, v_pending_uid);
  IF (v_res->>'success')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: approve_team_member failed: %', v_res;
  END IF;
  IF (SELECT status FROM team_members WHERE team_id = v_team_id AND user_id = v_pending_uid) != 'active' THEN
    RAISE EXCEPTION 'FAIL: approval did not activate the membership';
  END IF;
  IF EXISTS (SELECT 1 FROM team_members
             WHERE user_id = v_pending_uid AND team_id != v_team_id AND status = 'active') THEN
    RAISE EXCEPTION 'FAIL T: approval leaked into another team';
  END IF;
  -- Idempotent double-click:
  v_res := approve_team_member(v_team_id, v_pending_uid);
  IF (v_res->>'already_active')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL J: double approval was not idempotent: %', v_res;
  END IF;
  SELECT count(*) INTO v_posts FROM cricket_gallery
  WHERE team_id = v_team_id AND caption LIKE '%Pen Ding%';
  IF v_posts > 1 THEN
    RAISE EXCEPTION 'FAIL K: approval produced % welcome posts', v_posts;
  END IF;
  RAISE NOTICE 'ok T/J/K: approval is team-scoped, idempotent, single welcome';

  -- ── B3: rejection keeps the account ───────────────────────────────────
  -- (new pending fixture through the invite-less path)
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('role', NULL, true);
  INSERT INTO team_members (team_id, user_id, role, status)
  VALUES (v_team_id, v_attacker, 'player', 'pending')
  ON CONFLICT (team_id, user_id) DO UPDATE SET status = 'pending';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := reject_team_member(v_team_id, v_attacker);
  IF (v_res->>'success')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL B3: reject_team_member failed: %', v_res;
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('role', NULL, true);
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_attacker) THEN
    RAISE EXCEPTION 'FAIL B3: rejection deleted the auth account';
  END IF;
  IF (SELECT status FROM team_members WHERE team_id = v_team_id AND user_id = v_attacker) != 'rejected' THEN
    RAISE EXCEPTION 'FAIL B3: rejection did not set status=rejected';
  END IF;
  IF (SELECT approved FROM profiles WHERE id = v_attacker) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL B3: rejected user left locked out of their account';
  END IF;
  RAISE NOTICE 'ok B3: rejection is a status, account survives';

  -- ── Mirror consistency ────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM team_members WHERE approved IS DISTINCT FROM (status = 'active')) THEN
    RAISE EXCEPTION 'FAIL B1: approved mirror out of sync with status';
  END IF;
  RAISE NOTICE 'ok B1: approved mirror agrees with status everywhere';

  RAISE NOTICE '── ALL CHECKS PASSED (rolling back) ──';
END $$;

ROLLBACK;
