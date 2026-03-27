-- ============================================================
-- Cricket Live Scoring — Database Schema
-- ============================================================
-- Practice match ball-by-ball scoring with multi-device handoff.
-- Any cricket user can read. Active scorer can write.
-- Match lifecycle: setup → scoring → innings_break → completed
--
-- Depends on: has_cricket_access(), is_cricket_admin(), update_updated_at()
-- from cricket-schema.sql

-- ── Helper: check if user is the active scorer for a match ──
CREATE OR REPLACE FUNCTION is_active_scorer(match_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM practice_matches
    WHERE id = match_id AND active_scorer_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


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

  -- Toss
  toss_winner         TEXT CHECK (toss_winner IN ('team_a', 'team_b')),
  toss_decision       TEXT CHECK (toss_decision IN ('bat', 'bowl')),

  -- Scoring handoff
  scorer_name         TEXT,
  scorer_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  active_scorer_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Result
  result_summary      TEXT,
  mvp_player_id       UUID REFERENCES cricket_players(id) ON DELETE SET NULL,

  -- Timestamps
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE practice_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read matches"
  ON practice_matches FOR SELECT USING (has_cricket_access());
CREATE POLICY "Cricket users can create matches"
  ON practice_matches FOR INSERT WITH CHECK (has_cricket_access() AND created_by = auth.uid());
CREATE POLICY "Scorer can update match"
  ON practice_matches FOR UPDATE USING (
    has_cricket_access() AND (
      active_scorer_id = auth.uid() OR created_by = auth.uid() OR is_cricket_admin()
    )
  );
CREATE POLICY "Creator or admin can delete match"
  ON practice_matches FOR DELETE USING (
    has_cricket_access() AND (created_by = auth.uid() OR is_cricket_admin())
  );

CREATE TRIGGER set_practice_matches_updated_at
  BEFORE UPDATE ON practice_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_practice_matches_date ON practice_matches (match_date DESC);
CREATE INDEX idx_practice_matches_status ON practice_matches (status);
CREATE INDEX idx_practice_matches_season ON practice_matches (season_id) WHERE season_id IS NOT NULL;


-- ══════════════════════════════════════════════════════════════
-- 2. PRACTICE MATCH PLAYERS
-- ══════════════════════════════════════════════════════════════
-- Snapshot of players per match. Each gets a match-local ID
-- used by all ball references. Supports roster + guest players.
CREATE TABLE IF NOT EXISTS practice_match_players (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            UUID NOT NULL REFERENCES practice_matches(id) ON DELETE CASCADE,
  player_id           UUID REFERENCES cricket_players(id) ON DELETE SET NULL,
  team                TEXT NOT NULL CHECK (team IN ('team_a', 'team_b')),
  name                TEXT NOT NULL,
  jersey_number       INTEGER,
  is_guest            BOOLEAN NOT NULL DEFAULT false,
  is_captain          BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE NULLS NOT DISTINCT (match_id, player_id)
);

ALTER TABLE practice_match_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read match players"
  ON practice_match_players FOR SELECT USING (has_cricket_access());
CREATE POLICY "Scorer can manage match players"
  ON practice_match_players FOR INSERT WITH CHECK (
    has_cricket_access() AND (
      is_active_scorer(match_id)
      OR EXISTS (SELECT 1 FROM practice_matches WHERE id = match_id AND created_by = auth.uid())
    )
  );
CREATE POLICY "Scorer can update match players"
  ON practice_match_players FOR UPDATE USING (
    has_cricket_access() AND (
      is_active_scorer(match_id)
      OR EXISTS (SELECT 1 FROM practice_matches WHERE id = match_id AND created_by = auth.uid())
    )
  );

CREATE INDEX idx_practice_match_players_match ON practice_match_players (match_id, team);


-- ══════════════════════════════════════════════════════════════
-- 3. PRACTICE INNINGS
-- ══════════════════════════════════════════════════════════════
-- Denormalized innings summary. Exactly 2 rows per match.
-- Updated after each ball for fast reads.
CREATE TABLE IF NOT EXISTS practice_innings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            UUID NOT NULL REFERENCES practice_matches(id) ON DELETE CASCADE,
  innings_number      SMALLINT NOT NULL CHECK (innings_number IN (0, 1)),
  batting_team        TEXT NOT NULL CHECK (batting_team IN ('team_a', 'team_b')),

  -- Totals (updated after each ball)
  total_runs          INTEGER NOT NULL DEFAULT 0,
  total_wickets       INTEGER NOT NULL DEFAULT 0,
  total_overs         NUMERIC(4,1) NOT NULL DEFAULT 0,
  legal_balls         INTEGER NOT NULL DEFAULT 0,

  -- Extras breakdown
  extras_wide         INTEGER NOT NULL DEFAULT 0,
  extras_no_ball      INTEGER NOT NULL DEFAULT 0,
  extras_bye          INTEGER NOT NULL DEFAULT 0,
  extras_leg_bye      INTEGER NOT NULL DEFAULT 0,

  -- Current state (for resuming)
  striker_id          UUID REFERENCES practice_match_players(id) ON DELETE SET NULL,
  non_striker_id      UUID REFERENCES practice_match_players(id) ON DELETE SET NULL,
  bowler_id           UUID REFERENCES practice_match_players(id) ON DELETE SET NULL,

  target              INTEGER,
  is_completed        BOOLEAN NOT NULL DEFAULT false,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE (match_id, innings_number)
);

ALTER TABLE practice_innings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read innings"
  ON practice_innings FOR SELECT USING (has_cricket_access());
CREATE POLICY "Scorer can manage innings"
  ON practice_innings FOR INSERT WITH CHECK (
    has_cricket_access() AND (
      is_active_scorer(match_id)
      OR EXISTS (SELECT 1 FROM practice_matches WHERE id = match_id AND created_by = auth.uid())
    )
  );
