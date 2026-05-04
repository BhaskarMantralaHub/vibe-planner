-- ============================================================================
-- Migration 005: cricclubs_* tables — pull match scores into player stats
-- ============================================================================
-- Stores match results and per-player batting/bowling rows scraped from
-- cricclubs.com (the league's external scoring portal). Linked to your
-- roster via cricket_players.cricclub_id (set in earlier sync work).
--
-- Tables:
--   cricclubs_matches       — one row per match (lean — no raw HTML)
--   cricclubs_match_html    — sibling, raw_html only (kept off the hot path)
--   cricclubs_batting       — one row per (match, innings, batter)
--   cricclubs_bowling       — one row per (match, innings, bowler)
--
-- Views:
--   cricclubs_batting_season  — aggregate per linked player (security_invoker)
--   cricclubs_bowling_season  — aggregate per linked player (security_invoker)
--
-- Hard delete (no soft-delete column) is INTENTIONAL: scraped data is
-- re-ingestible from raw_html, so deletion is recoverable by re-scrape.
-- See docs/MULTI_TEAM_DESIGN.md for the rationale.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. cricclubs_matches  (lean: no raw_html in this table)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cricclubs_matches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id               UUID NOT NULL REFERENCES cricket_teams(id) ON DELETE CASCADE,
  cricclubs_match_id    BIGINT NOT NULL,                 -- e.g., 3018
  match_date            DATE,
  match_format          TEXT,                            -- 'League' | 'T20' | 'Cup'
  league_name           TEXT,                            -- '2026 MTCA Spring League'
  division              TEXT,                            -- 'Division D'
  team_a                TEXT NOT NULL,
  team_b                TEXT NOT NULL,
  team_a_score          TEXT,                            -- '75/8 (20.0/20)'
  team_b_score          TEXT,                            -- '76/5 (10.4/20.0)'
  result_text           TEXT,
  winner_team           TEXT,
  scorecard_url         TEXT,
  fetched_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  parsed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, cricclubs_match_id)                   -- idempotent UPSERT key
);

CREATE INDEX IF NOT EXISTS idx_cricclubs_matches_team_date
  ON cricclubs_matches(team_id, match_date DESC);

-- ----------------------------------------------------------------------------
-- 2. cricclubs_match_html  (sibling — keeps ~800KB rows off the hot path)
-- ----------------------------------------------------------------------------
-- Storing raw HTML allows offline re-parsing if cricclubs HTML changes,
-- without re-fetching (and risking Cloudflare tightening). Keeping it in a
-- sibling table prevents bloating list/aggregate queries that don't need it.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cricclubs_match_html (
  match_row_id          UUID PRIMARY KEY REFERENCES cricclubs_matches(id) ON DELETE CASCADE,
  raw_html              TEXT NOT NULL,
  byte_length           INTEGER GENERATED ALWAYS AS (octet_length(raw_html)) STORED,
  fetched_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. cricclubs_batting
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cricclubs_batting (
  id                    BIGSERIAL PRIMARY KEY,
  match_row_id          UUID NOT NULL REFERENCES cricclubs_matches(id) ON DELETE CASCADE,
  team_id               UUID NOT NULL REFERENCES cricket_teams(id) ON DELETE CASCADE,
  innings_number        SMALLINT NOT NULL CHECK (innings_number IN (1, 2)),
  batting_team          TEXT NOT NULL,
  cricclubs_name        TEXT NOT NULL,
  player_id             UUID REFERENCES cricket_players(id) ON DELETE SET NULL,
  batting_position      SMALLINT CHECK (batting_position IS NULL OR batting_position BETWEEN 1 AND 11),
  runs                  INTEGER NOT NULL DEFAULT 0 CHECK (runs >= 0),
  balls                 INTEGER NOT NULL DEFAULT 0 CHECK (balls >= 0),
  fours                 INTEGER NOT NULL DEFAULT 0 CHECK (fours >= 0),
  sixes                 INTEGER NOT NULL DEFAULT 0 CHECK (sixes >= 0),
  strike_rate           NUMERIC(6,2),
  dismissal             TEXT,
  not_out               BOOLEAN NOT NULL DEFAULT FALSE,
  is_captain            BOOLEAN NOT NULL DEFAULT FALSE,
  is_wicketkeeper       BOOLEAN NOT NULL DEFAULT FALSE,
  did_not_bat           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_row_id, innings_number, batting_team, cricclubs_name)
);

