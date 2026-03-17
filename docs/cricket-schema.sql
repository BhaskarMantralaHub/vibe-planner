-- ============================================================
-- Cricket Team Expenses — Database Schema
-- ============================================================

-- ── Players ──────────────────────────────────────────────────
CREATE TABLE cricket_players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  jersey_number INTEGER,
  phone       TEXT,
  player_role TEXT,           -- 'batsman' | 'bowler' | 'all-rounder' | 'keeper'
  batting_style TEXT,         -- 'right' | 'left'
  bowling_style TEXT,         -- 'pace' | 'medium' | 'spin'
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cricket_players_user_id ON cricket_players(user_id);

ALTER TABLE cricket_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own players"
  ON cricket_players FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_cricket_players_updated_at
  BEFORE UPDATE ON cricket_players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Seasons ──────────────────────────────────────────────────
CREATE TABLE cricket_seasons (
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

CREATE INDEX idx_cricket_seasons_user_id ON cricket_seasons(user_id);

ALTER TABLE cricket_seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own seasons"
  ON cricket_seasons FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_cricket_seasons_updated_at
  BEFORE UPDATE ON cricket_seasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Expenses ─────────────────────────────────────────────────
CREATE TABLE cricket_expenses (
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

CREATE INDEX idx_cricket_expenses_user_id ON cricket_expenses(user_id);
CREATE INDEX idx_cricket_expenses_season_id ON cricket_expenses(season_id);

ALTER TABLE cricket_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own expenses"
  ON cricket_expenses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_cricket_expenses_updated_at
  BEFORE UPDATE ON cricket_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Expense Splits ───────────────────────────────────────────
CREATE TABLE cricket_expense_splits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id   UUID NOT NULL REFERENCES cricket_expenses(id) ON DELETE CASCADE,
  player_id    UUID NOT NULL REFERENCES cricket_players(id) ON DELETE RESTRICT,
  share_amount NUMERIC(10,2) NOT NULL,
  UNIQUE(expense_id, player_id)
);

ALTER TABLE cricket_expense_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage splits through parent expense"
  ON cricket_expense_splits FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM cricket_expenses
      WHERE cricket_expenses.id = cricket_expense_splits.expense_id
        AND cricket_expenses.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cricket_expenses
      WHERE cricket_expenses.id = cricket_expense_splits.expense_id
        AND cricket_expenses.user_id = auth.uid()
    )
  );

-- ── Settlements ──────────────────────────────────────────────
CREATE TABLE cricket_settlements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id    UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  from_player  UUID NOT NULL REFERENCES cricket_players(id) ON DELETE RESTRICT,
  to_player    UUID NOT NULL REFERENCES cricket_players(id) ON DELETE RESTRICT,
  amount       NUMERIC(10,2) NOT NULL,
  settled_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cricket_settlements_user_id ON cricket_settlements(user_id);
CREATE INDEX idx_cricket_settlements_season_id ON cricket_settlements(season_id);

ALTER TABLE cricket_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own settlements"
  ON cricket_settlements FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Profiles: Role-based access columns ─────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access text[] DEFAULT '{toolkit}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true;

-- ── Update handle_new_user() trigger ─────────────────────────
-- Reads access and approved from raw_user_meta_data so admins
-- can set them during user creation / invitation.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, access, approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      (NEW.raw_user_meta_data->>'access')::text[],
      '{toolkit}'
    ),
    COALESCE(
      (NEW.raw_user_meta_data->>'approved')::boolean,
      true
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
  -- Find the season by share_token
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
        'id', p.id,
        'name', p.name,
        'jersey_number', p.jersey_number,
        'is_active', p.is_active
      )), '[]'::json)
      FROM cricket_players p
      WHERE p.user_id = (SELECT user_id FROM cricket_seasons WHERE id = season_rec.id)
    ),
    'expenses', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', e.id,
        'paid_by', e.paid_by,
        'category', e.category,
        'description', e.description,
        'amount', e.amount,
        'expense_date', e.expense_date
      )), '[]'::json)
      FROM cricket_expenses e
      WHERE e.season_id = season_rec.id
    ),
    'splits', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', s.id,
        'expense_id', s.expense_id,
        'player_id', s.player_id,
        'share_amount', s.share_amount
      )), '[]'::json)
      FROM cricket_expense_splits s
      WHERE s.expense_id IN (SELECT id FROM cricket_expenses WHERE season_id = season_rec.id)
    ),
    'settlements', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', st.id,
        'from_player', st.from_player,
        'to_player', st.to_player,
        'amount', st.amount,
        'settled_date', st.settled_date
      )), '[]'::json)
      FROM cricket_settlements st
      WHERE st.season_id = season_rec.id
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant anonymous access to the public function
GRANT EXECUTE ON FUNCTION get_public_season_data(UUID) TO anon;
