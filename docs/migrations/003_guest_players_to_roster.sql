-- ============================================================
-- Migration 003: Guest Players in cricket_players
-- ============================================================
-- Guest players now get a real cricket_players record so their
-- stats persist across match deletions and appear in leaderboard.
--
-- Reviewed by: DBA, Architecture, SQL specialist agents (2026-03-28)
--
-- Changes:
-- 1. Add is_guest column to cricket_players
-- 2. Add unique index on lower(name) for guest dedup (prevents race condition)
-- 3. Fix practice_match_players unique index (add team column for same-guest-both-teams)
-- 4. Update create_practice_match to upsert guests into cricket_players (ON CONFLICT)
-- 5. Simplify get_guest_suggestions to read from cricket_players (returns id + name)
-- 6. Update leaderboard to include guests
-- 7. Add promote_guest_to_roster RPC
-- 8. Backfill: create cricket_players records for existing guest match players


-- ── 1. Add is_guest column ──────────────────────────────────
ALTER TABLE cricket_players ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false;


-- ── 2. Unique functional index for guest name dedup ─────────
-- Prevents race condition: concurrent create_practice_match calls
-- with the same guest name cannot create duplicate cricket_players rows.
-- Also used for efficient lookups in the upsert path.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cricket_players_guest_name_unique
  ON cricket_players (lower(name))
  WHERE is_guest = true AND is_active = true;


-- ── 3. Fix practice_match_players unique index ──────────────
-- CRITICAL: The old index was (match_id, player_id) which breaks when
-- the same guest plays on both teams in a practice match (same player_id,
-- same match_id). Adding 'team' to the index allows this valid scenario.
DROP INDEX IF EXISTS idx_practice_match_players_unique_roster;
CREATE UNIQUE INDEX idx_practice_match_players_unique_roster
  ON practice_match_players (match_id, player_id, team)
  WHERE player_id IS NOT NULL;


