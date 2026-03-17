-- Season fee tracking table
CREATE TABLE IF NOT EXISTS cricket_season_fees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES cricket_players(id) ON DELETE CASCADE,
  amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_date   DATE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(season_id, player_id)
);

ALTER TABLE cricket_season_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read fees" ON cricket_season_fees FOR SELECT USING (has_cricket_access());
CREATE POLICY "Admin can manage fees" ON cricket_season_fees FOR INSERT WITH CHECK (is_cricket_admin());
CREATE POLICY "Admin can update fees" ON cricket_season_fees FOR UPDATE USING (is_cricket_admin());
CREATE POLICY "Admin can delete fees" ON cricket_season_fees FOR DELETE USING (is_cricket_admin());

-- Add fee_amount to seasons (default $60)
ALTER TABLE cricket_seasons ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(10,2) DEFAULT 60;
