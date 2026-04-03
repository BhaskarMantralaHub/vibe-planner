-- ============================================================
-- User Activity Tracking — Database Schema
-- ============================================================
-- App-wide activity logging. Any authenticated user can log
-- their own activity. Only admins can read all activity.
-- Activity records are immutable — no updates allowed.
-- Admin can delete for cleanup/compliance.
-- ============================================================

-- ── Table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_activity (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL,   -- 'login' | 'page_view'
  page_path     VARCHAR(2048),          -- e.g., '/cricket', '/vibe-planner'
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ── CHECK constraints ──────────────────────────────────────
ALTER TABLE user_activity
  ADD CONSTRAINT chk_activity_type CHECK (activity_type IN ('login', 'page_view'));

-- ── Row Level Security ─────────────────────────────────────
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can insert their own activity
CREATE POLICY "Users can log own activity" ON user_activity
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Admin can read all activity (reuses existing helper from cricket-schema)
CREATE POLICY "Admin can read all activity" ON user_activity
  FOR SELECT USING (is_cricket_admin());

-- Activity is immutable — no updates
CREATE POLICY "No updates to activity" ON user_activity
  FOR UPDATE USING (false);

-- Admin can delete for cleanup/compliance
CREATE POLICY "Admin can delete activity" ON user_activity
  FOR DELETE USING (is_cricket_admin());

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX idx_user_activity_user ON user_activity(user_id);
CREATE INDEX idx_user_activity_user_created ON user_activity(user_id, created_at DESC);
CREATE INDEX idx_user_activity_type_created ON user_activity(activity_type, created_at DESC);

-- ── Retention Note ─────────────────────────────────────────
-- This table grows with every page view (~20 users).
-- Periodically clean up old records:
--   DELETE FROM user_activity WHERE created_at < now() - interval '90 days';
