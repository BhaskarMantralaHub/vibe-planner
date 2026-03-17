-- ============================================================
-- Cricket Signup Enhancement — Migration
-- ============================================================
-- Adds player_meta JSONB column to profiles table and updates
-- the handle_new_user() trigger to store player signup data.
-- Run this in Supabase SQL Editor.

-- ── 1. Add player_meta column to profiles ────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS player_meta JSONB DEFAULT NULL;

-- ── 2. Update handle_new_user() trigger ──────────────────────
-- This trigger fires on auth.users INSERT and creates a profile.
-- Updated to also save player metadata from raw_user_meta_data.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, access, approved, player_meta)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN NEW.raw_user_meta_data->>'access' IS NOT NULL
      THEN ARRAY[NEW.raw_user_meta_data->>'access']
      ELSE '{toolkit}'
    END,
    COALESCE((NEW.raw_user_meta_data->>'approved')::boolean, true),
    -- Build player_meta JSON only if player_role is present (cricket signup)
    CASE
      WHEN NEW.raw_user_meta_data->>'player_role' IS NOT NULL THEN
        jsonb_build_object(
          'jersey_number', (NEW.raw_user_meta_data->>'jersey_number')::integer,
          'player_role', NEW.raw_user_meta_data->>'player_role',
          'batting_style', NEW.raw_user_meta_data->>'batting_style',
          'bowling_style', NEW.raw_user_meta_data->>'bowling_style',
          'shirt_size', NEW.raw_user_meta_data->>'shirt_size'
        )
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
