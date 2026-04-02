-- ============================================================
-- Cricket Schedule Matches — Database Schema
-- ============================================================
-- Stores league and practice match schedules per season.
-- Same RLS pattern as other cricket tables:
--   SELECT → has_cricket_access()
--   INSERT/UPDATE/DELETE → is_cricket_admin()

CREATE TABLE IF NOT EXISTS cricket_schedule_matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
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
  ADD CONSTRAINT chk_schedule_result CHECK (result IS NULL OR result IN ('won', 'lost', 'tied'));

-- ── Row Level Security ────────────────────────────────────
ALTER TABLE cricket_schedule_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read schedule matches"
  ON cricket_schedule_matches FOR SELECT
  USING (has_cricket_access());

CREATE POLICY "Admin can create schedule matches"
  ON cricket_schedule_matches FOR INSERT
  WITH CHECK (is_cricket_admin());

CREATE POLICY "Admin can update schedule matches"
  ON cricket_schedule_matches FOR UPDATE
  USING (is_cricket_admin());

CREATE POLICY "Admin can delete schedule matches"
  ON cricket_schedule_matches FOR DELETE
  USING (is_cricket_admin());

-- ── Trigger: auto-update updated_at ───────────────────────
CREATE TRIGGER set_cricket_schedule_matches_updated_at
  BEFORE UPDATE ON cricket_schedule_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
