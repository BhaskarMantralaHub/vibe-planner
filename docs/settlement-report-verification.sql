-- ============================================================
-- Public settlement report — token, scope and accounting checks
-- ============================================================
-- Exercises generate/revoke/get_settlement_share and get_settlement_report as
-- a real admin AND as a real non-admin member, against real rows, then throws
-- it all away.
--
-- SAFE TO RUN ON PRODUCTION. One transaction, ends in ROLLBACK. It mints and
-- rotates share links and inserts a throwaway split; none of it survives.
--
-- Impersonation works the way Supabase resolves auth.uid(): from
-- current_setting('request.jwt.claims'). set_config(..., is_local => true)
-- makes it last only for this transaction.
--
-- Each check sits in its own sub-block. A PL/pgSQL block with an EXCEPTION
-- clause is a subtransaction, so one catch-all at the top would roll back
-- every result recorded before the failure and report "1 failure, 0 passed".
--
-- Run:  supabase db query --linked -f docs/settlement-report-verification.sql
-- Expect: every row PASS.

BEGIN;

CREATE TEMP TABLE _results (
  seq serial, area text, check_name text, status text, detail text
) ON COMMIT DROP;

DO $$
DECLARE
  v_team     uuid;
  v_season   uuid;
  v_other    uuid;
  v_admin    uuid;
  v_member   uuid;
  v_p1       uuid;
  v_p2       uuid;
  v_token    uuid;
  v_token2   uuid;
  v_res      json;
  v_n        int;
  v_txt      text;
