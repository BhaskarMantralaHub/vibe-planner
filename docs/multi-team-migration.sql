-- ============================================================
-- Multi-Team Migration — Complete Runnable SQL
-- ============================================================
-- Run this AFTER taking a full backup via backup.yml workflow.
-- This script is idempotent where possible (IF NOT EXISTS).
--
-- Team UUID: 8284208d-fb02-44bf-bb8c-3c5411d35386 (pre-generated)
-- Owner UID: resolved dynamically from __SUPER_ADMIN_EMAIL__
--
-- Run in Supabase SQL Editor as a single transaction.
-- ============================================================

BEGIN;

-- Resolve owner UID from email (case-insensitive)
DO $$
DECLARE
  v_owner_uid UUID;
BEGIN
  SELECT id INTO v_owner_uid FROM auth.users WHERE lower(email) = lower('__SUPER_ADMIN_EMAIL__');
  IF v_owner_uid IS NULL THEN
    RAISE EXCEPTION 'Owner email __SUPER_ADMIN_EMAIL__ not found in auth.users';
  END IF;
  -- Store in a temp table for use throughout the migration
  CREATE TEMP TABLE IF NOT EXISTS _migration_vars (key TEXT PRIMARY KEY, val UUID);
  INSERT INTO _migration_vars VALUES ('owner_uid', v_owner_uid)
    ON CONFLICT (key) DO UPDATE SET val = EXCLUDED.val;
END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 1: New Tables
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cricket_teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  logo_url      TEXT,
  primary_color TEXT DEFAULT '#0369a1',
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT cricket_teams_slug_unique UNIQUE (slug),
  CONSTRAINT cricket_teams_name_unique UNIQUE (name),
  CONSTRAINT cricket_teams_slug_format CHECK (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$')
);

CREATE TABLE IF NOT EXISTS team_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id   UUID NOT NULL REFERENCES cricket_teams(id) ON DELETE RESTRICT,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('owner', 'admin', 'player')),
  joined_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT team_members_unique UNIQUE (team_id, user_id)
);

ALTER TABLE cricket_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════
-- SECTION 2: Helper Functions (RLS Performance)
-- ════════════════════════════════════════════════════════════

-- Returns all team IDs the current user belongs to (cached per statement)
CREATE OR REPLACE FUNCTION user_team_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid();
$$;

-- Team-scoped admin check
CREATE OR REPLACE FUNCTION is_team_admin(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

-- Team-scoped membership check
CREATE OR REPLACE FUNCTION is_team_member(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid()
  );
$$;

-- Platform admin (super admin only)
CREATE OR REPLACE FUNCTION is_global_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND access @> '{admin}'
  );
$$;

-- Active scorer check (updated to keep existing behavior)
CREATE OR REPLACE FUNCTION is_active_scorer(target_match_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.practice_matches
    WHERE id = target_match_id
      AND (active_scorer_id = auth.uid() OR created_by = auth.uid())
      AND status IN ('scoring', 'innings_break')
  );
$$;

-- ════════════════════════════════════════════════════════════
-- SECTION 3: Privilege Escalation Prevention
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_owner_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'owner' AND (OLD IS NULL OR OLD.role != 'owner') THEN
    RAISE EXCEPTION 'Owner role can only be transferred via dedicated RPC';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_owner_escalation ON team_members;
CREATE TRIGGER trg_no_owner_escalation
  BEFORE UPDATE ON team_members FOR EACH ROW
  EXECUTE FUNCTION prevent_owner_escalation();

-- ════════════════════════════════════════════════════════════
-- SECTION 4: Add team_id Columns (NULLABLE first)
-- ════════════════════════════════════════════════════════════

-- Parent tables (9)
ALTER TABLE cricket_players          ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES cricket_teams(id);
ALTER TABLE cricket_seasons          ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES cricket_teams(id);
ALTER TABLE cricket_expenses         ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES cricket_teams(id);
ALTER TABLE cricket_settlements      ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES cricket_teams(id);
ALTER TABLE cricket_season_fees      ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES cricket_teams(id);
ALTER TABLE cricket_sponsorships     ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES cricket_teams(id);
ALTER TABLE cricket_gallery          ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES cricket_teams(id);
ALTER TABLE cricket_schedule_matches ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES cricket_teams(id);
ALTER TABLE practice_matches         ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES cricket_teams(id);

