-- ============================================================================
-- cricclubs duplicate innings rows — cleanup + prevention
--
-- SYMPTOM: Ashok Reddy Donti Reddy showed 5 wickets from 13 innings across 7
-- matches. MTCA's own site says 3 wickets from 7 matches.
--
-- ROOT CAUSE, precisely: the roster matcher is CASE-INSENSITIVE while the
-- uniqueness constraint is CASE-SENSITIVE.
--     UNIQUE (match_row_id, innings_number, bowling_team, cricclubs_name)
-- MTCA re-spelled him "Ashok Reddy DONTI Reddy". Both sync paths resolve a
-- player with `name.trim().toLowerCase()`, so that string still matched the
-- roster and carried the SAME player_id — while presenting a brand-new string
-- to a case-sensitive index. The upsert's ON CONFLICT therefore matched
-- nothing and INSERTED a second row per match instead of updating the first.
-- Six bowling and six batting rows were duplicated.
--
-- That distinction matters twice over: it is why the rows share a player_id
-- (so they are provably the same person, and the cleanup is safe), and it
-- bounds the drift this fix must survive to case and whitespace variants.
-- Every aggregate that SUMs rows then double-counted him; the player sheet's
-- match timeline happened to be right only because it keys a Map by
-- match_row_id and the second copy silently overwrote the first.
--
-- AUDIT (read-only, run 2026-09-07 against production):
--   bowling rows 183, batting rows 314
--   duplicate groups: bowling 6, batting 6 — ALL with IDENTICAL figures
--   players affected: 1 (Ashok Reddy Donti Reddy)
--   players with >1 cricclubs_name spelling: 1 (the same player)
--   every other player: raw totals == deduplicated totals
-- So the cleanup below is lossless, and no other player's figures move.
--
-- RUN ORDER — sections 1 → 2 → 3 → 4 → 5, in that order.
--   1, 2  SELECT-only. Read the output before going further. If any group in
--         section 1 reports distinct_figures > 1, STOP and get a human.
--   3     Deletes the duplicates. Keep the transaction open, re-run section 1,
--         and only COMMIT once it returns zero rows.
--   4     Installs the triggers. Order matters: the merge is bounded to the
--         NEWEST row precisely so that running 4 before 3 degrades (a stale
--         variant lingers) instead of breaking (duplicate-key on every sync).
--         Still run 3 first.
--   5     Exercises the trigger against real rows and ROLLBACKs.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. VERIFY — which rows are duplicated, and are they really identical?
--    Expect 6 bowling + 6 batting groups, every one with distinct_figures = 1.
--    If any group reports distinct_figures > 1, STOP: the two rows disagree
--    and a human must choose which is right. Do not run section 3.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  'bowling'                                   AS table_name,
  b.match_row_id,
  b.innings_number,
  b.bowling_team                              AS team,
  p.name                                      AS player,
  count(*)                                    AS row_count,
  -- EVERY non-key column, not a subset. A pair that differs only in `dots`,
  -- `economy` or `is_captain` must not be reported as identical, or the
  -- "lossless" claim above is broader than this query supports.
  count(DISTINCT (b.overs, b.maidens, b.dots, b.runs, b.wickets,
                  b.economy, b.is_captain))   AS distinct_figures,
  array_agg(b.cricclubs_name ORDER BY b.id)   AS spellings,
  array_agg(b.id ORDER BY b.id)               AS row_ids
FROM cricclubs_bowling b
JOIN cricket_players p ON p.id = b.player_id
WHERE b.player_id IS NOT NULL
GROUP BY b.match_row_id, b.innings_number, b.bowling_team, b.player_id, p.name
HAVING count(*) > 1

UNION ALL

SELECT
  'batting'                                   AS table_name,
  a.match_row_id,
  a.innings_number,
  a.batting_team                              AS team,
  p.name                                      AS player,
  count(*)                                    AS row_count,
  -- EVERY non-key column. `not_out` especially: it is the denominator of
  -- cricclubs_batting_season's batting average, so a pair differing only in
  -- not_out would change a published figure while reporting as identical.
  count(DISTINCT (a.batting_position, a.runs, a.balls, a.fours, a.sixes,
                  a.strike_rate, a.dismissal, a.not_out, a.is_captain,
                  a.is_wicketkeeper, a.did_not_bat)) AS distinct_figures,
  array_agg(a.cricclubs_name ORDER BY a.id)   AS spellings,
  array_agg(a.id ORDER BY a.id)               AS row_ids
