-- ============================================================
-- Migration: Make cricket data shared (team-wide, not per-user)
-- ============================================================
-- All cricket users can READ all cricket data.
-- Only admin users can INSERT/UPDATE/DELETE.
-- user_id is kept for audit trail (who created the record).

-- Helper: check if current user has cricket access
CREATE OR REPLACE FUNCTION has_cricket_access()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND access @> '{cricket}'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION is_cricket_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND access @> '{admin}'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ── cricket_players ────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own players" ON cricket_players;

CREATE POLICY "Cricket users can read players"
  ON cricket_players FOR SELECT
  USING (has_cricket_access());

CREATE POLICY "Admin can manage players"
  ON cricket_players FOR INSERT
  WITH CHECK (is_cricket_admin());

CREATE POLICY "Admin can update players"
  ON cricket_players FOR UPDATE
  USING (is_cricket_admin());

CREATE POLICY "Admin can delete players"
  ON cricket_players FOR DELETE
  USING (is_cricket_admin());

-- ── cricket_seasons ────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own seasons" ON cricket_seasons;

CREATE POLICY "Cricket users can read seasons"
  ON cricket_seasons FOR SELECT
  USING (has_cricket_access());

CREATE POLICY "Admin can manage seasons"
  ON cricket_seasons FOR INSERT
  WITH CHECK (is_cricket_admin());

CREATE POLICY "Admin can update seasons"
  ON cricket_seasons FOR UPDATE
  USING (is_cricket_admin());

CREATE POLICY "Admin can delete seasons"
  ON cricket_seasons FOR DELETE
  USING (is_cricket_admin());

-- ── cricket_expenses ───────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own expenses" ON cricket_expenses;

CREATE POLICY "Cricket users can read expenses"
  ON cricket_expenses FOR SELECT
  USING (has_cricket_access());

CREATE POLICY "Admin can manage expenses"
  ON cricket_expenses FOR INSERT
  WITH CHECK (is_cricket_admin());

CREATE POLICY "Admin can update expenses"
  ON cricket_expenses FOR UPDATE
  USING (is_cricket_admin());

CREATE POLICY "Admin can delete expenses"
  ON cricket_expenses FOR DELETE
  USING (is_cricket_admin());

-- ── cricket_expense_splits ─────────────────────────────────
DROP POLICY IF EXISTS "Users manage splits through parent expense" ON cricket_expense_splits;

CREATE POLICY "Cricket users can read splits"
  ON cricket_expense_splits FOR SELECT
  USING (has_cricket_access());

CREATE POLICY "Admin can manage splits"
  ON cricket_expense_splits FOR INSERT
  WITH CHECK (is_cricket_admin());

CREATE POLICY "Admin can delete splits"
  ON cricket_expense_splits FOR DELETE
  USING (is_cricket_admin());

-- ── cricket_settlements ────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own settlements" ON cricket_settlements;

CREATE POLICY "Cricket users can read settlements"
  ON cricket_settlements FOR SELECT
  USING (has_cricket_access());

CREATE POLICY "Admin can manage settlements"
  ON cricket_settlements FOR INSERT
  WITH CHECK (is_cricket_admin());

CREATE POLICY "Admin can delete settlements"
  ON cricket_settlements FOR DELETE
  USING (is_cricket_admin());

-- ── Update public season data function ─────────────────────
-- Remove user_id filter since data is now team-wide
CREATE OR REPLACE FUNCTION get_public_season_data(token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  season_rec RECORD;
BEGIN
  SELECT id, name, year, season_type
  INTO season_rec
  FROM cricket_seasons
  WHERE share_token = token AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Season not found');
  END IF;

  SELECT json_build_object(
    'season', json_build_object(
      'name', season_rec.name,
      'year', season_rec.year,
      'season_type', season_rec.season_type
    ),
    'players', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', p.id, 'name', p.name, 'jersey_number', p.jersey_number,
        'player_role', p.player_role, 'batting_style', p.batting_style,
        'bowling_style', p.bowling_style, 'designation', p.designation,
        'is_active', p.is_active
      )), '[]'::json)
      FROM cricket_players p WHERE p.is_active = true
    ),
    'expenses', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', e.id, 'paid_by', e.paid_by, 'category', e.category,
        'description', e.description, 'amount', e.amount, 'expense_date', e.expense_date
      )), '[]'::json)
      FROM cricket_expenses e WHERE e.season_id = season_rec.id
    ),
    'splits', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', s.id, 'expense_id', s.expense_id, 'player_id', s.player_id,
        'share_amount', s.share_amount
      )), '[]'::json)
      FROM cricket_expense_splits s
      WHERE s.expense_id IN (SELECT id FROM cricket_expenses WHERE season_id = season_rec.id)
    ),
    'settlements', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', st.id, 'from_player', st.from_player, 'to_player', st.to_player,
        'amount', st.amount, 'settled_date', st.settled_date
      )), '[]'::json)
      FROM cricket_settlements st WHERE st.season_id = season_rec.id
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_season_data(UUID) TO anon;
