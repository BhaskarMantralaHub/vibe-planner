-- ============================================================
-- Per-season rosters + carried-forward pool balance
-- ============================================================
-- APPLIED 2026-08-27, then reviewed by SQL / DBA / QA. Two HIGH findings from
-- that review are fixed in docs/season-roster-fixes.sql (also applied) — read
-- both files together; this one alone no longer describes production.
--
-- Problem: `cricket_players` is scoped to a TEAM, not a season — it has
-- `team_id` and `is_active` and nothing else. Every screen that asks "who is on
-- the roster" reads that one list, so:
--
--   * A player who does not return for Fall must be deactivated, which also
--     erases them from Spring's dues list and umpiring history.
--   * A player who joins for Fall appears retroactively in Spring — inflating
--     Spring's outstanding dues by one fee and its "everyone stands once"
--     umpiring denominator by one person.
--
-- Everything ELSE is already season-scoped (fees, expenses, sponsorships,
-- settlements, splits, gallery, schedule, umpiring, practice matches all carry
-- `season_id`). The roster is the single gap, which is why this migration is
-- one table plus one column rather than a rework.
--
-- League stats stay CAREER-WIDE by decision. `cricclubs_batting_season` and
-- `cricclubs_bowling_season` group by (team_id, player_id) with no season or
-- league dimension, so they already behave that way and are untouched here.
--
-- ── Sections ───────────────────────────────────────────────────────────────
--   1. Composite unique keys needed for tenant-safe foreign keys
--   2. cricket_season_players  (the roster)
--   3. RLS
--   4. cricket_seasons.opening_balance  (carried-forward pool balance)
--   5. Backfill Spring 2026
--   6. Seed Fall 2026 from Spring
--   7. Verification queries (read-only, safe to re-run)
--
-- Idempotent throughout: safe to re-run.
--
-- Run:  supabase db query --linked -f docs/season-roster-migration.sql


-- ============================================================
-- 1. Composite unique keys for tenant-safe foreign keys
-- ============================================================
-- `id` is already the primary key on both tables, so these add no new
-- restriction whatsoever — they exist purely so section 2 can declare
-- FOREIGN KEY (season_id, team_id) and (player_id, team_id).
--
-- Why that matters: RLS on INSERT can only check the team_id ON THE NEW ROW.
-- A client could send its OWN team_id (passing `is_team_admin`) while pointing
-- season_id at another team's season, and enrol a player into a season it does
-- not own. The composite FKs make that combination unrepresentable rather than
-- merely disallowed. Single-tenant today, but docs/MULTI_TEAM_DESIGN.md is the
-- stated direction and this is far cheaper to add now than to retrofit.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_cricket_seasons_id_team
  ON public.cricket_seasons (id, team_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_cricket_players_id_team
  ON public.cricket_players (id, team_id);


-- ============================================================
-- 2. The roster table
-- ============================================================
-- One row per person per season. `cricket_players` remains the single identity
-- record — name, photo, email, jersey, user_id link — so nobody is duplicated
-- and the email-based "which player am I" resolution used in 8+ places keeps
-- working unchanged.

CREATE TABLE IF NOT EXISTS public.cricket_season_players (
  season_id UUID NOT NULL,
  player_id UUID NOT NULL,
  team_id   UUID NOT NULL REFERENCES public.cricket_teams(id),

  -- Guest-ness is a property of a SEASON, not of a person: someone can guest in
  -- Spring and be a regular in Fall. Moved off cricket_players for that reason.
  -- Guests are excluded from fee and umpiring-target denominators.
  is_guest BOOLEAN NOT NULL DEFAULT false,

  -- Mid-season departure. Kept rather than deleting the row, so the player stays
  -- in that season's history (dues paid, duties stood) while dropping out of
  -- "current roster" counts.
  left_at TIMESTAMPTZ DEFAULT NULL,

  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Enrolling the same player twice in one season is meaningless, and a natural
  -- key removes any need for a surrogate id or a dedupe pass.
  PRIMARY KEY (season_id, player_id),

  -- Tenant-safe: the season, the player and this row must all agree on team.
  FOREIGN KEY (season_id, team_id)
    REFERENCES public.cricket_seasons (id, team_id) ON DELETE CASCADE,
  FOREIGN KEY (player_id, team_id)
    REFERENCES public.cricket_players (id, team_id) ON DELETE CASCADE
);

-- "Who is on this season's roster" is the hot query — served by the PK.
-- This one serves the reverse: "which seasons has this player been in",
-- needed by the per-player sheet and any career view.
CREATE INDEX IF NOT EXISTS idx_season_players_player
  ON public.cricket_season_players (player_id);

-- Team-wide sweeps (backup, admin tooling) filter on team_id alone.
CREATE INDEX IF NOT EXISTS idx_season_players_team
  ON public.cricket_season_players (team_id);


-- ============================================================
-- 3. RLS
-- ============================================================
-- Mirrors cricket_season_fees exactly: any team member reads, only a team
-- admin writes. Deliberately identical so there is one pattern to reason about.

ALTER TABLE public.cricket_season_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can read season roster" ON public.cricket_season_players;
CREATE POLICY "Team members can read season roster"
  ON public.cricket_season_players FOR SELECT
  -- user_team_ids() is SETOF uuid with no arguments, so this is the direct form.
  -- cricket_season_fees carries the same rule written as pg_policies deparses it.
  USING (
    team_id IN (SELECT * FROM public.user_team_ids())
    OR is_global_admin()
  );

DROP POLICY IF EXISTS "Team admin can add to season roster" ON public.cricket_season_players;
CREATE POLICY "Team admin can add to season roster"
  ON public.cricket_season_players FOR INSERT
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());

