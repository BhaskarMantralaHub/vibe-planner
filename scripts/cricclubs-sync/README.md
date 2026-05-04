# cricclubs-sync

Weekly scraper that pulls match scorecards from cricclubs.com and writes them
into Supabase via service-role upserts. Designed to run from a scheduled
GitHub Action (Mondays after the weekend's matches), but also runnable
locally for one-off backfills.

## What it does

1. Launches headless Chromium (Playwright).
2. Hits `listMatches.do` for our team to discover scorecard IDs.
3. For each match, hits `viewScorecard.do`, parses the HTML.
4. Upserts:
   - one `cricclubs_matches` row per match (idempotent on `(team_id, cricclubs_match_id)`),
   - the raw HTML into the sibling `cricclubs_match_html` table,
   - one `cricclubs_batting` row per (innings × batter), including `did_not_bat = true` for the rest of the XI,
   - one `cricclubs_bowling` row per (innings × bowler).

Names are matched to your roster via case-insensitive `cricket_players.name`
equality (the names were aligned in the prior `align-names.sql` step).
Opposition players land with `player_id = NULL` — the `cricclubs_name` text
is preserved so they show up in the dismissal context but are excluded
from the season-aggregate views.

## Architecture

```
parser.ts     pure HTML→object functions, no I/O          ← unit-tested
supabase.ts   service-role client + roster lookup helpers
sync.ts       orchestrator (Playwright + parser + upserts) ← entry point

__tests__/    fixture-replay tests
  fixtures/   real cricclubs HTML captured 2026-05-01
```

The parser is deliberately I/O-free so its tests can run in milliseconds
without any network. When cricclubs changes their HTML, fixture tests fail
in CI before the live job tries.

## Run locally

```bash
cd scripts/cricclubs-sync
npm install
npx playwright install chromium

# Run the parser unit tests (no network)
npm test

# Live sync against Supabase (requires service role key)
SUPABASE_URL='https://<project>.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='<service-role-key>' \
npm run sync
```

## Required env vars

| Variable | Where to get it | Required? |
|---|---|---|
| `SUPABASE_URL` | Supabase project settings → API | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings → API → `service_role` (secret) | Yes |
| `CRICCLUBS_TEAM_ID_INTERNAL` | UUID of your row in `cricket_teams` | Optional (defaults to Sunrisers Manteca) |
| `CRICCLUBS_FROM_DATE` | `MM/DD/YYYY` season start | Optional (default `04/01/2026`) |
| `CRICCLUBS_TO_DATE` | `MM/DD/YYYY` season end | Optional (default `08/31/2026`) |

> ⚠️ The `service_role` key bypasses RLS. Never commit it. Add it to
> `.env.local` (gitignored) for local runs and to GitHub Secrets for CI.

## Idempotency

Re-running this script is safe. Every upsert is keyed on a natural key
covered by a UNIQUE constraint in the migration:

| Table | Conflict key |
|---|---|
| `cricclubs_matches` | `(team_id, cricclubs_match_id)` |
| `cricclubs_match_html` | `(match_row_id)` |
| `cricclubs_batting` | `(match_row_id, innings_number, batting_team, cricclubs_name)` |
| `cricclubs_bowling` | `(match_row_id, innings_number, bowling_team, cricclubs_name)` |

A re-run for a closed match is a no-op (upsert sees identical values). A
re-run during a live match overwrites with whatever cricclubs currently
shows.

## Performance

For our team's ~20-match season, a full run takes about 60 seconds end-to-end:

- 1 list page fetch (~1.5 s)
- N scorecard fetches × ~1.5 s each + 1.5 s polite jitter
- A few hundred Supabase upserts (~10 s)

GitHub Action runner adds another 60–90 s of cold-start (checkout, npm
install, Chromium install or cache restore).

## Future enhancements (out of scope for this PR)

- Telemetry / Sentry alerts on parse failures.
- Notify the team Slack/Discord on new match ingest.
- Diff-detect "live match update" vs. "final match" so only finals
  trigger downstream notifications.
