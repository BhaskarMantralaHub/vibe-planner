# Backup & Disaster Recovery

## Automated Backups
- **GitHub Actions workflow** (`.github/workflows/backup.yml`) runs daily at 11 PM PT
- Exports all 20 tables as JSON to private repo `vibe-planner-backups`
- Keeps last 30 days, auto-deletes older backups
- Can trigger manually: Actions → Daily Supabase Backup → Run workflow
- Secrets required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VIBE_PLANNER_BACKUP` (GitHub PAT)

## Backed Up Tables (20)
When creating a new table, you **MUST** add it to both `.github/workflows/backup.yml` and `.github/workflows/restore.yml`.

| # | Table | Category |
|---|-------|----------|
| 1 | `profiles` | Core |
| 2 | `vibes` | Vibe Planner |
| 3 | `id_documents` | ID Tracker |
| 4 | `cricket_players` | Cricket |
| 5 | `cricket_seasons` | Cricket |
| 6 | `cricket_expenses` | Cricket |
| 7 | `cricket_expense_splits` | Cricket |
| 8 | `cricket_settlements` | Cricket |
| 9 | `cricket_season_fees` | Cricket |
| 10 | `cricket_sponsorships` | Cricket |
| 11 | `cricket_gallery` | Moments |
| 12 | `cricket_gallery_tags` | Moments |
| 13 | `cricket_gallery_comments` | Moments |
| 14 | `cricket_gallery_likes` | Moments |
| 15 | `cricket_comment_reactions` | Moments |
| 16 | `cricket_notifications` | Moments |
| 17 | `practice_matches` | Live Scoring |
| 18 | `practice_match_players` | Live Scoring |
| 19 | `practice_innings` | Live Scoring |
| 20 | `practice_balls` | Live Scoring |

## Restore Process (if Supabase project is lost)
1. **Create new Supabase project** — note the new URL and keys
2. **Restore schema** — run `docs/cricket-schema.sql` in Supabase SQL Editor
3. **Generate restore SQL** — Actions → Generate Restore SQL → Run workflow → enter date or "latest"
4. **Download artifact** — download the `.sql` file from the workflow run
5. **Restore data** — paste the SQL into Supabase SQL Editor and execute
6. **Update credentials** — update `.env.local` with new `SUPABASE_URL` and `SUPABASE_ANON_KEY`
7. **Update GitHub secrets** — update `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in repo settings
8. **Storage images** — NOT backed up. Player photos and gallery photos would need to be re-uploaded.

## What's Backed Up vs Not

| Backed up | Not backed up |
|-----------|---------------|
| All table data (JSON) | Storage bucket images |
| Schema + RPCs + triggers (git) | Auth user passwords/sessions |
| RLS policies (git) | Supabase project config |
