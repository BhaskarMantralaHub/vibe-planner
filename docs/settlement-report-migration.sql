-- ============================================================================
-- PUBLIC TEAM SETTLEMENT REPORT — share links + the report RPC
-- ============================================================================
-- A team admin mints a link; anyone holding it sees who owes whom for ONE
-- team and ONE season, with no login. Nothing else is reachable through it.
--
-- WHAT THE REPORT COMPUTES
-- ------------------------
-- The same PAIRWISE model the authenticated Splits page uses, and deliberately
-- not a "simplify debts" netting. What A owes B comes only from splits B
-- actually paid that A shared in, less settlements between those two people.
--
-- Worked example of the difference: A owes B $50, B owes C $50. This report
-- says "A pays B $50, B pays C $50". A netting engine would say "A pays C $50"
-- — fewer transfers, but it invents a debt between two people who never shared
-- an expense, and it contradicts what both of them already see in the app.
-- The mirror of this logic lives in app/(tools)/cricket/lib/settlement.ts;
-- docs/settlement-report-verification.sql checks the two still agree.
--
-- MONEY: every sum is NUMERIC, which is exact decimal in Postgres — no binary
-- float ever touches a balance. Amounts leave here as INTEGER CENTS so JSON
-- cannot reintroduce float drift on the way to the browser.
--
-- WHAT LEAVES: team name, team logo URL, season name, display names, and
-- amounts in cents. No emails, phones, user_ids, player ids or membership
-- data. One caveat worth stating rather than hiding: teamLogo is a Supabase
-- Storage URL whose path contains the TEAM's uuid. That id unlocks nothing on
-- its own (every policy still requires membership), but "no database ids" is
-- not literally true and nobody should build on the stronger claim.
--
-- SCOPE: peer-to-peer splits only. The pool fund (season fees, team expenses,
-- sponsorships) is a different accounting model — players owe the POOL there,
-- not each other — and the app has always kept the two apart.
--
-- WHY A RAW TOKEN AND NOT A HASH
-- ------------------------------
-- Same trade-off already made and documented for team_invites: the admin
-- re-shares this link weeks after minting it (a new player joins the group
-- chat, someone loses the message). Storing only a hash means the link is
-- readable exactly once, so every re-share forces a rotation that breaks the
-- copy everyone else is holding. The token is a v4 UUID from gen_random_uuid()
-- (122 bits of CSPRNG), the table denies all client access, and both lookup
-- paths go through SECURITY DEFINER functions.
--
-- ONE ACTIVE LINK PER TEAM + SEASON, enforced by a partial unique index rather
-- than by convention, so no code path can quietly mint a second live
-- credential. Generating again ROTATES: the old token stops working in the
-- same transaction the new one is born.
-- ============================================================================


-- ============================================================
-- 0. Prerequisite
-- ============================================================
-- The composite FK below targets cricket_seasons(id, team_id), which is backed
-- by a unique INDEX created in season-roster-migration.sql. Without it the
-- CREATE TABLE fails with "no unique constraint matching given keys", which
-- names the wrong culprit.

DO $$ BEGIN
  IF to_regclass('public.uniq_cricket_seasons_id_team') IS NULL THEN
    RAISE EXCEPTION 'Apply docs/season-roster-migration.sql first (needs uniq_cricket_seasons_id_team).';
  END IF;
END $$;