CREATE INDEX IF NOT EXISTS idx_cricclubs_batting_team_player
  ON cricclubs_batting(team_id, player_id) WHERE player_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. cricclubs_bowling
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cricclubs_bowling (
  id                    BIGSERIAL PRIMARY KEY,
  match_row_id          UUID NOT NULL REFERENCES cricclubs_matches(id) ON DELETE CASCADE,
  team_id               UUID NOT NULL REFERENCES cricket_teams(id) ON DELETE CASCADE,
  innings_number        SMALLINT NOT NULL CHECK (innings_number IN (1, 2)),
  bowling_team          TEXT NOT NULL,
  cricclubs_name        TEXT NOT NULL,
  player_id             UUID REFERENCES cricket_players(id) ON DELETE SET NULL,
  -- Cricket overs are base-6 fractional (4.3 = 4 overs + 3 balls). The CHECK
  -- below rejects 4.6/4.7/etc. which would otherwise corrupt aggregates.
  overs                 NUMERIC(4,1) NOT NULL DEFAULT 0
                          CHECK (overs >= 0 AND (overs - FLOOR(overs)) * 10 < 6),
  maidens               INTEGER NOT NULL DEFAULT 0 CHECK (maidens >= 0),
  dots                  INTEGER NOT NULL DEFAULT 0 CHECK (dots >= 0),
  runs                  INTEGER NOT NULL DEFAULT 0 CHECK (runs >= 0),
  wickets               INTEGER NOT NULL DEFAULT 0 CHECK (wickets >= 0),
  economy               NUMERIC(5,2),
  is_captain            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_row_id, innings_number, bowling_team, cricclubs_name)
);

CREATE INDEX IF NOT EXISTS idx_cricclubs_bowling_team_player
  ON cricclubs_bowling(team_id, player_id) WHERE player_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. updated_at triggers (matches existing pattern: cricket-schema.sql:619)
-- ----------------------------------------------------------------------------
CREATE TRIGGER set_cricclubs_matches_updated_at
  BEFORE UPDATE ON cricclubs_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_cricclubs_batting_updated_at
  BEFORE UPDATE ON cricclubs_batting
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_cricclubs_bowling_updated_at
  BEFORE UPDATE ON cricclubs_bowling
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- 6. RLS — enable on all four tables
-- ----------------------------------------------------------------------------
-- Reads: any approved team member can see their team's match data.
-- Writes: team admins via UI; the GitHub Action runs as service_role and
-- bypasses RLS naturally. All policies are explicitly scoped TO authenticated
-- to prevent any future change to user_team_ids() from leaking to anon.
-- ----------------------------------------------------------------------------
ALTER TABLE cricclubs_matches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cricclubs_match_html ENABLE ROW LEVEL SECURITY;
ALTER TABLE cricclubs_batting    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cricclubs_bowling    ENABLE ROW LEVEL SECURITY;

-- cricclubs_matches
CREATE POLICY "Team members read matches" ON cricclubs_matches
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());
CREATE POLICY "Team admin insert matches" ON cricclubs_matches
  FOR INSERT TO authenticated
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());
CREATE POLICY "Team admin update matches" ON cricclubs_matches
  FOR UPDATE TO authenticated
  USING (is_team_admin(team_id) OR is_global_admin());
CREATE POLICY "Team admin delete matches" ON cricclubs_matches
  FOR DELETE TO authenticated
  USING (is_team_admin(team_id) OR is_global_admin());

-- cricclubs_match_html  (read-only for team members; admin write only)
CREATE POLICY "Team members read match html" ON cricclubs_match_html
  FOR SELECT TO authenticated
  USING (
    match_row_id IN (
      SELECT id FROM cricclubs_matches
      WHERE team_id IN (SELECT * FROM user_team_ids())
    ) OR is_global_admin()
  );
CREATE POLICY "Team admin insert match html" ON cricclubs_match_html
  FOR INSERT TO authenticated
  WITH CHECK (
    match_row_id IN (
      SELECT id FROM cricclubs_matches WHERE is_team_admin(team_id)
    ) OR is_global_admin()
  );
CREATE POLICY "Team admin update match html" ON cricclubs_match_html
  FOR UPDATE TO authenticated
  USING (
    match_row_id IN (
      SELECT id FROM cricclubs_matches WHERE is_team_admin(team_id)
    ) OR is_global_admin()
  );
CREATE POLICY "Team admin delete match html" ON cricclubs_match_html
  FOR DELETE TO authenticated
  USING (
    match_row_id IN (
      SELECT id FROM cricclubs_matches WHERE is_team_admin(team_id)
    ) OR is_global_admin()
  );

-- cricclubs_batting
CREATE POLICY "Team members read batting" ON cricclubs_batting
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());
CREATE POLICY "Team admin insert batting" ON cricclubs_batting
  FOR INSERT TO authenticated
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());
CREATE POLICY "Team admin update batting" ON cricclubs_batting
  FOR UPDATE TO authenticated
  USING (is_team_admin(team_id) OR is_global_admin());
CREATE POLICY "Team admin delete batting" ON cricclubs_batting
  FOR DELETE TO authenticated
  USING (is_team_admin(team_id) OR is_global_admin());

