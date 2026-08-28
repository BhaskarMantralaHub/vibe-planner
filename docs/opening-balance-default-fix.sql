-- ============================================================
-- opening_balance: NULL should mean "derive live", not 0
-- ============================================================
-- `cricket_seasons.opening_balance` was added as `NOT NULL DEFAULT 0` when the
-- design was a static admin-set snapshot. The design then changed: the carried
-- forward figure is DERIVED LIVE from the previous season while
-- `opening_balance IS NULL`, and setting a value FREEZES it. Spring is still
-- being played, so a frozen figure would go stale the moment its next expense
-- lands.
--
-- Under those semantics `0` means "an admin recorded that nothing carried
-- over" — which is a real thing to record, and deliberately distinct from
-- NULL. So the DEFAULT of 0 is now actively wrong: every season is born frozen
-- at zero, the carried-forward entry computes 0, and it renders as nothing.
-- That is exactly what happened: Fall showed no entry despite Spring holding
-- $233.21.
--
-- Two changes:
--   1. Drop the DEFAULT so a new season is born NULL — i.e. "derive live".
--   2. Null out the two existing rows, which were only 0 because of the
--      default and never because anyone chose zero.
--
-- Effect after this runs:
--   Spring — NULL, and it is the earliest season, so it derives 0. Unchanged.
--   Fall   — NULL, so it derives Spring's live balance:
--            1080 fees + 420 sponsors - 1266.79 expenses = 233.21
--
-- NOT NULL was already dropped (docs/season-roster-fixes.sql) because
-- restore.yml rebuilds rows with json_populate_recordset, which does not apply
-- defaults — the same reason dropping the default here costs nothing.
--
-- Safe: no row loses information. Anyone wanting a frozen zero can set it
-- explicitly with the lock control on the carried-forward entry.
--
-- Run:  supabase db query --linked -f docs/opening-balance-default-fix.sql

ALTER TABLE public.cricket_seasons
  ALTER COLUMN opening_balance DROP DEFAULT;

-- Only rows still sitting at exactly 0 — leaves any deliberately frozen figure
-- alone, so this is safe to re-run later.
UPDATE public.cricket_seasons
SET opening_balance = NULL
WHERE opening_balance = 0;

SELECT name,
       CASE WHEN opening_balance IS NULL THEN 'NULL (derives live)'
            ELSE 'frozen at ' || opening_balance::text END AS opening_balance,
       coalesce((SELECT column_default FROM information_schema.columns
                  WHERE table_name = 'cricket_seasons'
                    AND column_name = 'opening_balance'), 'none') AS col_default
FROM public.cricket_seasons
ORDER BY year, season_type;
