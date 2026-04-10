# Backup & Disaster Recovery

## Automated Backups
- **GitHub Actions workflow** (`.github/workflows/backup.yml`) runs daily at 11 PM PT
- Exports all 27 tables as JSON to private repo `vibe-planner-backups`
- **Schema dump** — `schema.sql` captures tables, RLS policies, functions, triggers, indexes
- **Roles dump** — `roles.sql` captures role grants and permissions
- Keeps last 30 days, auto-deletes older backups
- Can trigger manually: Actions → Daily Supabase Backup → Run workflow
- **Failure alerts** — sends email via Resend if backup job fails
- Secrets required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`, `VIBE_PLANNER_BACKUP` (GitHub PAT), `RESEND_API_KEY`, `SUPER_ADMIN_EMAIL`

## Backed Up Tables (27)
When creating a new table, you **MUST** add it to both `.github/workflows/backup.yml` and `.github/workflows/restore.yml`.

| # | Table | Category |
|---|-------|----------|
| 1 | `profiles` | Core |
| 2 | `app_settings` | Core |
| 3 | `cricket_teams` | Multi-Team |
| 4 | `team_members` | Multi-Team |
| 5 | `team_invites` | Multi-Team |
| 6 | `vibes` | Vibe Planner |
| 7 | `id_documents` | ID Tracker |
| 8 | `cricket_players` | Cricket |
| 9 | `cricket_seasons` | Cricket |
| 10 | `cricket_expenses` | Cricket |
| 11 | `cricket_expense_splits` | Cricket |
| 12 | `cricket_settlements` | Cricket |
| 13 | `cricket_season_fees` | Cricket |
| 14 | `cricket_sponsorships` | Cricket |
| 15 | `cricket_gallery` | Moments |
| 16 | `cricket_gallery_tags` | Moments |
| 17 | `cricket_gallery_comments` | Moments |
| 18 | `cricket_gallery_likes` | Moments |
| 19 | `cricket_comment_reactions` | Moments |
| 20 | `cricket_notifications` | Moments |
| 21 | `practice_matches` | Live Scoring |
| 22 | `practice_match_players` | Live Scoring |
| 23 | `practice_innings` | Live Scoring |
| 24 | `practice_balls` | Live Scoring |
| 25 | `cricket_schedule_matches` | Schedule |
| 26 | `user_activity` | Analytics |
| 27 | `team_audit_log` | Audit Trail |

## Restore Process (if Supabase project is lost)
1. **Create new Supabase project** — note the new URL and keys
2. **Restore roles** — run the `roles.sql` file from the backup in Supabase SQL Editor
3. **Restore schema** — run the `schema.sql` file from the backup in Supabase SQL Editor (this includes tables, RLS policies, functions, triggers, and indexes)
4. **Generate restore SQL** — Actions → Generate Restore SQL → Run workflow → enter date or "latest"
5. **Download artifact** — download the `.sql` file from the workflow run
6. **Restore data** — paste the SQL into Supabase SQL Editor and execute
7. **Update credentials** — update `.env.local` with new `SUPABASE_URL` and `SUPABASE_ANON_KEY`
8. **Update GitHub secrets** — update `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_PASSWORD` in repo settings
9. **Storage images** — NOT backed up. Player photos and gallery photos would need to be re-uploaded.

## What's Backed Up vs Not

| Backed up | Not backed up |
|-----------|---------------|
| All table data (JSON) | Storage bucket images |
| Schema + RPCs + triggers (`schema.sql` dump) | Auth user passwords/sessions |
| RLS policies (`schema.sql` dump) | Supabase project config |
| Role grants (`roles.sql` dump) | Edge Functions (deploy from git) |