FROM cricclubs_batting a
JOIN cricket_players p ON p.id = a.player_id
WHERE a.player_id IS NOT NULL
GROUP BY a.match_row_id, a.innings_number, a.batting_team, a.player_id, p.name
HAVING count(*) > 1
ORDER BY table_name, match_row_id;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. VERIFY — every total that will change, before and after.
--
--    BOTH disciplines. Section 3 deletes batting rows too, and
--    cricclubs_batting_season sums runs/balls/fours/sixes and counts
--    not_out/dismissals — so batting runs, boundaries, average and strike
--    rate all move. Previewing bowling alone would hide half the change.
--
--    Grouped by player_id, NOT by name: two roster rows sharing a display
--    name would otherwise collapse into one output row and mask which of
--    them is actually affected.
--
--    Expect exactly one player: Ashok — bowling 5w/127r/13i -> 3w/69r/7i,
--    batting 2 runs/2 innings -> 1 run/1 innings.
-- ────────────────────────────────────────────────────────────────────────────
WITH bowl AS (
  SELECT b.*, row_number() OVER (
           PARTITION BY b.match_row_id, b.innings_number, b.bowling_team, b.player_id
           ORDER BY b.id DESC) AS rn
  FROM cricclubs_bowling b WHERE b.player_id IS NOT NULL
), bat AS (
  SELECT a.*, row_number() OVER (
           PARTITION BY a.match_row_id, a.innings_number, a.batting_team, a.player_id
           ORDER BY a.id DESC) AS rn
  FROM cricclubs_batting a WHERE a.player_id IS NOT NULL
)
SELECT 'bowling' AS discipline, r.player_id, p.name AS player,
       sum(r.wickets)                          AS wickets_or_runs_now,
       count(*)                                AS innings_now,
       sum(r.wickets) FILTER (WHERE r.rn = 1)  AS wickets_or_runs_after,
       count(*)       FILTER (WHERE r.rn = 1)  AS innings_after
FROM bowl r JOIN cricket_players p ON p.id = r.player_id
GROUP BY r.player_id, p.name
HAVING count(*) <> count(*) FILTER (WHERE r.rn = 1)

UNION ALL

SELECT 'batting' AS discipline, r.player_id, p.name AS player,
       sum(r.runs)                             AS wickets_or_runs_now,
       count(*)                                AS innings_now,
       sum(r.runs) FILTER (WHERE r.rn = 1)     AS wickets_or_runs_after,
       count(*)    FILTER (WHERE r.rn = 1)     AS innings_after
FROM bat r JOIN cricket_players p ON p.id = r.player_id
GROUP BY r.player_id, p.name
HAVING count(*) <> count(*) FILTER (WHERE r.rn = 1)
ORDER BY discipline, player;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. CLEAN UP — delete the duplicates, keeping ONE row per
--    (match, innings, team, player).
--
--    KEEPS THE HIGHEST id, which is the most recently inserted row and
--    therefore MTCA's CURRENT spelling. That choice is load-bearing: keeping
--    the older spelling would leave the current one absent, and the very next
--    sync would insert it again and rebuild the duplicate. (Confirmed: one of
--    his matches exists ONLY under the new "DONTI" spelling, so the new
--    spelling is what MTCA serves today.)
--
--    Wrapped in a transaction with the counts echoed, so a surprising number
--    can be rolled back instead of discovered afterwards.
-- ────────────────────────────────────────────────────────────────────────────
BEGIN;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY match_row_id, innings_number, bowling_team, player_id
           ORDER BY id DESC
         ) AS rn
  FROM cricclubs_bowling
  WHERE player_id IS NOT NULL
)
DELETE FROM cricclubs_bowling
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
-- Expect: DELETE 6

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY match_row_id, innings_number, batting_team, player_id
           ORDER BY id DESC
         ) AS rn
  FROM cricclubs_batting
  WHERE player_id IS NOT NULL
)
DELETE FROM cricclubs_batting
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
-- Expect: DELETE 6

