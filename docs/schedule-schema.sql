-- ============================================================
-- Cricket Schedule Matches — Database Schema
-- ============================================================
-- Stores league and practice match schedules per season.
-- Team-scoped RLS pattern (multi-team migration):
--   SELECT → user_team_ids() or is_global_admin()
--   INSERT/UPDATE/DELETE → is_team_admin(team_id) or is_global_admin()

CREATE TABLE IF NOT EXISTS cricket_schedule_matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  team_id         UUID NOT NULL REFERENCES cricket_teams(id),
  opponent        TEXT NOT NULL,
  match_date      DATE NOT NULL,
  match_time      TEXT NOT NULL,              -- HH:MM format
  venue           TEXT NOT NULL,
  match_type      TEXT NOT NULL,              -- 'league' | 'practice'
  overs           INTEGER NOT NULL DEFAULT 20,
  status          TEXT NOT NULL DEFAULT 'upcoming', -- 'upcoming' | 'completed'
  notes           TEXT,
  result          TEXT,                       -- 'won' | 'lost' | 'tied'
  team_score      TEXT,
  team_overs      TEXT,
  opponent_score  TEXT,
  opponent_overs  TEXT,
  result_summary  TEXT,
  is_home         BOOLEAN,                    -- true = home, false = away, null = unknown
  umpire          TEXT,                       -- umpire team/name
  created_by      TEXT,                       -- admin name who created
  deleted_at      TIMESTAMPTZ DEFAULT NULL,   -- soft delete
  deleted_by      TEXT DEFAULT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── CHECK constraints ─────────────────────────────────────
ALTER TABLE cricket_schedule_matches
  ADD CONSTRAINT chk_schedule_match_type CHECK (match_type IN ('league', 'practice'));

ALTER TABLE cricket_schedule_matches
  ADD CONSTRAINT chk_schedule_status CHECK (status IN ('upcoming', 'completed'));

ALTER TABLE cricket_schedule_matches
  ADD CONSTRAINT chk_schedule_result CHECK (result IS NULL OR result IN ('won', 'lost', 'draw'));

-- ── Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cricket_schedule_matches_team ON cricket_schedule_matches(team_id);

-- ── Row Level Security ────────────────────────────────────
ALTER TABLE cricket_schedule_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read schedule"
  ON cricket_schedule_matches FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

CREATE POLICY "Team admin can create schedule"
  ON cricket_schedule_matches FOR INSERT
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can update schedule"
  ON cricket_schedule_matches FOR UPDATE
  USING (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can delete schedule"
  ON cricket_schedule_matches FOR DELETE
  USING (is_team_admin(team_id) OR is_global_admin());

-- ── Trigger: auto-update updated_at ───────────────────────
CREATE TRIGGER set_cricket_schedule_matches_updated_at
  BEFORE UPDATE ON cricket_schedule_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
