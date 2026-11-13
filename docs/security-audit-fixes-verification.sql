-- ============================================================================
-- SECURITY AUDIT FIXES — VERIFICATION (run by hand, everything ROLLS BACK)
-- ============================================================================
-- Run in the Supabase SQL editor AFTER docs/security-audit-fixes-migration.sql.
--
-- Same pattern as docs/auth-hardening-verification.sql: one transaction,
-- throwaway auth users, impersonation through
-- set_config('request.jwt.claims', ..., true) + SET LOCAL ROLE authenticated
-- (which is what auth.uid() and RLS read), ROLLBACK at the end — safe on
-- production. Each check prints "ok ..." via NOTICE; a failed check raises
-- "FAIL ..." and aborts. Success is reported with NOTICE, never by throwing.
--
-- Uses the oldest live team, its owner and one of its seasons as anchors.
-- The S3b section needs a second team; it creates a throwaway one and reports
-- SKIP if the teams table refuses the insert.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_team_id    UUID;
  v_season_id  UUID;
  v_owner_uid  UUID;
  v_admin      UUID := gen_random_uuid();  -- plain team admin (not global)
  v_member     UUID := gen_random_uuid();  -- plain active member
  v_victim     UUID := gen_random_uuid();
  v_other      UUID := gen_random_uuid();
  v_team2      UUID;
  v_row1       UUID;
  v_row2       UUID;
  v_post       UUID;
  v_blocked    BOOLEAN;
  v_name       TEXT;
