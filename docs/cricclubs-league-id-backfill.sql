-- ============================================================
-- Backfill cricclubs_matches.cricclubs_league_id
-- ============================================================
-- `cricclubs_league_id` is the only reliable link from a scraped scorecard back
-- to a season: cricclubs_matches.cricclubs_league_id → cricket_seasons
-- .cricclubs_league_id. Without it a match cannot be attributed to a season, so
-- season-filtered statistics are impossible.
--
-- It was set by scripts/cricclubs-sync/ingest-html.mts but NOT by
-- scripts/scriptable/cricclubs-sync.js — which is the canonical, working sync
-- path. So every match synced from the phone landed with a NULL league id:
-- 6 of 13 matches, all from Jul 19 onward. The gap is silent, because the match
-- row itself looks complete.
--
-- The script is fixed separately. This repairs the existing rows.
--
-- Derived, not hardcoded: takes the league id from the team's own season rather
-- than writing 87 literally, so re-running on another team or another league
-- cannot stamp the wrong id.
--
-- SAFE because it is unambiguous TODAY and only today: this team has exactly one
-- season carrying a cricclubs_league_id, and every match on record falls inside
-- it (2026-04-11 .. 2026-08-23). Once Fall has fixtures this query would be
-- WRONG — two candidate leagues, no way to choose by team alone. The guard
-- below makes it refuse rather than guess.
--
-- Run:  supabase db query --linked -f docs/cricclubs-league-id-backfill.sql

DO $$
DECLARE v_leagues int;
BEGIN
  SELECT count(DISTINCT cricclubs_league_id) INTO v_leagues
  FROM public.cricket_seasons
  WHERE cricclubs_league_id IS NOT NULL;

  IF v_leagues <> 1 THEN
    RAISE EXCEPTION
      'Refusing to backfill: % seasons carry a cricclubs_league_id. With more '
      'than one, a NULL match cannot be attributed by team alone — match it by '
      'date against each season instead.', v_leagues;
  END IF;
END $$;

UPDATE public.cricclubs_matches m
SET cricclubs_league_id = s.cricclubs_league_id
FROM public.cricket_seasons s
WHERE m.team_id = s.team_id
  AND s.cricclubs_league_id IS NOT NULL
  AND m.cricclubs_league_id IS NULL;

SELECT coalesce(m.cricclubs_league_id::text, 'STILL NULL') AS league_id,
       count(*) AS matches,
       min(m.match_date)::text AS first_match,
       max(m.match_date)::text AS last_match,
       coalesce(max(s.name), 'NO MATCHING SEASON') AS maps_to_season
FROM public.cricclubs_matches m
LEFT JOIN public.cricket_seasons s
  ON s.cricclubs_league_id = m.cricclubs_league_id AND s.team_id = m.team_id
GROUP BY m.cricclubs_league_id
ORDER BY 1;
