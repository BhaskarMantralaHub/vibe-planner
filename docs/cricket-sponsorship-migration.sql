CREATE TABLE IF NOT EXISTS cricket_sponsorships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  sponsor_name    TEXT NOT NULL,
  amount          NUMERIC(10,2) NOT NULL,
  sponsored_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_sponsorships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read sponsorships" ON cricket_sponsorships FOR SELECT USING (has_cricket_access());
CREATE POLICY "Admin can manage sponsorships" ON cricket_sponsorships FOR INSERT WITH CHECK (is_cricket_admin());
CREATE POLICY "Admin can update sponsorships" ON cricket_sponsorships FOR UPDATE USING (is_cricket_admin());
CREATE POLICY "Admin can delete sponsorships" ON cricket_sponsorships FOR DELETE USING (is_cricket_admin());