CREATE POLICY "Scorer can update innings"
  ON practice_innings FOR UPDATE USING (
    has_cricket_access() AND (
      is_active_scorer(match_id)
      OR EXISTS (SELECT 1 FROM practice_matches WHERE id = match_id AND created_by = auth.uid())
    )
  );

CREATE TRIGGER set_practice_innings_updated_at
  BEFORE UPDATE ON practice_innings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_practice_innings_match ON practice_innings (match_id, innings_number);


-- ══════════════════════════════════════════════════════════════
-- 4. PRACTICE BALLS
-- ══════════════════════════════════════════════════════════════
-- Every delivery. Undo = soft delete via deleted_at.
CREATE TABLE IF NOT EXISTS practice_balls (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            UUID NOT NULL REFERENCES practice_matches(id) ON DELETE CASCADE,
  innings_number      SMALLINT NOT NULL CHECK (innings_number IN (0, 1)),
  sequence            INTEGER NOT NULL,
  over_number         INTEGER NOT NULL,
  ball_in_over        INTEGER NOT NULL,

  -- Players (match-local IDs)
  striker_id          UUID NOT NULL REFERENCES practice_match_players(id) ON DELETE CASCADE,
  non_striker_id      UUID NOT NULL REFERENCES practice_match_players(id) ON DELETE CASCADE,
  bowler_id           UUID NOT NULL REFERENCES practice_match_players(id) ON DELETE CASCADE,

  -- Scoring
  runs_bat            INTEGER NOT NULL DEFAULT 0 CHECK (runs_bat >= 0),
  runs_extras         INTEGER NOT NULL DEFAULT 0 CHECK (runs_extras >= 0),
  extras_type         TEXT CHECK (extras_type IN ('wide', 'no_ball', 'bye', 'leg_bye')),
  is_legal            BOOLEAN NOT NULL DEFAULT true,
  is_free_hit         BOOLEAN NOT NULL DEFAULT false,

  -- Wicket
  is_wicket           BOOLEAN NOT NULL DEFAULT false,
  wicket_type         TEXT CHECK (wicket_type IN ('bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket', 'retired')),
  dismissed_id        UUID REFERENCES practice_match_players(id) ON DELETE SET NULL,
  fielder_id          UUID REFERENCES practice_match_players(id) ON DELETE SET NULL,

  -- Soft delete for undo
  deleted_at          TIMESTAMPTZ,

  created_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE (match_id, innings_number, sequence)
);

ALTER TABLE practice_balls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read balls"
  ON practice_balls FOR SELECT USING (has_cricket_access());
CREATE POLICY "Scorer can record balls"
  ON practice_balls FOR INSERT WITH CHECK (
    has_cricket_access() AND (
      is_active_scorer(match_id)
      OR EXISTS (SELECT 1 FROM practice_matches WHERE id = match_id AND created_by = auth.uid())
    )
  );
CREATE POLICY "Scorer can update balls"
  ON practice_balls FOR UPDATE USING (
    has_cricket_access() AND (
      is_active_scorer(match_id)
      OR EXISTS (SELECT 1 FROM practice_matches WHERE id = match_id AND created_by = auth.uid())
    )
  );

CREATE INDEX idx_practice_balls_innings ON practice_balls (match_id, innings_number, sequence)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_practice_balls_over ON practice_balls (match_id, innings_number, over_number)
  WHERE deleted_at IS NULL;


-- ══════════════════════════════════════════════════════════════
-- 5. RPC FUNCTIONS
-- ══════════════════════════════════════════════════════════════

-- ── Match History (landing page list) ──
CREATE OR REPLACE FUNCTION get_match_history(
  match_status TEXT DEFAULT NULL,
  result_limit INTEGER DEFAULT 20,
  result_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(row ORDER BY row.match_date DESC, row.created_at DESC), '[]'::json)
  INTO result
  FROM (
    SELECT
      m.id, m.title, m.match_date, m.status, m.overs_per_innings,
      m.team_a_name, m.team_b_name, m.toss_winner, m.toss_decision,
      m.result_summary, m.scorer_name, m.started_at, m.completed_at, m.created_at,
      (SELECT json_build_object('batting_team', i.batting_team, 'total_runs', i.total_runs, 'total_wickets', i.total_wickets, 'total_overs', i.total_overs)
       FROM practice_innings i WHERE i.match_id = m.id AND i.innings_number = 0) AS first_innings,
      (SELECT json_build_object('batting_team', i.batting_team, 'total_runs', i.total_runs, 'total_wickets', i.total_wickets, 'total_overs', i.total_overs)
       FROM practice_innings i WHERE i.match_id = m.id AND i.innings_number = 1) AS second_innings
    FROM practice_matches m
    WHERE (match_status IS NULL OR m.status = match_status)
    ORDER BY m.match_date DESC, m.created_at DESC
    LIMIT result_limit OFFSET result_offset
  ) row;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_match_history(TEXT, INTEGER, INTEGER) TO authenticated;


-- ── Full Match Scorecard (view completed match) ──
CREATE OR REPLACE FUNCTION get_match_scorecard(target_match_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  result JSON;
BEGIN
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
        'target', i.target, 'is_completed', i.is_completed
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


-- ── Claim Scorer (multi-device handoff) ──
CREATE OR REPLACE FUNCTION claim_scorer(
  target_match_id UUID,
  scorer_display_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE practice_matches
  SET active_scorer_id = auth.uid(),
      scorer_name = scorer_display_name,
      updated_at = now()
  WHERE id = target_match_id
    AND status IN ('setup', 'scoring', 'innings_break')
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access @> '{cricket}');
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_scorer(UUID, TEXT) TO authenticated;