BEGIN
  -- ── Context ─────────────────────────────────────────────────────────
  SELECT id INTO v_team FROM public.cricket_teams
   WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
  SELECT id INTO v_season FROM public.cricket_seasons
   WHERE team_id = v_team AND is_active LIMIT 1;
  SELECT id INTO v_other FROM public.cricket_seasons
   WHERE team_id = v_team AND id <> v_season ORDER BY year DESC LIMIT 1;

  SELECT tm.user_id INTO v_admin FROM public.team_members tm
   WHERE tm.team_id = v_team AND tm.role IN ('owner','admin') AND tm.status='active'
   ORDER BY tm.role LIMIT 1;
  SELECT tm.user_id INTO v_member FROM public.team_members tm
   WHERE tm.team_id = v_team AND tm.role = 'player' AND tm.status='active'
   LIMIT 1;

  SELECT id INTO v_p1 FROM public.cricket_players
   WHERE team_id = v_team AND is_active AND NOT is_guest ORDER BY created_at LIMIT 1;
  SELECT id INTO v_p2 FROM public.cricket_players
   WHERE team_id = v_team AND is_active AND NOT is_guest AND id <> v_p1
   ORDER BY created_at LIMIT 1;

  IF v_team IS NULL OR v_season IS NULL OR v_admin IS NULL OR v_p2 IS NULL THEN
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('setup','resolve team/season/admin/players','FAIL',
            format('team=%s season=%s admin=%s p2=%s', v_team, v_season, v_admin, v_p2));
    RETURN;
  END IF;
  INSERT INTO _results(area,check_name,status,detail)
  VALUES ('setup','resolved real team, season, admin and players','PASS',NULL);

  -- Act as the admin for the write paths.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role','authenticated')::text, true);

  -- ══ 1. Admin can mint a link ═══════════════════════════════════════
  BEGIN
    v_res := public.generate_settlement_share(v_season);
    v_token := (v_res->>'token')::uuid;
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('mint','admin can generate a share link',
            CASE WHEN (v_res->>'success')::bool AND v_token IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
            v_res::text);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('mint','admin can generate a share link','FAIL',SQLERRM);
  END;

  -- ══ 2. Default expiry is 30 days, server-side ══════════════════════
  BEGIN
    SELECT count(*) INTO v_n FROM public.cricket_report_shares
     WHERE token = v_token
       AND expires_at BETWEEN now() + interval '29 days' AND now() + interval '31 days';
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('expiry','new link expires in ~30 days',
            CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, v_n::text);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('expiry','new link expires in ~30 days','FAIL',SQLERRM);
  END;

  -- ══ 3. The token resolves to the right team and season ═════════════
  BEGIN
    v_res := public.get_settlement_report(v_token);
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('read','token returns the report for its own team + season',
            CASE WHEN v_res IS NOT NULL
                  AND v_res->>'teamName' = (SELECT name FROM public.cricket_teams WHERE id=v_team)
                  AND v_res->>'seasonName' = (SELECT name FROM public.cricket_seasons WHERE id=v_season)
                 THEN 'PASS' ELSE 'FAIL' END,
            COALESCE(v_res->>'seasonName','(null report)'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('read','token returns the report for its own team + season','FAIL',SQLERRM);
  END;

  -- ══ 4. Debtors and creditors reconcile to the exact cent ═══════════
  BEGIN
    -- Add a throwaway split so there is guaranteed to be something to settle.
    INSERT INTO public.cricket_splits (team_id, season_id, paid_by, category,
                                       description, amount, split_date)
    VALUES (v_team, v_season, v_p1, 'food', 'ZZ verification split', 100.00, CURRENT_DATE);
    INSERT INTO public.cricket_split_shares (split_id, player_id, share_amount)
    SELECT id, v_p1, 33.34 FROM public.cricket_splits WHERE description='ZZ verification split';
    INSERT INTO public.cricket_split_shares (split_id, player_id, share_amount)
    SELECT id, v_p2, 66.66 FROM public.cricket_splits WHERE description='ZZ verification split';

    v_res := public.get_settlement_report(v_token);

    SELECT SUM((r->>'amountCents')::bigint) INTO v_n
    FROM json_array_elements(v_res->'settlements') r;

    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('accounting','outstanding total equals the sum of its rows',
            CASE WHEN COALESCE(v_n,0) = (v_res->>'totalOutstandingCents')::bigint
                 THEN 'PASS' ELSE 'FAIL' END,
            format('rows=%s header=%s', COALESCE(v_n,0), v_res->>'totalOutstandingCents'));

    SELECT count(*) INTO v_n
    FROM json_array_elements(v_res->'settlements') r
    WHERE (r->>'amountCents')::bigint <= 0;
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('accounting','no zero or negative rows',
            CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, v_n::text);

    -- The breakdown must ADD UP to the row it explains. An explanation that
    -- does not reconcile is worse than none: it invites the reader to trust a
    -- number the report cannot actually justify.
    SELECT count(*) INTO v_n
    FROM json_array_elements(v_res->'settlements') r
    WHERE (r->>'amountCents')::bigint
          IS DISTINCT FROM (
            SELECT COALESCE(SUM((w->>'amountCents')::bigint), 0)
            FROM json_array_elements(r->'why') w
          );
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('accounting','every row''s breakdown sums to the row total',
            CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END,
            format('%s row(s) do not reconcile', v_n));

    SELECT count(*) INTO v_n
    FROM json_array_elements(v_res->'settlements') r
    WHERE json_array_length(r->'why') = 0;
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('accounting','no row is left unexplained',
            CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END,
            format('%s row(s) with no reason', v_n));

    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('accounting','paymentCount matches the number of rows',
            CASE WHEN (v_res->>'paymentCount')::int
                     = json_array_length(v_res->'settlements')
                 THEN 'PASS' ELSE 'FAIL' END,
            v_res->>'paymentCount');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('accounting','reconciliation','FAIL',SQLERRM);
  END;

  -- ══ 5. Nothing private leaves the building ════════════════════════
  BEGIN
    v_txt := v_res::text;
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('privacy','report body contains no @ email address',
            CASE WHEN v_txt NOT LIKE '%@%' THEN 'PASS' ELSE 'FAIL' END, NULL);

    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('privacy','report body contains no player/team UUIDs',
            CASE WHEN v_txt NOT LIKE '%'||v_p1::text||'%'
                  AND v_txt NOT LIKE '%'||v_team::text||'%'
                  AND v_txt NOT LIKE '%'||v_season::text||'%'
                 THEN 'PASS' ELSE 'FAIL' END, NULL);

    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('privacy','report body does not echo the token',
            CASE WHEN v_txt NOT LIKE '%'||v_token::text||'%' THEN 'PASS' ELSE 'FAIL' END, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('privacy','no private data in the report','FAIL',SQLERRM);
  END;

  -- ══ 6. A random token is indistinguishable from a real miss ═══════
  BEGIN
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('security','a random token returns NULL',
            CASE WHEN public.get_settlement_report(gen_random_uuid()) IS NULL
                 THEN 'PASS' ELSE 'FAIL' END, NULL);
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('security','a NULL token returns NULL',
            CASE WHEN public.get_settlement_report(NULL) IS NULL
                 THEN 'PASS' ELSE 'FAIL' END, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('security','unknown tokens fail closed','FAIL',SQLERRM);
  END;

  -- ══ 7. Rotation kills the old link immediately ════════════════════
  BEGIN
    v_res := public.generate_settlement_share(v_season);
    v_token2 := (v_res->>'token')::uuid;

    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('rotate','rotating mints a different token',
            CASE WHEN v_token2 IS DISTINCT FROM v_token THEN 'PASS' ELSE 'FAIL' END, NULL);
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('rotate','the old token stops working at once',
            CASE WHEN public.get_settlement_report(v_token) IS NULL THEN 'PASS' ELSE 'FAIL' END, NULL);
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('rotate','the new token works',
            CASE WHEN public.get_settlement_report(v_token2) IS NOT NULL THEN 'PASS' ELSE 'FAIL' END, NULL);

    SELECT count(*) INTO v_n FROM public.cricket_report_shares
     WHERE team_id=v_team AND season_id=v_season AND is_active;
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('rotate','never more than one live link per team+season',
            CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, v_n::text);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('rotate','rotation invalidates the previous link','FAIL',SQLERRM);
  END;

  -- ══ 8. Expiry is enforced server-side ═════════════════════════════
  BEGIN
    UPDATE public.cricket_report_shares SET expires_at = now() - interval '1 day'
     WHERE token = v_token2;
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('expiry','an expired token returns NULL',
            CASE WHEN public.get_settlement_report(v_token2) IS NULL THEN 'PASS' ELSE 'FAIL' END, NULL);
    UPDATE public.cricket_report_shares SET expires_at = now() + interval '30 days'
     WHERE token = v_token2;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('expiry','an expired token returns NULL','FAIL',SQLERRM);
  END;

  -- ══ 9. Revocation is immediate and touches nothing else ═══════════
  BEGIN
    SELECT count(*) INTO v_n FROM public.cricket_splits
     WHERE team_id=v_team AND season_id=v_season AND deleted_at IS NULL;

    v_res := public.revoke_settlement_share(v_season);
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('revoke','a revoked token returns NULL',
            CASE WHEN public.get_settlement_report(v_token2) IS NULL THEN 'PASS' ELSE 'FAIL' END, NULL);

    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('revoke','revoking deletes no financial data',
            CASE WHEN v_n = (SELECT count(*) FROM public.cricket_splits
                             WHERE team_id=v_team AND season_id=v_season AND deleted_at IS NULL)
                 THEN 'PASS' ELSE 'FAIL' END, v_n::text);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('revoke','revocation','FAIL',SQLERRM);
  END;

  -- ══ 10. A non-admin member cannot mint, revoke or read a token ════
  BEGIN
    IF v_member IS NULL THEN
      INSERT INTO _results(area,check_name,status,detail)
      VALUES ('authz','a plain member cannot manage links','SKIP','no player-role member');
    ELSE
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_member, 'role','authenticated')::text, true);

      v_res := public.generate_settlement_share(v_season);
      INSERT INTO _results(area,check_name,status,detail)
      VALUES ('authz','a plain member cannot generate a link',
              CASE WHEN NOT (v_res->>'success')::bool THEN 'PASS' ELSE 'FAIL' END, v_res::text);

      v_res := public.revoke_settlement_share(v_season);
      INSERT INTO _results(area,check_name,status,detail)
      VALUES ('authz','a plain member cannot revoke a link',
              CASE WHEN NOT (v_res->>'success')::bool THEN 'PASS' ELSE 'FAIL' END, v_res::text);

      v_res := public.get_settlement_share(v_season);
      INSERT INTO _results(area,check_name,status,detail)
      VALUES ('authz','a plain member cannot read the live token',
              CASE WHEN NOT (v_res->>'success')::bool THEN 'PASS' ELSE 'FAIL' END, v_res::text);

      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role','authenticated')::text, true);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('authz','a plain member cannot manage links','FAIL',SQLERRM);
  END;

  -- ══ 11. A token for one season never shows another ════════════════
  BEGIN
    IF v_other IS NULL THEN
      INSERT INTO _results(area,check_name,status,detail)
      VALUES ('scope','a season token shows only that season','SKIP','only one season on record');
    ELSE
      v_res := public.generate_settlement_share(v_other);
      v_token := (v_res->>'token')::uuid;
      v_res := public.get_settlement_report(v_token);
      INSERT INTO _results(area,check_name,status,detail)
      VALUES ('scope','a season token shows only that season',
              CASE WHEN v_res->>'seasonName' = (SELECT name FROM public.cricket_seasons WHERE id=v_other)
                   THEN 'PASS' ELSE 'FAIL' END, v_res->>'seasonName');

      SELECT count(*) INTO v_n FROM public.cricket_report_shares
       WHERE team_id=v_team AND is_active;
      INSERT INTO _results(area,check_name,status,detail)
      VALUES ('scope','seasons hold independent links',
              CASE WHEN v_n >= 1 THEN 'PASS' ELSE 'FAIL' END, v_n::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('scope','season isolation','FAIL',SQLERRM);
  END;

  -- ══ 12. The share table itself is unreachable from the client ═════
  BEGIN
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('exposure','anon cannot select cricket_report_shares',
            CASE WHEN NOT has_table_privilege('anon','public.cricket_report_shares','SELECT')
                 THEN 'PASS' ELSE 'FAIL' END, NULL);
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('exposure','authenticated cannot select cricket_report_shares',
            CASE WHEN NOT has_table_privilege('authenticated','public.cricket_report_shares','SELECT')
                 THEN 'PASS' ELSE 'FAIL' END, NULL);
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('exposure','anon cannot mint a link',
            CASE WHEN NOT has_function_privilege('anon','public.generate_settlement_share(uuid)','EXECUTE')
                 THEN 'PASS' ELSE 'FAIL' END, NULL);
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('exposure','anon CAN read a report (the one public surface)',
            CASE WHEN has_function_privilege('anon','public.get_settlement_report(uuid)','EXECUTE')
                 THEN 'PASS' ELSE 'FAIL' END, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(area,check_name,status,detail)
    VALUES ('exposure','grants','FAIL',SQLERRM);
  END;
END $$;

SELECT seq, area, check_name, status, detail FROM _results ORDER BY seq;

SELECT count(*) FILTER (WHERE status='FAIL') AS failures,
       count(*) FILTER (WHERE status='SKIP') AS skipped,
       count(*) FILTER (WHERE status='PASS') AS passed,
       string_agg(check_name,' | ') FILTER (WHERE status='FAIL') AS failed_checks
FROM _results;

ROLLBACK;