-- High-volume children (5) — auto-populated via trigger
ALTER TABLE practice_balls           ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES cricket_teams(id);
ALTER TABLE practice_innings         ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES cricket_teams(id);
ALTER TABLE practice_match_players   ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES cricket_teams(id);
ALTER TABLE cricket_gallery_comments ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES cricket_teams(id);
ALTER TABLE cricket_notifications    ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES cricket_teams(id);

-- ════════════════════════════════════════════════════════════
-- SECTION 5: Seed Default Team + Backfill
-- ════════════════════════════════════════════════════════════

-- Insert the existing team (idempotent)
INSERT INTO cricket_teams (id, name, slug, owner_id, primary_color)
VALUES (
  '8284208d-fb02-44bf-bb8c-3c5411d35386',
  'Sunrisers Manteca',
  'sunrisers-manteca',
  (SELECT val FROM _migration_vars WHERE key = 'owner_uid'),
  '#0369a1'
) ON CONFLICT (slug) DO NOTHING;

-- Backfill all parent tables
UPDATE cricket_players          SET team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386' WHERE team_id IS NULL;
UPDATE cricket_seasons          SET team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386' WHERE team_id IS NULL;
UPDATE cricket_expenses         SET team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386' WHERE team_id IS NULL;
UPDATE cricket_settlements      SET team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386' WHERE team_id IS NULL;
UPDATE cricket_season_fees      SET team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386' WHERE team_id IS NULL;
UPDATE cricket_sponsorships     SET team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386' WHERE team_id IS NULL;
UPDATE cricket_gallery          SET team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386' WHERE team_id IS NULL;
UPDATE cricket_schedule_matches SET team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386' WHERE team_id IS NULL;
UPDATE practice_matches         SET team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386' WHERE team_id IS NULL;

-- Backfill high-volume children
UPDATE practice_balls           SET team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386' WHERE team_id IS NULL;
UPDATE practice_innings         SET team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386' WHERE team_id IS NULL;
UPDATE practice_match_players   SET team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386' WHERE team_id IS NULL;
UPDATE cricket_gallery_comments SET team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386' WHERE team_id IS NULL;
UPDATE cricket_notifications    SET team_id = '8284208d-fb02-44bf-bb8c-3c5411d35386' WHERE team_id IS NULL;

-- Populate team_members from existing cricket users
-- Owner gets 'owner' role directly (trigger blocks UPDATE to 'owner')
INSERT INTO team_members (team_id, user_id, role)
SELECT '8284208d-fb02-44bf-bb8c-3c5411d35386', p.id,
  CASE
    WHEN p.id = (SELECT val FROM _migration_vars WHERE key = 'owner_uid') THEN 'owner'
    WHEN p.access @> '{admin}' THEN 'admin'
    ELSE 'player'
  END
