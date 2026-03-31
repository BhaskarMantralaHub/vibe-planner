---
name: Multi-team cricket architecture
description: Planned but not yet implemented — making cricket tool multi-tenant so any team can onboard with own branding/admin/players
type: project
---

Multi-team cricket support is planned on branch `feat/multi-team-cricket` with a detailed plan at `.claude/plans/snoopy-prancing-meteor.md`.

**Key decisions made:**
- Admin-only team creation (Bhaskar onboards teams)
- Multi-team users supported (one player can be on multiple teams)
- URL: `?team=slug` query param (static export compatible)
- New `cricket_teams` table + `team_id` FK on 7 cricket tables
- `cricket_players` doubles as junction table (with `role` column: player/admin/owner)
- Migration SQL delivered as a file to paste into Supabase SQL Editor

**Why:** To allow other cricket teams to use the tool with their own branding, admin, and isolated data.

**How to apply:** When resuming, start with Phase A (additive SQL + TeamContext infrastructure, no behavior changes). Bhaskar is concerned about breaking the live app — use strictly additive, backwards-compatible changes. Never modify existing RLS policies or columns until new ones are tested.
