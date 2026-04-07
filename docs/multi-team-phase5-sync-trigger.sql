-- ============================================================
-- Phase 5 addendum: Player sync trigger + suggest_players RPC
-- Run AFTER multi-team-phase5-onboarding.sql (already deployed)
-- ============================================================

BEGIN;

-- ── Global Player Profile Sync Trigger ──────────────────────
-- When a player's profile fields change on one team, sync to all
-- their records on other teams (same user_id). Team-specific fields
-- (is_guest, is_active, team_id) are NOT synced.
-- Syncs GLOBAL player fields across all team records with same user_id.
-- NOT synced (team-specific): jersey_number, designation, is_guest, is_active, team_id
-- Recursion safety: pg_trigger_depth() guard prevents re-entrant cascade.
-- SECURITY DEFINER needed to bypass RLS for cross-team writes.
CREATE OR REPLACE FUNCTION sync_player_profile_across_teams()
RETURNS TRIGGER AS $$
BEGIN
  -- Guard: skip if not the original trigger (prevents cascade)
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  -- Guard: skip unlinked players
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  -- Guard: skip if user_id was reassigned (prevents hijacking another player's records)
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RETURN NEW; END IF;

  -- Only sync if global fields actually changed
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

  -- Propagate global fields to all other records with same user_id
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

-- ── Player Suggestion RPC (autocomplete) ────────────────────
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

NOTIFY pgrst, 'reload schema';

COMMIT;
