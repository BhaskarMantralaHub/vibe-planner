-- ============================================================================
-- Verification harness for the cricclubs name-drift merge triggers.
--
-- Companion to docs/cricclubs-duplicate-innings-fix.sql. Run this AFTER that
-- file's sections 3 and 4 have been committed.
--
-- EXPECTED OUTPUT: no error. Several NOTICE lines ending in
--   "VERIFICATION PASSED - both triggers correct, all test changes reverted"
-- ANY error at all means a real failure.
--
-- ── Why this file is shaped the way it is ───────────────────────────────────
--
-- The merge can only be tested against a row that already exists, so this
-- harness necessarily touches REAL data: when the trigger works, its INSERT
-- never lands — the trigger converts it into an in-place UPDATE of a real
-- player's real innings. If that change were ever left behind there would be
-- nothing to spot: one existing row quietly carrying wrong figures, feeding
-- cricclubs_bowling_season, the leaderboards and computePlayerHistory.
--
-- So the block RESTORES every value it changed, from a snapshot taken before
-- the test, and then verifies the restore before reporting success. The
-- outer BEGIN/ROLLBACK is a second, independent guard — not the only one.
--
-- An earlier version instead ended in RAISE EXCEPTION to make committing
-- impossible. That was safe but a bad idea in practice: Supabase's SQL editor
-- renders it as "Failed to run sql query: ERROR", so a PASS was
-- indistinguishable from a FAILURE to the person reading it. A harness whose
-- job is to build confidence must not cry wolf. Self-restoring achieves the
-- same protection and lets success look like success.
--
-- Checks use IF ... RAISE EXCEPTION, never ASSERT: ASSERT is disabled by
-- `SET plpgsql.check_asserts = off`, and a disabled ASSERT is a silent pass.
--
-- Safe on production. Re-runnable.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  src_bowl  public.cricclubs_bowling;
  src_bat   public.cricclubs_batting;
  before_n  integer;
  after_n   integer;
  got_int   integer;
  now_row   public.cricclubs_bowling;
  now_bat   public.cricclubs_batting;