-- Re-run the section 1 query here; it must return ZERO rows before COMMIT.
COMMIT;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. PREVENT RECURRENCE
--
--    ⚠ DO NOT INSTALL UNTIL SECTION 3 HAS COMMITTED. This section reads like
--    independent prevention work and is not: on uncleaned data the merge
--    finds a pre-existing duplicate, updates the newest copy, and leaves the
--    older one behind — so aggregates stay double-counted with no error to
--    signal that the cleanup was skipped. (It no longer 409s the sync, which
--    an earlier draft did; that was worse, but silent is not good either.)
--
--    The existing name-based UNIQUE constraints are DELIBERATELY LEFT IN
--    PLACE. Both sync paths upsert with
--      on_conflict=match_row_id,innings_number,bowling_team,cricclubs_name
--    and PostgREST needs a unique index on exactly those columns to infer the
--    conflict target. Dropping or reshaping it would make every sync 409 —
--    trading silent corruption for a total outage.
--
--    Instead: a BEFORE INSERT trigger that recognises the player. When a row
--    arrives for a (match, innings, team, player) that already has one under
--    a DIFFERENT spelling, it updates the existing row and skips the insert.
--    Name drift then behaves as the update it always should have been.
--
--    Only fires when player_id IS NOT NULL. Opponent rows are unlinked (88
--    bowling / 169 batting today) and must keep their name-only identity —
--    there is no player to key them on.
--
--    WHY NOT THE OBVIOUS ALTERNATIVE: making the name comparison itself
--    case-insensitive — `citext`, or a UNIQUE index on
--    (match_row_id, innings_number, bowling_team, lower(cricclubs_name)) —
--    would let the existing constraint catch case drift with no trigger and
--    no RETURN NULL. It is rejected because PostgREST's `on_conflict` cannot
--    target an EXPRESSION index, so both sync paths would lose their upsert
--    target and start 409-ing. Written down so the next reader does not
--    reinvent it and hit the same wall.
--
--    CONSTRAINT this introduces: a PLAIN INSERT into these tables (no
--    ON CONFLICT clause) can now raise 23505 where it previously would have
--    duplicated. Both sync paths supply an on_conflict target and use
--    `return=minimal`, so neither is affected. Any new writer must do the
--    same.
--
--    SECURITY INVOKER IS DELIBERATE AND MUST NOT BECOME DEFINER.
--    Under INVOKER, `current_user` inside the body stays the caller, so the
--    merge UPDATE is still subject to RLS and to the existing "Team admin
--    update bowling"/"…batting" policies. That gives exactly the split we
--    want: service_role (the sync, and the only real writer) has BYPASSRLS so
--    the merge always works; an authenticated team admin gets the merge only
--    within their own team, and outside it ROW_COUNT comes back 0 and the
--    insert proceeds normally. A DEFINER function owned by postgres would
--    bypass RLS for EVERY caller and turn the team_id note below from
--    "unreachable" into "any team admin can rewrite another team's innings
--    row with one crafted INSERT".
--
--    `search_path = ''` matches the hardened precedent in
--    docs/umpiring-schema.sql, so nothing inside the body can be resolved
--    through a shadowing pg_temp object. Every reference is therefore
--    schema-qualified.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cricclubs_bowling_merge_name_drift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  merged_count integer;
BEGIN
  IF NEW.player_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ONE row, the newest, and the name test lives INSIDE the subquery. Three
  -- separate reasons, all load-bearing — do not "simplify" this back into a
  -- plain set-UPDATE with the name test in the outer WHERE.
  --
  -- (a) An unbounded UPDATE is a self-inflicted outage. It would rewrite
  --     cricclubs_name on EVERY variant row, so two variants (A and B,
  --     incoming C) both become C and collide on
  --     UNIQUE (match_row_id, innings_number, bowling_team, cricclubs_name)
  --     → 23505 → the whole PostgREST batch fails and the sync throws. Two
  --     variant rows is exactly the state this file exists to clean up, so a
  --     trigger installed WITHOUT section 3 would hard-fail on every run for
  --     that player.
  --
  -- (b) CONCURRENCY. Under read-committed, two overlapping syncs inserting
  --     the same innings: A updates row X and holds the lock; B's subquery
  --     (on its older snapshot) also returns X; B blocks, and on wake
  --     EvalPlanQual re-evaluates only the OUTER qual `id = X`, which is
  --     still true because id never changes. B's UPDATE lands, ROW_COUNT=1,
  --     insert skipped. No duplicate, no error.
  --     With the name test in the outer WHERE, EPQ would re-check it against
  --     A's committed row, fail, fall through to the INSERT, and depend on
  --     ON CONFLICT to rescue it. Moving the test into the subquery is what
  --     removes it from the EPQ re-check.
  --
  -- (c) TRADE-OFF, chosen deliberately: if two variant rows somehow exist,
  --     this updates the newest and returns merged_count = 1, so the insert
  --     is skipped and the older duplicate survives QUIETLY rather than
  --     raising a loud 23505. Post-cleanup that state is unreachable, and a
  --     quiet stale row beats a sync that cannot run at all.
  --
  -- An empty subquery yields `id = NULL`, matches nothing, ROW_COUNT = 0,
  -- and the function returns NEW — the normal insert path.
  --
  -- team_id is in the predicate to make the merge STRUCTURALLY intra-tenant.
  -- It cannot change today's behaviour: cricclubs_matches is UNIQUE
  -- (team_id, cricclubs_match_id), so match_row_id is already team-pinned.
  -- But nothing ENFORCES cricclubs_bowling.team_id = the match's team_id —
  -- the two FKs are independent, and both sync paths stamp team_id from a
  -- device-local constant (INTERNAL_TEAM_ID / CONFIG.team_id) rather than
  -- deriving it from the match. Hand the Scriptable script to a second club
  -- with a wrong CONFIG.team_id and, as service_role with BYPASSRLS, this
  -- UPDATE would rewrite the FIRST club's innings row and swallow the insert.
  --
  -- No explicit updated_at: set_cricclubs_bowling_updated_at already stamps
  -- it on every UPDATE.
  UPDATE public.cricclubs_bowling SET
    cricclubs_name = NEW.cricclubs_name,
    overs          = NEW.overs,
    maidens        = NEW.maidens,
    dots           = NEW.dots,
    runs           = NEW.runs,
    wickets        = NEW.wickets,
    economy        = NEW.economy,
    is_captain     = NEW.is_captain
  WHERE id = (
    SELECT id FROM public.cricclubs_bowling
    WHERE match_row_id   = NEW.match_row_id
      AND team_id        = NEW.team_id
      AND innings_number = NEW.innings_number
      AND bowling_team   = NEW.bowling_team
      AND player_id      = NEW.player_id
      AND cricclubs_name IS DISTINCT FROM NEW.cricclubs_name
    ORDER BY id DESC
    LIMIT 1
  );

  GET DIAGNOSTICS merged_count = ROW_COUNT;
  IF merged_count > 0 THEN
    -- The one interesting event, made visible for free. Both syncs count
    -- optimistically (batting += batRows.length), so a run that merged rows
    -- otherwise reports success identical to a run that inserted them.
    RAISE LOG 'cricclubs name drift merged: player=% match=% now="%"',
      NEW.player_id, NEW.match_row_id, NEW.cricclubs_name;
    -- Skip the INSERT: the existing row has been brought up to date.
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cricclubs_bowling_merge_name_drift ON public.cricclubs_bowling;
CREATE TRIGGER trg_cricclubs_bowling_merge_name_drift
  BEFORE INSERT ON public.cricclubs_bowling
  FOR EACH ROW EXECUTE FUNCTION public.cricclubs_bowling_merge_name_drift();


