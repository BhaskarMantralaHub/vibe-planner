-- ============================================================================
-- SECURITY AUDIT FIXES
-- ============================================================================
-- Run in the Supabase SQL editor AFTER docs/membership-status-migration.sql
-- and docs/captain-team-admin-migration.sql. Idempotent — safe to re-run.
-- Verify with docs/security-audit-fixes-verification.sql (ends in ROLLBACK).
--
-- Sections are independent; each ships with the commit that needs it:
--   S1  profiles INSERT lockdown (was: a profile-less user could insert
--       is_admin=true / access={admin} for themselves)
-- ============================================================================


-- ============================================================
-- S1. profiles — no client INSERT at all
-- ============================================================
-- "Users can insert own profile" (auth-hardening A7) only bound id, so a user
-- whose profiles row was deleted (admin Reject used to delete ONLY the profile,
-- leaving auth.users alive) could re-insert it with is_admin=true and
-- access={admin}. Nothing in the app inserts profiles from the browser:
-- handle_new_user is SECURITY DEFINER and writes the row as the table owner,
-- which bypasses RLS. So the safest policy is none.

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Allow insert via trigger" ON profiles;
REVOKE INSERT ON public.profiles FROM anon, authenticated;


-- ============================================================
-- S2a. get_signed_up_emails — drop (anon-callable auth.users email oracle)
-- ============================================================
-- SECURITY DEFINER over auth.users with default PUBLIC EXECUTE and no caller
-- check: anyone with the public anon key could ask "does this email have an
-- account?". Nothing calls it any more — get_dashboard_data computes
-- signed_up_emails inline (per-team-approval-migration.sql:597).

DROP FUNCTION IF EXISTS public.get_signed_up_emails(TEXT[]);


-- ============================================================
-- S2b. cricclubs sync-lock RPCs — service_role only
-- ============================================================
-- Migration 009 revoked PUBLIC, but Supabase's default privileges grant
-- EXECUTE to anon/authenticated by name, so they must be revoked explicitly.
-- Only the edge function (service role) takes this lock.

REVOKE ALL ON FUNCTION public.acquire_cricclubs_sync_lock(TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_cricclubs_sync_lock(UUID, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_cricclubs_sync_lock(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_cricclubs_sync_lock(UUID, TEXT) TO service_role;


-- ============================================================
-- S2c. suggest_players — stop leaking other teams' / non-active people's PII
-- ============================================================
-- Supersedes docs/multi-team-player-suggest.sql. Changes:
--   * caller must be a team admin (the only UI is the admin Add Player form);
--   * 'member' branch: ACTIVE members only, email comes from THIS team's
--     profile (never from the person's roster row on another team);
--   * 'other_team' branch: email is no longer returned (the file's own
--     comment says "NO email - privacy" but the SELECT returned it).

CREATE OR REPLACE FUNCTION public.suggest_players(
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
    SELECT team_id FROM team_members
    WHERE user_id = auth.uid() AND status = 'active'
    ORDER BY joined_at ASC LIMIT 1
  ));
  IF v_team_id IS NULL THEN RETURN '[]'::json; END IF;
  IF NOT is_team_admin(v_team_id) AND NOT is_global_admin() THEN RETURN '[]'::json; END IF;

  v_query := replace(replace(trim(p_query), '%', '\%'), '_', '\_');

  SELECT COALESCE(json_agg(json_build_object(
    'source', sub.source, 'name', sub.name, 'email', sub.email,
    'jersey_number', sub.jersey_number, 'player_role', sub.player_role,
    'batting_style', sub.batting_style, 'bowling_style', sub.bowling_style,
    'shirt_size', sub.shirt_size, 'cricclub_id', sub.cricclub_id,
    'designation', sub.designation
  )), '[]'::json)
  INTO result
  FROM (
    SELECT
      'member' AS source,
      COALESCE(xp.name, p.full_name) AS name,
      p.email AS email,
      xp.jersey_number,
      xp.player_role,
      xp.batting_style,
      xp.bowling_style,
      xp.shirt_size,
      xp.cricclub_id,
      xp.designation
    FROM team_members tm
    JOIN profiles p ON p.id = tm.user_id
    LEFT JOIN cricket_players cp ON cp.user_id = tm.user_id AND cp.team_id = v_team_id AND cp.is_active = true
    LEFT JOIN LATERAL (
      SELECT * FROM cricket_players op
      WHERE op.user_id = tm.user_id AND op.team_id != v_team_id AND op.is_active = true
      ORDER BY op.updated_at DESC LIMIT 1
    ) xp ON true
    WHERE tm.team_id = v_team_id
      AND tm.status = 'active'
      AND cp.id IS NULL
      AND (p.full_name ILIKE '%' || v_query || '%' OR xp.name ILIKE '%' || v_query || '%')

    UNION ALL

    SELECT
      'other_team' AS source,
      cp.name,
      NULL::text AS email,
      cp.jersey_number,
      cp.player_role,
      cp.batting_style,
      cp.bowling_style,
      cp.shirt_size,
      cp.cricclub_id,
      cp.designation
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

REVOKE ALL ON FUNCTION public.suggest_players(TEXT, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.suggest_players(TEXT, UUID) TO authenticated;
