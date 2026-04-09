-- ============================================================
-- Per-Team Approval Migration
-- ============================================================
-- Moves approval from global (profiles.approved) to per-team
-- (team_members.approved). Each team independently approves
-- members. Unapproved members can't access team data.
--
-- Pre-added players (email match) + existing multi-team players
-- are auto-approved. Unknown signups get approved = false and
-- team admins see them in "Pending Members" section.
-- ============================================================

-- ── Step 1: Add approved column to team_members ─────────────
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT true;

-- Backfill: all existing members are approved
UPDATE team_members SET approved = true WHERE approved IS NULL;

-- Index for pending member lookups (admins querying unapproved)
CREATE INDEX IF NOT EXISTS idx_team_members_pending
  ON team_members(team_id) WHERE approved = false;

-- Note: profiles.approved is kept in sync with team_members.approved
-- for backward compatibility with existing Shell.tsx PendingApprovals UI.
-- Do NOT blanket-approve all profiles — existing pending users should stay pending.

-- ── Step 1b: Make notifications.post_id nullable ────────────
-- Non-gallery notifications (join_request, approval) have no gallery post.
ALTER TABLE cricket_notifications ALTER COLUMN post_id DROP NOT NULL;

-- Update trigger to skip team_id derivation when post_id is NULL
CREATE OR REPLACE FUNCTION set_gallery_child_team_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.post_id IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.team_id := (SELECT team_id FROM cricket_gallery WHERE id = NEW.post_id);
  IF NEW.team_id IS NULL THEN
    RAISE EXCEPTION 'Cannot determine team_id from post %', NEW.post_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Step 2: Update helper functions ─────────────────────────

-- user_team_ids() — only returns APPROVED teams
-- This is the single chokepoint for ALL RLS policies.
-- Unapproved members are locked out of all team data automatically.
CREATE OR REPLACE FUNCTION user_team_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT team_id FROM public.team_members
  WHERE user_id = auth.uid() AND approved = true;
$$;

-- is_team_member() — only approved members count
CREATE OR REPLACE FUNCTION is_team_member(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid() AND approved = true
  );
$$;

-- is_team_admin() — add approved check for safety
CREATE OR REPLACE FUNCTION is_team_admin(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid()
      AND role IN ('owner', 'admin') AND approved = true
  );
$$;

-- ── Step 3: Update team_members RLS ─────────────────────────
-- Users must be able to see their OWN membership (including pending).
-- Without this, unapproved users can't even see they're pending.

DROP POLICY IF EXISTS "Members can read own team members" ON team_members;
CREATE POLICY "Members can read own team members"
  ON team_members FOR SELECT
  USING (
    team_id IN (SELECT * FROM user_team_ids())
    OR user_id = auth.uid()   -- can always see own rows (pending or approved)
    OR is_global_admin()
  );

-- Admin can update members (including approving) — already exists, no change needed
-- The existing update policy checks is_team_admin(team_id) AND user_id != auth.uid()

-- ── Step 4: Update accept_invite RPC ────────────────────────
-- Key change: set team_members.approved instead of profiles.approved