DROP POLICY IF EXISTS "Team admin can update season roster" ON public.cricket_season_players;
CREATE POLICY "Team admin can update season roster"
  ON public.cricket_season_players FOR UPDATE
  USING (is_team_admin(team_id) OR is_global_admin());

DROP POLICY IF EXISTS "Team admin can remove from season roster" ON public.cricket_season_players;
CREATE POLICY "Team admin can remove from season roster"
  ON public.cricket_season_players FOR DELETE
  USING (is_team_admin(team_id) OR is_global_admin());


-- ============================================================
-- 4. Carried-forward pool balance
-- ============================================================
-- The ONE thing that crosses a season boundary: whatever is left in the pool.
--
-- Deliberately a STATIC number, not a live sum of the previous season. A live
-- chain would mean editing or deleting an old Spring expense silently rewrites
-- Fall's opening balance — and with several seasons, one correction years back
-- would ripple through every balance since. As a plain stored number an admin
-- can read and correct, that cannot happen.
--
-- Pool balance becomes:
--   opening_balance + fees collected + sponsorships - expenses
-- (one line at app/(tools)/cricket/page.tsx:216).
--
-- Left at 0 for both existing seasons: Spring is the first season on record and
-- has nothing before it, and Spring is still being played, so Fall's opening
-- balance is not yet known. Set Fall's when Spring closes.

ALTER TABLE public.cricket_seasons
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.cricket_seasons.opening_balance IS
  'Pool money carried in from the previous season. Static snapshot set by an '
  'admin when the season opens, never derived live from prior seasons.';


-- ============================================================
-- 5. Backfill Spring 2026
-- ============================================================
-- CRITICAL: enrol everyone with ANY Spring footprint, not just the currently
-- active players. A player who paid a fee or stood as umpire and was later
-- deactivated must still appear on that season's roster, or the moment the code
-- starts filtering by roster their payment and their duty become orphaned and
-- Spring's history is wrong.
--
-- On this data all 24 players are active and all have footprints, so the union
-- is the whole table — but the query is written for correctness, not for
-- today's numbers, because it will run again for future seasons.
--
-- is_guest is copied FROM cricket_players, which is the only place it exists
-- right now. cricket_players.is_guest is left in place for now and stops being
-- read once the app switches over; dropping it is a separate cleanup once
-- nothing references it.