-- ============================================================
-- 1. The share credential
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cricket_report_shares (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL,
  season_id   UUID NOT NULL,
  token       UUID NOT NULL DEFAULT gen_random_uuid(),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT cricket_report_shares_token_key UNIQUE (token),
  -- Composite FK: makes a link whose season belongs to another team
  -- unrepresentable, rather than merely disallowed by policy.
  CONSTRAINT cricket_report_shares_season_fk
    FOREIGN KEY (season_id, team_id)
    REFERENCES public.cricket_seasons (id, team_id) ON DELETE CASCADE,
  CONSTRAINT cricket_report_shares_team_fk
    FOREIGN KEY (team_id) REFERENCES public.cricket_teams (id) ON DELETE CASCADE,
  -- An equivalence, not an implication: this also forbids the dead-but-
  -- unrevoked row (is_active = false, revoked_at NULL) that "is it usable"
  -- would otherwise have two ways to answer.
  CONSTRAINT cricket_report_shares_revoked_consistent
    CHECK ((revoked_at IS NULL) = is_active)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_report_share
  ON public.cricket_report_shares (team_id, season_id)
  WHERE is_active;

-- No separate index on token: the UNIQUE constraint above already builds one,
-- and the report's lookup is a unique probe with the lifecycle columns as
-- cheap recheck filters. A partial copy would only add write amplification on
-- every rotation.

-- RLS on with NO policies: the table is unreachable from anon and
-- authenticated entirely. Every read and write goes through the SECURITY
-- DEFINER functions below, which is what stops token enumeration.
ALTER TABLE public.cricket_report_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cricket_report_shares FROM anon, authenticated;


-- ============================================================
-- 2. Default lifetime
-- ============================================================
-- A function, not a column DEFAULT: a client could POST any expires_at it
-- liked if the value were merely advisory. This is how team_invites ended up
-- with a 2099 token.

CREATE OR REPLACE FUNCTION public.settlement_share_ttl()
RETURNS INTERVAL LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$ SELECT INTERVAL '30 days' $$;


-- ============================================================
-- 3. Mint / rotate a link (team admin only)
-- ============================================================
-- Idempotent in the sense that matters: there is never more than one usable
-- link per team+season. Calling again deliberately rotates.

CREATE OR REPLACE FUNCTION public.generate_settlement_share(p_season_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team    UUID;
  v_token   UUID;
  v_expires TIMESTAMPTZ;
BEGIN
  SELECT s.team_id INTO v_team
  FROM public.cricket_seasons s
  JOIN public.cricket_teams t ON t.id = s.team_id AND t.deleted_at IS NULL
  WHERE s.id = p_season_id;

  -- One failure for both "no such season" and "not your season". Splitting
  -- them would let any signed-in account probe whether an arbitrary UUID is a
  -- real season on some other team — get_settlement_share already collapses
  -- them, and the three RPCs should not disagree about this.
  IF v_team IS NULL OR NOT (public.is_team_admin(v_team) OR public.is_global_admin()) THEN
    RETURN json_build_object('success', false, 'reason', 'not_allowed');
  END IF;

  -- Serialise rotations for this team+season. The partial unique index makes
  -- two live rows impossible either way; without this lock the admin who
  -- loses a concurrent race gets a raw 23505 instead of the {success, reason}
  -- envelope every other path here returns, and their transaction aborts.
  PERFORM pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_team::text || ':' || p_season_id::text, 0));

  -- Retire the incumbent first, in the same transaction, so the partial
  -- unique index can never see two live rows.
  UPDATE public.cricket_report_shares
  SET is_active = false, revoked_at = now()
  WHERE team_id = v_team AND season_id = p_season_id AND is_active;

  v_expires := now() + public.settlement_share_ttl();

  INSERT INTO public.cricket_report_shares (team_id, season_id, created_by, expires_at)
  VALUES (v_team, p_season_id, auth.uid(), v_expires)
  RETURNING token INTO v_token;

  RETURN json_build_object(
    'success', true,
    'token', v_token,
    'expires_at', v_expires
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_settlement_share(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_settlement_share(UUID) TO authenticated;


-- ============================================================
-- 4. Revoke (team admin only)
-- ============================================================
-- Invalidates the credential and NOTHING else. No expense, settlement,
-- balance or player is touched.

CREATE OR REPLACE FUNCTION public.revoke_settlement_share(p_season_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team UUID;
  v_n    INTEGER;
BEGIN
  SELECT s.team_id INTO v_team
  FROM public.cricket_seasons s WHERE s.id = p_season_id;

  -- Same single failure as generate: no existence oracle.
  IF v_team IS NULL OR NOT (public.is_team_admin(v_team) OR public.is_global_admin()) THEN
    RETURN json_build_object('success', false, 'reason', 'not_allowed');
  END IF;

  UPDATE public.cricket_report_shares
  SET is_active = false, revoked_at = now()
  WHERE team_id = v_team AND season_id = p_season_id AND is_active;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN json_build_object('success', true, 'revoked', v_n);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_settlement_share(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.revoke_settlement_share(UUID) TO authenticated;


-- ============================================================
-- 5. What link does this season currently have? (team admin only)
-- ============================================================
-- Powers the admin's Share button: it needs to re-copy the live link without
-- rotating it. Returns the token because the admin is already authorised to
-- mint one — see the header on why the token is not hashed.

CREATE OR REPLACE FUNCTION public.get_settlement_share(p_season_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
DECLARE
  v_team UUID;
  v_row  RECORD;
BEGIN
  SELECT s.team_id INTO v_team
  FROM public.cricket_seasons s WHERE s.id = p_season_id;
  IF v_team IS NULL OR NOT (public.is_team_admin(v_team) OR public.is_global_admin()) THEN
    RETURN json_build_object('success', false);
  END IF;

  SELECT token, expires_at, created_at, created_by
  INTO v_row
  FROM public.cricket_report_shares
  WHERE team_id = v_team AND season_id = p_season_id AND is_active
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', true, 'share', NULL);
  END IF;

  RETURN json_build_object('success', true, 'share', json_build_object(
    'token', v_row.token,
    'expires_at', v_row.expires_at,
    'created_at', v_row.created_at,
    'created_by_name', (
      SELECT p.name FROM public.cricket_players p
      WHERE p.user_id = v_row.created_by AND p.team_id = v_team LIMIT 1
    )
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.get_settlement_share(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_settlement_share(UUID) TO authenticated;


-- ============================================================
-- 6. THE PUBLIC REPORT
-- ============================================================
-- The only function anon can call. Everything it can reach is scoped by the
-- team+season stored ON the token row, so a token cannot be steered at other
-- data by any argument.
--
-- Returns NULL for every failure — invalid, expired, revoked, unknown. The
-- caller cannot tell which, so a guessed UUID reveals nothing about whether it
-- nearly existed. Do not add reason codes here.

CREATE OR REPLACE FUNCTION public.get_settlement_report(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
DECLARE
  v_team    UUID;
  v_season  UUID;
  v_result  JSON;
BEGIN
  IF p_token IS NULL THEN
    RETURN NULL;
  END IF;

  -- The team join is not decoration: soft-deleting a team is the strongest
  -- "make this stop" the product offers, and without it a deleted team would
  -- keep serving names and debts to the open internet for up to 30 more days.
  SELECT sh.team_id, sh.season_id INTO v_team, v_season
  FROM public.cricket_report_shares sh
  JOIN public.cricket_teams t ON t.id = sh.team_id AND t.deleted_at IS NULL
  WHERE sh.token = p_token
    AND sh.is_active
    AND sh.revoked_at IS NULL
    AND sh.expires_at > now();

  IF v_team IS NULL THEN
    RETURN NULL;  -- invalid / expired / revoked, indistinguishable by design
  END IF;

  WITH
  -- Every obligation as (debtor owes creditor, amount). A share on a split
  -- someone else paid is a debt; a settlement pays one down.
  obligations AS (
    SELECT x.player_id AS debtor, s.paid_by AS creditor, x.share_amount AS amt
    FROM public.cricket_splits s
    JOIN public.cricket_split_shares x ON x.split_id = s.id
    WHERE s.team_id = v_team
      AND s.season_id = v_season
      AND s.deleted_at IS NULL
      AND x.player_id <> s.paid_by
    UNION ALL
    SELECT st.from_player, st.to_player, -st.amount
    FROM public.cricket_split_settlements st
    WHERE st.team_id = v_team AND st.season_id = v_season
  ),
  -- Collapse both directions of each pair onto one row; the sign says who owes.
  normalised AS (
    SELECT
      LEAST(debtor, creditor)    AS a,
      GREATEST(debtor, creditor) AS b,
      CASE WHEN debtor < creditor THEN amt ELSE -amt END AS signed_amt
    FROM obligations
    WHERE debtor IS DISTINCT FROM creditor
  ),
  netted AS (
    SELECT a, b, SUM(signed_amt) AS net
    FROM normalised
    GROUP BY a, b
    HAVING SUM(signed_amt) <> 0    -- no zero rows, ever
  ),
  directed AS (
    SELECT
      CASE WHEN net > 0 THEN a ELSE b END AS from_id,
      CASE WHEN net > 0 THEN b ELSE a END AS to_id,
      -- Exact, and ROUND never actually rounds: share_amount and amount are
      -- NUMERIC(10,2), so net*100 is already integral. The TS mirror rounds
      -- per row instead; the two agree ONLY while inputs are exactly 2dp.
      ROUND(ABS(net) * 100)::BIGINT       AS amount_cents
    FROM netted
  ),
  rows_out AS (
    SELECT
      d.from_id,
      d.to_id,
      d.amount_cents,
      pf.name AS from_name,
      pt.name AS to_name
    FROM directed d
    JOIN public.cricket_players pf ON pf.id = d.from_id
    JOIN public.cricket_players pt ON pt.id = d.to_id
    -- No is_active filter, deliberately: someone who left the club still owes
    -- what they owe, and dropping the row would silently unbalance the report.
    -- No ORDER BY either — a CTE's ordering is not preserved into json_agg,
    -- so it is applied inside the aggregate below, which is the only place
    -- Postgres guarantees it.
  ),
  settled_out AS (
    SELECT
      ROUND(st.amount * 100)::BIGINT AS amount_cents,
      pf.name AS from_name,
      pt.name AS to_name,
      st.settled_date,
      st.created_at,
      st.id
    FROM public.cricket_split_settlements st
    JOIN public.cricket_players pf ON pf.id = st.from_player
    JOIN public.cricket_players pt ON pt.id = st.to_player
    WHERE st.team_id = v_team AND st.season_id = v_season
    -- This ORDER BY is load-bearing for a different reason: it decides WHICH
    -- 20 rows survive the LIMIT. created_at is nullable, so NULLS LAST keeps a
    -- legacy row from jumping ahead of a real timestamp on the same day.
    ORDER BY st.settled_date DESC, st.created_at DESC NULLS LAST, st.id
    LIMIT 20
  )
  SELECT json_build_object(
    'teamName',   (SELECT t.name FROM public.cricket_teams t WHERE t.id = v_team),
    'teamLogo',   (SELECT t.logo_url FROM public.cricket_teams t WHERE t.id = v_team),
    'seasonName', (SELECT s.name FROM public.cricket_seasons s WHERE s.id = v_season),
    'updatedAt',  now(),
    'totalOutstandingCents',
      COALESCE((SELECT SUM(amount_cents) FROM rows_out), 0),
    'paymentCount',
      (SELECT count(*) FROM rows_out),
    -- Counted on player ids, never on names: cricket_players.name has no
    -- unique constraint, and two people called Madhu are two members.
    'membersInvolved',
      (SELECT count(*) FROM (
         SELECT from_id AS pid FROM rows_out
         UNION
         SELECT to_id FROM rows_out
       ) q),
    'settlements',
      COALESCE((SELECT json_agg(json_build_object(
        'from', from_name, 'to', to_name, 'amountCents', amount_cents
      ) ORDER BY amount_cents DESC, from_id) FROM rows_out), '[]'::json),
    'settled',
      COALESCE((SELECT json_agg(json_build_object(
        'from', from_name, 'to', to_name,
        'amountCents', amount_cents, 'date', settled_date
      ) ORDER BY settled_date DESC, created_at DESC NULLS LAST, id) FROM settled_out), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- The one public surface. anon needs it; authenticated viewers get the same
-- report rather than being pushed through the app's login.
--
-- Call it with POST (supabase-js rpc() does). Being STABLE, PostgREST will
-- also serve it over GET — which would put the token in a query string and
-- make the response cacheable. Do not add a GET caller.
REVOKE ALL ON FUNCTION public.get_settlement_report(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_settlement_report(UUID) TO anon, authenticated;

-- Anyone the link was forwarded to can call this at line rate, and a valid
-- token aggregates a season's splits. A hard ceiling costs nothing here (the
-- real query is a handful of index scans) and bounds the amplification.
ALTER FUNCTION public.get_settlement_report(UUID) SET statement_timeout = '5s';

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 7. Verification (read-only)
-- ============================================================
-- Full harness: docs/settlement-report-verification.sql
--
-- Live links:
--   SELECT t.name, s.name AS season, rs.expires_at, rs.is_active
--   FROM cricket_report_shares rs
--   JOIN cricket_teams t ON t.id = rs.team_id
--   JOIN cricket_seasons s ON s.id = rs.season_id
--   WHERE rs.is_active ORDER BY rs.created_at DESC;
--
-- Never more than one live link per team+season:
--   SELECT team_id, season_id, count(*) FROM cricket_report_shares
--   WHERE is_active GROUP BY 1,2 HAVING count(*) > 1;   -- expect zero rows


-- ============================================================
-- 7b. Deliberately NOT in backup.yml / restore.yml
-- ============================================================
-- These rows are bearer credentials, not team data. Restoring them would
-- resurrect links an admin had revoked — the one thing revocation is for.
-- The cost of excluding them is that a restore silently kills live links and
-- an admin re-shares; that is the right way round.


-- ============================================================
-- 8. Rollback
-- ============================================================
--   DROP FUNCTION IF EXISTS public.get_settlement_report(UUID);
--   DROP FUNCTION IF EXISTS public.get_settlement_share(UUID);
--   DROP FUNCTION IF EXISTS public.revoke_settlement_share(UUID);
--   DROP FUNCTION IF EXISTS public.generate_settlement_share(UUID);
--   DROP FUNCTION IF EXISTS public.settlement_share_ttl();
--   DROP TABLE IF EXISTS public.cricket_report_shares;