-- cricclubs_bowling
CREATE POLICY "Team members read bowling" ON cricclubs_bowling
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());
CREATE POLICY "Team admin insert bowling" ON cricclubs_bowling
  FOR INSERT TO authenticated
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());
CREATE POLICY "Team admin update bowling" ON cricclubs_bowling
  FOR UPDATE TO authenticated
  USING (is_team_admin(team_id) OR is_global_admin());
CREATE POLICY "Team admin delete bowling" ON cricclubs_bowling
  FOR DELETE TO authenticated
  USING (is_team_admin(team_id) OR is_global_admin());

-- ----------------------------------------------------------------------------
-- 7. Stats views — explicit security_invoker so RLS is honored
-- ----------------------------------------------------------------------------
-- LEFT JOIN to cricket_players so stat rows survive even if the linked
-- player belongs to a team the viewer can't see (avoids silent data loss
-- via INNER-JOIN + RLS interaction). Falls back to cricclubs_name.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW cricclubs_batting_season WITH (security_invoker = true) AS
SELECT
  b.team_id,
  b.player_id,
  -- Coalesce to MAX so the (team_id, player_id) GROUP key isn't fragmented
  -- by drift between cricclubs spellings or RLS-hidden cricket_players rows.
  COALESCE(MAX(cp.name), MAX(b.cricclubs_name))  AS player_name,
  COUNT(DISTINCT b.match_row_id)                 AS innings,
  COALESCE(SUM(b.runs)::int, 0)                  AS runs,
  COALESCE(SUM(b.balls)::int, 0)                 AS balls,
  COALESCE(SUM(b.fours)::int, 0)                 AS fours,
  COALESCE(SUM(b.sixes)::int, 0)                 AS sixes,
  COUNT(*) FILTER (WHERE b.not_out)              AS not_outs,
  COUNT(*) FILTER (WHERE NOT b.not_out)          AS dismissals,
  MAX(b.runs)                                    AS highest_score,
  CASE
    WHEN COUNT(*) FILTER (WHERE NOT b.not_out) > 0
    THEN ROUND(SUM(b.runs)::numeric
              / COUNT(*) FILTER (WHERE NOT b.not_out), 2)
    ELSE NULL
  END                                            AS batting_average,
  CASE
    WHEN SUM(b.balls) > 0
    THEN ROUND((SUM(b.runs)::numeric / SUM(b.balls)) * 100, 2)
    ELSE NULL
  END                                            AS strike_rate
FROM cricclubs_batting b
LEFT JOIN cricket_players cp ON cp.id = b.player_id
WHERE b.player_id IS NOT NULL
  AND NOT b.did_not_bat
GROUP BY b.team_id, b.player_id;

CREATE OR REPLACE VIEW cricclubs_bowling_season WITH (security_invoker = true) AS
WITH balls_calc AS (
  SELECT
    bw.team_id,
    bw.player_id,
    cp.name                                      AS roster_name,
    bw.cricclubs_name,
    bw.maidens,
    bw.runs,
    bw.wickets,
    -- Defensive: cap the fractional part at 5 in case a bad row sneaks in
    -- (CHECK constraint should prevent it, but the view is the second line).
    FLOOR(bw.overs)::int * 6
      + LEAST(ROUND((bw.overs - FLOOR(bw.overs)) * 10)::int, 5) AS balls
  FROM cricclubs_bowling bw
  LEFT JOIN cricket_players cp ON cp.id = bw.player_id
  WHERE bw.player_id IS NOT NULL
)
SELECT
  team_id,
  player_id,
  -- MAX over the per-row name; (team_id, player_id) keeps key clean.
  COALESCE(MAX(roster_name), MAX(cricclubs_name)) AS player_name,
  COUNT(*)                                        AS innings,
  SUM(balls)                                      AS balls,
  COALESCE(SUM(maidens)::int, 0)                  AS maidens,
  COALESCE(SUM(runs)::int, 0)                     AS runs,
  COALESCE(SUM(wickets)::int, 0)                  AS wickets,
  CASE
    WHEN SUM(wickets) > 0
    THEN ROUND(SUM(runs)::numeric / SUM(wickets), 2)
    ELSE NULL
  END                                             AS bowling_average,
  CASE
    WHEN SUM(balls) > 0
    THEN ROUND((SUM(runs)::numeric * 6.0) / SUM(balls), 2)
    ELSE NULL
  END                                             AS economy,
  MAX(wickets)                                    AS best_wickets
FROM balls_calc
GROUP BY team_id, player_id;

GRANT SELECT ON cricclubs_batting_season TO authenticated;
GRANT SELECT ON cricclubs_bowling_season TO authenticated;

COMMIT;

-- ============================================================================
-- FOLLOW-UPS (separate PRs):
--   1. Update .github/workflows/backup.yml + restore.yml to include the new
--      tables (cricclubs_matches, cricclubs_match_html, cricclubs_batting,
--      cricclubs_bowling) and the two views.
--   2. Document the hard-delete-by-design choice in docs/MULTI_TEAM_DESIGN.md.
-- ============================================================================