INSERT INTO public.cricket_season_players (season_id, player_id, team_id, is_guest, joined_at)
SELECT s.id, p.id, p.team_id, p.is_guest, s.created_at
FROM public.cricket_seasons s
JOIN public.cricket_players p ON p.team_id = s.team_id
WHERE s.name = '2026 MTCA Spring League · Division D'
  AND (
    -- IS NOT FALSE, not a bare truth test: cricket_players.is_active is BOOLEAN
    -- DEFAULT true with no NOT NULL, and `WHERE p.is_active` silently skips a
    -- NULL row. Zero NULLs today, but a row inserted by direct SQL — or restored
    -- from a JSON backup missing the key — would drop out with no error.
    p.is_active IS NOT FALSE
    OR EXISTS (SELECT 1 FROM public.cricket_season_fees f
                WHERE f.season_id = s.id AND f.player_id = p.id)
    OR EXISTS (SELECT 1 FROM public.cricket_expenses e
                WHERE e.season_id = s.id AND e.paid_by = p.id)
    OR EXISTS (SELECT 1 FROM public.cricket_umpiring_duties d
                WHERE d.season_id = s.id AND d.assigned_player_id = p.id)
    OR EXISTS (SELECT 1 FROM public.cricket_settlements st
                WHERE st.season_id = s.id AND (st.from_player = p.id OR st.to_player = p.id))
    OR EXISTS (SELECT 1 FROM public.cricket_splits sp
                WHERE sp.season_id = s.id AND sp.paid_by = p.id)
    OR EXISTS (SELECT 1 FROM public.cricket_split_shares sh
                JOIN public.cricket_splits sp2 ON sp2.id = sh.split_id
                WHERE sp2.season_id = s.id AND sh.player_id = p.id)
    OR EXISTS (SELECT 1 FROM public.cricket_gallery_tags gt
                JOIN public.cricket_gallery g ON g.id = gt.post_id
                WHERE g.season_id = s.id AND gt.player_id = p.id)
    -- The three branches below were MISSING from the first version. Added after
    -- the DBA enumerated all 15 foreign keys into cricket_players from the live
    -- catalog rather than from the docs. Note cricket_split_settlements is a
    -- DIFFERENT table from cricket_settlements above — the easiest to miss.
    OR EXISTS (SELECT 1 FROM public.cricket_split_settlements ss
                WHERE ss.season_id = s.id
                  AND (ss.from_player = p.id OR ss.to_player = p.id))
    OR EXISTS (SELECT 1 FROM public.cricket_expense_splits es
                JOIN public.cricket_expenses e2 ON e2.id = es.expense_id
                WHERE e2.season_id = s.id AND es.player_id = p.id)
    OR EXISTS (SELECT 1 FROM public.practice_match_players pmp
                JOIN public.practice_matches pm ON pm.id = pmp.match_id
                WHERE pm.season_id = s.id AND pmp.player_id = p.id)
    OR EXISTS (SELECT 1 FROM public.practice_matches pm2
                WHERE pm2.season_id = s.id AND pm2.mvp_player_id = p.id)
    -- practice_balls and practice_innings reference practice_match_players(id),
    -- NOT cricket_players, so the branch above covers them transitively.
    --
    -- cricclubs_batting / cricclubs_bowling are DELIBERATELY NOT a footprint.
    -- They carry no season_id (reachable only via cricclubs_matches), and league
    -- stats are career-wide by decision, so match-play does not imply season
    -- membership. Stated explicitly because the silence was the risk, not the
    -- choice.
  )
ON CONFLICT (season_id, player_id) DO NOTHING;


-- ============================================================
-- 6. Seed Fall 2026 from Spring
-- ============================================================
-- Pre-fill, then remove whoever is not returning — chosen because most players
-- carry over, so this is far fewer actions than adding 20-odd people by hand.
--
-- GUESTS ARE NOT CARRIED FORWARD. A guest is by definition a one-off fill-in
-- for a particular season, so copying the 6 Spring guests into Fall would just
-- create 6 removals. Flag this if you would rather they came across.
--
-- Anyone who left Spring mid-season (left_at set) is also not carried forward.

