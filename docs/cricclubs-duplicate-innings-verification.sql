-- ============================================================================
-- Verification harness for the cricclubs name-drift merge triggers.
--
-- Companion to docs/cricclubs-duplicate-innings-fix.sql. Run this AFTER that
-- file's sections 3 and 4 have been committed.
--
-- Kept in its own file, matching docs/umpiring-rpc-verification.sql and
-- docs/settlement-report-verification.sql, for a specific reason: this
-- harness MUTATES REAL ROWS. When the trigger works, the INSERT below never
-- lands — the trigger converts it into an in-place UPDATE of a real player's
-- real innings, setting runs + 99 and wickets + 9. So what the rollback
-- protects is not the removal of an obvious phantom row, it is the
-- RESTORATION of live figures. If the rollback is ever lost there is nothing
-- to spot: one existing row quietly carries +99 runs and +9 wickets, feeding
-- cricclubs_bowling_season, the leaderboards and computePlayerHistory.
--
-- The failure mode of a WORKING trigger is therefore worse than that of a
-- broken one, which is why:
--   * the DO block ends in RAISE EXCEPTION, so it can never commit however
--     it is invoked — lift it out of the transaction, paste it alone into a
--     GUI, run it with autocommit on, and it still aborts itself;
--   * the outer BEGIN/ROLLBACK is belt-and-braces, not the only guard;
--   * checks are IF ... RAISE EXCEPTION, never ASSERT. ASSERT is disabled by
--     `SET plpgsql.check_asserts = off`, and a disabled ASSERT is a silent
--     pass — for a harness whose whole job is to earn trust before the
--     trigger touches production data, silent-pass is the wrong default.
--
-- Safe on production. Ends in ROLLBACK, and aborts itself before that.
-- Expected outcome: the final RAISE EXCEPTION message listing both triggers
-- as verified. Any OTHER error is a real failure.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  src_bowl  public.cricclubs_bowling;
  src_bat   public.cricclubs_batting;
  before_n  integer;
  after_n   integer;
  got       integer;
BEGIN
  -- ── Bowling trigger ─────────────────────────────────────────────────────
  -- INTO STRICT: with no linked bowling rows at all, a plain SELECT INTO
  -- leaves src_bowl all-NULL and the INSERT dies on match_row_id NOT NULL
  -- with a message that says nothing about the real problem.
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

  -- The exact failure: the same innings arriving under a third spelling.
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
    RAISE EXCEPTION 'BOWLING trigger did not merge name drift: % row(s) before, % after',
      before_n, after_n;
  END IF;

  -- It must have UPDATED, not merely discarded the insert.
  -- ORDER BY/LIMIT 1 guards against 21000 if this is somehow run on
  -- uncleaned data where the predicate still matches two variant rows.
  SELECT wickets INTO got FROM public.cricclubs_bowling
  WHERE match_row_id = src_bowl.match_row_id
    AND player_id = src_bowl.player_id
    AND innings_number = src_bowl.innings_number
    AND bowling_team = src_bowl.bowling_team
  ORDER BY id DESC LIMIT 1;

  IF got <> src_bowl.wickets + 9 THEN
    RAISE EXCEPTION 'BOWLING trigger skipped the insert without applying new figures: wickets=% expected=%',
      got, src_bowl.wickets + 9;
  END IF;

  -- ── Batting trigger ─────────────────────────────────────────────────────
  -- Exercised explicitly. The original harness covered bowling only, which
  -- is exactly why the batting merge's missing is_captain/is_wicketkeeper
  -- survived review of the code but not review of the schema.
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
     -- Flipped on purpose: these two are the columns the merge used to drop.
     NOT src_bat.is_captain, NOT src_bat.is_wicketkeeper, src_bat.did_not_bat);

  SELECT count(*) INTO after_n FROM public.cricclubs_batting
  WHERE match_row_id = src_bat.match_row_id
    AND player_id = src_bat.player_id
    AND innings_number = src_bat.innings_number
    AND batting_team = src_bat.batting_team;

  IF after_n <> before_n THEN
    RAISE EXCEPTION 'BATTING trigger did not merge name drift: % row(s) before, % after',
      before_n, after_n;
  END IF;

  SELECT runs INTO got FROM public.cricclubs_batting
  WHERE match_row_id = src_bat.match_row_id
    AND player_id = src_bat.player_id
    AND innings_number = src_bat.innings_number
    AND batting_team = src_bat.batting_team
  ORDER BY id DESC LIMIT 1;

  IF got <> src_bat.runs + 77 THEN
    RAISE EXCEPTION 'BATTING trigger skipped the insert without applying new figures: runs=% expected=%',
      got, src_bat.runs + 77;
  END IF;

  -- The regression that prompted this file: the merge must carry
  -- is_captain AND is_wicketkeeper, not silently keep the old flags.
  IF EXISTS (
    SELECT 1 FROM public.cricclubs_batting
    WHERE match_row_id = src_bat.match_row_id
      AND player_id = src_bat.player_id
      AND innings_number = src_bat.innings_number
      AND batting_team = src_bat.batting_team
      AND (is_captain <> NOT src_bat.is_captain
        OR is_wicketkeeper <> NOT src_bat.is_wicketkeeper)
  ) THEN
    RAISE EXCEPTION 'BATTING merge left is_captain/is_wicketkeeper stale — the merge must copy EVERY non-key column';
  END IF;

  -- Self-abort. Reaching this line means every check passed; raising here is
  -- what makes committing impossible regardless of how this was invoked.
  RAISE EXCEPTION
    'VERIFICATION PASSED — bowling and batting merge triggers both correct, is_captain/is_wicketkeeper carried. Aborting so nothing commits. This exception is the SUCCESS case.';
END $$;

ROLLBACK;
