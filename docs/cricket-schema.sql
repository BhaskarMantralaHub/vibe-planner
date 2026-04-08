-- ============================================================
-- Cricket Team Expenses — Database Schema (Multi-Team Model)
-- ============================================================
-- Multi-team architecture: each team has isolated data via team_id.
-- RLS policies use team membership (team_members) for access control.
-- Team admins (owner/admin role in team_members) can manage data.
-- Global admins (profiles.access @> '{admin}') can access all teams.
-- Pool Fund model: fees + sponsorships - expenses = balance

-- ── Teams ───────────────────────────────────────────────────

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

ALTER TABLE cricket_teams ENABLE ROW LEVEL SECURITY;

-- ── Team Members ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id   UUID NOT NULL REFERENCES cricket_teams(id) ON DELETE RESTRICT,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('owner', 'admin', 'player')),
  joined_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT team_members_unique UNIQUE (team_id, user_id)
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Indexes for team_members (critical for RLS helper performance)
CREATE INDEX IF NOT EXISTS idx_team_members_user_team ON team_members(user_id, team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team      ON team_members(team_id);

-- ── Privilege Escalation Prevention ─────────────────────────
-- Owner role can only be transferred via dedicated RPC, not via UPDATE

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

-- ── RLS Policies: cricket_teams ─────────────────────────────

CREATE POLICY "Anyone can read teams"
  ON cricket_teams FOR SELECT
  USING (deleted_at IS NULL);

CREATE POLICY "Authenticated can create teams"
  ON cricket_teams FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Owner can update team"
  ON cricket_teams FOR UPDATE
  USING (owner_id = auth.uid() OR is_global_admin());

-- ── RLS Policies: team_members ──────────────────────────────

CREATE POLICY "Members can read own team members"
  ON team_members FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

CREATE POLICY "Admin can add members"
  ON team_members FOR INSERT
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Admin can update members"
  ON team_members FOR UPDATE
  USING (
    (is_team_admin(team_id) AND user_id != auth.uid())
    OR is_global_admin()
  );

CREATE POLICY "Admin can remove members"
  ON team_members FOR DELETE
  USING (
    (is_team_admin(team_id) AND user_id != auth.uid())
    OR is_global_admin()
  );

-- ── Team Invites ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES cricket_teams(id) ON DELETE CASCADE,
  token       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  max_uses    INTEGER DEFAULT NULL,  -- NULL = unlimited
  use_count   INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team admin can read invites"
  ON team_invites FOR SELECT
  USING (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can create invites"
  ON team_invites FOR INSERT
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can update invites"
  ON team_invites FOR UPDATE
  USING (is_team_admin(team_id) OR is_global_admin());

CREATE INDEX idx_team_invites_token ON team_invites(token);
CREATE INDEX idx_team_invites_team ON team_invites(team_id);

-- ── Validate Invite Token (public, no auth) ─────────────────
-- Returns team info if token is valid, NULL if expired/exhausted/inactive
CREATE OR REPLACE FUNCTION validate_invite_token(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'team_id', t.id,
    'team_name', t.name,
    'team_slug', t.slug,
    'invite_id', ti.id
  ) INTO result
  FROM team_invites ti
  JOIN cricket_teams t ON t.id = ti.team_id
  WHERE ti.token = p_token
    AND ti.is_active = true
    AND ti.expires_at > now()
    AND (ti.max_uses IS NULL OR ti.use_count < ti.max_uses)
    AND t.deleted_at IS NULL;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_invite_token(UUID) TO anon, authenticated;

-- ── Accept Invite (called after signup/login) ───────────────
-- Adds user to team, increments invite use_count, adds cricket access
CREATE OR REPLACE FUNCTION accept_invite(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_team_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Validate and lock the invite
  SELECT ti.*, t.name AS team_name, t.slug AS team_slug
  INTO v_invite
  FROM team_invites ti
  JOIN cricket_teams t ON t.id = ti.team_id
  WHERE ti.token = p_token
    AND ti.is_active = true
    AND ti.expires_at > now()
    AND (ti.max_uses IS NULL OR ti.use_count < ti.max_uses)
    AND t.deleted_at IS NULL
  FOR UPDATE OF ti;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid or expired invite link');
  END IF;

  -- Add user to team (skip if already a member)
  INSERT INTO team_members (team_id, user_id, role)
  VALUES (v_invite.team_id, auth.uid(), 'player')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  -- Add cricket access if user doesn't have it
  UPDATE profiles
  SET access = CASE
    WHEN NOT (access @> '{cricket}') THEN array_append(access, 'cricket')
    ELSE access
  END,
  features = CASE
    WHEN NOT (features @> '{cricket}') THEN array_append(features, 'cricket')
    ELSE features
  END,
  approved = true
  WHERE id = auth.uid();

  -- Increment use count
  UPDATE team_invites SET use_count = use_count + 1 WHERE id = v_invite.id;

  RETURN json_build_object(
    'success', true,
    'team_id', v_invite.team_id,
    'team_name', v_invite.team_name,
    'team_slug', v_invite.team_slug
  );
END;
$$;

GRANT EXECUTE ON FUNCTION accept_invite(UUID) TO authenticated;

-- ── Create Team (admin-only) ───────────────────────────────
CREATE OR REPLACE FUNCTION create_team(
  p_name TEXT,
  p_slug TEXT,
  p_primary_color TEXT DEFAULT '#0369a1'
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  IF NOT is_global_admin() THEN
    RAISE EXCEPTION 'Only platform admin can create teams';
  END IF;

  -- Validate slug format
  IF p_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RAISE EXCEPTION 'Invalid slug: use lowercase letters, numbers, and hyphens only';
  END IF;

  INSERT INTO cricket_teams (name, slug, owner_id, primary_color)
  VALUES (p_name, p_slug, auth.uid(), p_primary_color)
  RETURNING id INTO v_team_id;

  -- Creator becomes team owner
  INSERT INTO team_members (team_id, user_id, role)
  VALUES (v_team_id, auth.uid(), 'owner');

  RETURN json_build_object(
    'team_id', v_team_id,
    'name', p_name,
    'slug', p_slug
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_team(TEXT, TEXT, TEXT) TO authenticated;

-- ── Player Suggestion RPC (autocomplete for adding players) ─
-- Returns matching players from: (1) team members not yet on roster,
-- (2) players from other teams. LATERAL JOIN enriches members with
-- profile data from their other-team player records.
CREATE OR REPLACE FUNCTION suggest_players(
  p_query TEXT,
  p_team_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_query TEXT;
  result JSON;
BEGIN
  IF p_query IS NULL OR length(trim(p_query)) < 2 THEN RETURN '[]'::json; END IF;

  v_team_id := COALESCE(p_team_id, (
    SELECT team_id FROM team_members WHERE user_id = auth.uid() ORDER BY joined_at ASC LIMIT 1
  ));
  IF v_team_id IS NULL THEN RETURN '[]'::json; END IF;
  IF NOT is_team_member(v_team_id) AND NOT is_global_admin() THEN RETURN '[]'::json; END IF;

  v_query := replace(replace(trim(p_query), '%', '\%'), '_', '\_');

  SELECT COALESCE(json_agg(json_build_object(
    'source', sub.source, 'name', sub.name, 'email', sub.email,
    'jersey_number', sub.jersey_number, 'player_role', sub.player_role,
    'batting_style', sub.batting_style, 'bowling_style', sub.bowling_style,
    'shirt_size', sub.shirt_size, 'cricclub_id', sub.cricclub_id,
    'designation', sub.designation, 'user_id', sub.user_id
  )), '[]'::json)
  INTO result
  FROM (
    -- Enriched with player details from any other team (if they have one)
    SELECT
      'member' AS source,
      COALESCE(xp.name, p.full_name) AS name,
      COALESCE(xp.email, p.email) AS email,
      xp.jersey_number,
      xp.player_role,
      xp.batting_style,
      xp.bowling_style,
      xp.shirt_size,
      xp.cricclub_id,
      xp.designation,
      tm.user_id
    FROM team_members tm
    JOIN profiles p ON p.id = tm.user_id
    LEFT JOIN cricket_players cp ON cp.user_id = tm.user_id AND cp.team_id = v_team_id AND cp.is_active = true
    LEFT JOIN LATERAL (
      SELECT * FROM cricket_players op
      WHERE op.user_id = tm.user_id AND op.team_id != v_team_id AND op.is_active = true
      ORDER BY op.updated_at DESC LIMIT 1
    ) xp ON true
    WHERE tm.team_id = v_team_id
      AND cp.id IS NULL
      AND (p.full_name ILIKE '%' || v_query || '%' OR xp.name ILIKE '%' || v_query || '%')

    UNION ALL

    SELECT
      'other_team' AS source,
      cp.name,
      cp.email,
      cp.jersey_number,
      cp.player_role,
      cp.batting_style,
      cp.bowling_style,
      cp.shirt_size,
      cp.cricclub_id,
      cp.designation,
      cp.user_id
    FROM cricket_players cp
    WHERE cp.team_id != v_team_id
      AND cp.is_active = true
      AND cp.is_guest = false
      AND cp.name ILIKE '%' || v_query || '%'
      AND NOT EXISTS (
        SELECT 1 FROM cricket_players cp2
        WHERE cp2.team_id = v_team_id AND cp2.is_active = true
          AND (cp2.user_id = cp.user_id OR lower(cp2.name) = lower(cp.name))
      )

    ORDER BY source, name
    LIMIT 20
  ) sub;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION suggest_players(TEXT, UUID) TO authenticated;

-- ── Global Player Profile Sync Trigger ──────────────────────
-- Syncs GLOBAL player fields across all team records with same user_id.
-- NOT synced (team-specific): jersey_number, designation, is_guest, is_active, team_id
-- Recursion safety: pg_trigger_depth() guard prevents re-entrant cascade.
-- SECURITY DEFINER needed to bypass RLS for cross-team writes.
CREATE OR REPLACE FUNCTION sync_player_profile_across_teams()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RETURN NEW; END IF;

  IF NEW.name IS NOT DISTINCT FROM OLD.name
    AND NEW.email IS NOT DISTINCT FROM OLD.email
    AND NEW.player_role IS NOT DISTINCT FROM OLD.player_role
    AND NEW.batting_style IS NOT DISTINCT FROM OLD.batting_style
    AND NEW.bowling_style IS NOT DISTINCT FROM OLD.bowling_style
    AND NEW.shirt_size IS NOT DISTINCT FROM OLD.shirt_size
    AND NEW.cricclub_id IS NOT DISTINCT FROM OLD.cricclub_id
    AND NEW.photo_url IS NOT DISTINCT FROM OLD.photo_url
    AND NEW.phone IS NOT DISTINCT FROM OLD.phone
  THEN
    RETURN NEW;
  END IF;

  UPDATE cricket_players
  SET name = NEW.name,
      email = NEW.email,
      player_role = NEW.player_role,
      batting_style = NEW.batting_style,
      bowling_style = NEW.bowling_style,
      shirt_size = NEW.shirt_size,
      cricclub_id = NEW.cricclub_id,
      photo_url = NEW.photo_url,
      phone = NEW.phone,
      updated_at = now()
  WHERE user_id = NEW.user_id
    AND id != NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_player_profile ON cricket_players;
CREATE TRIGGER trg_sync_player_profile
  AFTER UPDATE ON cricket_players FOR EACH ROW
  EXECUTE FUNCTION sync_player_profile_across_teams();

-- ── Helper functions (legacy — still used by old code paths) ──

CREATE OR REPLACE FUNCTION has_cricket_access()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND access @> '{cricket}'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_cricket_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND access @> '{admin}'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ── Helper functions (multi-team) ───────────────────────────

-- Returns all team IDs the current user belongs to (cached per statement)
CREATE OR REPLACE FUNCTION user_team_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid();
$$;

-- Team-scoped admin check (owner or admin role)
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

-- Platform admin (super admin only — checks profiles.access)
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

-- Resolve team_id with fallback to user's first team
CREATE OR REPLACE FUNCTION resolve_team_id(p_team_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    p_team_id,
    (SELECT team_id FROM public.team_members WHERE user_id = auth.uid() ORDER BY joined_at ASC LIMIT 1)
  );
$$;

-- Active scorer check (for practice match RLS)
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

-- ── Players ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cricket_players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID NOT NULL REFERENCES cricket_teams(id),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- nullable: NULL for admin-created players, linked on signup via email ILIKE match
  name          TEXT NOT NULL,
  jersey_number INTEGER,
  phone         TEXT,
  player_role   TEXT,           -- 'batsman' | 'bowler' | 'all-rounder' | 'keeper'
  batting_style TEXT,           -- 'right' | 'left'
  bowling_style TEXT,           -- 'pace' | 'medium' | 'spin'
  cricclub_id   TEXT,
  shirt_size    TEXT,           -- 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL'
  email         TEXT,
  designation   TEXT,           -- 'captain' | 'vice-captain'
  photo_url     TEXT,           -- Supabase Storage public URL (player-photos bucket)
  is_active     BOOLEAN DEFAULT true,
  is_guest      BOOLEAN NOT NULL DEFAULT false,  -- true for guest players auto-created from practice matches
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_players ENABLE ROW LEVEL SECURITY;

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

-- Unique index for guest name dedup (team-scoped — prevents duplicate guest records per team)
CREATE UNIQUE INDEX idx_guest_unique_per_team
  ON cricket_players (lower(name), team_id)
  WHERE is_guest = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_cricket_players_team ON cricket_players(team_id);
CREATE INDEX IF NOT EXISTS idx_cricket_players_user_id ON cricket_players(user_id) WHERE user_id IS NOT NULL;

CREATE TRIGGER set_cricket_players_updated_at BEFORE UPDATE ON cricket_players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- WHY: When admin updates a player's name in cricket_players, the corresponding
--      profiles.full_name must stay in sync. Without this, the admin page (which
--      reads from profiles) shows stale signup-time names while the cricket page
--      shows the updated names. Using a SECURITY DEFINER trigger ensures:
--      1. Runs in the same transaction as the player update (atomic)
--      2. Catches ALL update paths (UI, direct SQL, bulk imports)
--      3. Bypasses RLS safely (no client-side permission concerns)
CREATE OR REPLACE FUNCTION sync_player_name_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name AND NEW.user_id IS NOT NULL THEN
    UPDATE profiles SET full_name = NEW.name WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_player_name_trigger ON cricket_players;
CREATE TRIGGER sync_player_name_trigger
  AFTER UPDATE ON cricket_players
  FOR EACH ROW EXECUTE FUNCTION sync_player_name_to_profile();

-- ── Seasons ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cricket_seasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES cricket_teams(id),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  year        INTEGER NOT NULL,
  season_type TEXT,             -- 'spring' | 'summer' | 'fall'
  share_token UUID DEFAULT gen_random_uuid(),
  fee_amount  NUMERIC(10,2) DEFAULT 60,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_seasons ENABLE ROW LEVEL SECURITY;

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

CREATE INDEX IF NOT EXISTS idx_cricket_seasons_team ON cricket_seasons(team_id);
CREATE INDEX IF NOT EXISTS idx_seasons_team_active  ON cricket_seasons(team_id, is_active);

CREATE TRIGGER set_cricket_seasons_updated_at BEFORE UPDATE ON cricket_seasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Expenses (pool fund model — no paid_by player) ──────────

CREATE TABLE IF NOT EXISTS cricket_expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID NOT NULL REFERENCES cricket_teams(id),
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  season_id    UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  paid_by      UUID REFERENCES cricket_players(id) ON DELETE SET NULL,  -- legacy, nullable
  category     TEXT NOT NULL,   -- 'ground' (jerseys) | 'equipment' (cricket kit) | 'tournament' | 'food' | 'other'
  description  TEXT,
  amount       NUMERIC(10,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by   TEXT DEFAULT NULL,
  updated_by   TEXT DEFAULT NULL,
  deleted_at   TIMESTAMPTZ DEFAULT NULL,
  deleted_by   TEXT DEFAULT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_expenses ENABLE ROW LEVEL SECURITY;

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

CREATE INDEX IF NOT EXISTS idx_cricket_expenses_team   ON cricket_expenses(team_id);
CREATE INDEX IF NOT EXISTS idx_expenses_team_season    ON cricket_expenses(team_id, season_id);

CREATE TRIGGER set_cricket_expenses_updated_at BEFORE UPDATE ON cricket_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Expense Splits (equal share per player) ─────────────────
-- No team_id column — access controlled via parent expense join

CREATE TABLE IF NOT EXISTS cricket_expense_splits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id   UUID NOT NULL REFERENCES cricket_expenses(id) ON DELETE CASCADE,
  player_id    UUID NOT NULL REFERENCES cricket_players(id),
  share_amount NUMERIC(10,2) NOT NULL
);

ALTER TABLE cricket_expense_splits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON cricket_expense_splits(expense_id);

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

-- ── Settlements (player-to-player payments) ─────────────────

CREATE TABLE IF NOT EXISTS cricket_settlements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID NOT NULL REFERENCES cricket_teams(id),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id    UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  from_player  UUID NOT NULL REFERENCES cricket_players(id),
  to_player    UUID NOT NULL REFERENCES cricket_players(id),
  amount       NUMERIC(10,2) NOT NULL,
  settled_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read settlements"
  ON cricket_settlements FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

CREATE POLICY "Team admin can create settlements"
  ON cricket_settlements FOR INSERT
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());

CREATE POLICY "Team admin can delete settlements"
  ON cricket_settlements FOR DELETE
  USING (is_team_admin(team_id) OR is_global_admin());

CREATE INDEX IF NOT EXISTS idx_cricket_settlements_team ON cricket_settlements(team_id);

-- ── Season Fees (per-player fee tracking) ───────────────────

CREATE TABLE IF NOT EXISTS cricket_season_fees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES cricket_teams(id),
  season_id   UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES cricket_players(id) ON DELETE CASCADE,
  amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_date   DATE,
  marked_by   TEXT,             -- who recorded the payment
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(season_id, player_id)
);

ALTER TABLE cricket_season_fees ENABLE ROW LEVEL SECURITY;

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

CREATE INDEX IF NOT EXISTS idx_cricket_season_fees_team ON cricket_season_fees(team_id);

-- ── Sponsorships (income to pool fund) ──────────────────────

CREATE TABLE IF NOT EXISTS cricket_sponsorships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID NOT NULL REFERENCES cricket_teams(id),
  season_id       UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  sponsor_name    TEXT NOT NULL,
  amount          NUMERIC(10,2) NOT NULL,
  sponsored_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_by      TEXT,
  updated_by      TEXT,
  deleted_at      TIMESTAMPTZ DEFAULT NULL,
  deleted_by      TEXT DEFAULT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_sponsorships ENABLE ROW LEVEL SECURITY;

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

CREATE INDEX IF NOT EXISTS idx_cricket_sponsorships_team ON cricket_sponsorships(team_id);

-- ── Profiles: Role-based access columns ─────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access text[] DEFAULT '{toolkit}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS player_meta JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_access ON profiles USING GIN (access);

-- ── Welcome post function (called by trigger + RPC) ─────────────
-- Creates a welcome post in Moments and notifies all active players on the team.
-- Uses SECURITY DEFINER to bypass RLS (trigger context has no auth.uid).
-- Accepts optional team_id; falls back to new user's team membership.
CREATE OR REPLACE FUNCTION post_welcome_message(
  new_user_id UUID,
  player_name TEXT,
  p_team_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_season_id UUID;
  v_post_id UUID;
  admin_uid UUID;
  team_name TEXT;
  welcome_messages TEXT[] := ARRAY[
    'Welcome to the squad, %s! Let''s make this season one for the books',
    '%s has joined the team! Another warrior in the dugout',
    'Big welcome to %s! The team just got stronger',
    '%s is officially on the roster! Time to hit the ground running',
    'Welcome aboard, %s! Can''t wait to see you on the field',
    'The squad grows! %s joins the family',
    '%s has entered the arena! Welcome to the team',
    'New player alert! Welcome %s to the team',
    '%s just leveled up our roster! Welcome to the squad',
    'Say hello to our newest teammate — %s! Let''s go'
  ];
  caption TEXT;
BEGIN
  -- Resolve team: passed explicitly, or from the new user's membership
  v_team_id := COALESCE(p_team_id, (
    SELECT team_id FROM team_members WHERE user_id = new_user_id LIMIT 1
  ));
  IF v_team_id IS NULL THEN RETURN; END IF;

  -- Get team name for the post
  SELECT name INTO team_name FROM cricket_teams WHERE id = v_team_id;

  -- Get current active season for this team
  SELECT id INTO v_season_id FROM cricket_seasons
  WHERE is_active = true AND team_id = v_team_id
  ORDER BY
    CASE
      WHEN season_type = (
        CASE
          WHEN EXTRACT(MONTH FROM now()) BETWEEN 3 AND 5 THEN 'spring'
          WHEN EXTRACT(MONTH FROM now()) BETWEEN 6 AND 9 THEN 'summer'
          ELSE 'fall'
        END
      ) AND year = EXTRACT(YEAR FROM now()) THEN 0
      ELSE 1
    END,
    year DESC, created_at DESC
  LIMIT 1;
  IF v_season_id IS NULL THEN RETURN; END IF;

  -- Use an existing team admin as the post owner
  SELECT tm.user_id INTO admin_uid
  FROM team_members tm
  WHERE tm.team_id = v_team_id AND tm.role IN ('owner', 'admin')
  ORDER BY tm.joined_at LIMIT 1;
  IF admin_uid IS NULL THEN RETURN; END IF;

  -- Pick random welcome message
  caption := format(
    welcome_messages[1 + floor(random() * array_length(welcome_messages, 1))::int],
    player_name
  ) || ' @' || player_name || ' @Everyone';

  -- Create welcome post (text-only, owned by admin, posted by team name)
  INSERT INTO cricket_gallery (user_id, season_id, team_id, caption, posted_by)
  VALUES (admin_uid, v_season_id, v_team_id, caption, COALESCE(team_name, 'Team'))
  RETURNING id INTO v_post_id;

  -- Notify all active players on this team (except the new player)
  INSERT INTO cricket_notifications (user_id, post_id, team_id, type, message, is_read)
  SELECT DISTINCT cp.user_id, v_post_id, v_team_id, 'tag', player_name || ' joined the team!', false
  FROM cricket_players cp
  WHERE cp.is_active = true AND cp.user_id IS NOT NULL AND cp.user_id != new_user_id
    AND cp.team_id = v_team_id;
END;
$$ SET search_path = public;

-- RPC wrapper so client-side can call it after manual approval
-- Authorization: caller must be the new user, a team admin, or global admin
CREATE OR REPLACE FUNCTION create_welcome_post(
  new_user_id UUID,
  player_name TEXT,
  p_team_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  v_team_id := COALESCE(p_team_id, (
    SELECT team_id FROM team_members WHERE user_id = new_user_id LIMIT 1
  ));
  IF auth.uid() != new_user_id
    AND NOT is_team_admin(v_team_id)
    AND NOT is_global_admin()
  THEN
    RAISE EXCEPTION 'Access denied: cannot create welcome post for another user';
  END IF;

  PERFORM post_welcome_message(new_user_id, player_name, p_team_id);
END;
$$;

GRANT EXECUTE ON FUNCTION create_welcome_post(UUID, TEXT, UUID) TO authenticated;

-- ── Handle new user trigger (reads access/approved/player meta + team_slug) ──
-- Phase 5: Now reads team_slug from signup metadata and creates team_members row.
-- Fallback: if no team_slug but cricket access, uses the first available team.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_access TEXT;
  user_access TEXT[];
  user_features TEXT[];
  user_approved BOOLEAN;
  meta JSONB;
  v_team_id UUID;
  v_team_slug TEXT;
BEGIN
  raw_access := NEW.raw_user_meta_data->>'access';

  IF raw_access IS NOT NULL THEN
    user_access := ARRAY[raw_access];
  ELSE
    user_access := '{toolkit}';
  END IF;

  -- Set default features based on signup role
  IF raw_access = 'cricket' THEN
    user_features := '{cricket}';
  ELSE
    user_features := '{vibe-planner,id-tracker}';
  END IF;

  user_approved := COALESCE(
    (NEW.raw_user_meta_data->>'approved')::boolean,
    true
  );

  IF raw_access = 'cricket' THEN
    meta := jsonb_build_object(
      'jersey_number', NEW.raw_user_meta_data->>'jersey_number',
      'player_role', NEW.raw_user_meta_data->>'player_role',
      'batting_style', NEW.raw_user_meta_data->>'batting_style',
      'bowling_style', NEW.raw_user_meta_data->>'bowling_style',
      'shirt_size', NEW.raw_user_meta_data->>'shirt_size'
    );
  ELSE
    meta := NULL;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, access, approved, player_meta, features)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    user_access,
    user_approved,
    meta,
    user_features
  )
  ON CONFLICT (id) DO NOTHING;

  -- Team membership: resolve from signup metadata team_slug
  v_team_slug := NEW.raw_user_meta_data->>'team_slug';
  IF v_team_slug IS NOT NULL THEN
    SELECT id INTO v_team_id FROM cricket_teams WHERE slug = v_team_slug AND deleted_at IS NULL;
  END IF;

  -- Fallback: if no team_slug but cricket access, use the first available team
  IF v_team_id IS NULL AND raw_access = 'cricket' THEN
    SELECT id INTO v_team_id FROM cricket_teams WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- Create team membership
  IF v_team_id IS NOT NULL THEN
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (v_team_id, NEW.id, 'player')
    ON CONFLICT (team_id, user_id) DO NOTHING;
  END IF;

  -- Auto-approved cricket player: claim pre-added player record (team-scoped)
  IF raw_access = 'cricket' AND user_approved AND v_team_id IS NOT NULL THEN
    BEGIN
      UPDATE cricket_players
      SET user_id = NEW.id,
          name = COALESCE(NEW.raw_user_meta_data->>'full_name', name),
          jersey_number = COALESCE((NEW.raw_user_meta_data->>'jersey_number')::integer, jersey_number),
          player_role = COALESCE(NEW.raw_user_meta_data->>'player_role', player_role),
          batting_style = COALESCE(NEW.raw_user_meta_data->>'batting_style', batting_style),
          bowling_style = COALESCE(NEW.raw_user_meta_data->>'bowling_style', bowling_style),
          shirt_size = COALESCE(NEW.raw_user_meta_data->>'shirt_size', shirt_size),
          updated_at = now()
      WHERE lower(email) = lower(NEW.email) AND is_active = true AND team_id = v_team_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: player link failed for %: %', NEW.email, SQLERRM;
    END;

    -- Auto-post welcome message in Moments (wrapped so signup never fails)
    BEGIN
      PERFORM post_welcome_message(
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        v_team_id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: welcome post failed for %: %', NEW.email, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Reject user: fully removes from auth.users + profiles so they can re-signup ──
CREATE OR REPLACE FUNCTION reject_user(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM profiles WHERE id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION reject_user(UUID) TO authenticated;

-- ── Request cricket access for existing user (callable by anon) ──
-- Used when a toolkit user tries to sign up on cricket page.
-- Adds 'cricket' to access array, sets approved=false for admin review.
CREATE OR REPLACE FUNCTION request_cricket_access(check_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET access = array_append(access, 'cricket'),
      approved = false
  WHERE lower(email) = lower(check_email)
    AND NOT (access @> '{cricket}');
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION request_cricket_access(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION request_cricket_access(TEXT) TO authenticated;

-- ── Auto-approve: check if player email exists (team-scoped) ──
CREATE OR REPLACE FUNCTION check_cricket_player_email(
  check_email TEXT,
  p_team_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID := p_team_id;
BEGIN
  -- If no team specified, check across all teams (backward compat for signup)
  IF v_team_id IS NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM cricket_players WHERE lower(email) = lower(check_email) AND is_active = true
    );
  ELSE
    RETURN EXISTS (
      SELECT 1 FROM cricket_players WHERE lower(email) = lower(check_email) AND is_active = true AND team_id = v_team_id
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION check_cricket_player_email(TEXT, UUID) TO anon;

-- ── Public season data function (bypasses RLS, returns team_name) ──
CREATE OR REPLACE FUNCTION get_public_season_data(token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  season_rec RECORD;
  v_team_name TEXT;
BEGIN
  SELECT s.id, s.name, s.year, s.season_type, s.fee_amount, s.team_id
  INTO season_rec
  FROM cricket_seasons s
  WHERE s.share_token = token AND s.is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Season not found');
  END IF;

  SELECT name INTO v_team_name FROM cricket_teams WHERE id = season_rec.team_id;

  SELECT json_build_object(
    'team_name', COALESCE(v_team_name, 'Team'),
    'season', json_build_object(
      'name', season_rec.name, 'year', season_rec.year,
      'season_type', season_rec.season_type, 'fee_amount', season_rec.fee_amount
    ),
    'players', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', p.id, 'name', p.name, 'jersey_number', p.jersey_number,
        'player_role', p.player_role, 'designation', p.designation, 'is_active', p.is_active
      )), '[]'::json)
      FROM cricket_players p WHERE p.is_active = true AND p.team_id = season_rec.team_id
    ),
    'expenses', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', e.id, 'category', e.category, 'description', e.description,
        'amount', e.amount, 'expense_date', e.expense_date
      )), '[]'::json)
      FROM cricket_expenses e WHERE e.season_id = season_rec.id AND e.deleted_at IS NULL
    ),
    'fees', (
      SELECT COALESCE(json_agg(json_build_object(
        'player_id', f.player_id, 'amount_paid', f.amount_paid, 'paid_date', f.paid_date
      )), '[]'::json)
      FROM cricket_season_fees f WHERE f.season_id = season_rec.id
    ),
    'sponsorships', (
      SELECT COALESCE(json_agg(json_build_object(
        'sponsor_name', sp.sponsor_name, 'amount', sp.amount,
        'sponsored_date', sp.sponsored_date, 'notes', sp.notes
      )), '[]'::json)
      FROM cricket_sponsorships sp WHERE sp.season_id = season_rec.id AND sp.deleted_at IS NULL
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_season_data(UUID) TO anon;

-- ── Signed-up player emails (bypasses RLS, checks auth.users) ──
-- WHY: Player cards show signup status dots. Regular admins can't
--      read all profiles due to RLS, so this SECURITY DEFINER function
--      checks auth.users directly. Case-insensitive comparison.
CREATE OR REPLACE FUNCTION get_signed_up_emails(check_emails TEXT[])
RETURNS TEXT[] AS $$
  SELECT ARRAY(
    SELECT LOWER(email) FROM auth.users
    WHERE LOWER(email) = ANY(SELECT LOWER(unnest(check_emails)))
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── Consolidated Dashboard Data (performance: 13 queries → 1) ──
-- Returns all cricket dashboard data as a single JSON object.
-- Includes: players, seasons, expenses, splits, settlements, fees,
-- sponsorships, gallery (limited), tags, comments, likes, reactions,
-- notifications, admin_user_ids, signed_up_emails.
-- Gallery sub-tables scoped to visible_posts CTE (prevents unbounded loads).
-- Frontend falls back to 13 parallel queries if this RPC doesn't exist.
CREATE OR REPLACE FUNCTION get_dashboard_data(
  p_team_id UUID DEFAULT NULL,
  p_gallery_limit INTEGER DEFAULT 20
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  result JSON;
BEGIN
  v_team_id := COALESCE(p_team_id, (
    SELECT team_id FROM team_members WHERE user_id = auth.uid() ORDER BY joined_at ASC LIMIT 1
  ));
  IF v_team_id IS NULL THEN RETURN '{}'::json; END IF;
  IF NOT is_team_member(v_team_id) AND NOT is_global_admin() THEN RETURN '{}'::json; END IF;

  WITH visible_posts AS (
    SELECT id FROM cricket_gallery
    WHERE team_id = v_team_id AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT p_gallery_limit
  )
  SELECT json_build_object(
    'players', (SELECT COALESCE(json_agg(row ORDER BY row.created_at), '[]'::json) FROM (SELECT * FROM cricket_players WHERE team_id = v_team_id) row),
    'seasons', (SELECT COALESCE(json_agg(row ORDER BY row.year DESC), '[]'::json) FROM (SELECT * FROM cricket_seasons WHERE team_id = v_team_id) row),
    'expenses', (SELECT COALESCE(json_agg(row ORDER BY row.expense_date DESC), '[]'::json) FROM (SELECT * FROM cricket_expenses WHERE team_id = v_team_id) row),
    'splits', (SELECT COALESCE(json_agg(row ORDER BY row.expense_id), '[]'::json) FROM (SELECT s.* FROM cricket_expense_splits s JOIN cricket_expenses e ON s.expense_id = e.id WHERE e.team_id = v_team_id) row),
    'settlements', (SELECT COALESCE(json_agg(row ORDER BY row.settled_date DESC), '[]'::json) FROM (SELECT * FROM cricket_settlements WHERE team_id = v_team_id) row),
    'fees', (SELECT COALESCE(json_agg(row ORDER BY row.created_at), '[]'::json) FROM (SELECT * FROM cricket_season_fees WHERE team_id = v_team_id) row),
    'sponsorships', (SELECT COALESCE(json_agg(row ORDER BY row.created_at), '[]'::json) FROM (SELECT * FROM cricket_sponsorships WHERE team_id = v_team_id) row),
    'gallery', (SELECT COALESCE(json_agg(row ORDER BY row.created_at DESC), '[]'::json) FROM (SELECT * FROM cricket_gallery WHERE id IN (SELECT id FROM visible_posts) ORDER BY created_at DESC) row),
    'gallery_tags', (SELECT COALESCE(json_agg(row), '[]'::json) FROM (SELECT t.* FROM cricket_gallery_tags t WHERE t.post_id IN (SELECT id FROM visible_posts)) row),
    'gallery_comments', (SELECT COALESCE(json_agg(row ORDER BY row.created_at), '[]'::json) FROM (SELECT c.* FROM cricket_gallery_comments c WHERE c.post_id IN (SELECT id FROM visible_posts)) row),
    'gallery_likes', (SELECT COALESCE(json_agg(row), '[]'::json) FROM (SELECT l.* FROM cricket_gallery_likes l WHERE l.post_id IN (SELECT id FROM visible_posts)) row),
    'comment_reactions', (SELECT COALESCE(json_agg(row), '[]'::json) FROM (SELECT r.* FROM cricket_comment_reactions r JOIN cricket_gallery_comments c ON r.comment_id = c.id WHERE c.post_id IN (SELECT id FROM visible_posts)) row),
    'notifications', (SELECT COALESCE(json_agg(row ORDER BY row.created_at DESC), '[]'::json) FROM (SELECT * FROM cricket_notifications WHERE user_id = auth.uid() AND team_id = v_team_id ORDER BY created_at DESC LIMIT 50) row),
    'admin_user_ids', (SELECT COALESCE(json_agg(tm.user_id), '[]'::json) FROM team_members tm WHERE tm.team_id = v_team_id AND tm.role IN ('admin', 'owner')),
    'signed_up_emails', (SELECT COALESCE(json_agg(lower(au.email)), '[]'::json) FROM auth.users au WHERE lower(au.email) IN (SELECT lower(cp.email) FROM cricket_players cp WHERE cp.team_id = v_team_id AND cp.is_active = true AND cp.email IS NOT NULL))
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_data(UUID, INTEGER) TO authenticated;

-- ── Gallery (team photo feed per season) ─────────────────────

CREATE TABLE IF NOT EXISTS cricket_gallery (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID NOT NULL REFERENCES cricket_teams(id),
  season_id     UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url     TEXT,              -- first photo URL (backward compat); NULL for text-only posts
  photo_urls    TEXT[],            -- multi-photo array; NULL for legacy single-photo or text-only
  caption       TEXT,
  posted_by     TEXT,              -- player name (denormalized for display)
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_gallery ENABLE ROW LEVEL SECURITY;

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

CREATE INDEX IF NOT EXISTS idx_cricket_gallery_team    ON cricket_gallery(team_id);
CREATE INDEX IF NOT EXISTS idx_gallery_team_season     ON cricket_gallery(team_id, season_id);

-- Player tags on gallery posts (no team_id — access via parent join)
CREATE TABLE IF NOT EXISTS cricket_gallery_tags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES cricket_gallery(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES cricket_players(id) ON DELETE CASCADE,
  UNIQUE(post_id, player_id)
);

ALTER TABLE cricket_gallery_tags ENABLE ROW LEVEL SECURITY;

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

-- Comments on gallery posts
CREATE TABLE IF NOT EXISTS cricket_gallery_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID NOT NULL REFERENCES cricket_teams(id),
  post_id       UUID NOT NULL REFERENCES cricket_gallery(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_by    TEXT,              -- player name (denormalized)
  text          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_gallery_comments ENABLE ROW LEVEL SECURITY;

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

CREATE INDEX IF NOT EXISTS idx_gallery_comments_team ON cricket_gallery_comments(team_id);

-- Auto-populate team_id from parent gallery post
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

-- Likes on gallery posts (no team_id — access via parent join)
CREATE TABLE IF NOT EXISTS cricket_gallery_likes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES cricket_gallery(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  liked_by      TEXT,               -- player name (denormalized for display)
  UNIQUE(post_id, user_id)
);

ALTER TABLE cricket_gallery_likes ENABLE ROW LEVEL SECURITY;

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

-- Emoji reactions on comments (no team_id — access via parent join)
CREATE TABLE IF NOT EXISTS cricket_comment_reactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id    UUID NOT NULL REFERENCES cricket_gallery_comments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji         TEXT NOT NULL,       -- emoji character e.g. '🔥', '😂', '❤️', '👏', '💯'
  UNIQUE(comment_id, user_id, emoji)
);

ALTER TABLE cricket_comment_reactions ENABLE ROW LEVEL SECURITY;

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

-- Notifications for gallery activity (tags, comments, likes)
CREATE TABLE IF NOT EXISTS cricket_notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID NOT NULL REFERENCES cricket_teams(id),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id       UUID NOT NULL REFERENCES cricket_gallery(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,       -- 'tag' | 'comment' | 'like'
  message       TEXT NOT NULL,
  is_read       BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_notifications ENABLE ROW LEVEL SECURITY;

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

CREATE INDEX IF NOT EXISTS idx_notifications_team ON cricket_notifications(team_id);

-- Auto-populate team_id from parent gallery post
DROP TRIGGER IF EXISTS trg_set_notifications_team_id ON cricket_notifications;
CREATE TRIGGER trg_set_notifications_team_id
  BEFORE INSERT ON cricket_notifications FOR EACH ROW
  EXECUTE FUNCTION set_gallery_child_team_id();

-- ── Storage: gallery-photos bucket ──────────────────────────────
-- Public bucket, 5MB limit, image/* MIME types
-- Path pattern: {season_id}/{post_id}.jpg
-- Any cricket user can upload (team-shared, not restricted by user_id path)
-- NOTE: Storage policies still use has_cricket_access() — will be updated to
-- team-scoped in a future phase.

CREATE POLICY "Cricket users can view gallery photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'gallery-photos' AND has_cricket_access());

CREATE POLICY "Cricket users can upload gallery photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'gallery-photos' AND has_cricket_access());

CREATE POLICY "Cricket users can delete gallery photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'gallery-photos' AND has_cricket_access());

-- ── Storage: player-photos bucket ─────────────────────────────
-- WHY: Player photos stored in Supabase Storage. Bucket is public
--      for read access. Only the player themselves can upload/edit/delete
--      their own photo (matched by auth.uid() in the folder path).
-- Bucket: player-photos (public, 2MB limit, image/jpeg + image/png + image/webp)
-- Path pattern: {user_id}/{player_id}.jpg
-- NOTE: Storage policies still use has_cricket_access() — will be updated to
-- team-scoped in a future phase.

CREATE POLICY "Cricket users can view photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'player-photos' AND has_cricket_access());

CREATE POLICY "Players can upload own photo"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'player-photos' AND has_cricket_access() AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Players can update own photo"
ON storage.objects FOR UPDATE
USING (bucket_id = 'player-photos' AND has_cricket_access() AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Players can delete own photo"
ON storage.objects FOR DELETE
USING (bucket_id = 'player-photos' AND has_cricket_access() AND (storage.foldername(name))[1] = auth.uid()::text);