INSERT INTO public.cricket_season_players (season_id, player_id, team_id, is_guest)
SELECT fall.id, sp.player_id, sp.team_id, false
FROM public.cricket_seasons fall
JOIN public.cricket_seasons spring
  ON spring.team_id = fall.team_id
 AND spring.name = '2026 MTCA Spring League · Division D'
JOIN public.cricket_season_players sp
  ON sp.season_id = spring.id
WHERE fall.name = '2026 MTCA Fall League'
  AND sp.is_guest = false
  AND sp.left_at IS NULL
  -- Seed ONLY into an empty roster. ON CONFLICT DO NOTHING prevents an ERROR;
  -- it does NOT prevent re-inserting rows an admin deliberately DELETED. Since
  -- the documented workflow is "pre-fill, then remove whoever is not
  -- returning", a re-run of this file would silently restore every removal and
  -- re-inflate the dues and umpiring denominators, with section 7 still
  -- printing plausible numbers. Found by SQL review.
  AND NOT EXISTS (
    SELECT 1 FROM public.cricket_season_players x WHERE x.season_id = fall.id
  )
ON CONFLICT (season_id, player_id) DO NOTHING;


-- ============================================================
-- 7. Verification (read-only)
-- ============================================================
-- Expect: Spring 24 (18 regular + 6 guests), Fall 18 (all regular, 0 guests).
--
-- APPLIED 2026-08-27. Verified against production:
--   Spring: 24 (18 regular + 6 guests) · Fall: 18 (18 regular, 0 guests)
--   opening_balance: 0.00 on both
--
-- Backfill completeness separately confirmed by query — 0 players missed:
--   24 players total, 24 enrolled in Spring, 0 not enrolled
--   0 players with a NULL or foreign team_id
--   0 players appearing ONLY in practice_match_players
--   0 players appearing ONLY in cricclubs_batting / cricclubs_bowling
--   0 orphan player_ids in cricclubs data
-- Section 5 deliberately does not list practice-match or cricclubs footprints.
-- On this data it does not matter (every player row is is_active, so the
-- footprint clauses are belt-and-braces) — but if this backfill is ever adapted
-- for a season where some players are INACTIVE, add those two sources first.

-- count(sp.player_id), not count(*): over a LEFT JOIN, count(*) counts the
-- all-NULL row, so a season with an EMPTY roster would report roster_size = 1.
-- This is the query whose entire job is to be trusted. Found by SQL review.
SELECT s.name,
       count(sp.player_id) AS roster_size,
       count(*) FILTER (WHERE sp.is_guest) AS guests,
       count(sp.player_id) FILTER (WHERE NOT sp.is_guest) AS regulars,
       s.opening_balance
FROM public.cricket_seasons s
LEFT JOIN public.cricket_season_players sp ON sp.season_id = s.id
GROUP BY s.id, s.name, s.opening_balance
ORDER BY s.name;


-- ============================================================
-- 8. Rollback
-- ============================================================
-- Entirely safe WHILE NO APPLICATION CODE READS THE NEW TABLE, which is the
-- case as applied: this migration is additive, so the app behaves exactly as it
-- did before. Once the roster is wired into the app, rolling back means losing
-- real roster data — take a backup first.
--
-- ORDER MATTERS: the table must go before the unique indexes, because its
-- composite foreign keys depend on them.
--
--   DROP TABLE IF EXISTS public.cricket_season_players;
--   ALTER TABLE public.cricket_seasons DROP COLUMN IF EXISTS opening_balance;
--   DROP INDEX IF EXISTS public.uniq_cricket_seasons_id_team;
--   DROP INDEX IF EXISTS public.uniq_cricket_players_id_team;
--
-- Also revert the two GitHub workflows, which now list cricket_season_players:
--   .github/workflows/backup.yml, .github/workflows/restore.yml
