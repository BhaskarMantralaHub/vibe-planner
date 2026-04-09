-- ============================================================
-- Deploy: Fix handle_new_user trigger for per-team approval
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Fix existing broken users
UPDATE profiles SET approved = false WHERE lower(email) IN ('topgunsplayer@gmail.com', 'saitesting@gmail.com') AND approved = false;

-- Redeploy the trigger with profiles.approved sync
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

  -- Never trust client-supplied 'approved' metadata.
  -- Non-cricket users always approved. Cricket users approved only if pre-added.
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

  -- Team membership: resolve from signup metadata team_slug
  v_team_slug := NEW.raw_user_meta_data->>'team_slug';
  IF v_team_slug IS NOT NULL THEN
    SELECT id INTO v_team_id FROM cricket_teams WHERE slug = v_team_slug AND deleted_at IS NULL;
  END IF;

  -- No fallback: signup without invite link = no team assigned

  -- Check if player was pre-added (email match on target team)
  IF v_team_id IS NOT NULL AND raw_access = 'cricket' THEN
    v_is_pre_added := EXISTS (
      SELECT 1 FROM cricket_players
      WHERE team_id = v_team_id AND lower(email) = lower(NEW.email) AND is_active = true
    );
    IF v_is_pre_added THEN
      user_approved := true;
    END IF;
  END IF;

  -- profiles.approved synced with team approval (Shell.tsx PendingApprovals reads this)
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

  -- Create team membership with per-team approval
  IF v_team_id IS NOT NULL THEN
    INSERT INTO team_members (team_id, user_id, role, approved)
    VALUES (v_team_id, NEW.id, 'player', user_approved)
    ON CONFLICT (team_id, user_id) DO NOTHING;

    -- Notify team admins if pending
    IF NOT user_approved THEN
      INSERT INTO cricket_notifications (user_id, post_id, team_id, type, message)
      SELECT
        tm.user_id, NULL, v_team_id, 'join_request',
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
          || ' wants to join the team'
      FROM team_members tm
      WHERE tm.team_id = v_team_id AND tm.role IN ('owner', 'admin') AND tm.approved = true;
    END IF;
  END IF;

  -- Auto-approved: claim player record + welcome post
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

NOTIFY pgrst, 'reload schema';
