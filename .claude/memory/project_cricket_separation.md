---
name: Cricket app separation to new repo
description: Cricket tool being extracted to standalone multi-tenant repo at cricket.viberstoolkit.com — design decisions from 2026-03-23
type: project
---

Cricket is being separated from vibe-planner-repo into a **new standalone repo** (`sunrisers-cricket-repo`).

**Key decisions (2026-03-23):**
- New repo: `cricket-hub` (`github.com/BhaskarMantralaHub/cricket-hub`) at `/Users/bmantrala/cricket-hub/`
- Fresh Next.js 15 project, NOT a fork
- Hosted at `cricket.viberstoolkit.com` (free subdomain, same Cloudflare account)
- Product name TBD — repo name is `cricket-hub`
- Same Supabase backend as vibe-planner (shared DB + Auth)
- Multi-tenant from day one: `cricket_teams` table, `team_id` on all cricket tables
- Roles: `super_admin` (platform-wide), `team_admin` (per-team), `player` (per-team)
- New `cricket_team_members` table for user ↔ team membership
- URL pattern: `cricket.viberstoolkit.com/t/[slug]` (path-based, free, zero config per team)
- Optional vanity subdomains later (e.g., `sunrisers.viberstoolkit.com`) — added manually per team in Cloudflare DNS, free
- vibe-planner-repo stays untouched for now; cricket code stripped later
- Redirects added to vibe-planner `public/_redirects` after new site is live: `/cricket/*` → `cricket.viberstoolkit.com/:splat`

**Why:** Dual-login on same domain was confusing. Bhaskar doesn't want to buy a second domain. Subdomain is free. Clean separation enables independent deploys, simpler code, and proper multi-tenant architecture.

**How to apply:** Build new repo fresh with multi-tenant schema. Port cricket components/store from vibe-planner-repo. Migrate existing Sunrisers data with backfill SQL. This supersedes the `feat/multi-team-cricket` branch approach — that branch is now obsolete.
