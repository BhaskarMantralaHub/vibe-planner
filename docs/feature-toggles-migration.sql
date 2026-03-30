-- ============================================================================
-- Feature Toggles Migration
-- ============================================================================
-- Platform: Supabase (PostgreSQL 15+)
-- Purpose: Adds per-user feature visibility, separate from role-based access.
-- Run AFTER: cricket-schema.sql
--
-- HOW TO USE:
-- 1. Go to SQL Editor → New Query
-- 2. Copy-paste this ENTIRE file and click Run
-- 3. After running, uncomment and run Step 4 with your superadmin email
--
-- NOTES:
-- - This file is idempotent — safe to run multiple times
-- - Uses IF NOT EXISTS for column, DO NOTHING patterns for data
-- - The `features` column controls which tools appear in the UI
-- - The existing `access` column continues to control RLS/role privileges
-- - Admin in `access` does NOT auto-grant feature visibility
-- ============================================================================


-- ============================================================================
-- STEP 1: Add features column to profiles
-- ============================================================================
-- WHY: Separates "what tools you see" (features) from "what data you can
--      access" (access/roles). This allows a cricket admin to manage data
--      without automatically seeing Vibe Planner or ID Tracker.
-- VALUES: 'vibe-planner', 'id-tracker', 'cricket'
-- DEFAULT: Empty array — the handle_new_user() trigger sets defaults on signup.
--          The app also derives features from access as a fallback for
--          pre-migration users who haven't had this column populated yet.
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS features text[] DEFAULT '{}';

-- WHY: Prevents invalid feature values from being written to the database.
--      The <@ ("is contained by") operator ensures every element in features
--      is a member of the allowed set. Protects against client-side bugs or
--      direct API calls writing arbitrary strings.
-- NOTE: Drop first to make this idempotent (safe to re-run).
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS valid_features;
ALTER TABLE profiles ADD CONSTRAINT valid_features
  CHECK (features <@ '{vibe-planner,id-tracker,cricket}'::text[]);


-- ============================================================================
-- STEP 2: Populate features for existing users
-- ============================================================================
-- WHY: Existing users need features populated based on their current access
--      roles so they don't lose tool visibility after this migration.
-- IDEMPOTENT: Only updates rows where features is empty or null.
--             Running this multiple times is safe — already-populated rows
--             are skipped by the WHERE clause.
-- MAPPING:
--   access @> '{toolkit}'  → features += {vibe-planner, id-tracker}
--   access @> '{cricket}'  → features += {cricket}
--   access @> '{toolkit,cricket}' → features = all three
-- ============================================================================
UPDATE profiles SET features =
  CASE
    WHEN access @> '{toolkit}' AND access @> '{cricket}' THEN '{vibe-planner,id-tracker,cricket}'::text[]
    WHEN access @> '{toolkit}' THEN '{vibe-planner,id-tracker}'::text[]
    WHEN access @> '{cricket}' THEN '{cricket}'::text[]
    ELSE '{}'::text[]
  END
WHERE features = '{}' OR features IS NULL;


-- ============================================================================
-- STEP 3: RLS policy — only super admin can update features column
-- ============================================================================
-- WHY: The existing "Admin can update all profiles" policy (in DATABASE_SCHEMA.sql)
--      allows any admin to update ANY column on profiles. Since this is a static
--      export app (no server-side code), we rely on the superadmin check in the
--      client-side admin page UI. The database-level RLS already requires
--      is_admin() for profile updates, which is sufficient — the superadmin
--      restriction is enforced at the UI layer (only the super admin email
--      sees the "Manage Features" option).
--
--      If stricter DB-level enforcement is needed in the future, add a trigger:
--
--      CREATE OR REPLACE FUNCTION enforce_features_update()
--      RETURNS TRIGGER AS $$
--      BEGIN
--        IF NEW.features IS DISTINCT FROM OLD.features THEN
--          -- Only allow if current user is the designated super admin
--          IF NOT EXISTS (
--            SELECT 1 FROM profiles
--            WHERE id = auth.uid()
--            AND email = current_setting('app.super_admin_email', true)
--          ) THEN
--            RAISE EXCEPTION 'Only super admin can update features';
--          END IF;
--        END IF;
--        RETURN NEW;
--      END;
--      $$ LANGUAGE plpgsql SECURITY DEFINER;
-- ============================================================================


-- ============================================================================
-- STEP 4: Grant superadmin all features
-- ============================================================================
-- WHY: The superadmin should see all tools by default.
-- HOW: Uncomment the line below and replace with the same email used for
--      NEXT_PUBLIC_SUPER_ADMIN_EMAIL in your .env.local file.
-- ============================================================================
-- UPDATE profiles SET features = '{vibe-planner,id-tracker,cricket}'::text[]
-- WHERE email = 'your-superadmin@email.com';
