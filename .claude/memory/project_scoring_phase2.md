---
name: Live Scoring Phase 2 — current state (2026-03-27)
description: Supabase sync complete, match history, delete/restore, guest autocomplete, leaderboard UI in progress
type: project
---

## Live Scoring — Phase 2 Status

### Completed
- **Supabase sync**: Every ball syncs to DB (fire-and-forget INSERT + UPDATE innings)
- **Match creation**: Awaits `create_practice_match` RPC, returns server player ID map
- **Match history**: Landing page loads from DB via `get_match_history` RPC (5 params: status, limit, offset, from_date, to_date)
- **Resume match**: `resumeMatch` hydrates store from `get_match_scorecard` RPC (now includes striker/bowler IDs) + claims scorer
- **Continue Scoring**: Always re-hydrates from DB to avoid stale localStorage
- **Soft delete → Restore → Permanent delete**: Full cycle with CASCADE cleanup
- **Recently Deleted**: Via "Deleted" filter tab (admin only), not separate section
- **Match count filters**: All / Last 5 / Last 10 / Last 20 / Deleted (admin)
- **Revert match**: Admin can revert abruptly ended (no winner) matches. Smart status logic: innings 1 has players → scoring, 1st completed → innings_break, else scoring
- **Guest autocomplete**: `get_guest_suggestions` RPC queries distinct guest names from past matches
- **End match logic**: Only declares winner when both innings `is_completed`. Mid-innings abort = "No result". `endInnings` on 2nd innings delegates to `endMatch`.
- **match_winner always derived**: Even when result_summary pre-set by recordBall
- **Scorecard dismissal text**: Verbose mode for scorecard (b Bowler, c Fielder b Bowler, st Keeper b Bowler)
- **Dedup fix**: Active match card only excluded from DB list when local store has valid player data

### In Progress
- **Leaderboard UI**: `LeaderboardEntry` type added to `types/scoring.ts`. Store interface has `leaderboard`, `leaderboardLoading`, `fetchLeaderboard` — implementation started but not completed
- Store has partial changes for leaderboard (interface declared, initial state + action body NOT yet added)

### Known Issues Fixed
- Old 3-param `get_match_history` conflicted with new 5-param → user must `DROP FUNCTION IF EXISTS get_match_history(TEXT, INTEGER, INTEGER)` and run `NOTIFY pgrst, 'reload schema'`
- `get_match_scorecard` was missing striker_id/non_striker_id/bowler_id in innings data → fixed
- Continue Scoring used stale localStorage → now re-hydrates from DB
- `resumeMatch` didn't claim scorer → RLS blocked ball writes → fixed

### DB State
- 16 RPCs in `docs/scoring-schema.sql` (all deployed)
- Tables: practice_matches, practice_match_players, practice_innings, practice_balls
- `deleted_at`/`deleted_by` columns on practice_matches for soft delete
- Backup workflows updated to include scoring tables

### Guest Player Architecture (2026-03-28)
- `cricket_players.is_guest` column added — guests get real roster records
- `create_practice_match` upserts guests into `cricket_players` via `ON CONFLICT` (race-safe)
- Unique index on `lower(name) WHERE is_guest = true AND is_active = true` prevents duplicates
- `practice_match_players.player_id` is now set for ALL players (never NULL for guests)
- Unique index updated to `(match_id, player_id, team)` — allows same guest on both teams
- `get_guest_suggestions` returns `{id, name}` from `cricket_players`
- `promote_guest_to_roster` RPC: admin flips `is_guest=false`, validates email uniqueness
- Leaderboard includes guests (returns `is_guest` flag for UI badging)
- Guest stats survive match deletion (tied to `cricket_players`, not CASCADE)
- Migration: `docs/migrations/003_guest_players_to_roster.sql` (deployed 2026-03-28)

### Pending Features
1. **Leaderboard UI** (in progress) — component + store wiring
2. **Guest Players UI** — collapsible section in PlayerManager, promote to roster
3. **Rematch** — one-tap restart, `get_rematch_template` RPC ready
4. **Spectator Realtime** — Supabase Realtime subscriptions
5. **Post to Moments** — auto-generate match result post
6. **Public Match Scorecard** — `/cricket/match/[token]` route

**How to apply:** Continue from leaderboard UI implementation. The store interface is updated but the initial state and fetchLeaderboard action body need to be added. Then build Guest Players section in PlayerManager.
