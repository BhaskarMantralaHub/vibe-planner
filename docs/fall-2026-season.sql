-- ============================================================
-- Create the 2026 MTCA Fall League season (Sunrisers Manteca)
-- ============================================================
-- Fall registration has opened, and there is currently NO working way to create
-- a season from the app:
--
--   * SeasonSelector.tsx still contains the whole "New Season" form, but it is
--     dead-coded behind a literal `false` (disabled 2026-05-05) on the grounds
--     that the cricclubs-sync GitHub Action would auto-create seasons.
--   * That Action has been dormant since 2026-06-22 — cricclubs now serves a
--     Cloudflare JS challenge no automated browser can clear.
--   * The Scriptable script that replaced it does NOT create seasons; it reads a
--     hardcoded CONFIG.league_id.
--
-- So this row is created by hand. Re-enabling the admin UI is tracked
-- separately; note it CANNOT simply be un-hidden, because addSeason() inserts
-- without is_active and the column defaults to true — see below.
--
-- ── Why INACTIVE ───────────────────────────────────────────────────────────
-- Two independent reasons:
--
--  1. `uniq_cricket_seasons_one_active_per_team` (docs/umpiring-schema.sql) is a
--     partial unique index on (team_id) WHERE is_active. Spring 2026 is still
--     active, so inserting a second active season raises 23505.
--  2. Sunrisers have qualified for the Spring semi-finals, which have not been
--     played. cricket-store picks the ACTIVE season as the default selection, so
--     activating Fall now would hide the pending playoff fixtures and their
--     umpiring duties behind a season switch.
--
-- Inactive does not block anything: every screen keys off selectedSeasonId, so
-- Fall fees and players can be recorded as soon as it is pickable in the
-- season dropdown. Flip it when the Spring playoffs are done, both statements
-- together (the index permits exactly one active season at a time):
--
--   UPDATE cricket_seasons SET is_active = false WHERE name LIKE '2026 MTCA Spring%';
--   UPDATE cricket_seasons SET is_active = true  WHERE name = '2026 MTCA Fall League';
--
-- ── Left NULL on purpose ───────────────────────────────────────────────────
--   cricclubs_league_id  — MTCA issues a NEW league id per season (Spring = 87).
--                          The Fall id is not published yet. Until it is set,
--                          no sync can pull Fall fixtures.
--   division             — not assigned yet at registration time. Spring became
--                          "Division D" and its name carries it; Fall's name can
--                          be updated once the division is known.
--
-- Also creates the umpiring settings row, because it is the thing most easily
-- forgotten: without it the duty sync skips the season with a warning.
-- cricclubs_team_id is per-LEAGUE (1014 was Sunrisers in league 87), so it too
-- has to wait for the Fall league to be published.
--
-- Idempotent: safe to re-run.
--
-- Run:  supabase db query --linked -f docs/fall-2026-season.sql

INSERT INTO public.cricket_seasons
  (user_id, team_id, name, year, season_type, is_active, source, fee_amount)
SELECT s.user_id,
       s.team_id,
       '2026 MTCA Fall League',
       2026,
       'fall',
       false,
       'manual',
       s.fee_amount          -- same $60 as Spring; adjust if Fall differs
FROM public.cricket_seasons s
WHERE s.name = '2026 MTCA Spring League · Division D'
  AND NOT EXISTS (
    SELECT 1 FROM public.cricket_seasons x
    WHERE x.team_id = s.team_id AND x.name = '2026 MTCA Fall League'
  );

INSERT INTO public.cricket_umpiring_settings (season_id, team_id, duty_target)
SELECT s.id, s.team_id, 1
FROM public.cricket_seasons s
WHERE s.name = '2026 MTCA Fall League'
ON CONFLICT (season_id) DO NOTHING;
