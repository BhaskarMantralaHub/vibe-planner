-- ============================================================
-- Audit Trail: Trigger-based activity logging
-- ============================================================
-- Automatic capture of all INSERT/UPDATE/DELETE on cricket tables.
-- Zero client code changes. Fires inside the same DB transaction.
-- Human-readable view joins with profiles for admin queries.
-- ============================================================

-- ── Audit log table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id     UUID REFERENCES cricket_teams(id) ON DELETE CASCADE,
  table_name  TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  record_id   UUID,
  actor_id    UUID,  -- auth.uid() at time of write
  old_data    JSONB, -- row before change (UPDATE/DELETE)
  new_data    JSONB, -- row after change (INSERT/UPDATE)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE team_audit_log ENABLE ROW LEVEL SECURITY;

-- Team admins + global admin can read
CREATE POLICY "Admin can read audit log"
  ON team_audit_log FOR SELECT
  USING (is_team_admin(team_id) OR is_global_admin());

-- Block direct inserts — only the SECURITY DEFINER trigger can write
CREATE POLICY "No direct inserts to audit log"
  ON team_audit_log FOR INSERT
  WITH CHECK (false);

-- Immutable — no updates
CREATE POLICY "No updates to audit log"
  ON team_audit_log FOR UPDATE USING (false);

-- Global admin can delete for cleanup
CREATE POLICY "Admin can delete audit log"
  ON team_audit_log FOR DELETE
  USING (is_global_admin());

-- Indexes
CREATE INDEX idx_audit_log_team_created ON team_audit_log (team_id, created_at DESC);
CREATE INDEX idx_audit_log_table_action ON team_audit_log (table_name, action);
CREATE INDEX idx_audit_log_record ON team_audit_log (record_id) WHERE record_id IS NOT NULL;

-- ── Generic trigger function ────────────────────────────────
-- One function, applied to all audited tables. Automatically
-- captures team_id, actor (auth.uid()), old/new row data.

CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_record_id UUID;
  v_old JSONB;
  v_new JSONB;