BEGIN
  -- ══ BOWLING TRIGGER ══════════════════════════════════════════════════════
  -- INTO STRICT: with no linked bowling rows at all, a plain SELECT INTO
  -- leaves src_bowl all-NULL and the INSERT below dies on match_row_id
  -- NOT NULL with a message that says nothing about the real problem.
  SELECT * INTO STRICT src_bowl
  FROM public.cricclubs_bowling
  WHERE player_id IS NOT NULL
  ORDER BY id
  LIMIT 1;

  SELECT count(*) INTO before_n FROM public.cricclubs_bowling
  WHERE match_row_id = src_bowl.match_row_id
    AND player_id = src_bowl.player_id
    AND innings_number = src_bowl.innings_number
    AND bowling_team = src_bowl.bowling_team;

  -- The exact failure being guarded against: the same innings arriving again
  -- under a third spelling, as MTCA does when it re-capitalises a name.
  INSERT INTO public.cricclubs_bowling
    (match_row_id, team_id, innings_number, bowling_team, cricclubs_name,
     player_id, overs, maidens, dots, runs, wickets, economy, is_captain)
  VALUES
    (src_bowl.match_row_id, src_bowl.team_id, src_bowl.innings_number,
     src_bowl.bowling_team, upper(src_bowl.cricclubs_name) || ' ',
     src_bowl.player_id, src_bowl.overs, src_bowl.maidens, src_bowl.dots,
     src_bowl.runs + 99, src_bowl.wickets + 9, src_bowl.economy,
     src_bowl.is_captain);

  SELECT count(*) INTO after_n FROM public.cricclubs_bowling
  WHERE match_row_id = src_bowl.match_row_id
    AND player_id = src_bowl.player_id
    AND innings_number = src_bowl.innings_number
    AND bowling_team = src_bowl.bowling_team;

  IF after_n <> before_n THEN
    RAISE EXCEPTION 'FAIL: bowling trigger did not merge name drift - % row(s) before, % after (a duplicate was created)',
      before_n, after_n;
  END IF;

  -- It must have UPDATED, not merely swallowed the insert.
  SELECT * INTO now_row FROM public.cricclubs_bowling WHERE id = src_bowl.id;

  IF now_row.wickets <> src_bowl.wickets + 9 THEN
    RAISE EXCEPTION 'FAIL: bowling trigger swallowed the insert without applying new figures - wickets=% expected=%',
      now_row.wickets, src_bowl.wickets + 9;
  END IF;
  IF now_row.cricclubs_name <> upper(src_bowl.cricclubs_name) || ' ' THEN
    RAISE EXCEPTION 'FAIL: bowling trigger did not adopt the new spelling - got "%"',
      now_row.cricclubs_name;
  END IF;

  RAISE NOTICE 'OK  bowling: name drift merged into row id=%, figures applied, no duplicate created', src_bowl.id;

  -- ── Restore, from the snapshot. Not reliant on the outer ROLLBACK. ───────
  UPDATE public.cricclubs_bowling SET
    cricclubs_name = src_bowl.cricclubs_name,
    overs          = src_bowl.overs,
    maidens        = src_bowl.maidens,
    dots           = src_bowl.dots,
    runs           = src_bowl.runs,
    wickets        = src_bowl.wickets,
    economy        = src_bowl.economy,
    is_captain     = src_bowl.is_captain
  WHERE id = src_bowl.id;

  SELECT * INTO now_row FROM public.cricclubs_bowling WHERE id = src_bowl.id;
  IF now_row.cricclubs_name <> src_bowl.cricclubs_name
     OR now_row.runs <> src_bowl.runs
     OR now_row.wickets <> src_bowl.wickets THEN
    RAISE EXCEPTION 'FAIL: could not restore bowling row id=% - ROLLBACK is now the only guard, DO NOT COMMIT', src_bowl.id;
  END IF;
  RAISE NOTICE 'OK  bowling row id=% restored to its original figures', src_bowl.id;

  -- ══ BATTING TRIGGER ══════════════════════════════════════════════════════
  -- Exercised explicitly. The first draft of this harness covered bowling
  -- only, which is exactly why the batting merge's missing is_captain /
  -- is_wicketkeeper survived a code review but not a schema review.
  SELECT * INTO STRICT src_bat
  FROM public.cricclubs_batting
  WHERE player_id IS NOT NULL
  ORDER BY id
  LIMIT 1;

  SELECT count(*) INTO before_n FROM public.cricclubs_batting
  WHERE match_row_id = src_bat.match_row_id
    AND player_id = src_bat.player_id
    AND innings_number = src_bat.innings_number
    AND batting_team = src_bat.batting_team;

  INSERT INTO public.cricclubs_batting
    (match_row_id, team_id, innings_number, batting_team, cricclubs_name,
     player_id, batting_position, runs, balls, fours, sixes, strike_rate,
     dismissal, not_out, is_captain, is_wicketkeeper, did_not_bat)
  VALUES
    (src_bat.match_row_id, src_bat.team_id, src_bat.innings_number,
     src_bat.batting_team, upper(src_bat.cricclubs_name) || ' ',
     src_bat.player_id, src_bat.batting_position, src_bat.runs + 77,
     src_bat.balls, src_bat.fours, src_bat.sixes, src_bat.strike_rate,
     src_bat.dismissal, src_bat.not_out,
     -- Flipped deliberately: these two are the columns the merge used to drop.
     NOT src_bat.is_captain, NOT src_bat.is_wicketkeeper, src_bat.did_not_bat);

  SELECT count(*) INTO after_n FROM public.cricclubs_batting
  WHERE match_row_id = src_bat.match_row_id
    AND player_id = src_bat.player_id
    AND innings_number = src_bat.innings_number
    AND batting_team = src_bat.batting_team;

  IF after_n <> before_n THEN
    RAISE EXCEPTION 'FAIL: batting trigger did not merge name drift - % row(s) before, % after (a duplicate was created)',
      before_n, after_n;
  END IF;

  SELECT * INTO now_bat FROM public.cricclubs_batting WHERE id = src_bat.id;

  IF now_bat.runs <> src_bat.runs + 77 THEN
    RAISE EXCEPTION 'FAIL: batting trigger swallowed the insert without applying new figures - runs=% expected=%',
      now_bat.runs, src_bat.runs + 77;
  END IF;

  -- The regression this file exists for: the merge must carry EVERY non-key
  -- column, including these two. is_wicketkeeper is the only signal in the
  -- data distinguishing a stumping from a catch, so a stale flag
  -- misattributes fielding credit downstream.
  IF now_bat.is_captain <> (NOT src_bat.is_captain)
     OR now_bat.is_wicketkeeper <> (NOT src_bat.is_wicketkeeper) THEN
    RAISE EXCEPTION 'FAIL: batting merge left is_captain/is_wicketkeeper stale - the merge must copy every non-key column';
  END IF;

  RAISE NOTICE 'OK  batting: name drift merged into row id=%, figures applied, is_captain/is_wicketkeeper carried', src_bat.id;

  -- ── Restore ─────────────────────────────────────────────────────────────
  UPDATE public.cricclubs_batting SET
    cricclubs_name   = src_bat.cricclubs_name,
    batting_position = src_bat.batting_position,
    runs             = src_bat.runs,
    balls            = src_bat.balls,
    fours            = src_bat.fours,
    sixes            = src_bat.sixes,
    strike_rate      = src_bat.strike_rate,
    dismissal        = src_bat.dismissal,
    not_out          = src_bat.not_out,
    is_captain       = src_bat.is_captain,
    is_wicketkeeper  = src_bat.is_wicketkeeper,
    did_not_bat      = src_bat.did_not_bat
  WHERE id = src_bat.id;

  SELECT * INTO now_bat FROM public.cricclubs_batting WHERE id = src_bat.id;
  IF now_bat.cricclubs_name <> src_bat.cricclubs_name
     OR now_bat.runs <> src_bat.runs
     OR now_bat.is_captain <> src_bat.is_captain
     OR now_bat.is_wicketkeeper <> src_bat.is_wicketkeeper THEN
    RAISE EXCEPTION 'FAIL: could not restore batting row id=% - ROLLBACK is now the only guard, DO NOT COMMIT', src_bat.id;
  END IF;
  RAISE NOTICE 'OK  batting row id=% restored to its original figures', src_bat.id;

  RAISE NOTICE 'VERIFICATION PASSED - both triggers correct, all test changes reverted';
END $$;

-- Second, independent guard. Everything above was already restored in place,
-- so this discards nothing but the sequence values the attempted INSERTs
-- consumed (sequences are non-transactional; a small id gap is harmless).
ROLLBACK;
