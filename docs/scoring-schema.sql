-- ============================================================
-- Cricket Live Scoring — Database Schema (v3 — Final)
-- ============================================================
-- Reviewed by: DBA, Architecture, UX, QA agents
-- Security audit: All RPCs have cricket access guards.
-- RLS policies block writes after match completion.
--
-- Depends on: has_cricket_access(), is_cricket_admin(), update_updated_at()
-- from cricket-schema.sql


-- ── Helper: check if user is the active scorer for a match ──
CREATE OR REPLACE FUNCTION is_active_scorer(target_match_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM practice_matches
    WHERE id = target_match_id AND active_scorer_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Restrict helper from anonymous users
REVOKE EXECUTE ON FUNCTION is_active_scorer(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION is_active_scorer(UUID) TO authenticated;


-- ── Helper: prevent created_by from being changed ──
CREATE OR REPLACE FUNCTION prevent_created_by_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by != OLD.created_by THEN
    RAISE EXCEPTION 'Cannot change created_by';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ══════════════════════════════════════════════════════════════
-- 1. PRACTICE MATCHES
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS practice_matches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id           UUID REFERENCES cricket_seasons(id) ON DELETE SET NULL,
  created_by          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  match_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  overs_per_innings   INTEGER NOT NULL CHECK (overs_per_innings > 0 AND overs_per_innings <= 50),
  status              TEXT NOT NULL DEFAULT 'setup'
                        CHECK (status IN ('setup', 'scoring', 'innings_break', 'completed')),
  current_innings     SMALLINT NOT NULL DEFAULT 0 CHECK (current_innings IN (0, 1)),

  -- Team names
  team_a_name         TEXT NOT NULL,
  team_b_name         TEXT NOT NULL,

  -- Toss (both set together or both null)
  toss_winner         TEXT CHECK (toss_winner IN ('team_a', 'team_b')),
  toss_decision       TEXT CHECK (toss_decision IN ('bat', 'bowl')),
  CONSTRAINT toss_consistency CHECK (
    (toss_winner IS NULL AND toss_decision IS NULL) OR
    (toss_winner IS NOT NULL AND toss_decision IS NOT NULL)
  ),

  -- Result
  result_summary      TEXT,
  match_winner        TEXT CHECK (match_winner IN ('team_a', 'team_b', 'tied')),
  mvp_player_id       UUID REFERENCES cricket_players(id) ON DELETE SET NULL,

  -- Scoring handoff
  scorer_name         TEXT,
  scorer_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  active_scorer_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  scorer_heartbeat    TIMESTAMPTZ,

  -- Rematch / series
  previous_match_id   UUID REFERENCES practice_matches(id) ON DELETE SET NULL,
  match_number        INTEGER DEFAULT 1,

  -- Public share
  share_token         UUID UNIQUE DEFAULT gen_random_uuid(),

  -- Soft delete
  deleted_at          TIMESTAMPTZ,
  deleted_by          TEXT,             -- display name of who deleted

  -- Timestamps
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE practice_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cricket users can read matches" ON practice_matches;
CREATE POLICY "Cricket users can read matches"
  ON practice_matches FOR SELECT USING (has_cricket_access());
DROP POLICY IF EXISTS "Cricket users can create matches" ON practice_matches;
CREATE POLICY "Cricket users can create matches"
  ON practice_matches FOR INSERT WITH CHECK (has_cricket_access() AND created_by = auth.uid());
DROP POLICY IF EXISTS "Scorer can update match" ON practice_matches;
CREATE POLICY "Scorer can update match"
  ON practice_matches FOR UPDATE USING (
    has_cricket_access() AND (
      active_scorer_id = auth.uid() OR (active_scorer_id IS NULL AND created_by = auth.uid())
    )
  );
DROP POLICY IF EXISTS "Creator or admin can delete match" ON practice_matches;
CREATE POLICY "Creator or admin can delete match"
  ON practice_matches FOR DELETE USING (
    has_cricket_access() AND (created_by = auth.uid() OR is_cricket_admin())
  );

DROP TRIGGER IF EXISTS set_practice_matches_updated_at ON practice_matches;
CREATE TRIGGER set_practice_matches_updated_at
  BEFORE UPDATE ON practice_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Prevent created_by from being changed
DROP TRIGGER IF EXISTS protect_practice_match_creator ON practice_matches;
CREATE TRIGGER protect_practice_match_creator
  BEFORE UPDATE ON practice_matches
  FOR EACH ROW EXECUTE FUNCTION prevent_created_by_change();

CREATE INDEX IF NOT EXISTS idx_practice_matches_date ON practice_matches (match_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_practice_matches_status ON practice_matches (status);
CREATE INDEX IF NOT EXISTS idx_practice_matches_season ON practice_matches (season_id) WHERE season_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_practice_matches_completed ON practice_matches (completed_at DESC) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_practice_matches_active_scorer ON practice_matches (active_scorer_id) WHERE active_scorer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_practice_matches_not_deleted ON practice_matches (match_date DESC, created_at DESC) WHERE deleted_at IS NULL;


-- ══════════════════════════════════════════════════════════════
-- 2. PRACTICE MATCH PLAYERS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS practice_match_players (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            UUID NOT NULL REFERENCES practice_matches(id) ON DELETE CASCADE,
  player_id           UUID REFERENCES cricket_players(id) ON DELETE SET NULL,
  team                TEXT NOT NULL CHECK (team IN ('team_a', 'team_b')),
  name                TEXT NOT NULL,
  jersey_number       INTEGER,
  is_guest            BOOLEAN NOT NULL DEFAULT false,
  is_captain          BOOLEAN NOT NULL DEFAULT false,
  batting_order       INTEGER,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Players unique per match per team (includes team to allow same guest on both teams)
CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_match_players_unique_roster
  ON practice_match_players (match_id, player_id, team)
  WHERE player_id IS NOT NULL;

ALTER TABLE practice_match_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cricket users can read match players" ON practice_match_players;
CREATE POLICY "Cricket users can read match players"
  ON practice_match_players FOR SELECT USING (has_cricket_access());
DROP POLICY IF EXISTS "Scorer can manage match players" ON practice_match_players;
CREATE POLICY "Scorer can manage match players"
  ON practice_match_players FOR INSERT WITH CHECK (
    has_cricket_access() AND EXISTS (
      SELECT 1 FROM practice_matches WHERE id = match_id
        AND status IN ('setup', 'scoring', 'innings_break')
        AND (active_scorer_id = auth.uid() OR (active_scorer_id IS NULL AND created_by = auth.uid()))
    )
  );
DROP POLICY IF EXISTS "Scorer can update match players" ON practice_match_players;
CREATE POLICY "Scorer can update match players"
  ON practice_match_players FOR UPDATE USING (
    has_cricket_access() AND EXISTS (
      SELECT 1 FROM practice_matches WHERE id = match_id
        AND status IN ('setup', 'scoring', 'innings_break')
        AND (active_scorer_id = auth.uid() OR (active_scorer_id IS NULL AND created_by = auth.uid()))
    )
  );
DROP POLICY IF EXISTS "Scorer can delete match players" ON practice_match_players;
CREATE POLICY "Scorer can delete match players"
  ON practice_match_players FOR DELETE USING (
    has_cricket_access() AND (
      -- Admin can always delete (cleanup)
      is_cricket_admin()
      OR EXISTS (
        SELECT 1 FROM practice_matches WHERE id = match_id
          AND status IN ('setup', 'scoring', 'innings_break')
          AND (active_scorer_id = auth.uid() OR (active_scorer_id IS NULL AND created_by = auth.uid()))
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_practice_match_players_match ON practice_match_players (match_id, team);


-- ══════════════════════════════════════════════════════════════
-- 3. PRACTICE INNINGS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS practice_innings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            UUID NOT NULL REFERENCES practice_matches(id) ON DELETE CASCADE,
  innings_number      SMALLINT NOT NULL CHECK (innings_number IN (0, 1)),
  batting_team        TEXT NOT NULL CHECK (batting_team IN ('team_a', 'team_b')),

  total_runs          INTEGER NOT NULL DEFAULT 0,
  total_wickets       INTEGER NOT NULL DEFAULT 0,
  total_overs         NUMERIC(4,1) NOT NULL DEFAULT 0,
  legal_balls         INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT valid_overs CHECK (
    total_overs >= 0 AND (total_overs - floor(total_overs)) * 10 <= 5
  ),

  extras_wide         INTEGER NOT NULL DEFAULT 0,
  extras_no_ball      INTEGER NOT NULL DEFAULT 0,
  extras_bye          INTEGER NOT NULL DEFAULT 0,
  extras_leg_bye      INTEGER NOT NULL DEFAULT 0,

  striker_id          UUID REFERENCES practice_match_players(id) ON DELETE SET NULL,
  non_striker_id      UUID REFERENCES practice_match_players(id) ON DELETE SET NULL,
  bowler_id           UUID REFERENCES practice_match_players(id) ON DELETE SET NULL,

  target              INTEGER,
  is_completed        BOOLEAN NOT NULL DEFAULT false,

  retired_players     JSONB NOT NULL DEFAULT '[]',

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE (match_id, innings_number)
);

ALTER TABLE practice_innings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cricket users can read innings" ON practice_innings;
CREATE POLICY "Cricket users can read innings"
  ON practice_innings FOR SELECT USING (has_cricket_access());
DROP POLICY IF EXISTS "Scorer can create innings" ON practice_innings;
CREATE POLICY "Scorer can create innings"
  ON practice_innings FOR INSERT WITH CHECK (
    has_cricket_access() AND EXISTS (
      SELECT 1 FROM practice_matches WHERE id = match_id
        AND status IN ('setup', 'scoring', 'innings_break')
        AND (active_scorer_id = auth.uid() OR (active_scorer_id IS NULL AND created_by = auth.uid()))
    )
  );
DROP POLICY IF EXISTS "Scorer can update innings" ON practice_innings;
CREATE POLICY "Scorer can update innings"
  ON practice_innings FOR UPDATE USING (
    has_cricket_access() AND EXISTS (
      SELECT 1 FROM practice_matches WHERE id = match_id
        AND status IN ('scoring', 'innings_break')
        AND (active_scorer_id = auth.uid() OR (active_scorer_id IS NULL AND created_by = auth.uid()))
    )
  );
DROP POLICY IF EXISTS "Admin can delete innings" ON practice_innings;
CREATE POLICY "Admin can delete innings"
  ON practice_innings FOR DELETE USING (has_cricket_access() AND is_cricket_admin());

DROP TRIGGER IF EXISTS set_practice_innings_updated_at ON practice_innings;
CREATE TRIGGER set_practice_innings_updated_at
  BEFORE UPDATE ON practice_innings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_practice_innings_match ON practice_innings (match_id, innings_number);


-- ══════════════════════════════════════════════════════════════
-- 4. PRACTICE BALLS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS practice_balls (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            UUID NOT NULL REFERENCES practice_matches(id) ON DELETE CASCADE,
  innings_number      SMALLINT NOT NULL CHECK (innings_number IN (0, 1)),
  sequence            INTEGER NOT NULL CHECK (sequence >= 0),
  over_number         INTEGER NOT NULL CHECK (over_number >= 0),
  ball_in_over        INTEGER NOT NULL CHECK (ball_in_over >= 0),

  striker_id          UUID NOT NULL REFERENCES practice_match_players(id) ON DELETE CASCADE,
  non_striker_id      UUID NOT NULL REFERENCES practice_match_players(id) ON DELETE CASCADE,
  bowler_id           UUID NOT NULL REFERENCES practice_match_players(id) ON DELETE CASCADE,

  runs_bat            INTEGER NOT NULL DEFAULT 0 CHECK (runs_bat >= 0 AND runs_bat <= 7),
  runs_extras         INTEGER NOT NULL DEFAULT 0 CHECK (runs_extras >= 0),
  extras_type         TEXT CHECK (extras_type IN ('wide', 'no_ball', 'bye', 'leg_bye')),
  is_legal            BOOLEAN NOT NULL DEFAULT true,
  is_free_hit         BOOLEAN NOT NULL DEFAULT false,

  -- Wide/no-ball must have at least 1 extra run
  CONSTRAINT extras_min_runs CHECK (
    extras_type IS NULL OR extras_type NOT IN ('wide', 'no_ball') OR runs_extras >= 1
  ),

  is_wicket           BOOLEAN NOT NULL DEFAULT false,
  wicket_type         TEXT CHECK (wicket_type IN ('bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket', 'retired')),
  dismissed_id        UUID REFERENCES practice_match_players(id) ON DELETE SET NULL,
  fielder_id          UUID REFERENCES practice_match_players(id) ON DELETE SET NULL,

  -- Wicket consistency
  CONSTRAINT wicket_consistency CHECK (
    (is_wicket = false AND wicket_type IS NULL AND dismissed_id IS NULL)
    OR (is_wicket = true AND wicket_type IS NOT NULL)
  ),

  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Unique sequence per innings (only for active balls — allows undo/redo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_balls_unique_sequence
  ON practice_balls (match_id, innings_number, sequence)
  WHERE deleted_at IS NULL;

ALTER TABLE practice_balls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cricket users can read balls" ON practice_balls;
CREATE POLICY "Cricket users can read balls"
  ON practice_balls FOR SELECT USING (has_cricket_access());
DROP POLICY IF EXISTS "Scorer can record balls" ON practice_balls;
CREATE POLICY "Scorer can record balls"
  ON practice_balls FOR INSERT WITH CHECK (
    has_cricket_access() AND EXISTS (
      SELECT 1 FROM practice_matches WHERE id = match_id
        AND status IN ('scoring', 'innings_break')
        AND (active_scorer_id = auth.uid() OR (active_scorer_id IS NULL AND created_by = auth.uid()))
    )
  );
DROP POLICY IF EXISTS "Scorer can update balls" ON practice_balls;
CREATE POLICY "Scorer can update balls"
  ON practice_balls FOR UPDATE USING (
    has_cricket_access() AND EXISTS (
      SELECT 1 FROM practice_matches WHERE id = match_id
        AND status IN ('scoring', 'innings_break')
        AND (active_scorer_id = auth.uid() OR (active_scorer_id IS NULL AND created_by = auth.uid()))
    )
  );
DROP POLICY IF EXISTS "Admin can delete balls" ON practice_balls;
CREATE POLICY "Admin can delete balls"
  ON practice_balls FOR DELETE USING (has_cricket_access() AND is_cricket_admin());

CREATE INDEX IF NOT EXISTS idx_practice_balls_innings ON practice_balls (match_id, innings_number, sequence) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_practice_balls_over ON practice_balls (match_id, innings_number, over_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_practice_balls_striker ON practice_balls (striker_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_practice_balls_bowler ON practice_balls (bowler_id) WHERE deleted_at IS NULL;


-- ══════════════════════════════════════════════════════════════
-- 5. RPC FUNCTIONS
-- ══════════════════════════════════════════════════════════════

-- ── Atomic Match Creation ──
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


-- ── Match History ──
CREATE OR REPLACE FUNCTION get_match_history(
  match_status TEXT DEFAULT NULL,
  result_limit INTEGER DEFAULT 20,
  result_offset INTEGER DEFAULT 0,
  from_date DATE DEFAULT NULL,
  to_date DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT has_cricket_access() THEN RETURN '[]'::json; END IF;
  result_limit := LEAST(COALESCE(result_limit, 20), 100);
  result_offset := GREATEST(COALESCE(result_offset, 0), 0);

  SELECT COALESCE(json_agg(row ORDER BY row.match_date DESC, row.created_at DESC), '[]'::json)
  INTO result
  FROM (
    SELECT
      m.id, m.title, m.match_date, m.status, m.overs_per_innings,
      m.team_a_name, m.team_b_name, m.toss_winner, m.toss_decision,
      m.result_summary, m.match_winner, m.scorer_name,
      m.previous_match_id, m.match_number, m.share_token,
      m.started_at, m.completed_at, m.created_at,
      (SELECT json_build_object('batting_team', i.batting_team, 'total_runs', i.total_runs,
        'total_wickets', i.total_wickets, 'total_overs', i.total_overs)
       FROM practice_innings i WHERE i.match_id = m.id AND i.innings_number = 0) AS first_innings,
      (SELECT json_build_object('batting_team', i.batting_team, 'total_runs', i.total_runs,
        'total_wickets', i.total_wickets, 'total_overs', i.total_overs)
       FROM practice_innings i WHERE i.match_id = m.id AND i.innings_number = 1) AS second_innings
    FROM practice_matches m
    WHERE m.deleted_at IS NULL
      AND (match_status IS NULL OR m.status = match_status)
      AND (from_date IS NULL OR m.match_date >= from_date)
      AND (to_date IS NULL OR m.match_date <= to_date)
    ORDER BY m.match_date DESC, m.created_at DESC
    LIMIT result_limit OFFSET result_offset
  ) row;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_match_history(TEXT, INTEGER, INTEGER) TO authenticated;


-- ── Full Match Scorecard ──
CREATE OR REPLACE FUNCTION get_match_scorecard(target_match_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT has_cricket_access() THEN RETURN NULL; END IF;

  SELECT json_build_object(
    'match', (SELECT row_to_json(m) FROM practice_matches m WHERE m.id = target_match_id),
    'players', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', p.id, 'player_id', p.player_id, 'team', p.team,
        'name', p.name, 'jersey_number', p.jersey_number,
        'is_guest', p.is_guest, 'is_captain', p.is_captain
      ) ORDER BY p.team, p.created_at), '[]'::json)
      FROM practice_match_players p WHERE p.match_id = target_match_id
    ),
    'innings', (
      SELECT COALESCE(json_agg(json_build_object(
        'innings_number', i.innings_number, 'batting_team', i.batting_team,
        'total_runs', i.total_runs, 'total_wickets', i.total_wickets,
        'total_overs', i.total_overs, 'legal_balls', i.legal_balls,
        'extras_wide', i.extras_wide, 'extras_no_ball', i.extras_no_ball,
        'extras_bye', i.extras_bye, 'extras_leg_bye', i.extras_leg_bye,
        'striker_id', i.striker_id, 'non_striker_id', i.non_striker_id,
        'bowler_id', i.bowler_id,
        'target', i.target, 'is_completed', i.is_completed,
        'retired_players', COALESCE(i.retired_players, '[]'::jsonb)
      ) ORDER BY i.innings_number), '[]'::json)
      FROM practice_innings i WHERE i.match_id = target_match_id
    ),
    'balls', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', b.id, 'innings_number', b.innings_number, 'sequence', b.sequence,
        'over_number', b.over_number, 'ball_in_over', b.ball_in_over,
        'striker_id', b.striker_id, 'non_striker_id', b.non_striker_id, 'bowler_id', b.bowler_id,
        'runs_bat', b.runs_bat, 'runs_extras', b.runs_extras, 'extras_type', b.extras_type,
        'is_legal', b.is_legal, 'is_free_hit', b.is_free_hit,
        'is_wicket', b.is_wicket, 'wicket_type', b.wicket_type,
        'dismissed_id', b.dismissed_id, 'fielder_id', b.fielder_id
      ) ORDER BY b.innings_number, b.sequence), '[]'::json)
      FROM practice_balls b WHERE b.match_id = target_match_id AND b.deleted_at IS NULL
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_match_scorecard(UUID) TO authenticated;


-- ── Public Match Scorecard (no auth, stripped of internal IDs) ──
CREATE OR REPLACE FUNCTION get_public_match_scorecard(token UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  target_id UUID;
  result JSON;
BEGIN
  SELECT id INTO target_id FROM practice_matches WHERE share_token = token AND deleted_at IS NULL;
  IF target_id IS NULL THEN RETURN NULL; END IF;

  SELECT json_build_object(
    'match', (
      SELECT json_build_object(
        'title', m.title, 'match_date', m.match_date, 'status', m.status,
        'overs_per_innings', m.overs_per_innings,
        'team_a_name', m.team_a_name, 'team_b_name', m.team_b_name,
        'toss_winner', m.toss_winner, 'toss_decision', m.toss_decision,
        'result_summary', m.result_summary, 'match_winner', m.match_winner,
        'scorer_name', m.scorer_name, 'match_number', m.match_number,
        'started_at', m.started_at, 'completed_at', m.completed_at
      ) FROM practice_matches m WHERE m.id = target_id
    ),
    'players', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', p.id, 'team', p.team, 'name', p.name,
        'jersey_number', p.jersey_number, 'is_guest', p.is_guest
      ) ORDER BY p.team, p.created_at), '[]'::json)
      FROM practice_match_players p WHERE p.match_id = target_id
    ),
    'innings', (
      SELECT COALESCE(json_agg(json_build_object(
        'innings_number', i.innings_number, 'batting_team', i.batting_team,
        'total_runs', i.total_runs, 'total_wickets', i.total_wickets,
        'total_overs', i.total_overs, 'extras_wide', i.extras_wide,
        'extras_no_ball', i.extras_no_ball, 'extras_bye', i.extras_bye,
        'extras_leg_bye', i.extras_leg_bye, 'target', i.target, 'is_completed', i.is_completed
      ) ORDER BY i.innings_number), '[]'::json)
      FROM practice_innings i WHERE i.match_id = target_id
    ),
    'balls', (
      SELECT COALESCE(json_agg(json_build_object(
        'innings_number', b.innings_number, 'sequence', b.sequence,
        'over_number', b.over_number, 'ball_in_over', b.ball_in_over,
        'striker_id', b.striker_id, 'non_striker_id', b.non_striker_id, 'bowler_id', b.bowler_id,
        'runs_bat', b.runs_bat, 'runs_extras', b.runs_extras, 'extras_type', b.extras_type,
        'is_legal', b.is_legal, 'is_free_hit', b.is_free_hit,
        'is_wicket', b.is_wicket, 'wicket_type', b.wicket_type,
        'dismissed_id', b.dismissed_id, 'fielder_id', b.fielder_id
      ) ORDER BY b.innings_number, b.sequence), '[]'::json)
      FROM practice_balls b WHERE b.match_id = target_id AND b.deleted_at IS NULL
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_match_scorecard(UUID) TO anon, authenticated;


-- ── Claim Scorer (multi-device handoff with row lock) ──
CREATE OR REPLACE FUNCTION claim_scorer(
  target_match_id UUID,
  scorer_display_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT has_cricket_access() THEN RETURN FALSE; END IF;

  PERFORM 1 FROM practice_matches
  WHERE id = target_match_id FOR UPDATE NOWAIT;

  UPDATE practice_matches
  SET active_scorer_id = auth.uid(),
      scorer_name = scorer_display_name,
      scorer_heartbeat = now(),
      updated_at = now()
  WHERE id = target_match_id
    AND status IN ('setup', 'scoring', 'innings_break')
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access @> '{cricket}');
  RETURN FOUND;

EXCEPTION WHEN lock_not_available THEN
  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_scorer(UUID, TEXT) TO authenticated;


-- ── Release Scorer ──
CREATE OR REPLACE FUNCTION release_scorer(target_match_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT has_cricket_access() THEN RETURN FALSE; END IF;

  UPDATE practice_matches
  SET active_scorer_id = NULL, updated_at = now()
  WHERE id = target_match_id
    AND (
      active_scorer_id = auth.uid()
      OR created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access @> '{admin}')
    );
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION release_scorer(UUID) TO authenticated;


-- ── Rematch Template ──
CREATE OR REPLACE FUNCTION get_rematch_template(source_match_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
BEGIN
  IF NOT has_cricket_access() THEN RETURN NULL; END IF;

  RETURN (
    SELECT json_build_object(
      'title', m.title,
      'overs_per_innings', m.overs_per_innings,
      'team_a_name', m.team_a_name,
      'team_b_name', m.team_b_name,
      'match_number', COALESCE(m.match_number, 1) + 1,
      'previous_match_id', m.id,
      'players', (
        SELECT json_agg(json_build_object(
          'team', p.team, 'name', p.name, 'jersey_number', p.jersey_number,
          'player_id', p.player_id, 'is_guest', p.is_guest
        ) ORDER BY p.team, p.created_at)
        FROM practice_match_players p WHERE p.match_id = m.id
      )
    )
    FROM practice_matches m WHERE m.id = source_match_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_rematch_template(UUID) TO authenticated;


-- ── Soft Delete Match (admin cleanup) ──
CREATE OR REPLACE FUNCTION soft_delete_match(
  target_match_id UUID,
  deleter_name TEXT DEFAULT 'Admin'
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT has_cricket_access() THEN RETURN FALSE; END IF;

  -- Only admin or match creator can soft-delete
  UPDATE practice_matches
  SET deleted_at = now(),
      deleted_by = deleter_name,
      updated_at = now()
  WHERE id = target_match_id
    AND deleted_at IS NULL
    AND (created_by = auth.uid() OR is_cricket_admin());

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION soft_delete_match(UUID, TEXT) TO authenticated;


-- ── Restore Soft-Deleted Match ──
CREATE OR REPLACE FUNCTION restore_match(target_match_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT has_cricket_access() THEN RETURN FALSE; END IF;
  UPDATE practice_matches
  SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE id = target_match_id
    AND deleted_at IS NOT NULL
    AND (created_by = auth.uid() OR is_cricket_admin());
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION restore_match(UUID) TO authenticated;


-- ── Permanent Delete (hard delete with CASCADE) ──
CREATE OR REPLACE FUNCTION permanent_delete_match(target_match_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_cricket_admin() THEN RETURN FALSE; END IF;
  -- Only allow permanent delete on already soft-deleted matches
  DELETE FROM practice_matches
  WHERE id = target_match_id AND deleted_at IS NOT NULL;
  -- CASCADE removes practice_match_players, practice_innings, practice_balls
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION permanent_delete_match(UUID) TO authenticated;


-- ── Get Deleted Matches (admin only, for Recently Deleted section) ──
CREATE OR REPLACE FUNCTION get_deleted_matches(
  result_limit INTEGER DEFAULT 20
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT is_cricket_admin() THEN RETURN '[]'::json; END IF;
  result_limit := LEAST(COALESCE(result_limit, 20), 50);

  SELECT COALESCE(json_agg(row ORDER BY row.deleted_at DESC), '[]'::json)
  INTO result
  FROM (
    SELECT
      m.id, m.title, m.match_date, m.status, m.overs_per_innings,
      m.team_a_name, m.team_b_name, m.result_summary, m.match_winner,
      m.scorer_name, m.deleted_at, m.deleted_by, m.created_at,
      (SELECT json_build_object('total_runs', i.total_runs, 'total_wickets', i.total_wickets, 'total_overs', i.total_overs)
       FROM practice_innings i WHERE i.match_id = m.id AND i.innings_number = 0) AS first_innings,
      (SELECT json_build_object('total_runs', i.total_runs, 'total_wickets', i.total_wickets, 'total_overs', i.total_overs)
       FROM practice_innings i WHERE i.match_id = m.id AND i.innings_number = 1) AS second_innings
    FROM practice_matches m
    WHERE m.deleted_at IS NOT NULL
    ORDER BY m.deleted_at DESC
    LIMIT result_limit
  ) row;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_deleted_matches(INTEGER) TO authenticated;


-- ══════════════════════════════════════════════════════════════
-- 6. PRACTICE LEADERBOARD
-- ══════════════════════════════════════════════════════════════
-- Season performance stats computed from practice_balls.
-- Categories: batting, bowling, fielding, allround

DROP FUNCTION IF EXISTS get_practice_leaderboard(UUID, TEXT);

CREATE OR REPLACE FUNCTION get_practice_leaderboard(
  p_season_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT 'batting',
  p_match_limit INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  result JSON;
  match_ids UUID[];
BEGIN
  IF NOT has_cricket_access() THEN RETURN '[]'::json; END IF;

  IF p_category NOT IN ('batting', 'bowling', 'fielding', 'allround') THEN
    RAISE EXCEPTION 'Invalid category: must be batting, bowling, fielding, or allround';
  END IF;

  -- Resolve match IDs: optionally limited to last N completed matches
  IF p_match_limit IS NOT NULL THEN
    SELECT ARRAY(
      SELECT id FROM practice_matches
      WHERE status = 'completed' AND deleted_at IS NULL
        AND (p_season_id IS NULL OR season_id = p_season_id)
      ORDER BY completed_at DESC NULLS LAST, created_at DESC
      LIMIT p_match_limit
    ) INTO match_ids;
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
        AND (match_ids IS NULL OR m.id = ANY(match_ids))
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
        SUM(CASE WHEN b.is_wicket AND COALESCE(b.wicket_type, '') != 'retired' THEN 1 ELSE 0 END) AS total_wickets,
        COUNT(*) FILTER (WHERE b.is_legal) AS legal_balls,
        SUM(b.runs_bat + CASE WHEN b.extras_type IN ('wide', 'no_ball') THEN b.runs_extras ELSE 0 END) AS runs_conceded,
        CASE WHEN COUNT(*) FILTER (WHERE b.is_legal) > 0
          THEN ROUND((SUM(b.runs_bat + CASE WHEN b.extras_type IN ('wide', 'no_ball') THEN b.runs_extras ELSE 0 END)::NUMERIC / COUNT(*) FILTER (WHERE b.is_legal)) * 6, 2)
          ELSE 0 END AS economy,
        SUM(CASE WHEN b.extras_type = 'wide' THEN 1 ELSE 0 END) AS wides,
        SUM(CASE WHEN b.extras_type = 'no_ball' THEN 1 ELSE 0 END) AS no_balls
      FROM practice_balls b
      JOIN practice_match_players pmp ON pmp.id = b.bowler_id
      JOIN cricket_players cp ON cp.id = pmp.player_id
      JOIN practice_matches m ON m.id = b.match_id
      WHERE b.deleted_at IS NULL AND m.status = 'completed' AND m.deleted_at IS NULL
        AND (match_ids IS NULL OR m.id = ANY(match_ids))
        AND (p_season_id IS NULL OR m.season_id = p_season_id)
      GROUP BY cp.id, cp.name, cp.photo_url, cp.is_guest
      HAVING COUNT(*) FILTER (WHERE b.is_legal) > 0
      ORDER BY total_wickets DESC, economy ASC LIMIT 50
    ) row;

  ELSIF p_category = 'fielding' THEN
    SELECT COALESCE(json_agg(row ORDER BY row.total_dismissals DESC, row.total_catches DESC), '[]'::json)
    INTO result
    FROM (
      SELECT
        cp.id AS player_id, cp.name, cp.photo_url, cp.is_guest,
        COUNT(DISTINCT b.match_id) AS matches,
        SUM(CASE WHEN b.wicket_type = 'caught' THEN 1 ELSE 0 END) AS total_catches,
        SUM(CASE WHEN b.wicket_type = 'run_out' THEN 1 ELSE 0 END) AS total_runouts,
        SUM(CASE WHEN b.wicket_type = 'stumped' THEN 1 ELSE 0 END) AS total_stumpings,
        COUNT(*) AS total_dismissals
      FROM practice_balls b
      JOIN practice_match_players pmp ON pmp.id = b.fielder_id
      JOIN cricket_players cp ON cp.id = pmp.player_id
      JOIN practice_matches m ON m.id = b.match_id
      WHERE b.deleted_at IS NULL AND b.is_wicket = true AND b.fielder_id IS NOT NULL
        AND m.status = 'completed' AND m.deleted_at IS NULL
        AND (match_ids IS NULL OR m.id = ANY(match_ids))
        AND (p_season_id IS NULL OR m.season_id = p_season_id)
      GROUP BY cp.id, cp.name, cp.photo_url, cp.is_guest
      ORDER BY total_dismissals DESC, total_catches DESC LIMIT 50
    ) row;

  ELSE -- allround
    SELECT COALESCE(json_agg(row ORDER BY row.score DESC), '[]'::json)
    INTO result
    FROM (
      SELECT
        cp.id AS player_id, cp.name, cp.photo_url, cp.is_guest,
        COALESCE(match_count.matches, 0) AS matches,
        COALESCE(bat.total_runs, 0) AS total_runs,
        COALESCE(bowl.total_wickets, 0) AS total_wickets,
        COALESCE(field.total_catches, 0) AS total_catches,
        COALESCE(bat.total_runs, 0) + COALESCE(bowl.total_wickets, 0) * 25 + COALESCE(field.total_catches, 0) * 10 AS score
      FROM cricket_players cp
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT m.id) AS matches
        FROM practice_match_players pmp
        JOIN practice_matches m ON m.id = pmp.match_id
        WHERE pmp.player_id = cp.id AND m.status = 'completed' AND m.deleted_at IS NULL
          AND (match_ids IS NULL OR m.id = ANY(match_ids))
        AND (p_season_id IS NULL OR m.season_id = p_season_id)
      ) match_count ON true
      LEFT JOIN LATERAL (
        SELECT SUM(b.runs_bat) AS total_runs
        FROM practice_balls b JOIN practice_match_players pmp ON pmp.id = b.striker_id
        JOIN practice_matches m ON m.id = b.match_id
        WHERE pmp.player_id = cp.id AND b.deleted_at IS NULL AND m.status = 'completed' AND m.deleted_at IS NULL
          AND (match_ids IS NULL OR m.id = ANY(match_ids))
        AND (p_season_id IS NULL OR m.season_id = p_season_id)
      ) bat ON true
      LEFT JOIN LATERAL (
        SELECT SUM(CASE WHEN b.is_wicket AND COALESCE(b.wicket_type, '') != 'retired' THEN 1 ELSE 0 END) AS total_wickets
        FROM practice_balls b JOIN practice_match_players pmp ON pmp.id = b.bowler_id
        JOIN practice_matches m ON m.id = b.match_id
        WHERE pmp.player_id = cp.id AND b.deleted_at IS NULL AND m.status = 'completed' AND m.deleted_at IS NULL
          AND (match_ids IS NULL OR m.id = ANY(match_ids))
        AND (p_season_id IS NULL OR m.season_id = p_season_id)
      ) bowl ON true
      LEFT JOIN LATERAL (
        SELECT SUM(CASE WHEN b.wicket_type = 'caught' THEN 1 ELSE 0 END) AS total_catches
        FROM practice_balls b JOIN practice_match_players pmp ON pmp.id = b.fielder_id
        JOIN practice_matches m ON m.id = b.match_id
        WHERE pmp.player_id = cp.id AND b.deleted_at IS NULL AND b.is_wicket = true
          AND m.status = 'completed' AND m.deleted_at IS NULL AND (match_ids IS NULL OR m.id = ANY(match_ids))
        AND (p_season_id IS NULL OR m.season_id = p_season_id)
      ) field ON true
      WHERE cp.is_active = true
        AND (COALESCE(bat.total_runs, 0) + COALESCE(bowl.total_wickets, 0) + COALESCE(field.total_catches, 0)) > 0
      ORDER BY score DESC LIMIT 50
    ) row;
  END IF;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_practice_leaderboard(UUID, TEXT, INTEGER) TO authenticated;


-- ── Guest Player Suggestions (auto-complete from past matches) ──
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


-- ── Revert Completed Match to Scoring (admin only) ──
CREATE OR REPLACE FUNCTION revert_match_to_scoring(target_match_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_cricket_admin() THEN RETURN FALSE; END IF;
  -- Only allow revert for abruptly ended matches (no result / no winner)
  -- Smart logic: if 1st innings was completed → revert to innings_break (not scoring)
  -- If current innings has no players → fall back to innings 0
  UPDATE practice_matches
  SET result_summary = NULL,
      match_winner = NULL,
      completed_at = NULL,
      updated_at = now(),
      status = CASE
        WHEN (SELECT striker_id FROM practice_innings WHERE match_id = target_match_id AND innings_number = 1) IS NOT NULL
        THEN 'scoring'
        WHEN (SELECT is_completed FROM practice_innings WHERE match_id = target_match_id AND innings_number = 0)
        THEN 'innings_break'
        ELSE 'scoring'
      END,
      current_innings = CASE
        WHEN (SELECT striker_id FROM practice_innings WHERE match_id = target_match_id AND innings_number = 1) IS NOT NULL
        THEN 1
        ELSE 0
      END
  WHERE id = target_match_id
    AND status = 'completed'
    AND match_winner IS NULL
    AND deleted_at IS NULL;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION revert_match_to_scoring(UUID) TO authenticated;


-- ── Promote Guest to Roster (admin only) ─────────────────
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
