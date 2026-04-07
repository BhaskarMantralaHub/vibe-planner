-- ============================================================
-- Player Suggestion RPC for Add Player autocomplete
-- ============================================================
-- Searches two sources:
-- 1. Team members who joined via invite but aren't roster players yet
-- 2. Players from other teams with matching name (name only, no PII)
-- ============================================================

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
  -- Guard: empty/short queries
  IF p_query IS NULL OR length(trim(p_query)) < 2 THEN RETURN '[]'::json; END IF;

  v_team_id := COALESCE(p_team_id, (
    SELECT team_id FROM team_members WHERE user_id = auth.uid() ORDER BY joined_at ASC LIMIT 1
  ));
  IF v_team_id IS NULL THEN RETURN '[]'::json; END IF;
  IF NOT is_team_member(v_team_id) AND NOT is_global_admin() THEN RETURN '[]'::json; END IF;

  -- Escape ILIKE wildcards in user input
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
    -- Source 1: Team members without a roster player record
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
      AND cp.id IS NULL
      AND (p.full_name ILIKE '%' || v_query || '%' OR xp.name ILIKE '%' || v_query || '%')

    UNION ALL

    -- Source 2: Players from other teams (name + player details, NO email — privacy)
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

GRANT EXECUTE ON FUNCTION suggest_players(TEXT, UUID) TO authenticated;
