-- Migration: Update handle_new_user() to claim cricket_players record at signup
-- When an auto-approved cricket player signs up, this trigger now:
--   1. Links user_id to the pre-added player record
--   2. Overwrites admin data with player's own signup preferences
-- SECURITY DEFINER bypasses RLS, so this works even though the player isn't admin

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_access TEXT;
  user_access TEXT[];
  user_approved BOOLEAN;
  meta JSONB;
BEGIN
  raw_access := NEW.raw_user_meta_data->>'access';

  IF raw_access IS NOT NULL THEN
    user_access := ARRAY[raw_access];
  ELSE
    user_access := '{toolkit}';
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

  INSERT INTO public.profiles (id, email, full_name, access, approved, player_meta)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    user_access,
    user_approved,
    meta
  );

  -- Auto-approved cricket player: claim pre-added player record
  -- Links user_id and overwrites with player's own signup preferences
  IF raw_access = 'cricket' AND user_approved THEN
    UPDATE cricket_players
    SET user_id = NEW.id,
        name = COALESCE(NEW.raw_user_meta_data->>'full_name', name),
        jersey_number = COALESCE((NEW.raw_user_meta_data->>'jersey_number')::integer, jersey_number),
        player_role = COALESCE(NEW.raw_user_meta_data->>'player_role', player_role),
        batting_style = COALESCE(NEW.raw_user_meta_data->>'batting_style', batting_style),
        bowling_style = COALESCE(NEW.raw_user_meta_data->>'bowling_style', bowling_style),
        shirt_size = COALESCE(NEW.raw_user_meta_data->>'shirt_size', shirt_size),
        updated_at = now()
    WHERE lower(email) = lower(NEW.email) AND is_active = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
