-- ============================================================
-- Multi-Team Phase 5: Team Onboarding (Invites + Signup Flow)
-- ============================================================
-- Adds invite link infrastructure and updates handle_new_user
-- trigger to auto-create team_members rows on signup.
-- ============================================================

BEGIN;

-- ── Team Invites Table ──────────────────────────────────────
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
-- Adds user to team, increments invite use_count
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

-- ── Create Team (admin-only for now) ────────────────────────
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

-- ── Update handle_new_user trigger ──────────────────────────
-- Now reads team_slug from signup metadata and creates team_members row
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

-- Add team_invites to backup (reminder — also update backup.yml + restore.yml)

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
