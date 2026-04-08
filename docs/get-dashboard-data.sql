-- ============================================================
-- Performance: Consolidated Dashboard RPC
-- Replaces 13 parallel queries with 1 round-trip
-- ============================================================

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
  result JSON;
BEGIN
  v_team_id := COALESCE(p_team_id, (
    SELECT team_id FROM team_members WHERE user_id = auth.uid() ORDER BY joined_at ASC LIMIT 1
  ));
  IF v_team_id IS NULL THEN RETURN '{}'::json; END IF;
  IF NOT is_team_member(v_team_id) AND NOT is_global_admin() THEN RETURN '{}'::json; END IF;

  -- Visible gallery posts (scoped to limit) — used by sub-table JOINs
  -- This prevents gallery_tags/likes/reactions from loading ALL posts
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
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_data(UUID, INTEGER) TO authenticated;
NOTIFY pgrst, 'reload schema';