BEGIN
  -- Extract team_id from the row (most tables have it directly)
  IF TG_OP = 'DELETE' THEN
    v_team_id := OLD.team_id;
    v_record_id := OLD.id;
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_team_id := NEW.team_id;
    v_record_id := NEW.id;
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSE -- UPDATE
    v_team_id := NEW.team_id;
    v_record_id := NEW.id;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  END IF;

  INSERT INTO team_audit_log (team_id, table_name, action, record_id, actor_id, old_data, new_data)
  VALUES (v_team_id, TG_TABLE_NAME, TG_OP, v_record_id, auth.uid(), v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── Apply triggers to all cricket tables ────────────────────

-- Players (add, edit, remove, restore)
DROP TRIGGER IF EXISTS trg_audit_cricket_players ON cricket_players;
CREATE TRIGGER trg_audit_cricket_players
  AFTER INSERT OR UPDATE OR DELETE ON cricket_players
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- Seasons (create, edit, activate)
DROP TRIGGER IF EXISTS trg_audit_cricket_seasons ON cricket_seasons;
CREATE TRIGGER trg_audit_cricket_seasons
  AFTER INSERT OR UPDATE OR DELETE ON cricket_seasons
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- Expenses (add, edit, delete, restore)
DROP TRIGGER IF EXISTS trg_audit_cricket_expenses ON cricket_expenses;
CREATE TRIGGER trg_audit_cricket_expenses
  AFTER INSERT OR UPDATE OR DELETE ON cricket_expenses
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- Settlements (add, delete)
DROP TRIGGER IF EXISTS trg_audit_cricket_settlements ON cricket_settlements;
CREATE TRIGGER trg_audit_cricket_settlements
  AFTER INSERT OR UPDATE OR DELETE ON cricket_settlements
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- Season fees (record, delete)
DROP TRIGGER IF EXISTS trg_audit_cricket_season_fees ON cricket_season_fees;
CREATE TRIGGER trg_audit_cricket_season_fees
  AFTER INSERT OR UPDATE OR DELETE ON cricket_season_fees
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- Sponsorships (add, edit, delete, restore)
DROP TRIGGER IF EXISTS trg_audit_cricket_sponsorships ON cricket_sponsorships;
CREATE TRIGGER trg_audit_cricket_sponsorships
  AFTER INSERT OR UPDATE OR DELETE ON cricket_sponsorships
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- Gallery / Moments (post, edit, delete)
DROP TRIGGER IF EXISTS trg_audit_cricket_gallery ON cricket_gallery;
CREATE TRIGGER trg_audit_cricket_gallery
  AFTER INSERT OR UPDATE OR DELETE ON cricket_gallery
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- Team members (join, approve, reject, role change, leave)
DROP TRIGGER IF EXISTS trg_audit_team_members ON team_members;
CREATE TRIGGER trg_audit_team_members
  AFTER INSERT OR UPDATE OR DELETE ON team_members
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ── Skipped tables (high-churn, no team_id, or low-value) ───
-- cricket_expense_splits: no team_id column, tracked via expense parent
-- cricket_gallery_tags: low-value (who tagged who)
-- cricket_gallery_comments: could add later if needed
-- cricket_gallery_likes: too noisy (every like)
-- cricket_comment_reactions: too noisy
-- cricket_notifications: system-generated, not user actions
-- practice_balls/innings/match_players: scoring is high-churn

-- ── Human-readable view ─────────────────────────────────────
-- Joins audit log with profiles to produce friendly descriptions.
-- Query: SELECT * FROM audit_feed WHERE team_id = '...' LIMIT 50;

-- security_invoker = true: view respects caller's RLS (Postgres 15+)
-- Without this, the view runs as postgres and bypasses all RLS.
CREATE OR REPLACE VIEW audit_feed
WITH (security_invoker = true) AS
SELECT
  a.id,
  a.team_id,
  a.table_name,
  a.action,
  a.record_id,
  a.actor_id,
  COALESCE(p.full_name, p.email, 'System') AS actor_name,
  a.created_at,
  -- Human-readable description
  CASE
    -- Players
    WHEN a.table_name = 'cricket_players' AND a.action = 'INSERT' THEN
      COALESCE(p.full_name, 'Someone') || ' added player ' || COALESCE(a.new_data->>'name', 'Unknown')
    WHEN a.table_name = 'cricket_players' AND a.action = 'UPDATE' AND (a.old_data->>'is_active') = 'true' AND (a.new_data->>'is_active') = 'false' THEN
      COALESCE(p.full_name, 'Someone') || ' removed player ' || COALESCE(a.old_data->>'name', 'Unknown')
    WHEN a.table_name = 'cricket_players' AND a.action = 'UPDATE' AND (a.old_data->>'is_active') = 'false' AND (a.new_data->>'is_active') = 'true' THEN
      COALESCE(p.full_name, 'Someone') || ' restored player ' || COALESCE(a.new_data->>'name', 'Unknown')
    WHEN a.table_name = 'cricket_players' AND a.action = 'UPDATE' THEN
      COALESCE(p.full_name, 'Someone') || ' edited player ' || COALESCE(a.new_data->>'name', 'Unknown')
    WHEN a.table_name = 'cricket_players' AND a.action = 'DELETE' THEN
      COALESCE(p.full_name, 'Someone') || ' permanently deleted player ' || COALESCE(a.old_data->>'name', 'Unknown')

    -- Expenses
    WHEN a.table_name = 'cricket_expenses' AND a.action = 'INSERT' THEN
      COALESCE(p.full_name, 'Someone') || ' added $' || COALESCE(a.new_data->>'amount', '?') || ' expense: ' || COALESCE(a.new_data->>'description', '')
    WHEN a.table_name = 'cricket_expenses' AND a.action = 'UPDATE' AND a.old_data->>'deleted_at' IS NULL AND a.new_data->>'deleted_at' IS NOT NULL THEN
      COALESCE(p.full_name, 'Someone') || ' deleted expense: ' || COALESCE(a.old_data->>'description', '')
    WHEN a.table_name = 'cricket_expenses' AND a.action = 'UPDATE' AND a.old_data->>'deleted_at' IS NOT NULL AND a.new_data->>'deleted_at' IS NULL THEN
      COALESCE(p.full_name, 'Someone') || ' restored expense: ' || COALESCE(a.new_data->>'description', '')
    WHEN a.table_name = 'cricket_expenses' AND a.action = 'UPDATE' THEN
      COALESCE(p.full_name, 'Someone') || ' edited expense: ' || COALESCE(a.new_data->>'description', '')

    -- Settlements
    WHEN a.table_name = 'cricket_settlements' AND a.action = 'INSERT' THEN
      COALESCE(p.full_name, 'Someone') || ' recorded $' || COALESCE(a.new_data->>'amount', '?') || ' settlement'
    WHEN a.table_name = 'cricket_settlements' AND a.action = 'DELETE' THEN
      COALESCE(p.full_name, 'Someone') || ' deleted a settlement'

    -- Season fees
    WHEN a.table_name = 'cricket_season_fees' AND a.action = 'INSERT' THEN
      COALESCE(p.full_name, 'Someone') || ' recorded $' || COALESCE(a.new_data->>'amount_paid', '?') || ' fee payment'
    WHEN a.table_name = 'cricket_season_fees' AND a.action = 'DELETE' THEN
      COALESCE(p.full_name, 'Someone') || ' deleted a fee record'

    -- Sponsorships
    WHEN a.table_name = 'cricket_sponsorships' AND a.action = 'INSERT' THEN
      COALESCE(p.full_name, 'Someone') || ' added $' || COALESCE(a.new_data->>'amount', '?') || ' sponsorship from ' || COALESCE(a.new_data->>'sponsor_name', 'Unknown')
    WHEN a.table_name = 'cricket_sponsorships' AND a.action = 'UPDATE' AND a.old_data->>'deleted_at' IS NULL AND a.new_data->>'deleted_at' IS NOT NULL THEN
      COALESCE(p.full_name, 'Someone') || ' deleted sponsorship from ' || COALESCE(a.old_data->>'sponsor_name', '')
    WHEN a.table_name = 'cricket_sponsorships' AND a.action = 'UPDATE' AND a.old_data->>'deleted_at' IS NOT NULL AND a.new_data->>'deleted_at' IS NULL THEN
      COALESCE(p.full_name, 'Someone') || ' restored sponsorship from ' || COALESCE(a.new_data->>'sponsor_name', '')
    WHEN a.table_name = 'cricket_sponsorships' AND a.action = 'UPDATE' THEN
      COALESCE(p.full_name, 'Someone') || ' edited sponsorship from ' || COALESCE(a.new_data->>'sponsor_name', '')

    -- Seasons
    WHEN a.table_name = 'cricket_seasons' AND a.action = 'INSERT' THEN
      COALESCE(p.full_name, 'Someone') || ' created season ' || COALESCE(a.new_data->>'name', '')
    WHEN a.table_name = 'cricket_seasons' AND a.action = 'UPDATE' AND (a.old_data->>'is_active') = 'false' AND (a.new_data->>'is_active') = 'true' THEN
      COALESCE(p.full_name, 'Someone') || ' activated season ' || COALESCE(a.new_data->>'name', '')
    WHEN a.table_name = 'cricket_seasons' AND a.action = 'UPDATE' AND (a.old_data->>'is_active') = 'true' AND (a.new_data->>'is_active') = 'false' THEN
      COALESCE(p.full_name, 'Someone') || ' deactivated season ' || COALESCE(a.new_data->>'name', '')
    WHEN a.table_name = 'cricket_seasons' AND a.action = 'UPDATE' THEN
      COALESCE(p.full_name, 'Someone') || ' edited season ' || COALESCE(a.new_data->>'name', '')

    -- Gallery / Moments
    WHEN a.table_name = 'cricket_gallery' AND a.action = 'INSERT' THEN
      COALESCE(p.full_name, 'Someone') || ' posted in Moments'
    WHEN a.table_name = 'cricket_gallery' AND a.action = 'UPDATE' AND a.old_data->>'deleted_at' IS NULL AND a.new_data->>'deleted_at' IS NOT NULL THEN
      COALESCE(p.full_name, 'Someone') || ' deleted a Moments post'
    WHEN a.table_name = 'cricket_gallery' AND a.action = 'UPDATE' THEN
      COALESCE(p.full_name, 'Someone') || ' edited a Moments post'

    -- Team members
    WHEN a.table_name = 'team_members' AND a.action = 'INSERT' AND (a.new_data->>'approved') = 'true' THEN
      COALESCE(p.full_name, 'Someone') || ' joined the team'
    WHEN a.table_name = 'team_members' AND a.action = 'INSERT' AND (a.new_data->>'approved') = 'false' THEN
      'New signup requested to join the team'
    WHEN a.table_name = 'team_members' AND a.action = 'UPDATE' AND (a.old_data->>'approved') = 'false' AND (a.new_data->>'approved') = 'true' THEN
      COALESCE(p.full_name, 'Admin') || ' approved a team member'
    WHEN a.table_name = 'team_members' AND a.action = 'UPDATE' AND (a.old_data->>'role') IS DISTINCT FROM (a.new_data->>'role') THEN
      COALESCE(p.full_name, 'Someone') || ' changed role to ' || COALESCE(a.new_data->>'role', '?')
    WHEN a.table_name = 'team_members' AND a.action = 'DELETE' THEN
      COALESCE(p.full_name, 'Someone') || ' removed a team member'

    -- Fallback
    ELSE COALESCE(p.full_name, 'Someone') || ' ' || lower(a.action) || 'ed a ' || replace(replace(a.table_name, 'cricket_', ''), '_', ' ') || ' record'
  END AS description,
  a.old_data,
  a.new_data
FROM team_audit_log a
LEFT JOIN profiles p ON p.id = a.actor_id;
-- Note: callers must add ORDER BY (view ORDER BY is not guaranteed by Postgres)

NOTIFY pgrst, 'reload schema';
