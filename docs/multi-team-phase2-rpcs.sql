-- ============================================================
-- Multi-Team Phase 2: RPC Updates (Backward-Compatible)
-- ============================================================
-- All RPCs get optional team_id with auto-detection fallback.
-- Existing frontend (no team_id) continues working.
-- New frontend can pass team_id explicitly.
--
-- Strategy: COALESCE(p_team_id, user's first team) for every RPC.
-- Safe because all users currently have exactly 1 team.
-- ============================================================

BEGIN;

-- ── Shared helper: resolve team_id with fallback ────────────
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


-- ════════════════════════════════════════════════════════════
-- CRICKET-SCHEMA RPCs
-- ════════════════════════════════════════════════════════════

-- ── 1. post_welcome_message (internal, called by trigger + RPC) ──
-- Drop old 2-param signature to prevent overload ambiguity
DROP FUNCTION IF EXISTS post_welcome_message(UUID, TEXT);
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


-- ── 2. create_welcome_post (client-callable RPC wrapper) ──
-- Drop old 2-param signature to prevent overload ambiguity
DROP FUNCTION IF EXISTS create_welcome_post(UUID, TEXT);
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
  -- Authorization: caller must be the new user, a team admin, or global admin
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


-- ── 3. check_cricket_player_email (auto-approve check) ──
-- Drop old 1-param signature to prevent overload ambiguity
DROP FUNCTION IF EXISTS check_cricket_player_email(TEXT);
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


-- ── 4. get_public_season_data (token-based, no auth) ──
-- Already team-scoped via share_token → season → team. Adding team_name to response.
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


-- ── 5. get_signed_up_emails (unchanged — not team-scoped) ──
-- This checks auth.users, not cricket data. No team_id needed.


-- ── 6. request_cricket_access (unchanged for now) ──
-- This modifies profiles.access, not team-specific. Will be replaced
-- by team invite flow in Phase 5.


-- ── 7. reject_user (unchanged — platform-level operation) ──


-- ════════════════════════════════════════════════════════════
-- SCORING-SCHEMA RPCs
-- ════════════════════════════════════════════════════════════

-- ── 8. create_practice_match ──
-- Drop old signature first to avoid overload conflicts
DROP FUNCTION IF EXISTS create_practice_match(TEXT, DATE, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION create_practice_match(
  p_title TEXT,
  p_match_date DATE,
  p_overs INTEGER,
  p_team_a_name TEXT,
  p_team_b_name TEXT,
  p_toss_winner TEXT,
  p_toss_decision TEXT,
  p_scorer_name TEXT,
  p_batting_first TEXT,
  p_players JSONB,
  p_team_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  new_match_id UUID;
  batting_second TEXT;
  player_row JSONB;
  new_player_id UUID;
  guest_player_id UUID;
  guest_name TEXT;
  player_map JSONB := '[]'::jsonb;
  idx INTEGER := 0;
BEGIN
  v_team_id := resolve_team_id(p_team_id);
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Cannot determine team context';
  END IF;

  -- Access guard: must be member of this team
  IF NOT is_team_member(v_team_id) AND NOT is_global_admin() THEN
    RAISE EXCEPTION 'Access denied: not a member of this team';
  END IF;

  -- Input validation
  IF p_batting_first NOT IN ('team_a', 'team_b') THEN
    RAISE EXCEPTION 'Invalid batting_first: must be team_a or team_b';
  END IF;
  IF p_toss_winner IS NOT NULL AND p_toss_winner NOT IN ('team_a', 'team_b') THEN
    RAISE EXCEPTION 'Invalid toss_winner';
  END IF;
  IF p_toss_decision IS NOT NULL AND p_toss_decision NOT IN ('bat', 'bowl') THEN
    RAISE EXCEPTION 'Invalid toss_decision';
  END IF;
  IF p_players IS NULL OR jsonb_typeof(p_players) != 'array' THEN
    RAISE EXCEPTION 'p_players must be a JSON array';
  END IF;
  IF jsonb_array_length(p_players) > 30 THEN
    RAISE EXCEPTION 'Too many players: maximum 30';
  END IF;
  IF jsonb_array_length(p_players) < 2 THEN
    RAISE EXCEPTION 'At least 2 players required';
  END IF;

  batting_second := CASE WHEN p_batting_first = 'team_a' THEN 'team_b' ELSE 'team_a' END;

  INSERT INTO practice_matches (
    created_by, team_id, title, match_date, overs_per_innings,
    team_a_name, team_b_name, toss_winner, toss_decision,
    scorer_name, scorer_id, active_scorer_id, status, started_at
  ) VALUES (
    auth.uid(), v_team_id, p_title, p_match_date, p_overs,
    p_team_a_name, p_team_b_name, p_toss_winner, p_toss_decision,
    p_scorer_name, auth.uid(), auth.uid(), 'scoring', now()
  ) RETURNING id INTO new_match_id;

  FOR player_row IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    guest_player_id := NULL;

    IF COALESCE((player_row->>'is_guest')::BOOLEAN, false) THEN
      guest_name := player_row->>'name';
      IF length(guest_name) > 100 THEN
        RAISE EXCEPTION 'Guest player name too long: maximum 100 characters';
      END IF;

      -- Guest upsert now team-scoped
      INSERT INTO cricket_players (name, team_id, is_guest, is_active)
      VALUES (guest_name, v_team_id, true, true)
      ON CONFLICT ((lower(name)), team_id) WHERE is_guest = true AND is_active = true
      DO NOTHING
      RETURNING id INTO guest_player_id;

      IF guest_player_id IS NULL THEN
        SELECT id INTO guest_player_id
        FROM cricket_players
        WHERE lower(name) = lower(guest_name)
          AND team_id = v_team_id
          AND is_guest = true
          AND is_active = true;
      END IF;
    END IF;

    INSERT INTO practice_match_players (
      match_id, team, name, jersey_number, player_id, is_guest
    ) VALUES (
      new_match_id,
      player_row->>'team',
      player_row->>'name',
      (player_row->>'jersey_number')::INTEGER,
      CASE
        WHEN COALESCE((player_row->>'is_guest')::BOOLEAN, false) THEN guest_player_id
        WHEN player_row->>'player_id' IS NOT NULL AND player_row->>'player_id' != ''
          THEN (
            SELECT id FROM cricket_players
            WHERE id = (player_row->>'player_id')::UUID AND team_id = v_team_id
          )
        ELSE NULL
      END,
      COALESCE((player_row->>'is_guest')::BOOLEAN, false)
    ) RETURNING id INTO new_player_id;

    player_map := player_map || jsonb_build_array(jsonb_build_object('idx', idx, 'db_id', new_player_id));
    idx := idx + 1;
  END LOOP;

  INSERT INTO practice_innings (match_id, innings_number, batting_team)
  VALUES (new_match_id, 0, p_batting_first);
  INSERT INTO practice_innings (match_id, innings_number, batting_team)
  VALUES (new_match_id, 1, batting_second);

  RETURN json_build_object(
    'match_id', new_match_id,
    'player_map', player_map,
    'share_token', (SELECT share_token FROM practice_matches WHERE id = new_match_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_practice_match(TEXT, DATE, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated;


-- ── 9. get_match_history ──
DROP FUNCTION IF EXISTS get_match_history(TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_match_history(TEXT, INTEGER, INTEGER, DATE, DATE);

CREATE OR REPLACE FUNCTION get_match_history(
  match_status TEXT DEFAULT NULL,
  result_limit INTEGER DEFAULT 20,
  result_offset INTEGER DEFAULT 0,
  from_date DATE DEFAULT NULL,
  to_date DATE DEFAULT NULL,
  p_team_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  result JSON;
BEGIN
  v_team_id := resolve_team_id(p_team_id);
  IF v_team_id IS NULL THEN RETURN '[]'::json; END IF;
  IF NOT is_team_member(v_team_id) AND NOT is_global_admin() THEN RETURN '[]'::json; END IF;

  result_limit := LEAST(COALESCE(result_limit, 20), 100);
  result_offset := GREATEST(COALESCE(result_offset, 0), 0);

  SELECT COALESCE(json_agg(row ORDER BY row.match_date DESC, row.created_at DESC), '[]'::json)
  INTO result
  FROM (
    SELECT
      m.id, m.title, m.match_date, m.status, m.overs_per_innings,
      m.team_a_name, m.team_b_name, m.toss_winner, m.toss_decision,
      m.result_summary, m.match_winner, m.scorer_name,
      m.previous_match_id, m.match_number, m.share_token,
      m.started_at, m.completed_at, m.created_at,
      (SELECT json_build_object('batting_team', i.batting_team, 'total_runs', i.total_runs,
        'total_wickets', i.total_wickets, 'total_overs', i.total_overs)
       FROM practice_innings i WHERE i.match_id = m.id AND i.innings_number = 0) AS first_innings,
      (SELECT json_build_object('batting_team', i.batting_team, 'total_runs', i.total_runs,
        'total_wickets', i.total_wickets, 'total_overs', i.total_overs)
       FROM practice_innings i WHERE i.match_id = m.id AND i.innings_number = 1) AS second_innings
    FROM practice_matches m
    WHERE m.deleted_at IS NULL
      AND m.team_id = v_team_id
      AND (match_status IS NULL OR m.status = match_status)
      AND (from_date IS NULL OR m.match_date >= from_date)
      AND (to_date IS NULL OR m.match_date <= to_date)
    ORDER BY m.match_date DESC, m.created_at DESC
    LIMIT result_limit OFFSET result_offset
  ) row;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_match_history(TEXT, INTEGER, INTEGER, DATE, DATE, UUID) TO authenticated;


-- ── 10. get_match_scorecard (match-scoped, no team_id needed) ──
-- Already scoped by match_id. Team membership checked via RLS.
-- Adding team membership validation.
CREATE OR REPLACE FUNCTION get_match_scorecard(target_match_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  result JSON;
BEGIN
  SELECT team_id INTO v_team_id FROM practice_matches WHERE id = target_match_id;
  IF NOT is_team_member(v_team_id) AND NOT is_global_admin() THEN RETURN NULL; END IF;

  SELECT json_build_object(
    'match', (SELECT row_to_json(m) FROM practice_matches m WHERE m.id = target_match_id),
    'players', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', p.id, 'player_id', p.player_id, 'team', p.team,
        'name', p.name, 'jersey_number', p.jersey_number,
        'is_guest', p.is_guest, 'is_captain', p.is_captain
      ) ORDER BY p.team, p.created_at), '[]'::json)
      FROM practice_match_players p WHERE p.match_id = target_match_id
    ),
    'innings', (
      SELECT COALESCE(json_agg(json_build_object(
        'innings_number', i.innings_number, 'batting_team', i.batting_team,
        'total_runs', i.total_runs, 'total_wickets', i.total_wickets,
        'total_overs', i.total_overs, 'legal_balls', i.legal_balls,
        'extras_wide', i.extras_wide, 'extras_no_ball', i.extras_no_ball,
        'extras_bye', i.extras_bye, 'extras_leg_bye', i.extras_leg_bye,
        'striker_id', i.striker_id, 'non_striker_id', i.non_striker_id,
        'bowler_id', i.bowler_id,
        'target', i.target, 'is_completed', i.is_completed,
        'retired_players', COALESCE(i.retired_players, '[]'::jsonb)
      ) ORDER BY i.innings_number), '[]'::json)
      FROM practice_innings i WHERE i.match_id = target_match_id
    ),
    'balls', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', b.id, 'innings_number', b.innings_number, 'sequence', b.sequence,
        'over_number', b.over_number, 'ball_in_over', b.ball_in_over,
        'striker_id', b.striker_id, 'non_striker_id', b.non_striker_id, 'bowler_id', b.bowler_id,
        'runs_bat', b.runs_bat, 'runs_extras', b.runs_extras, 'extras_type', b.extras_type,
        'is_legal', b.is_legal, 'is_free_hit', b.is_free_hit,
        'is_wicket', b.is_wicket, 'wicket_type', b.wicket_type,
        'dismissed_id', b.dismissed_id, 'fielder_id', b.fielder_id
      ) ORDER BY b.innings_number, b.sequence), '[]'::json)
      FROM practice_balls b WHERE b.match_id = target_match_id AND b.deleted_at IS NULL
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_match_scorecard(UUID) TO authenticated;


-- ── 11. get_public_match_scorecard (unchanged — token-scoped, no auth) ──
-- Already safe: looks up match by share_token, no team_id needed.


-- ── 12. claim_scorer ──
CREATE OR REPLACE FUNCTION claim_scorer(
  target_match_id UUID,
  scorer_display_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  SELECT team_id INTO v_team_id FROM practice_matches WHERE id = target_match_id;
  IF NOT is_team_member(v_team_id) AND NOT is_global_admin() THEN RETURN FALSE; END IF;

  PERFORM 1 FROM practice_matches
  WHERE id = target_match_id FOR UPDATE NOWAIT;

  UPDATE practice_matches
  SET active_scorer_id = auth.uid(),
      scorer_name = scorer_display_name,
      scorer_heartbeat = now(),
      updated_at = now()
  WHERE id = target_match_id
    AND status IN ('setup', 'scoring', 'innings_break');
  RETURN FOUND;

EXCEPTION WHEN lock_not_available THEN
  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_scorer(UUID, TEXT) TO authenticated;


-- ── 13. release_scorer ──
CREATE OR REPLACE FUNCTION release_scorer(target_match_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  SELECT team_id INTO v_team_id FROM practice_matches WHERE id = target_match_id;
  IF NOT is_team_member(v_team_id) AND NOT is_global_admin() THEN RETURN FALSE; END IF;

  UPDATE practice_matches
  SET active_scorer_id = NULL, updated_at = now()
  WHERE id = target_match_id
    AND (
      active_scorer_id = auth.uid()
      OR created_by = auth.uid()
      OR is_team_admin(v_team_id)
      OR is_global_admin()
    );
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION release_scorer(UUID) TO authenticated;


-- ── 14. get_rematch_template ──
CREATE OR REPLACE FUNCTION get_rematch_template(source_match_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  SELECT team_id INTO v_team_id FROM practice_matches WHERE id = source_match_id;
  IF NOT is_team_member(v_team_id) AND NOT is_global_admin() THEN RETURN NULL; END IF;

  RETURN (
    SELECT json_build_object(
      'title', m.title,
      'overs_per_innings', m.overs_per_innings,
      'team_a_name', m.team_a_name,
      'team_b_name', m.team_b_name,
      'match_number', COALESCE(m.match_number, 1) + 1,
      'previous_match_id', m.id,
      'players', (
        SELECT json_agg(json_build_object(
          'team', p.team, 'name', p.name, 'jersey_number', p.jersey_number,
          'player_id', p.player_id, 'is_guest', p.is_guest
        ) ORDER BY p.team, p.created_at)
        FROM practice_match_players p WHERE p.match_id = m.id
      )
    )
    FROM practice_matches m WHERE m.id = source_match_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_rematch_template(UUID) TO authenticated;


-- ── 15. soft_delete_match ──
CREATE OR REPLACE FUNCTION soft_delete_match(
  target_match_id UUID,
  deleter_name TEXT DEFAULT 'Admin'
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  SELECT team_id INTO v_team_id FROM practice_matches WHERE id = target_match_id;
  IF NOT is_team_member(v_team_id) AND NOT is_global_admin() THEN RETURN FALSE; END IF;

  UPDATE practice_matches
  SET deleted_at = now(),
      deleted_by = deleter_name,
      updated_at = now()
  WHERE id = target_match_id
    AND deleted_at IS NULL
    AND (created_by = auth.uid() OR is_team_admin(v_team_id) OR is_global_admin());

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION soft_delete_match(UUID, TEXT) TO authenticated;


-- ── 16. restore_match ──
CREATE OR REPLACE FUNCTION restore_match(target_match_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  SELECT team_id INTO v_team_id FROM practice_matches WHERE id = target_match_id;
  IF NOT is_team_member(v_team_id) AND NOT is_global_admin() THEN RETURN FALSE; END IF;

  UPDATE practice_matches
  SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE id = target_match_id
    AND deleted_at IS NOT NULL
    AND (created_by = auth.uid() OR is_team_admin(v_team_id) OR is_global_admin());
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION restore_match(UUID) TO authenticated;


-- ── 17. permanent_delete_match ──
CREATE OR REPLACE FUNCTION permanent_delete_match(target_match_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  SELECT team_id INTO v_team_id FROM practice_matches WHERE id = target_match_id;
  IF NOT is_team_admin(v_team_id) AND NOT is_global_admin() THEN RETURN FALSE; END IF;

  DELETE FROM practice_matches
  WHERE id = target_match_id AND deleted_at IS NOT NULL;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION permanent_delete_match(UUID) TO authenticated;


-- ── 18. get_deleted_matches ──
-- Drop old 1-param signature to prevent overload ambiguity
DROP FUNCTION IF EXISTS get_deleted_matches(INTEGER);
CREATE OR REPLACE FUNCTION get_deleted_matches(
  result_limit INTEGER DEFAULT 20,
  p_team_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  result JSON;
BEGIN
  v_team_id := resolve_team_id(p_team_id);
  IF NOT is_team_admin(v_team_id) AND NOT is_global_admin() THEN RETURN '[]'::json; END IF;
  result_limit := LEAST(COALESCE(result_limit, 20), 50);

  SELECT COALESCE(json_agg(row ORDER BY row.deleted_at DESC), '[]'::json)
  INTO result
  FROM (
    SELECT
      m.id, m.title, m.match_date, m.status, m.overs_per_innings,
      m.team_a_name, m.team_b_name, m.result_summary, m.match_winner,
      m.scorer_name, m.deleted_at, m.deleted_by, m.created_at,
      (SELECT json_build_object('total_runs', i.total_runs, 'total_wickets', i.total_wickets, 'total_overs', i.total_overs)
       FROM practice_innings i WHERE i.match_id = m.id AND i.innings_number = 0) AS first_innings,
      (SELECT json_build_object('total_runs', i.total_runs, 'total_wickets', i.total_wickets, 'total_overs', i.total_overs)
       FROM practice_innings i WHERE i.match_id = m.id AND i.innings_number = 1) AS second_innings
    FROM practice_matches m
    WHERE m.deleted_at IS NOT NULL AND m.team_id = v_team_id
    ORDER BY m.deleted_at DESC
    LIMIT result_limit
  ) row;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_deleted_matches(INTEGER, UUID) TO authenticated;


-- ── 19. get_practice_leaderboard ──
DROP FUNCTION IF EXISTS get_practice_leaderboard(UUID, TEXT);
DROP FUNCTION IF EXISTS get_practice_leaderboard(UUID, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION get_practice_leaderboard(
  p_season_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT 'batting',
  p_match_limit INTEGER DEFAULT NULL,
  p_team_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  result JSON;
  match_ids UUID[];
BEGIN
  v_team_id := resolve_team_id(p_team_id);
  IF NOT is_team_member(v_team_id) AND NOT is_global_admin() THEN RETURN '[]'::json; END IF;

  IF p_category NOT IN ('batting', 'bowling', 'fielding', 'allround') THEN
    RAISE EXCEPTION 'Invalid category: must be batting, bowling, fielding, or allround';
  END IF;

  -- Resolve match IDs: team-scoped + optionally limited to last N
  IF p_match_limit IS NOT NULL THEN
    SELECT ARRAY(
      SELECT id FROM practice_matches
      WHERE status = 'completed' AND deleted_at IS NULL AND team_id = v_team_id
        AND (p_season_id IS NULL OR season_id = p_season_id)
      ORDER BY completed_at DESC NULLS LAST, created_at DESC
      LIMIT p_match_limit
    ) INTO match_ids;
  END IF;

  IF p_category = 'batting' THEN
    SELECT COALESCE(json_agg(row ORDER BY row.total_runs DESC), '[]'::json)
    INTO result
    FROM (
      SELECT
        cp.id AS player_id, cp.name, cp.photo_url, cp.is_guest,
        (SELECT COUNT(DISTINCT pmp2.match_id)
         FROM practice_match_players pmp2
         JOIN practice_matches m2 ON m2.id = pmp2.match_id
         WHERE pmp2.player_id = cp.id AND m2.status = 'completed' AND m2.deleted_at IS NULL
           AND m2.team_id = v_team_id
           AND (match_ids IS NULL OR m2.id = ANY(match_ids))
           AND (p_season_id IS NULL OR m2.season_id = p_season_id)
        ) AS matches,
        SUM(b.runs_bat) AS total_runs,
        COUNT(*) FILTER (WHERE b.is_legal OR b.extras_type = 'no_ball') AS balls_faced,
        CASE WHEN COUNT(*) FILTER (WHERE b.is_legal OR b.extras_type = 'no_ball') > 0
          THEN ROUND((SUM(b.runs_bat)::NUMERIC / COUNT(*) FILTER (WHERE b.is_legal OR b.extras_type = 'no_ball')) * 100, 1)
          ELSE 0 END AS strike_rate,
        SUM(CASE WHEN b.runs_bat = 4 THEN 1 ELSE 0 END) AS fours,
        SUM(CASE WHEN b.runs_bat = 6 THEN 1 ELSE 0 END) AS sixes
      FROM practice_balls b
      JOIN practice_match_players pmp ON pmp.id = b.striker_id
      JOIN cricket_players cp ON cp.id = pmp.player_id
      JOIN practice_matches m ON m.id = b.match_id
      WHERE b.deleted_at IS NULL AND m.status = 'completed' AND m.deleted_at IS NULL
        AND m.team_id = v_team_id
        AND (match_ids IS NULL OR m.id = ANY(match_ids))
        AND (p_season_id IS NULL OR m.season_id = p_season_id)
      GROUP BY cp.id, cp.name, cp.photo_url, cp.is_guest
      HAVING SUM(b.runs_bat) > 0
      ORDER BY total_runs DESC LIMIT 50
    ) row;

  ELSIF p_category = 'bowling' THEN
    SELECT COALESCE(json_agg(row ORDER BY row.total_wickets DESC, row.economy ASC), '[]'::json)
    INTO result
    FROM (
      SELECT
        cp.id AS player_id, cp.name, cp.photo_url, cp.is_guest,
        (SELECT COUNT(DISTINCT pmp2.match_id)
         FROM practice_match_players pmp2
         JOIN practice_matches m2 ON m2.id = pmp2.match_id
         WHERE pmp2.player_id = cp.id AND m2.status = 'completed' AND m2.deleted_at IS NULL
           AND m2.team_id = v_team_id
           AND (match_ids IS NULL OR m2.id = ANY(match_ids))
           AND (p_season_id IS NULL OR m2.season_id = p_season_id)
        ) AS matches,
        SUM(CASE WHEN b.is_wicket AND COALESCE(b.wicket_type, '') != 'retired' THEN 1 ELSE 0 END) AS total_wickets,
        COUNT(*) FILTER (WHERE b.is_legal) AS legal_balls,
        SUM(b.runs_bat + CASE WHEN b.extras_type IN ('wide', 'no_ball') THEN b.runs_extras ELSE 0 END) AS runs_conceded,
        CASE WHEN COUNT(*) FILTER (WHERE b.is_legal) > 0
          THEN ROUND((SUM(b.runs_bat + CASE WHEN b.extras_type IN ('wide', 'no_ball') THEN b.runs_extras ELSE 0 END)::NUMERIC / COUNT(*) FILTER (WHERE b.is_legal)) * 6, 2)
          ELSE 0 END AS economy,
        SUM(CASE WHEN b.extras_type = 'wide' THEN 1 ELSE 0 END) AS wides,
        SUM(CASE WHEN b.extras_type = 'no_ball' THEN 1 ELSE 0 END) AS no_balls
      FROM practice_balls b
      JOIN practice_match_players pmp ON pmp.id = b.bowler_id
      JOIN cricket_players cp ON cp.id = pmp.player_id
      JOIN practice_matches m ON m.id = b.match_id
      WHERE b.deleted_at IS NULL AND m.status = 'completed' AND m.deleted_at IS NULL
        AND m.team_id = v_team_id
        AND (match_ids IS NULL OR m.id = ANY(match_ids))
        AND (p_season_id IS NULL OR m.season_id = p_season_id)
      GROUP BY cp.id, cp.name, cp.photo_url, cp.is_guest
      HAVING COUNT(*) FILTER (WHERE b.is_legal) > 0
      ORDER BY total_wickets DESC, economy ASC LIMIT 50
    ) row;

  ELSIF p_category = 'fielding' THEN
    SELECT COALESCE(json_agg(row ORDER BY row.total_dismissals DESC, row.total_catches DESC), '[]'::json)
    INTO result
    FROM (
      SELECT
        cp.id AS player_id, cp.name, cp.photo_url, cp.is_guest,
        (SELECT COUNT(DISTINCT pmp2.match_id)
         FROM practice_match_players pmp2
         JOIN practice_matches m2 ON m2.id = pmp2.match_id
         WHERE pmp2.player_id = cp.id AND m2.status = 'completed' AND m2.deleted_at IS NULL
           AND m2.team_id = v_team_id
           AND (match_ids IS NULL OR m2.id = ANY(match_ids))
           AND (p_season_id IS NULL OR m2.season_id = p_season_id)
        ) AS matches,
        SUM(CASE WHEN b.wicket_type = 'caught' THEN 1 ELSE 0 END) AS total_catches,
        SUM(CASE WHEN b.wicket_type = 'run_out' THEN 1 ELSE 0 END) AS total_runouts,
        SUM(CASE WHEN b.wicket_type = 'stumped' THEN 1 ELSE 0 END) AS total_stumpings,
        COUNT(*) AS total_dismissals
      FROM practice_balls b
      JOIN practice_match_players pmp ON pmp.id = b.fielder_id
      JOIN cricket_players cp ON cp.id = pmp.player_id
      JOIN practice_matches m ON m.id = b.match_id
      WHERE b.deleted_at IS NULL AND b.is_wicket = true AND b.fielder_id IS NOT NULL
        AND m.status = 'completed' AND m.deleted_at IS NULL
        AND m.team_id = v_team_id
        AND (match_ids IS NULL OR m.id = ANY(match_ids))
        AND (p_season_id IS NULL OR m.season_id = p_season_id)
      GROUP BY cp.id, cp.name, cp.photo_url, cp.is_guest
      ORDER BY total_dismissals DESC, total_catches DESC LIMIT 50
    ) row;

  ELSE -- allround
    SELECT COALESCE(json_agg(row ORDER BY row.score DESC), '[]'::json)
    INTO result
    FROM (
      SELECT
        cp.id AS player_id, cp.name, cp.photo_url, cp.is_guest,
        COALESCE(match_count.matches, 0) AS matches,
        COALESCE(bat.total_runs, 0) AS total_runs,
        COALESCE(bowl.total_wickets, 0) AS total_wickets,
        COALESCE(field.total_catches, 0) AS total_catches,
        COALESCE(bat.total_runs, 0) + COALESCE(bowl.total_wickets, 0) * 25 + COALESCE(field.total_catches, 0) * 10 AS score
      FROM cricket_players cp
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT m.id) AS matches
        FROM practice_match_players pmp
        JOIN practice_matches m ON m.id = pmp.match_id
        WHERE pmp.player_id = cp.id AND m.status = 'completed' AND m.deleted_at IS NULL
          AND m.team_id = v_team_id
          AND (match_ids IS NULL OR m.id = ANY(match_ids))
          AND (p_season_id IS NULL OR m.season_id = p_season_id)
      ) match_count ON true
      LEFT JOIN LATERAL (
        SELECT SUM(b.runs_bat) AS total_runs
        FROM practice_balls b JOIN practice_match_players pmp ON pmp.id = b.striker_id
        JOIN practice_matches m ON m.id = b.match_id
        WHERE pmp.player_id = cp.id AND b.deleted_at IS NULL AND m.status = 'completed' AND m.deleted_at IS NULL
          AND m.team_id = v_team_id
          AND (match_ids IS NULL OR m.id = ANY(match_ids))
          AND (p_season_id IS NULL OR m.season_id = p_season_id)
      ) bat ON true
      LEFT JOIN LATERAL (
        SELECT SUM(CASE WHEN b.is_wicket AND COALESCE(b.wicket_type, '') != 'retired' THEN 1 ELSE 0 END) AS total_wickets
        FROM practice_balls b JOIN practice_match_players pmp ON pmp.id = b.bowler_id
        JOIN practice_matches m ON m.id = b.match_id
        WHERE pmp.player_id = cp.id AND b.deleted_at IS NULL AND m.status = 'completed' AND m.deleted_at IS NULL
          AND m.team_id = v_team_id
          AND (match_ids IS NULL OR m.id = ANY(match_ids))
          AND (p_season_id IS NULL OR m.season_id = p_season_id)
      ) bowl ON true
      LEFT JOIN LATERAL (
        SELECT SUM(CASE WHEN b.wicket_type = 'caught' THEN 1 ELSE 0 END) AS total_catches
        FROM practice_balls b JOIN practice_match_players pmp ON pmp.id = b.fielder_id
        JOIN practice_matches m ON m.id = b.match_id
        WHERE pmp.player_id = cp.id AND b.deleted_at IS NULL AND b.is_wicket = true
          AND m.status = 'completed' AND m.deleted_at IS NULL
          AND m.team_id = v_team_id
          AND (match_ids IS NULL OR m.id = ANY(match_ids))
          AND (p_season_id IS NULL OR m.season_id = p_season_id)
      ) field ON true
      WHERE cp.is_active = true AND cp.team_id = v_team_id
        AND (COALESCE(bat.total_runs, 0) + COALESCE(bowl.total_wickets, 0) + COALESCE(field.total_catches, 0)) > 0
      ORDER BY score DESC LIMIT 50
    ) row;
  END IF;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_practice_leaderboard(UUID, TEXT, INTEGER, UUID) TO authenticated;


-- ── 20. get_guest_suggestions ──
-- Drop old 0-param signature to prevent overload ambiguity
DROP FUNCTION IF EXISTS get_guest_suggestions();
CREATE OR REPLACE FUNCTION get_guest_suggestions(p_team_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  result JSON;
BEGIN
  v_team_id := resolve_team_id(p_team_id);
  IF NOT is_team_member(v_team_id) AND NOT is_global_admin() THEN RETURN '[]'::json; END IF;

  SELECT COALESCE(json_agg(
    json_build_object('id', cp.id, 'name', cp.name)
    ORDER BY cp.name
  ), '[]'::json)
  INTO result
  FROM cricket_players cp
  WHERE cp.is_guest = true AND cp.is_active = true AND cp.team_id = v_team_id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_guest_suggestions(UUID) TO authenticated;


-- ── 21. revert_match_to_scoring ──
CREATE OR REPLACE FUNCTION revert_match_to_scoring(target_match_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  SELECT team_id INTO v_team_id FROM practice_matches WHERE id = target_match_id;
  IF NOT is_team_admin(v_team_id) AND NOT is_global_admin() THEN RETURN FALSE; END IF;

  UPDATE practice_matches
  SET result_summary = NULL,
      match_winner = NULL,
      completed_at = NULL,
      updated_at = now(),
      status = CASE
        WHEN (SELECT striker_id FROM practice_innings WHERE match_id = target_match_id AND innings_number = 1) IS NOT NULL
        THEN 'scoring'
        WHEN (SELECT is_completed FROM practice_innings WHERE match_id = target_match_id AND innings_number = 0)
        THEN 'innings_break'
        ELSE 'scoring'
      END,
      current_innings = CASE
        WHEN (SELECT striker_id FROM practice_innings WHERE match_id = target_match_id AND innings_number = 1) IS NOT NULL
        THEN 1
        ELSE 0
      END
  WHERE id = target_match_id
    AND status = 'completed'
    AND match_winner IS NULL
    AND deleted_at IS NULL;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION revert_match_to_scoring(UUID) TO authenticated;


-- ── 22. promote_guest_to_roster ──
DROP FUNCTION IF EXISTS promote_guest_to_roster(UUID, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION promote_guest_to_roster(
  target_player_id UUID,
  p_jersey_number INTEGER DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  SELECT team_id INTO v_team_id FROM cricket_players WHERE id = target_player_id;
  IF NOT is_team_admin(v_team_id) AND NOT is_global_admin() THEN RETURN FALSE; END IF;

  -- Check email uniqueness within the team
  IF p_email IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM cricket_players
      WHERE lower(email) = lower(p_email) AND id != target_player_id
        AND is_active = true AND team_id = v_team_id
    ) THEN
      RAISE EXCEPTION 'Email already belongs to another player on this team';
    END IF;
  END IF;

  UPDATE cricket_players
  SET is_guest = false,
      jersey_number = COALESCE(p_jersey_number, jersey_number),
      phone = COALESCE(p_phone, phone),
      email = COALESCE(p_email, email),
      updated_at = now()
  WHERE id = target_player_id
    AND is_guest = true
    AND is_active = true;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION promote_guest_to_roster(UUID, INTEGER, TEXT, TEXT) TO authenticated;


-- Refresh PostgREST schema cache (picks up new function signatures)
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ════════════════════════════════════════════════════════════
-- NOTES
-- ════════════════════════════════════════════════════════════
-- RPCs NOT updated (no team_id needed):
--   - get_signed_up_emails: checks auth.users, not cricket data
--   - request_cricket_access: modifies profiles.access (will be replaced by team invite)
--   - reject_user: platform-level operation
--   - get_public_match_scorecard: token-scoped, no auth
--
-- Backward compatibility:
--   - All RPCs with new p_team_id param default to NULL
--   - resolve_team_id() auto-detects from user's team membership
--   - Existing frontend calls (no team_id) continue working
--   - New frontend can pass team_id explicitly
--
-- Function signature changes (may need GRANT updates):
--   - create_practice_match: added p_team_id UUID param
--   - get_match_history: added p_team_id UUID param
--   - get_deleted_matches: added p_team_id UUID param
--   - get_practice_leaderboard: added p_team_id UUID param
--   - get_guest_suggestions: added p_team_id UUID param
--   - create_welcome_post: added p_team_id UUID param
--   - check_cricket_player_email: added p_team_id UUID param