-- Same contract as the bowling trigger above: SECURITY INVOKER on purpose,
-- `search_path = ''` with every reference qualified, team_id in the predicate.
CREATE OR REPLACE FUNCTION public.cricclubs_batting_merge_name_drift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  merged_count integer;
BEGIN
  IF NEW.player_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- One row, the newest — see the note on the bowling trigger for why an
  -- unbounded UPDATE here would turn a data bug into a sync outage.
  UPDATE public.cricclubs_batting SET
    cricclubs_name   = NEW.cricclubs_name,
    batting_position = NEW.batting_position,
    runs             = NEW.runs,
    balls            = NEW.balls,
    fours            = NEW.fours,
    sixes            = NEW.sixes,
    strike_rate      = NEW.strike_rate,
    dismissal        = NEW.dismissal,
    not_out          = NEW.not_out,
    -- is_captain AND is_wicketkeeper: batting carries both (bowling has only
    -- is_captain). Omitting them left the merged row with STALE flags while
    -- every other field updated — so a player who took the armband or the
    -- gloves in the same season their name drifted would keep the old value
    -- forever, invisibly. The merge must copy EVERY non-key column.
    is_captain       = NEW.is_captain,
    is_wicketkeeper  = NEW.is_wicketkeeper,
    did_not_bat      = NEW.did_not_bat
  WHERE id = (
    SELECT id FROM public.cricclubs_batting
    WHERE match_row_id   = NEW.match_row_id
      AND team_id        = NEW.team_id
      AND innings_number = NEW.innings_number
      AND batting_team   = NEW.batting_team
      AND player_id      = NEW.player_id
      AND cricclubs_name IS DISTINCT FROM NEW.cricclubs_name
    ORDER BY id DESC
    LIMIT 1
  );

  GET DIAGNOSTICS merged_count = ROW_COUNT;
  IF merged_count > 0 THEN
    -- The one interesting event, made visible for free. Both syncs count
    -- optimistically (batting += batRows.length), so a run that merged rows
    -- otherwise reports success identical to a run that inserted them.
    RAISE LOG 'cricclubs name drift merged: player=% match=% now="%"',
      NEW.player_id, NEW.match_row_id, NEW.cricclubs_name;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cricclubs_batting_merge_name_drift ON public.cricclubs_batting;