FROM profiles p
WHERE p.access @> '{cricket}'
ON CONFLICT (team_id, user_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- SECTION 6: NOT NULL Constraints (after backfill)
-- ════════════════════════════════════════════════════════════

ALTER TABLE cricket_players          ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE cricket_seasons          ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE cricket_expenses         ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE cricket_settlements      ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE cricket_season_fees      ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE cricket_sponsorships     ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE cricket_gallery          ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE cricket_schedule_matches ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE practice_matches         ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE practice_balls           ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE practice_innings         ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE practice_match_players   ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE cricket_gallery_comments ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE cricket_notifications    ALTER COLUMN team_id SET NOT NULL;

-- ════════════════════════════════════════════════════════════
-- SECTION 7: Indexes
-- ════════════════════════════════════════════════════════════

-- team_members (critical for RLS helper)
CREATE INDEX IF NOT EXISTS idx_team_members_user_team ON team_members(user_id, team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team      ON team_members(team_id);

-- Parent tables
CREATE INDEX IF NOT EXISTS idx_cricket_players_team          ON cricket_players(team_id);
CREATE INDEX IF NOT EXISTS idx_cricket_seasons_team          ON cricket_seasons(team_id);
CREATE INDEX IF NOT EXISTS idx_cricket_expenses_team         ON cricket_expenses(team_id);
CREATE INDEX IF NOT EXISTS idx_cricket_settlements_team      ON cricket_settlements(team_id);
CREATE INDEX IF NOT EXISTS idx_cricket_season_fees_team      ON cricket_season_fees(team_id);
CREATE INDEX IF NOT EXISTS idx_cricket_sponsorships_team     ON cricket_sponsorships(team_id);
CREATE INDEX IF NOT EXISTS idx_cricket_gallery_team          ON cricket_gallery(team_id);
CREATE INDEX IF NOT EXISTS idx_cricket_schedule_matches_team ON cricket_schedule_matches(team_id);
CREATE INDEX IF NOT EXISTS idx_practice_matches_team         ON practice_matches(team_id);

-- High-volume children
CREATE INDEX IF NOT EXISTS idx_practice_balls_team           ON practice_balls(team_id);
CREATE INDEX IF NOT EXISTS idx_practice_innings_team         ON practice_innings(team_id);
CREATE INDEX IF NOT EXISTS idx_practice_match_players_team   ON practice_match_players(team_id);
CREATE INDEX IF NOT EXISTS idx_gallery_comments_team         ON cricket_gallery_comments(team_id);
CREATE INDEX IF NOT EXISTS idx_notifications_team            ON cricket_notifications(team_id);

-- Composite indexes (frequent filter combos)
CREATE INDEX IF NOT EXISTS idx_seasons_team_active           ON cricket_seasons(team_id, is_active);
CREATE INDEX IF NOT EXISTS idx_expenses_team_season          ON cricket_expenses(team_id, season_id);
CREATE INDEX IF NOT EXISTS idx_gallery_team_season           ON cricket_gallery(team_id, season_id);
CREATE INDEX IF NOT EXISTS idx_practice_matches_team_season  ON practice_matches(team_id, season_id);

-- ════════════════════════════════════════════════════════════
-- SECTION 8: Auto-Populate Triggers (child tables)
-- ════════════════════════════════════════════════════════════

-- Practice children: inherit team_id from practice_matches
CREATE OR REPLACE FUNCTION set_practice_child_team_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.team_id := (SELECT team_id FROM practice_matches WHERE id = NEW.match_id);
  IF NEW.team_id IS NULL THEN
    RAISE EXCEPTION 'Cannot determine team_id from match %', NEW.match_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_balls_team_id ON practice_balls;
CREATE TRIGGER trg_set_balls_team_id
  BEFORE INSERT ON practice_balls FOR EACH ROW
  EXECUTE FUNCTION set_practice_child_team_id();

DROP TRIGGER IF EXISTS trg_set_innings_team_id ON practice_innings;
CREATE TRIGGER trg_set_innings_team_id
  BEFORE INSERT ON practice_innings FOR EACH ROW
  EXECUTE FUNCTION set_practice_child_team_id();

DROP TRIGGER IF EXISTS trg_set_match_players_team_id ON practice_match_players;
CREATE TRIGGER trg_set_match_players_team_id
  BEFORE INSERT ON practice_match_players FOR EACH ROW
  EXECUTE FUNCTION set_practice_child_team_id();

-- Gallery children: inherit team_id from cricket_gallery
CREATE OR REPLACE FUNCTION set_gallery_child_team_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.team_id := (SELECT team_id FROM cricket_gallery WHERE id = NEW.post_id);
  IF NEW.team_id IS NULL THEN
    RAISE EXCEPTION 'Cannot determine team_id from post %', NEW.post_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_comments_team_id ON cricket_gallery_comments;
CREATE TRIGGER trg_set_comments_team_id
  BEFORE INSERT ON cricket_gallery_comments FOR EACH ROW
  EXECUTE FUNCTION set_gallery_child_team_id();

DROP TRIGGER IF EXISTS trg_set_notifications_team_id ON cricket_notifications;
CREATE TRIGGER trg_set_notifications_team_id
  BEFORE INSERT ON cricket_notifications FOR EACH ROW
  EXECUTE FUNCTION set_gallery_child_team_id();

-- ════════════════════════════════════════════════════════════
-- SECTION 9: Update Guest Unique Constraint (team-scoped)
-- ════════════════════════════════════════════════════════════

-- Drop old constraint (single-team)
DROP INDEX IF EXISTS idx_unique_active_guest_name;

-- New: unique guest name per team
CREATE UNIQUE INDEX idx_guest_unique_per_team
  ON cricket_players(lower(name), team_id)
  WHERE is_guest = true AND is_active = true;

-- ════════════════════════════════════════════════════════════
-- SECTION 10: Drop Old RLS Policies
-- ════════════════════════════════════════════════════════════

-- cricket_teams & team_members (new tables, no old policies)

-- cricket_players
DROP POLICY IF EXISTS "Cricket users can read players"    ON cricket_players;
DROP POLICY IF EXISTS "Admin can manage players"           ON cricket_players;
DROP POLICY IF EXISTS "Admin can update players"           ON cricket_players;
DROP POLICY IF EXISTS "Admin can delete players"           ON cricket_players;

-- cricket_seasons
DROP POLICY IF EXISTS "Cricket users can read seasons"     ON cricket_seasons;
DROP POLICY IF EXISTS "Admin can manage seasons"           ON cricket_seasons;
DROP POLICY IF EXISTS "Admin can update seasons"           ON cricket_seasons;
DROP POLICY IF EXISTS "Admin can delete seasons"           ON cricket_seasons;

-- cricket_expenses
DROP POLICY IF EXISTS "Cricket users can read expenses"    ON cricket_expenses;
DROP POLICY IF EXISTS "Admin can manage expenses"          ON cricket_expenses;
DROP POLICY IF EXISTS "Admin can update expenses"          ON cricket_expenses;
DROP POLICY IF EXISTS "Admin can delete expenses"          ON cricket_expenses;

-- cricket_expense_splits
DROP POLICY IF EXISTS "Cricket users can read splits"      ON cricket_expense_splits;
DROP POLICY IF EXISTS "Admin can manage splits"            ON cricket_expense_splits;
DROP POLICY IF EXISTS "Admin can delete splits"            ON cricket_expense_splits;

-- cricket_settlements
DROP POLICY IF EXISTS "Cricket users can read settlements" ON cricket_settlements;
DROP POLICY IF EXISTS "Admin can manage settlements"       ON cricket_settlements;
DROP POLICY IF EXISTS "Admin can delete settlements"       ON cricket_settlements;

-- cricket_season_fees
DROP POLICY IF EXISTS "Cricket users can read fees"        ON cricket_season_fees;
DROP POLICY IF EXISTS "Admin can manage fees"              ON cricket_season_fees;
DROP POLICY IF EXISTS "Admin can update fees"              ON cricket_season_fees;
DROP POLICY IF EXISTS "Admin can delete fees"              ON cricket_season_fees;

-- cricket_sponsorships
DROP POLICY IF EXISTS "Cricket users can read sponsorships"  ON cricket_sponsorships;
DROP POLICY IF EXISTS "Admin can manage sponsorships"        ON cricket_sponsorships;
DROP POLICY IF EXISTS "Admin can update sponsorships"        ON cricket_sponsorships;
DROP POLICY IF EXISTS "Admin can delete sponsorships"        ON cricket_sponsorships;

-- cricket_gallery
DROP POLICY IF EXISTS "Cricket users can read gallery"       ON cricket_gallery;
DROP POLICY IF EXISTS "Cricket users can create posts"       ON cricket_gallery;
DROP POLICY IF EXISTS "Own or admin can soft-delete posts"   ON cricket_gallery;

-- cricket_gallery_tags
DROP POLICY IF EXISTS "Cricket users can read tags"          ON cricket_gallery_tags;
DROP POLICY IF EXISTS "Cricket users can create tags"        ON cricket_gallery_tags;

-- cricket_gallery_comments
DROP POLICY IF EXISTS "Cricket users can read comments"      ON cricket_gallery_comments;
DROP POLICY IF EXISTS "Cricket users can create comments"    ON cricket_gallery_comments;
DROP POLICY IF EXISTS "Own user can update comments"         ON cricket_gallery_comments;
DROP POLICY IF EXISTS "Own or admin can delete comments"     ON cricket_gallery_comments;

-- cricket_gallery_likes
DROP POLICY IF EXISTS "Cricket users can read likes"         ON cricket_gallery_likes;
DROP POLICY IF EXISTS "Cricket users can create likes"       ON cricket_gallery_likes;
DROP POLICY IF EXISTS "Users can remove own likes"           ON cricket_gallery_likes;

-- cricket_comment_reactions
DROP POLICY IF EXISTS "Cricket users can read reactions"     ON cricket_comment_reactions;
DROP POLICY IF EXISTS "Cricket users can add reactions"      ON cricket_comment_reactions;
DROP POLICY IF EXISTS "Users can remove own reactions"       ON cricket_comment_reactions;

-- cricket_notifications
DROP POLICY IF EXISTS "Users can read own notifications"     ON cricket_notifications;
DROP POLICY IF EXISTS "Cricket users can create notifications" ON cricket_notifications;
DROP POLICY IF EXISTS "Users can update own notifications"   ON cricket_notifications;
DROP POLICY IF EXISTS "Users can delete own notifications"   ON cricket_notifications;

-- cricket_schedule_matches
DROP POLICY IF EXISTS "Cricket users can read schedule matches"  ON cricket_schedule_matches;
DROP POLICY IF EXISTS "Admin can create schedule matches"        ON cricket_schedule_matches;
DROP POLICY IF EXISTS "Admin can update schedule matches"        ON cricket_schedule_matches;
DROP POLICY IF EXISTS "Admin can delete schedule matches"        ON cricket_schedule_matches;

-- practice_matches
DROP POLICY IF EXISTS "Cricket users can read matches"       ON practice_matches;
DROP POLICY IF EXISTS "Cricket users can create matches"     ON practice_matches;
DROP POLICY IF EXISTS "Scorer can update match"              ON practice_matches;
DROP POLICY IF EXISTS "Creator or admin can delete match"    ON practice_matches;

-- practice_match_players
DROP POLICY IF EXISTS "Cricket users can read match players" ON practice_match_players;
DROP POLICY IF EXISTS "Scorer can manage match players"      ON practice_match_players;
DROP POLICY IF EXISTS "Scorer can update match players"      ON practice_match_players;
DROP POLICY IF EXISTS "Scorer can delete match players"      ON practice_match_players;

-- practice_innings
DROP POLICY IF EXISTS "Cricket users can read innings"       ON practice_innings;
DROP POLICY IF EXISTS "Scorer can create innings"            ON practice_innings;
DROP POLICY IF EXISTS "Scorer can update innings"            ON practice_innings;
DROP POLICY IF EXISTS "Admin can delete innings"             ON practice_innings;

-- practice_balls
DROP POLICY IF EXISTS "Cricket users can read balls"         ON practice_balls;
DROP POLICY IF EXISTS "Scorer can record balls"              ON practice_balls;
DROP POLICY IF EXISTS "Scorer can update balls"              ON practice_balls;
DROP POLICY IF EXISTS "Admin can delete balls"               ON practice_balls;

-- ════════════════════════════════════════════════════════════
-- SECTION 11: New RLS Policies — cricket_teams & team_members
-- ════════════════════════════════════════════════════════════

-- Teams: any authenticated user can read non-deleted teams
CREATE POLICY "Anyone can read teams"
  ON cricket_teams FOR SELECT
  USING (deleted_at IS NULL);

-- Teams: only global admin can create teams (for now; relax later for self-service)
CREATE POLICY "Authenticated can create teams"
  ON cricket_teams FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Teams: only owner can update their team
CREATE POLICY "Owner can update team"
  ON cricket_teams FOR UPDATE
  USING (owner_id = auth.uid() OR is_global_admin());

-- team_members: members can see their team's roster
CREATE POLICY "Members can read own team members"
  ON team_members FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

-- team_members: team admin can add members
CREATE POLICY "Admin can add members"
  ON team_members FOR INSERT
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());

-- team_members: team admin can update (not self), escalation blocked by trigger
CREATE POLICY "Admin can update members"
  ON team_members FOR UPDATE
  USING (
    (is_team_admin(team_id) AND user_id != auth.uid())
    OR is_global_admin()
  );

-- team_members: team admin can remove (not self)
CREATE POLICY "Admin can remove members"
  ON team_members FOR DELETE
  USING (
    (is_team_admin(team_id) AND user_id != auth.uid())
    OR is_global_admin()
  );

-- ════════════════════════════════════════════════════════════
-- SECTION 12: New RLS Policies — Parent Tables (team-scoped)
-- ════════════════════════════════════════════════════════════

-- ── cricket_players ─────────────────────────────────────────
CREATE POLICY "Team members can read players"
  ON cricket_players FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

CREATE POLICY "Team admin can create players"
  ON cricket_players FOR INSERT
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can update players"
  ON cricket_players FOR UPDATE
  USING (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can delete players"
  ON cricket_players FOR DELETE
  USING (is_team_admin(team_id) OR is_global_admin());

-- ── cricket_seasons ─────────────────────────────────────────
CREATE POLICY "Team members can read seasons"
  ON cricket_seasons FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

CREATE POLICY "Team admin can create seasons"
  ON cricket_seasons FOR INSERT
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can update seasons"
  ON cricket_seasons FOR UPDATE
  USING (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can delete seasons"
  ON cricket_seasons FOR DELETE
  USING (is_team_admin(team_id) OR is_global_admin());

-- ── cricket_expenses ────────────────────────────────────────
CREATE POLICY "Team members can read expenses"
  ON cricket_expenses FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

CREATE POLICY "Team admin can create expenses"
  ON cricket_expenses FOR INSERT
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can update expenses"
  ON cricket_expenses FOR UPDATE
  USING (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can delete expenses"
  ON cricket_expenses FOR DELETE
  USING (is_team_admin(team_id) OR is_global_admin());

-- ── cricket_expense_splits (via parent join — no team_id) ───
CREATE POLICY "Team members can read splits"
  ON cricket_expense_splits FOR SELECT
  USING (expense_id IN (
    SELECT id FROM cricket_expenses WHERE team_id IN (SELECT * FROM user_team_ids())
  ) OR is_global_admin());

CREATE POLICY "Team admin can create splits"
  ON cricket_expense_splits FOR INSERT
  WITH CHECK (expense_id IN (
    SELECT id FROM cricket_expenses WHERE is_team_admin(team_id)
  ) OR is_global_admin());

CREATE POLICY "Team admin can delete splits"
  ON cricket_expense_splits FOR DELETE
  USING (expense_id IN (
    SELECT id FROM cricket_expenses WHERE is_team_admin(team_id)
  ) OR is_global_admin());

-- ── cricket_settlements ─────────────────────────────────────
CREATE POLICY "Team members can read settlements"
  ON cricket_settlements FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

CREATE POLICY "Team admin can create settlements"
  ON cricket_settlements FOR INSERT
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can delete settlements"
  ON cricket_settlements FOR DELETE
  USING (is_team_admin(team_id) OR is_global_admin());

-- ── cricket_season_fees ─────────────────────────────────────
CREATE POLICY "Team members can read fees"
  ON cricket_season_fees FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

CREATE POLICY "Team admin can create fees"
  ON cricket_season_fees FOR INSERT
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can update fees"
  ON cricket_season_fees FOR UPDATE
  USING (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can delete fees"
  ON cricket_season_fees FOR DELETE
  USING (is_team_admin(team_id) OR is_global_admin());

-- ── cricket_sponsorships ────────────────────────────────────
CREATE POLICY "Team members can read sponsorships"
  ON cricket_sponsorships FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

CREATE POLICY "Team admin can create sponsorships"
  ON cricket_sponsorships FOR INSERT
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can update sponsorships"
  ON cricket_sponsorships FOR UPDATE
  USING (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can delete sponsorships"
  ON cricket_sponsorships FOR DELETE
  USING (is_team_admin(team_id) OR is_global_admin());

-- ── cricket_gallery ─────────────────────────────────────────
CREATE POLICY "Team members can read gallery"
  ON cricket_gallery FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

CREATE POLICY "Team members can create posts"
  ON cricket_gallery FOR INSERT
  WITH CHECK (is_team_member(team_id));

CREATE POLICY "Own or admin can update posts"
  ON cricket_gallery FOR UPDATE
  USING (
    (user_id = auth.uid() AND is_team_member(team_id))
    OR is_team_admin(team_id)
    OR is_global_admin()
  );

-- ── cricket_gallery_tags (via parent join) ──────────────────
CREATE POLICY "Team members can read tags"
  ON cricket_gallery_tags FOR SELECT
  USING (post_id IN (
    SELECT id FROM cricket_gallery WHERE team_id IN (SELECT * FROM user_team_ids())
  ) OR is_global_admin());

CREATE POLICY "Team members can create tags"
  ON cricket_gallery_tags FOR INSERT
  WITH CHECK (post_id IN (
    SELECT id FROM cricket_gallery WHERE is_team_member(team_id)
  ));

-- ── cricket_gallery_comments (has team_id) ──────────────────
CREATE POLICY "Team members can read comments"
  ON cricket_gallery_comments FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

CREATE POLICY "Team members can create comments"
  ON cricket_gallery_comments FOR INSERT
  WITH CHECK (is_team_member(team_id));

CREATE POLICY "Own user can update comments"
  ON cricket_gallery_comments FOR UPDATE
  USING (user_id = auth.uid() AND is_team_member(team_id));

CREATE POLICY "Own or admin can delete comments"
  ON cricket_gallery_comments FOR DELETE
  USING (
    (user_id = auth.uid() AND is_team_member(team_id))
    OR is_team_admin(team_id)
    OR is_global_admin()
  );

-- ── cricket_gallery_likes (via parent join) ─────────────────
CREATE POLICY "Team members can read likes"
  ON cricket_gallery_likes FOR SELECT
  USING (post_id IN (
    SELECT id FROM cricket_gallery WHERE team_id IN (SELECT * FROM user_team_ids())
  ) OR is_global_admin());

CREATE POLICY "Team members can create likes"
  ON cricket_gallery_likes FOR INSERT
  WITH CHECK (post_id IN (
    SELECT id FROM cricket_gallery WHERE is_team_member(team_id)
  ));

CREATE POLICY "Users can remove own likes"
  ON cricket_gallery_likes FOR DELETE
  USING (user_id = auth.uid());

-- ── cricket_comment_reactions (via parent join) ─────────────
CREATE POLICY "Team members can read reactions"
  ON cricket_comment_reactions FOR SELECT
  USING (comment_id IN (
    SELECT id FROM cricket_gallery_comments WHERE team_id IN (SELECT * FROM user_team_ids())
  ) OR is_global_admin());

CREATE POLICY "Team members can add reactions"
  ON cricket_comment_reactions FOR INSERT
  WITH CHECK (comment_id IN (
    SELECT id FROM cricket_gallery_comments WHERE is_team_member(team_id)
  ));

CREATE POLICY "Users can remove own reactions"
  ON cricket_comment_reactions FOR DELETE
  USING (user_id = auth.uid());

-- ── cricket_notifications (has team_id) ─────────────────────
CREATE POLICY "Users can read own notifications"
  ON cricket_notifications FOR SELECT
  USING (user_id = auth.uid() AND team_id IN (SELECT * FROM user_team_ids()));

CREATE POLICY "Team members can create notifications"
  ON cricket_notifications FOR INSERT
  WITH CHECK (is_team_member(team_id));

CREATE POLICY "Users can update own notifications"
  ON cricket_notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own notifications"
  ON cricket_notifications FOR DELETE
  USING (user_id = auth.uid());

-- ── cricket_schedule_matches ────────────────────────────────
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

-- ════════════════════════════════════════════════════════════
-- SECTION 13: New RLS Policies — Scoring Tables (team-scoped)
-- ════════════════════════════════════════════════════════════

-- ── practice_matches ────────────────────────────────────────
CREATE POLICY "Team members can read matches"
  ON practice_matches FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

CREATE POLICY "Team members can create matches"
  ON practice_matches FOR INSERT
  WITH CHECK (is_team_member(team_id));

CREATE POLICY "Scorer can update match"
  ON practice_matches FOR UPDATE
  USING (
    is_active_scorer(id)
    OR is_team_admin(team_id)
    OR is_global_admin()
  );

CREATE POLICY "Creator or admin can delete match"
  ON practice_matches FOR DELETE
  USING (
    created_by = auth.uid()
    OR is_team_admin(team_id)
    OR is_global_admin()
  );

-- ── practice_match_players (has team_id) ────────────────────
CREATE POLICY "Team members can read match players"
  ON practice_match_players FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

CREATE POLICY "Scorer can manage match players"
  ON practice_match_players FOR INSERT
  WITH CHECK (
    match_id IN (SELECT id FROM practice_matches WHERE is_active_scorer(id))
    OR is_global_admin()
  );

CREATE POLICY "Scorer can update match players"
  ON practice_match_players FOR UPDATE
  USING (
    match_id IN (SELECT id FROM practice_matches WHERE is_active_scorer(id))
    OR is_global_admin()
  );

CREATE POLICY "Scorer can delete match players"
  ON practice_match_players FOR DELETE
  USING (
    match_id IN (SELECT id FROM practice_matches WHERE is_active_scorer(id))
    OR is_global_admin()
  );

-- ── practice_innings (has team_id) ──────────────────────────
CREATE POLICY "Team members can read innings"
  ON practice_innings FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

CREATE POLICY "Scorer can create innings"
  ON practice_innings FOR INSERT
  WITH CHECK (
    match_id IN (SELECT id FROM practice_matches WHERE is_active_scorer(id))
    OR is_global_admin()
  );

CREATE POLICY "Scorer can update innings"
  ON practice_innings FOR UPDATE
  USING (
    match_id IN (SELECT id FROM practice_matches WHERE is_active_scorer(id))
    OR is_global_admin()
  );

CREATE POLICY "Admin can delete innings"
  ON practice_innings FOR DELETE
  USING (is_team_admin(team_id) OR is_global_admin());

-- ── practice_balls (has team_id) ────────────────────────────
CREATE POLICY "Team members can read balls"
  ON practice_balls FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

CREATE POLICY "Scorer can record balls"
  ON practice_balls FOR INSERT
  WITH CHECK (
    match_id IN (SELECT id FROM practice_matches WHERE is_active_scorer(id))
    OR is_global_admin()
  );

CREATE POLICY "Scorer can update balls"
  ON practice_balls FOR UPDATE
  USING (
    match_id IN (SELECT id FROM practice_matches WHERE is_active_scorer(id))
    OR is_global_admin()
  );

CREATE POLICY "Admin can delete balls"
  ON practice_balls FOR DELETE
  USING (is_team_admin(team_id) OR is_global_admin());

-- ════════════════════════════════════════════════════════════
-- SECTION 14: Post-Migration Validation Queries
-- ════════════════════════════════════════════════════════════
-- Run these after the migration to verify correctness.
-- They should all return 0 for the count columns.

-- Uncomment and run manually:
/*
-- Zero NULLs check
SELECT 'cricket_players' AS tbl, count(*) AS nulls FROM cricket_players WHERE team_id IS NULL
UNION ALL SELECT 'cricket_seasons', count(*) FROM cricket_seasons WHERE team_id IS NULL
UNION ALL SELECT 'cricket_expenses', count(*) FROM cricket_expenses WHERE team_id IS NULL
UNION ALL SELECT 'cricket_settlements', count(*) FROM cricket_settlements WHERE team_id IS NULL
UNION ALL SELECT 'cricket_season_fees', count(*) FROM cricket_season_fees WHERE team_id IS NULL
UNION ALL SELECT 'cricket_sponsorships', count(*) FROM cricket_sponsorships WHERE team_id IS NULL
UNION ALL SELECT 'cricket_gallery', count(*) FROM cricket_gallery WHERE team_id IS NULL
UNION ALL SELECT 'cricket_schedule_matches', count(*) FROM cricket_schedule_matches WHERE team_id IS NULL
UNION ALL SELECT 'practice_matches', count(*) FROM practice_matches WHERE team_id IS NULL
UNION ALL SELECT 'practice_balls', count(*) FROM practice_balls WHERE team_id IS NULL
UNION ALL SELECT 'practice_innings', count(*) FROM practice_innings WHERE team_id IS NULL
UNION ALL SELECT 'practice_match_players', count(*) FROM practice_match_players WHERE team_id IS NULL
UNION ALL SELECT 'cricket_gallery_comments', count(*) FROM cricket_gallery_comments WHERE team_id IS NULL
UNION ALL SELECT 'cricket_notifications', count(*) FROM cricket_notifications WHERE team_id IS NULL;

-- Orphan check (team_id points to nonexistent team)
SELECT 'orphaned_players' AS issue, count(*)
FROM cricket_players p LEFT JOIN cricket_teams t ON p.team_id = t.id
WHERE t.id IS NULL;

-- Cross-team data leak check
SELECT 'cross_team_split' AS issue, count(*)
FROM cricket_expense_splits s
JOIN cricket_expenses e ON s.expense_id = e.id
JOIN cricket_players p ON s.player_id = p.id
WHERE e.team_id != p.team_id;

-- Teams with no owner
SELECT t.name, count(tm.id) AS owners
FROM cricket_teams t
LEFT JOIN team_members tm ON t.id = tm.team_id AND tm.role = 'owner'
GROUP BY t.name HAVING count(tm.id) = 0;

-- Members with no profile
SELECT count(*) AS orphaned_members
FROM team_members tm LEFT JOIN profiles p ON tm.user_id = p.id
WHERE p.id IS NULL;
*/

-- Clean up temp table
DROP TABLE IF EXISTS _migration_vars;

COMMIT;

-- ════════════════════════════════════════════════════════════
-- NOTES
-- ════════════════════════════════════════════════════════════
--
-- AFTER running this migration, you still need to:
--
-- 1. UPDATE ALL 21 RPCs to accept/validate team_id:
--    - create_practice_match, get_match_history, get_match_scorecard,
--      get_practice_leaderboard, create_welcome_post, get_public_season_data,
--      claim_scorer, release_scorer, get_rematch_template, soft_delete_match,
--      restore_match, permanent_delete_match, get_deleted_matches,
--      revert_match_to_scoring, get_guest_suggestions, promote_guest_to_roster,
--      get_public_match_scorecard, check_cricket_player_email,
--      get_signed_up_emails, request_cricket_access, reject_user
--
-- 2. UPDATE handle_new_user() trigger to accept team context from
--    signup metadata and create team_members row.
--
-- 3. UPDATE storage bucket RLS policies for player-photos and
--    gallery-photos to check team membership.
--
-- 4. ADD cricket_teams and team_members to backup.yml + restore.yml
--
-- 5. UPDATE frontend: auth-store, cricket-store, scoring-store,
--    useTeamContext hook, team switcher UI.