-- ── 4. Update create_practice_match RPC ─────────────────────
-- Now upserts guest players into cricket_players using ON CONFLICT
-- for race-condition safety. Name length validated.
DROP FUNCTION IF EXISTS create_practice_match(TEXT, DATE, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION create_practice_match(
  p_title TEXT,
  p_match_date DATE,
  p_overs INTEGER,
  p_team_a_name TEXT,
  p_team_b_name TEXT,
  p_toss_winner TEXT,
  p_toss_decision TEXT,
  p_scorer_name TEXT,
  p_batting_first TEXT,
  p_players JSONB
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  new_match_id UUID;
  batting_second TEXT;
  player_row JSONB;
  new_player_id UUID;
  guest_player_id UUID;
  guest_name TEXT;
  player_map JSONB := '[]'::jsonb;
  idx INTEGER := 0;
BEGIN
  -- Access guard
  IF NOT has_cricket_access() THEN
    RAISE EXCEPTION 'Access denied: cricket access required';
  END IF;

  -- Input validation
  IF p_batting_first NOT IN ('team_a', 'team_b') THEN
    RAISE EXCEPTION 'Invalid batting_first: must be team_a or team_b';
  END IF;
  IF p_toss_winner IS NOT NULL AND p_toss_winner NOT IN ('team_a', 'team_b') THEN
    RAISE EXCEPTION 'Invalid toss_winner';
  END IF;
  IF p_toss_decision IS NOT NULL AND p_toss_decision NOT IN ('bat', 'bowl') THEN
    RAISE EXCEPTION 'Invalid toss_decision';
  END IF;
  IF p_players IS NULL OR jsonb_typeof(p_players) != 'array' THEN
    RAISE EXCEPTION 'p_players must be a JSON array';
  END IF;
  IF jsonb_array_length(p_players) > 30 THEN
    RAISE EXCEPTION 'Too many players: maximum 30';
  END IF;
  IF jsonb_array_length(p_players) < 2 THEN
    RAISE EXCEPTION 'At least 2 players required';
  END IF;

  batting_second := CASE WHEN p_batting_first = 'team_a' THEN 'team_b' ELSE 'team_a' END;

  INSERT INTO practice_matches (
    created_by, title, match_date, overs_per_innings,
    team_a_name, team_b_name, toss_winner, toss_decision,
    scorer_name, scorer_id, active_scorer_id, status, started_at
  ) VALUES (
    auth.uid(), p_title, p_match_date, p_overs,
    p_team_a_name, p_team_b_name, p_toss_winner, p_toss_decision,
    p_scorer_name, auth.uid(), auth.uid(), 'scoring', now()
  ) RETURNING id INTO new_match_id;

  FOR player_row IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    guest_player_id := NULL;

    -- For guest players: upsert into cricket_players (race-safe via ON CONFLICT)
    IF COALESCE((player_row->>'is_guest')::BOOLEAN, false) THEN
      guest_name := player_row->>'name';

      -- Validate name length
      IF length(guest_name) > 100 THEN
        RAISE EXCEPTION 'Guest player name too long: maximum 100 characters';
      END IF;

      -- Attempt INSERT, DO NOTHING on conflict (existing guest with same lower(name))
      INSERT INTO cricket_players (name, is_guest, is_active)
      VALUES (guest_name, true, true)
      ON CONFLICT ((lower(name))) WHERE is_guest = true AND is_active = true
      DO NOTHING
      RETURNING id INTO guest_player_id;

      -- If DO NOTHING fired (already exists), fetch the existing id
      IF guest_player_id IS NULL THEN
        SELECT id INTO guest_player_id
        FROM cricket_players
        WHERE lower(name) = lower(guest_name)
          AND is_guest = true
          AND is_active = true;
      END IF;
    END IF;

    INSERT INTO practice_match_players (
      match_id, team, name, jersey_number, player_id, is_guest
    ) VALUES (
      new_match_id,
      player_row->>'team',
      player_row->>'name',
      (player_row->>'jersey_number')::INTEGER,
      CASE
        WHEN COALESCE((player_row->>'is_guest')::BOOLEAN, false) THEN guest_player_id
        WHEN player_row->>'player_id' IS NOT NULL AND player_row->>'player_id' != ''
          THEN (player_row->>'player_id')::UUID
        ELSE NULL
      END,
      COALESCE((player_row->>'is_guest')::BOOLEAN, false)
    ) RETURNING id INTO new_player_id;

    player_map := player_map || jsonb_build_array(jsonb_build_object('idx', idx, 'db_id', new_player_id));
    idx := idx + 1;
  END LOOP;

  INSERT INTO practice_innings (match_id, innings_number, batting_team)
  VALUES (new_match_id, 0, p_batting_first);
  INSERT INTO practice_innings (match_id, innings_number, batting_team)
  VALUES (new_match_id, 1, batting_second);

  RETURN json_build_object(
    'match_id', new_match_id,
    'player_map', player_map,
    'share_token', (SELECT share_token FROM practice_matches WHERE id = new_match_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_practice_match(TEXT, DATE, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;


-- ── 5. Simplified get_guest_suggestions (returns id + name) ──
DROP FUNCTION IF EXISTS get_guest_suggestions();

CREATE OR REPLACE FUNCTION get_guest_suggestions()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT has_cricket_access() THEN RETURN '[]'::json; END IF;

  SELECT COALESCE(json_agg(
    json_build_object('id', cp.id, 'name', cp.name)
    ORDER BY cp.name
  ), '[]'::json)
  INTO result
  FROM cricket_players cp
  WHERE cp.is_guest = true AND cp.is_active = true;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_guest_suggestions() TO authenticated;


-- ── 6. Updated Leaderboard (guests included, returns is_guest flag) ──
-- Removed "AND pmp.player_id IS NOT NULL" since all players
-- (roster + guest) now have a player_id pointing to cricket_players.
-- The JOIN itself naturally excludes any orphaned NULL player_id rows.
DROP FUNCTION IF EXISTS get_practice_leaderboard(UUID, TEXT);

CREATE OR REPLACE FUNCTION get_practice_leaderboard(
  p_season_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT 'batting'
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT has_cricket_access() THEN RETURN '[]'::json; END IF;

  IF p_category NOT IN ('batting', 'bowling', 'fielding', 'allround') THEN
    RAISE EXCEPTION 'Invalid category: must be batting, bowling, fielding, or allround';
  END IF;

  IF p_category = 'batting' THEN
    SELECT COALESCE(json_agg(row ORDER BY row.total_runs DESC), '[]'::json)
    INTO result
    FROM (
      SELECT
        cp.id AS player_id, cp.name, cp.photo_url, cp.is_guest,
        COUNT(DISTINCT b.match_id) AS matches,
        SUM(b.runs_bat) AS total_runs,
        COUNT(*) FILTER (WHERE b.is_legal OR b.extras_type = 'no_ball') AS balls_faced,
        CASE WHEN COUNT(*) FILTER (WHERE b.is_legal OR b.extras_type = 'no_ball') > 0
          THEN ROUND((SUM(b.runs_bat)::NUMERIC / COUNT(*) FILTER (WHERE b.is_legal OR b.extras_type = 'no_ball')) * 100, 1)
          ELSE 0 END AS strike_rate,
        SUM(CASE WHEN b.runs_bat = 4 THEN 1 ELSE 0 END) AS fours,
        SUM(CASE WHEN b.runs_bat = 6 THEN 1 ELSE 0 END) AS sixes
      FROM practice_balls b
      JOIN practice_match_players pmp ON pmp.id = b.striker_id
      JOIN cricket_players cp ON cp.id = pmp.player_id
      JOIN practice_matches m ON m.id = b.match_id
      WHERE b.deleted_at IS NULL AND m.status = 'completed' AND m.deleted_at IS NULL
        AND (p_season_id IS NULL OR m.season_id = p_season_id)
      GROUP BY cp.id, cp.name, cp.photo_url, cp.is_guest
      HAVING SUM(b.runs_bat) > 0
      ORDER BY total_runs DESC LIMIT 50
    ) row;

  ELSIF p_category = 'bowling' THEN
    SELECT COALESCE(json_agg(row ORDER BY row.total_wickets DESC, row.economy ASC), '[]'::json)
    INTO result
    FROM (
      SELECT
        cp.id AS player_id, cp.name, cp.photo_url, cp.is_guest,
        COUNT(DISTINCT b.match_id) AS matches,
        SUM(CASE WHEN b.is_wicket THEN 1 ELSE 0 END) AS total_wickets,
        COUNT(*) FILTER (WHERE b.is_legal) AS legal_balls,
        SUM(b.runs_bat + b.runs_extras) AS runs_conceded,
        CASE WHEN COUNT(*) FILTER (WHERE b.is_legal) > 0
          THEN ROUND((SUM(b.runs_bat + b.runs_extras)::NUMERIC / COUNT(*) FILTER (WHERE b.is_legal)) * 6, 2)
          ELSE 0 END AS economy,
        SUM(CASE WHEN b.extras_type = 'wide' THEN 1 ELSE 0 END) AS wides,
        SUM(CASE WHEN b.extras_type = 'no_ball' THEN 1 ELSE 0 END) AS no_balls
      FROM practice_balls b
      JOIN practice_match_players pmp ON pmp.id = b.bowler_id
      JOIN cricket_players cp ON cp.id = pmp.player_id
      JOIN practice_matches m ON m.id = b.match_id
      WHERE b.deleted_at IS NULL AND m.status = 'completed' AND m.deleted_at IS NULL
        AND (p_season_id IS NULL OR m.season_id = p_season_id)
      GROUP BY cp.id, cp.name, cp.photo_url, cp.is_guest
      HAVING COUNT(*) FILTER (WHERE b.is_legal) > 0
      ORDER BY total_wickets DESC, economy ASC LIMIT 50
    ) row;

  ELSIF p_category = 'fielding' THEN
    SELECT COALESCE(json_agg(row ORDER BY row.total_catches DESC), '[]'::json)
    INTO result
    FROM (
      SELECT
        cp.id AS player_id, cp.name, cp.photo_url, cp.is_guest,
        COUNT(DISTINCT b.match_id) AS matches,
        SUM(CASE WHEN b.wicket_type = 'caught' THEN 1 ELSE 0 END) AS total_catches,
        SUM(CASE WHEN b.wicket_type = 'run_out' THEN 1 ELSE 0 END) AS total_runouts,
        SUM(CASE WHEN b.wicket_type = 'stumped' THEN 1 ELSE 0 END) AS total_stumpings
      FROM practice_balls b
      JOIN practice_match_players pmp ON pmp.id = b.fielder_id
      JOIN cricket_players cp ON cp.id = pmp.player_id
      JOIN practice_matches m ON m.id = b.match_id
      WHERE b.deleted_at IS NULL AND b.is_wicket = true AND b.fielder_id IS NOT NULL
        AND m.status = 'completed' AND m.deleted_at IS NULL
        AND (p_season_id IS NULL OR m.season_id = p_season_id)
      GROUP BY cp.id, cp.name, cp.photo_url, cp.is_guest
      ORDER BY total_catches DESC LIMIT 50
    ) row;

  ELSE -- allround
    SELECT COALESCE(json_agg(row ORDER BY row.score DESC), '[]'::json)
    INTO result
    FROM (
      SELECT
        cp.id AS player_id, cp.name, cp.photo_url, cp.is_guest,
        COALESCE(bat.total_runs, 0) AS total_runs,
        COALESCE(bowl.total_wickets, 0) AS total_wickets,
        COALESCE(field.total_catches, 0) AS total_catches,
        COALESCE(bat.total_runs, 0) + COALESCE(bowl.total_wickets, 0) * 25 + COALESCE(field.total_catches, 0) * 10 AS score
      FROM cricket_players cp
      LEFT JOIN LATERAL (
        SELECT SUM(b.runs_bat) AS total_runs
        FROM practice_balls b JOIN practice_match_players pmp ON pmp.id = b.striker_id
        JOIN practice_matches m ON m.id = b.match_id
        WHERE pmp.player_id = cp.id AND b.deleted_at IS NULL AND m.status = 'completed' AND m.deleted_at IS NULL
          AND (p_season_id IS NULL OR m.season_id = p_season_id)
      ) bat ON true
      LEFT JOIN LATERAL (
        SELECT SUM(CASE WHEN b.is_wicket THEN 1 ELSE 0 END) AS total_wickets
        FROM practice_balls b JOIN practice_match_players pmp ON pmp.id = b.bowler_id
        JOIN practice_matches m ON m.id = b.match_id
        WHERE pmp.player_id = cp.id AND b.deleted_at IS NULL AND m.status = 'completed' AND m.deleted_at IS NULL
          AND (p_season_id IS NULL OR m.season_id = p_season_id)
      ) bowl ON true
      LEFT JOIN LATERAL (
        SELECT SUM(CASE WHEN b.wicket_type = 'caught' THEN 1 ELSE 0 END) AS total_catches
        FROM practice_balls b JOIN practice_match_players pmp ON pmp.id = b.fielder_id
        JOIN practice_matches m ON m.id = b.match_id
        WHERE pmp.player_id = cp.id AND b.deleted_at IS NULL AND b.is_wicket = true
          AND m.status = 'completed' AND m.deleted_at IS NULL AND (p_season_id IS NULL OR m.season_id = p_season_id)
      ) field ON true
      WHERE cp.is_active = true
        AND (COALESCE(bat.total_runs, 0) + COALESCE(bowl.total_wickets, 0) + COALESCE(field.total_catches, 0)) > 0
      ORDER BY score DESC LIMIT 50
    ) row;
  END IF;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_practice_leaderboard(UUID, TEXT) TO authenticated;


-- ── 7. Promote Guest to Roster (admin only) ─────────────────
DROP FUNCTION IF EXISTS promote_guest_to_roster(UUID, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION promote_guest_to_roster(
  target_player_id UUID,
  p_jersey_number INTEGER DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_cricket_admin() THEN RETURN FALSE; END IF;

  -- Check email uniqueness if provided (prevents linking conflicts)
  IF p_email IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM cricket_players
      WHERE lower(email) = lower(p_email) AND id != target_player_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Email already belongs to another player';
    END IF;
  END IF;

  UPDATE cricket_players
  SET is_guest = false,
      jersey_number = COALESCE(p_jersey_number, jersey_number),
      phone = COALESCE(p_phone, phone),
      email = COALESCE(p_email, email),
      updated_at = now()
  WHERE id = target_player_id
    AND is_guest = true
    AND is_active = true;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION promote_guest_to_roster(UUID, INTEGER, TEXT, TEXT) TO authenticated;


-- ── 8. Backfill: Create cricket_players records for existing guests ──
-- This creates a cricket_players record for each unique guest name that
-- doesn't already exist, then links practice_match_players.player_id.
-- Safe to re-run: WHERE player_id IS NULL guard prevents double-linking.
-- Must run AFTER the unique index (step 2) is created.
DO $$
DECLARE
  guest_rec RECORD;
  new_cp_id UUID;
BEGIN
  -- For each unique guest name in existing matches
  FOR guest_rec IN
    SELECT DISTINCT ON (lower(pmp.name)) pmp.name
    FROM practice_match_players pmp
    WHERE pmp.is_guest = true AND pmp.player_id IS NULL
    ORDER BY lower(pmp.name), pmp.created_at ASC
  LOOP
    -- Attempt upsert (race-safe via unique index)
    INSERT INTO cricket_players (name, is_guest, is_active)
    VALUES (guest_rec.name, true, true)
    ON CONFLICT ((lower(name))) WHERE is_guest = true AND is_active = true
    DO NOTHING
    RETURNING id INTO new_cp_id;

    -- If DO NOTHING fired, fetch existing id
    IF new_cp_id IS NULL THEN
      SELECT id INTO new_cp_id
      FROM cricket_players
      WHERE lower(name) = lower(guest_rec.name) AND is_guest = true AND is_active = true;
    END IF;

    -- Link all match players with this guest name
    UPDATE practice_match_players
    SET player_id = new_cp_id
    WHERE lower(name) = lower(guest_rec.name)
      AND is_guest = true
      AND player_id IS NULL;
  END LOOP;
END;
$$;


-- ── Reload PostgREST schema cache ───────────────────────────
NOTIFY pgrst, 'reload schema';