CREATE OR REPLACE FUNCTION accept_invite(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_user_email TEXT;
  v_is_pre_added BOOLEAN := false;
  v_is_existing_player BOOLEAN := false;
  v_needs_approval BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

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

  -- Check if player was pre-added by admin (email match on this team)
  v_is_pre_added := EXISTS (
    SELECT 1 FROM cricket_players
    WHERE team_id = v_invite.team_id
      AND lower(email) = lower(v_user_email)
      AND is_active = true
  );

  -- Check if player exists on any other team (already verified)
  v_is_existing_player := EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid()
      AND team_id != v_invite.team_id
      AND approved = true
  );

  -- Unknown player needs admin approval
  v_needs_approval := NOT v_is_pre_added AND NOT v_is_existing_player;

  -- Add user to team with per-team approval status
  -- DO UPDATE upgrades approved (never downgrades) for re-join after rejection
  INSERT INTO team_members (team_id, user_id, role, approved)
  VALUES (v_invite.team_id, auth.uid(), 'player', NOT v_needs_approval)
  ON CONFLICT (team_id, user_id) DO UPDATE
    SET approved = GREATEST(team_members.approved, EXCLUDED.approved);

  -- Add cricket access + features (but DON'T touch profiles.approved)
  UPDATE profiles
  SET access = CASE
    WHEN NOT (access @> '{cricket}') THEN array_append(access, 'cricket')
    ELSE access
  END,
  features = CASE
    WHEN NOT (features @> '{cricket}') THEN array_append(features, 'cricket')
    ELSE features
  END,
  -- Always ensure profiles.approved stays true (global access is no longer gated here)
  approved = true
  WHERE id = auth.uid();

  -- Increment use count
  UPDATE team_invites SET use_count = use_count + 1 WHERE id = v_invite.id;

  -- Link player record if pre-added
  IF v_is_pre_added THEN
    UPDATE cricket_players
    SET user_id = auth.uid()
    WHERE team_id = v_invite.team_id
      AND lower(email) = lower(v_user_email)
      AND is_active = true
      AND user_id IS NULL;
  END IF;

  -- Notify team admins about pending member
  IF v_needs_approval THEN
    INSERT INTO cricket_notifications (user_id, post_id, team_id, type, message)
    SELECT
      tm.user_id,
      NULL,  -- no gallery post for this notification type
      v_invite.team_id,
      'join_request',
      COALESCE(
        (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = auth.uid()),
        split_part(v_user_email, '@', 1)
      ) || ' wants to join the team'
    FROM team_members tm
    WHERE tm.team_id = v_invite.team_id
      AND tm.role IN ('owner', 'admin')
      AND tm.approved = true;
  END IF;

  RETURN json_build_object(
    'success', true,
    'team_id', v_invite.team_id,
    'team_name', v_invite.team_name,
    'team_slug', v_invite.team_slug,
    'pending_approval', v_needs_approval
  );
END;
$$;

GRANT EXECUTE ON FUNCTION accept_invite(UUID) TO authenticated;

-- ── Step 5: Update handle_new_user trigger ──────────────────
-- For cricket signups via direct signup (not invite), set team_members.approved
-- based on whether the player was pre-added.

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
  v_is_pre_added BOOLEAN := false;
BEGIN
  raw_access := NEW.raw_user_meta_data->>'access';

  IF raw_access IS NOT NULL THEN
    user_access := ARRAY[raw_access];
  ELSE
    user_access := '{toolkit}';
  END IF;

  IF raw_access = 'cricket' THEN
    user_features := '{cricket}';
  ELSE
    user_features := '{vibe-planner,id-tracker}';
  END IF;

  -- Per-team approval: never trust client-supplied 'approved' metadata.
  -- Non-cricket users are always approved. Cricket users derive approval from
  -- pre-added check (v_is_pre_added, checked below).
  user_approved := (raw_access IS NULL OR raw_access != 'cricket');

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

  -- profiles.approved synced with team approval (backward compat with Shell.tsx PendingApprovals)
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

  -- No fallback: signup without invite link → no team assigned.
  -- AuthGate requires invite links for cricket signup.

  -- Check if player was pre-added (email match on target team)
  IF v_team_id IS NOT NULL AND raw_access = 'cricket' THEN
    v_is_pre_added := EXISTS (
      SELECT 1 FROM cricket_players
      WHERE team_id = v_team_id AND lower(email) = lower(NEW.email) AND is_active = true
    );
  END IF;

  -- Create team membership with per-team approval
  IF v_team_id IS NOT NULL THEN
    INSERT INTO team_members (team_id, user_id, role, approved)
    VALUES (v_team_id, NEW.id, 'player', user_approved OR v_is_pre_added)
    ON CONFLICT (team_id, user_id) DO NOTHING;

    -- Notify team admins if pending approval
    IF NOT user_approved AND NOT v_is_pre_added THEN
      INSERT INTO cricket_notifications (user_id, post_id, team_id, type, message)
      SELECT
        tm.user_id,
        NULL,  -- no gallery post for this notification type
        v_team_id,
        'join_request',
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
          || ' wants to join the team'
      FROM team_members tm
      WHERE tm.team_id = v_team_id
        AND tm.role IN ('owner', 'admin')
        AND tm.approved = true;
    END IF;
  END IF;

  -- Auto-approved cricket player: claim pre-added player record (team-scoped)
  IF raw_access = 'cricket' AND (user_approved OR v_is_pre_added) AND v_team_id IS NOT NULL THEN
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

    -- Auto-post welcome message in Moments
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

-- ── Step 6: Approve member RPC ──────────────────────────────

CREATE OR REPLACE FUNCTION approve_team_member(
  p_team_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_player_name TEXT;
BEGIN
  -- Only team admins can approve
  IF NOT is_team_admin(p_team_id) AND NOT is_global_admin() THEN
    RAISE EXCEPTION 'Only team admins can approve members';
  END IF;

  -- Find the pending member
  SELECT tm.*, au.email, au.raw_user_meta_data->>'full_name' AS full_name
  INTO v_member
  FROM team_members tm
  JOIN auth.users au ON au.id = tm.user_id
  WHERE tm.team_id = p_team_id AND tm.user_id = p_user_id AND tm.approved = false;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'No pending member found');
  END IF;

  -- Approve
  UPDATE team_members
  SET approved = true
  WHERE team_id = p_team_id AND user_id = p_user_id;

  v_player_name := COALESCE(v_member.full_name, split_part(v_member.email, '@', 1));

  -- Create player record if none exists
  IF NOT EXISTS (
    SELECT 1 FROM cricket_players
    WHERE team_id = p_team_id AND user_id = p_user_id AND is_active = true
  ) THEN
    -- Check if there's a pre-added record by email
    IF EXISTS (
      SELECT 1 FROM cricket_players
      WHERE team_id = p_team_id AND lower(email) = lower(v_member.email) AND is_active = true AND user_id IS NULL
    ) THEN
      -- Link existing record
      UPDATE cricket_players
      SET user_id = p_user_id, updated_at = now()
      WHERE team_id = p_team_id AND lower(email) = lower(v_member.email) AND is_active = true AND user_id IS NULL;
    ELSE
      -- Create new player record
      INSERT INTO cricket_players (team_id, user_id, name, email, is_active, is_guest)
      VALUES (p_team_id, p_user_id, v_player_name, v_member.email, true, false);
    END IF;
  END IF;

  -- Create welcome post in gallery
  BEGIN
    PERFORM post_welcome_message(p_user_id, v_player_name, p_team_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'approve_team_member: welcome post failed: %', SQLERRM;
  END;

  -- Notify the approved member
  INSERT INTO cricket_notifications (user_id, post_id, team_id, type, message)
  VALUES (
    p_user_id,
    NULL,  -- no gallery post for this notification type
    p_team_id,
    'approval',
    'Welcome! Your request to join the team has been approved'
  );

  RETURN json_build_object(
    'success', true,
    'user_id', p_user_id,
    'player_name', v_player_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION approve_team_member(UUID, UUID) TO authenticated;

-- ── Step 7: Reject member RPC ───────────────────────────────

CREATE OR REPLACE FUNCTION reject_team_member(
  p_team_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only team admins can reject
  IF NOT is_team_admin(p_team_id) AND NOT is_global_admin() THEN
    RAISE EXCEPTION 'Only team admins can reject members';
  END IF;

  -- Must be a pending member
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND user_id = p_user_id AND approved = false
  ) THEN
    RETURN json_build_object('error', 'No pending member found');
  END IF;

  -- Remove the membership row
  DELETE FROM team_members
  WHERE team_id = p_team_id AND user_id = p_user_id AND approved = false;

  -- Clean up admin notifications about THIS specific user's join request
  DELETE FROM cricket_notifications
  WHERE team_id = p_team_id AND type = 'join_request'
    AND message LIKE (
      COALESCE(
        (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = p_user_id),
        split_part((SELECT email FROM auth.users WHERE id = p_user_id), '@', 1)
      ) || ' wants to join the team'
    );

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION reject_team_member(UUID, UUID) TO authenticated;

-- ── Step 8: Update get_dashboard_data to include pending members ──

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
  v_is_admin BOOLEAN;
  result JSON;
BEGIN
  v_team_id := COALESCE(p_team_id, (
    SELECT team_id FROM team_members
    WHERE user_id = auth.uid() AND approved = true
    ORDER BY joined_at ASC LIMIT 1
  ));
  IF v_team_id IS NULL THEN RETURN '{}'::json; END IF;
  IF NOT is_team_member(v_team_id) AND NOT is_global_admin() THEN RETURN '{}'::json; END IF;

  v_is_admin := is_team_admin(v_team_id) OR is_global_admin();

  WITH visible_posts AS (
    SELECT id FROM cricket_gallery
    WHERE team_id = v_team_id AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT p_gallery_limit
  )
  SELECT json_build_object(
    'players', (
      SELECT COALESCE(json_agg(row ORDER BY row.created_at), '[]'::json)
      FROM (SELECT * FROM cricket_players WHERE team_id = v_team_id) row
    ),
    'seasons', (
      SELECT COALESCE(json_agg(row ORDER BY row.year DESC), '[]'::json)
      FROM (SELECT * FROM cricket_seasons WHERE team_id = v_team_id) row
    ),
    'expenses', (
      SELECT COALESCE(json_agg(row ORDER BY row.expense_date DESC), '[]'::json)
      FROM (SELECT * FROM cricket_expenses WHERE team_id = v_team_id) row
    ),
    'splits', (
      SELECT COALESCE(json_agg(row ORDER BY row.expense_id), '[]'::json)
      FROM (
        SELECT s.* FROM cricket_expense_splits s
        JOIN cricket_expenses e ON s.expense_id = e.id
        WHERE e.team_id = v_team_id
      ) row
    ),
    'settlements', (
      SELECT COALESCE(json_agg(row ORDER BY row.settled_date DESC), '[]'::json)
      FROM (SELECT * FROM cricket_settlements WHERE team_id = v_team_id) row
    ),
    'fees', (
      SELECT COALESCE(json_agg(row ORDER BY row.created_at), '[]'::json)
      FROM (SELECT * FROM cricket_season_fees WHERE team_id = v_team_id) row
    ),
    'sponsorships', (
      SELECT COALESCE(json_agg(row ORDER BY row.created_at), '[]'::json)
      FROM (SELECT * FROM cricket_sponsorships WHERE team_id = v_team_id) row
    ),
    'gallery', (
      SELECT COALESCE(json_agg(row ORDER BY row.created_at DESC), '[]'::json)
      FROM (
        SELECT * FROM cricket_gallery
        WHERE id IN (SELECT id FROM visible_posts)
        ORDER BY created_at DESC
      ) row
    ),
    'gallery_tags', (
      SELECT COALESCE(json_agg(row), '[]'::json)
      FROM (
        SELECT t.* FROM cricket_gallery_tags t
        WHERE t.post_id IN (SELECT id FROM visible_posts)
      ) row
    ),
    'gallery_comments', (
      SELECT COALESCE(json_agg(row ORDER BY row.created_at), '[]'::json)
      FROM (
        SELECT c.* FROM cricket_gallery_comments c
        WHERE c.post_id IN (SELECT id FROM visible_posts)
      ) row
    ),
    'gallery_likes', (
      SELECT COALESCE(json_agg(row), '[]'::json)
      FROM (
        SELECT l.* FROM cricket_gallery_likes l
        WHERE l.post_id IN (SELECT id FROM visible_posts)
      ) row
    ),
    'comment_reactions', (
      SELECT COALESCE(json_agg(row), '[]'::json)
      FROM (
        SELECT r.* FROM cricket_comment_reactions r
        JOIN cricket_gallery_comments c ON r.comment_id = c.id
        WHERE c.post_id IN (SELECT id FROM visible_posts)
      ) row
    ),
    'notifications', (
      SELECT COALESCE(json_agg(row ORDER BY row.created_at DESC), '[]'::json)
      FROM (
        SELECT * FROM cricket_notifications
        WHERE user_id = auth.uid() AND team_id = v_team_id
        ORDER BY created_at DESC LIMIT 50
      ) row
    ),
    'admin_user_ids', (
      SELECT COALESCE(json_agg(tm.user_id), '[]'::json)
      FROM team_members tm
      WHERE tm.team_id = v_team_id AND tm.role IN ('admin', 'owner') AND tm.approved = true
    ),
    'signed_up_emails', (
      SELECT COALESCE(json_agg(lower(au.email)), '[]'::json)
      FROM auth.users au
      WHERE lower(au.email) IN (
        SELECT lower(cp.email) FROM cricket_players cp
        WHERE cp.team_id = v_team_id AND cp.is_active = true AND cp.email IS NOT NULL
      )
    ),
    -- Pending members (only populated for admins)
    'pending_members', CASE WHEN v_is_admin THEN (
      SELECT COALESCE(json_agg(json_build_object(
        'user_id', tm.user_id,
        'joined_at', tm.joined_at,
        'name', COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
        'email', au.email
      ) ORDER BY tm.joined_at ASC), '[]'::json)
      FROM team_members tm
      JOIN auth.users au ON au.id = tm.user_id
      WHERE tm.team_id = v_team_id AND tm.approved = false
    ) ELSE '[]'::json END
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_data(UUID, INTEGER) TO authenticated;

-- ── Step 9: Update notification type constraint ─────────────
-- Add 'join_request' and 'approval' to allowed notification types
-- (If there's a CHECK constraint on cricket_notifications.type, update it)
-- Note: The current schema uses TEXT type without a CHECK constraint,
-- so no ALTER needed. The TypeScript types need updating instead.

NOTIFY pgrst, 'reload schema';