CREATE TRIGGER trg_cricclubs_batting_merge_name_drift
  BEFORE INSERT ON public.cricclubs_batting
  FOR EACH ROW EXECUTE FUNCTION public.cricclubs_batting_merge_name_drift();

-- Not strictly required — EXECUTE on a trigger function is checked at
-- CREATE TRIGGER, not at firing time, and a RETURNS trigger function cannot
-- be called directly. Included to match the neighbouring block in
-- docs/cricket-schema.sql, which revokes then grants explicitly.
REVOKE ALL ON FUNCTION public.cricclubs_bowling_merge_name_drift() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cricclubs_batting_merge_name_drift() FROM PUBLIC;

-- COMMIT IS LOAD-BEARING, not tidiness. Section 5 below ends in ROLLBACK.
-- Executed statement-by-statement in psql (autocommit) this line is a no-op
-- warning. Executed as ONE BATCH — the Supabase SQL editor's run button,
-- `psql -c "$(cat …)"`, most GUI "run all" — the entire file runs inside a
-- single implicit transaction, and that terminal ROLLBACK would revert the
-- functions and triggers created above. The operator would read
-- "trigger OK: name drift merged" in the notices and walk away with NO
-- TRIGGER INSTALLED and no error anywhere. Commit the DDL before the test.
COMMIT;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. VERIFY THE TRIGGERS
--
--    Moved to its own file: docs/cricclubs-duplicate-innings-verification.sql
--
--    Not tidiness. When the trigger WORKS, the harness's INSERT never lands —
--    the trigger converts it into an in-place UPDATE of a real player's real
--    innings. So what protects live figures is not the removal of an obvious
--    phantom row, and a lost rollback leaves no trace to spot. Keeping it
--    inside a migration that explicitly invites piecemeal copy-pasting ("run
--    sections 1 and 2 first") is how a rollback gets lost.
--
--    The harness therefore RESTORES every value it changed from a snapshot,
--    and verifies the restore, before reporting success. The ROLLBACK is a
--    second independent guard rather than the only one.
--
--    Run it after sections 3 and 4 are committed. Expected output: NOTICE
--    lines ending "VERIFICATION PASSED". Any error means a real failure.
-- ────────────────────────────────────────────────────────────────────────────


-- ────────────────────────────────────────────────────────────────────────────
-- 6. KNOWN GAP — deliberately NOT fixed here
--
--    Nothing enforces that cricclubs_bowling.team_id (and batting) equals the
--    team_id of the cricclubs_matches row it points at. The two FKs are
--    independent single-column FKs; there is no composite FK to
--    (id, team_id) and no CHECK. Both sync paths stamp team_id from a
--    device-local constant rather than deriving it from the match, so a
--    misconfigured second club could write rows whose team_id and match
--    disagree.
--
--    The triggers above now carry `AND team_id = NEW.team_id`, which contains
--    the blast radius. Closing the invariant itself is a cross-table
--    structural change needing its own backfill audit and its own review, and
--    nothing in this fix depends on it — match_row_id already determines the
--    team, which is what makes section 3's DELETE partition safe without it.
--    Tracked as follow-up, not smuggled into a data-repair migration.
-- ────────────────────────────────────────────────────────────────────────────
