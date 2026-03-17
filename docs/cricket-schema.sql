-- ============================================================
-- Cricket Team Expenses — Database Schema (Shared Team Model)
-- ============================================================
-- All cricket data is team-wide. Any user with 'cricket' access
-- can read. Only users with 'admin' access can create/edit/delete.
-- user_id is kept on records for audit trail only.

-- ── Helper functions ───────────────────────────────────────
CREATE OR REPLACE FUNCTION has_cricket_access()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND access @> '{cricket}'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_cricket_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND access @> '{admin}'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ── Players ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cricket_players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  jersey_number INTEGER,
  phone         TEXT,
  player_role   TEXT,
  batting_style TEXT,
  bowling_style TEXT,
  cricclub_id   TEXT,
  shirt_size    TEXT,
  email         TEXT,
  designation   TEXT,     -- 'captain' | 'vice-captain'
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read players" ON cricket_players FOR SELECT USING (has_cricket_access());
CREATE POLICY "Admin can manage players" ON cricket_players FOR INSERT WITH CHECK (is_cricket_admin());
CREATE POLICY "Admin can update players" ON cricket_players FOR UPDATE USING (is_cricket_admin());
CREATE POLICY "Admin can delete players" ON cricket_players FOR DELETE USING (is_cricket_admin());

CREATE TRIGGER set_cricket_players_updated_at BEFORE UPDATE ON cricket_players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Seasons ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cricket_seasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  year        INTEGER NOT NULL,
  season_type TEXT,
  share_token UUID DEFAULT gen_random_uuid(),
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read seasons" ON cricket_seasons FOR SELECT USING (has_cricket_access());
CREATE POLICY "Admin can manage seasons" ON cricket_seasons FOR INSERT WITH CHECK (is_cricket_admin());
CREATE POLICY "Admin can update seasons" ON cricket_seasons FOR UPDATE USING (is_cricket_admin());
CREATE POLICY "Admin can delete seasons" ON cricket_seasons FOR DELETE USING (is_cricket_admin());

CREATE TRIGGER set_cricket_seasons_updated_at BEFORE UPDATE ON cricket_seasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Expenses ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cricket_expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id    UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  paid_by      UUID NOT NULL REFERENCES cricket_players(id) ON DELETE RESTRICT,
  category     TEXT NOT NULL,
  description  TEXT,
  amount       NUMERIC(10,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read expenses" ON cricket_expenses FOR SELECT USING (has_cricket_access());
CREATE POLICY "Admin can manage expenses" ON cricket_expenses FOR INSERT WITH CHECK (is_cricket_admin());
CREATE POLICY "Admin can update expenses" ON cricket_expenses FOR UPDATE USING (is_cricket_admin());
CREATE POLICY "Admin can delete expenses" ON cricket_expenses FOR DELETE USING (is_cricket_admin());

CREATE TRIGGER set_cricket_expenses_updated_at BEFORE UPDATE ON cricket_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Expense Splits ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cricket_expense_splits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id   UUID NOT NULL REFERENCES cricket_expenses(id) ON DELETE CASCADE,
  player_id    UUID NOT NULL REFERENCES cricket_players(id) ON DELETE RESTRICT,
  share_amount NUMERIC(10,2) NOT NULL,
  UNIQUE(expense_id, player_id)
);

ALTER TABLE cricket_expense_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read splits" ON cricket_expense_splits FOR SELECT USING (has_cricket_access());
CREATE POLICY "Admin can manage splits" ON cricket_expense_splits FOR INSERT WITH CHECK (is_cricket_admin());
CREATE POLICY "Admin can delete splits" ON cricket_expense_splits FOR DELETE USING (is_cricket_admin());

-- ── Settlements ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cricket_settlements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id    UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  from_player  UUID NOT NULL REFERENCES cricket_players(id) ON DELETE RESTRICT,
  to_player    UUID NOT NULL REFERENCES cricket_players(id) ON DELETE RESTRICT,
  amount       NUMERIC(10,2) NOT NULL,
  settled_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read settlements" ON cricket_settlements FOR SELECT USING (has_cricket_access());
CREATE POLICY "Admin can manage settlements" ON cricket_settlements FOR INSERT WITH CHECK (is_cricket_admin());
CREATE POLICY "Admin can delete settlements" ON cricket_settlements FOR DELETE USING (is_cricket_admin());

-- ── Profiles: Role-based access columns ─────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access text[] DEFAULT '{toolkit}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true;

-- ── Public season data function (bypasses RLS) ───────────────
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
      'name', season_rec.name, 'year', season_rec.year, 'season_type', season_rec.season_type
    ),
    'players', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', p.id, 'name', p.name, 'jersey_number', p.jersey_number,
        'player_role', p.player_role, 'designation', p.designation, 'is_active', p.is_active
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
        'id', s.id, 'expense_id', s.expense_id, 'player_id', s.player_id, 'share_amount', s.share_amount
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