BEGIN
  -- ── Anchors ───────────────────────────────────────────────────────────
  SELECT id INTO v_team_id FROM cricket_teams WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
  IF v_team_id IS NULL THEN RAISE EXCEPTION 'no team found'; END IF;
  SELECT id INTO v_season_id FROM cricket_seasons WHERE team_id = v_team_id ORDER BY created_at LIMIT 1;
  IF v_season_id IS NULL THEN RAISE EXCEPTION 'no season found for team'; END IF;
  SELECT user_id INTO v_owner_uid FROM team_members
  WHERE team_id = v_team_id AND role = 'owner' AND status = 'active' LIMIT 1;
  IF v_owner_uid IS NULL THEN RAISE EXCEPTION 'no active owner found for team'; END IF;

  -- Throwaway users (handle_new_user gives each a plain toolkit profile).
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role, instance_id, encrypted_password, email_confirmed_at, created_at, updated_at)
  SELECT u, 'sec-' || u || '@test.local', jsonb_build_object('access', 'toolkit', 'full_name', 'Sec ' || left(u::text, 4)),
         '{}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', now(), now(), now()
  FROM unnest(ARRAY[v_admin, v_member, v_victim, v_other]) AS u;

  INSERT INTO team_members (team_id, user_id, role, status) VALUES
    (v_team_id, v_admin,  'admin',  'active'),
    (v_team_id, v_member, 'player', 'active');

  -- ── S1: profiles cannot be inserted from the client ───────────────────
  IF has_table_privilege('authenticated', 'public.profiles', 'INSERT')
     OR has_table_privilege('anon', 'public.profiles', 'INSERT') THEN
    RAISE EXCEPTION 'FAIL S1: authenticated/anon still hold INSERT on profiles';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND cmd = 'INSERT') THEN
    RAISE EXCEPTION 'FAIL S1: a profiles INSERT policy still exists';
  END IF;
  RAISE NOTICE 'ok S1: profiles has no client INSERT path';

  -- ── S2: RPC exposure ──────────────────────────────────────────────────
  IF to_regprocedure('public.get_signed_up_emails(text[])') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL S2a: get_signed_up_emails still exists';
  END IF;
  IF has_function_privilege('anon', 'public.acquire_cricclubs_sync_lock(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.acquire_cricclubs_sync_lock(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.release_cricclubs_sync_lock(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.release_cricclubs_sync_lock(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL S2b: sync-lock RPCs still executable by anon/authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.acquire_cricclubs_sync_lock(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL S2b: service_role lost the sync lock';
  END IF;
  IF has_function_privilege('anon', 'public.suggest_players(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL S2c: suggest_players executable by anon';
  END IF;
  RAISE NOTICE 'ok S2a/S2b/S2c: grants and dropped oracle';

  -- suggest_players: a plain member gets nothing; no result may carry an email
  -- for the other_team source; non-active members never appear.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF suggest_players('a', v_team_id)::jsonb <> '[]'::jsonb THEN
    RAISE EXCEPTION 'FAIL S2c: plain member received suggestions';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(suggest_players('a', v_team_id)::jsonb) e
             WHERE e->>'source' = 'other_team' AND e->>'email' IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL S2c: other_team suggestion still carries an email';
  END IF;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'ok S2c: suggest_players is admin-only and email-free for other teams';

  -- ── S3a: owner protection (as a plain team admin) ─────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_blocked := false;
  BEGIN
    INSERT INTO team_members (team_id, user_id, role, status) VALUES (v_team_id, v_victim, 'owner', 'active');
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'FAIL S3a: team admin inserted an owner row'; END IF;

  v_blocked := false;
  BEGIN
    UPDATE team_members SET role = 'admin' WHERE team_id = v_team_id AND user_id = v_owner_uid;
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'FAIL S3a: team admin demoted the owner'; END IF;

  v_blocked := false;
  BEGIN
    DELETE FROM team_members WHERE team_id = v_team_id AND user_id = v_owner_uid;
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'FAIL S3a: team admin removed the owner'; END IF;

  EXECUTE 'RESET ROLE';
  IF NOT EXISTS (SELECT 1 FROM team_members WHERE team_id = v_team_id AND user_id = v_owner_uid AND role = 'owner') THEN
    RAISE EXCEPTION 'FAIL S3a: owner row changed despite the blocks';
  END IF;
  RAISE NOTICE 'ok S3a: team admin cannot insert, demote or remove an owner';

  -- ── S3b: sync triggers act only for genuine members of the row's team ──
  BEGIN
    INSERT INTO cricket_teams (name, slug, owner_id)
    VALUES ('Sec Verify Team', 'sec-verify-' || left(gen_random_uuid()::text, 8), v_owner_uid)
    RETURNING id INTO v_team2;
  EXCEPTION WHEN OTHERS THEN
    v_team2 := NULL;
  END;

  IF v_team2 IS NULL THEN
    RAISE NOTICE 'SKIP S3b: could not create a throwaway second team';
  ELSE
    -- victim's real record on team2, plus a row on team 1 aimed at them by an
    -- admin (victim is NOT a member of team 1).
    INSERT INTO cricket_players (team_id, name, email, is_active, is_guest, user_id)
    VALUES (v_team2, 'Victim Original', 'victim-' || v_victim || '@test.local', true, false, v_victim)
    RETURNING id INTO v_row2;
    INSERT INTO cricket_players (team_id, name, email, is_active, is_guest, user_id)
    VALUES (v_team_id, 'Aimed Row', 'aimed-' || v_victim || '@test.local', true, false, v_victim)
    RETURNING id INTO v_row1;

    UPDATE cricket_players SET name = 'HIJACKED' WHERE id = v_row1;
    SELECT name INTO v_name FROM cricket_players WHERE id = v_row2;
    IF v_name IS DISTINCT FROM 'Victim Original' THEN
      RAISE EXCEPTION 'FAIL S3b: sync trigger overwrote another team''s row for a non-member user_id (%)', v_name;
    END IF;
    SELECT full_name INTO v_name FROM profiles WHERE id = v_victim;
    IF v_name = 'HIJACKED' THEN
      RAISE EXCEPTION 'FAIL S3b: profiles.full_name overwritten for a non-member user_id';
    END IF;

    -- control: once the victim really is an active member, sync works again
    INSERT INTO team_members (team_id, user_id, role, status) VALUES (v_team_id, v_victim, 'player', 'active');
    UPDATE cricket_players SET name = 'Legit Rename' WHERE id = v_row1;
    SELECT name INTO v_name FROM cricket_players WHERE id = v_row2;
    IF v_name IS DISTINCT FROM 'Legit Rename' THEN
      RAISE EXCEPTION 'FAIL S3b: legitimate cross-team sync stopped working (%)', v_name;
    END IF;
    RAISE NOTICE 'ok S3b: sync only for genuine members, still works for them';
  END IF;

  -- ── S4: gallery INSERT bound to the caller ────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_blocked := false;
  BEGIN
    INSERT INTO cricket_gallery (user_id, season_id, team_id, caption)
    VALUES (v_other, v_season_id, v_team_id, 'forged');
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'FAIL S4: forged-author gallery post accepted'; END IF;

  INSERT INTO cricket_gallery (user_id, season_id, team_id, caption)
  VALUES (v_member, v_season_id, v_team_id, 'honest') RETURNING id INTO v_post;

  v_blocked := false;
  BEGIN
    INSERT INTO cricket_gallery_comments (post_id, user_id, comment_by, text, team_id)
    VALUES (v_post, v_other, 'Forged', 'x', v_team_id);
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'FAIL S4: forged-author comment accepted'; END IF;

  v_blocked := false;
  BEGIN
    INSERT INTO cricket_gallery_likes (post_id, user_id, liked_by) VALUES (v_post, v_other, 'Forged');
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'FAIL S4: forged-author like accepted'; END IF;

  INSERT INTO cricket_gallery_comments (post_id, user_id, comment_by, text, team_id)
  VALUES (v_post, v_member, 'Me', 'honest', v_team_id);
  INSERT INTO cricket_gallery_likes (post_id, user_id, liked_by) VALUES (v_post, v_member, 'Me');
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'ok S4: gallery family rejects forged authors, accepts honest writes';

  -- ── S5: storage policies (catalog-level) ──────────────────────────────
  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname = 'storage' AND tablename = 'objects'
               AND policyname LIKE 'Cricket users % gallery photos') THEN
    RAISE EXCEPTION 'FAIL S5: old has_cricket_access gallery policies still present';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND (coalesce(qual, '') ILIKE '%gallery-photos%' OR coalesce(with_check, '') ILIKE '%gallery-photos%')
        AND (coalesce(qual, '') || coalesce(with_check, '')) ILIKE '%cricket_seasons%') < 3 THEN
    RAISE EXCEPTION 'FAIL S5: gallery-photos SELECT/INSERT/DELETE are not all season/team scoped';
  END IF;
  RAISE NOTICE 'ok S5: gallery-photos policies are team-scoped';

  -- ── S6: receipt_urls CHECK ────────────────────────────────────────────
  IF NOT public.all_https_urls(ARRAY['https://x.supabase.co/a.jpg'])
     OR NOT public.all_https_urls(ARRAY['/storage/split-receipts/team/a.jpg'])
     OR public.all_https_urls(ARRAY['/storage/split-receipts/../x'])
     OR public.all_https_urls(ARRAY['https://x.supabase.co/a.jpg', 'javascript:alert(1)'])
     OR public.all_https_urls(ARRAY['http://insecure.example/a.jpg'])
     OR NOT public.all_https_urls(ARRAY[]::text[]) THEN
    RAISE EXCEPTION 'FAIL S6: all_https_urls misclassified an input';
  END IF;
  IF (SELECT count(*) FROM pg_constraint
      WHERE conname IN ('cricket_splits_receipt_urls_https', 'cricket_expenses_receipt_urls_https')) <> 2 THEN
    RAISE EXCEPTION 'FAIL S6: receipt_urls CHECK constraints missing';
  END IF;
  RAISE NOTICE 'ok S6: receipt_urls accepts only https';

  RAISE NOTICE '── ALL CHECKS PASSED (rolling back) ──';
END $$;

ROLLBACK;
