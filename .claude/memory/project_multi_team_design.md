---
name: multi_team_design
description: Multi-team architecture design for cricket module — council-reviewed, doc at docs/MULTI_TEAM_DESIGN.md (2026-04-06)
type: project
---

Multi-team cricket support designed and reviewed by 5-agent council (DB, Frontend, Security, QA, Product architects) on 2026-04-06.

**Key decisions:**
- `cricket_teams` + `team_members` tables, `team_id` FK on 14 tables (9 parent + 5 high-volume children)
- `user_team_ids()` STABLE SECURITY DEFINER helper for RLS performance
- Player multi-team via duplicate records (same user_id, different team_id)
- URL routing via `?team=slug` query param (static export compatible)
- Three-layer state: URL param > Zustand > localStorage
- Feature flag rollout: schema first, UI behind flag, then full rollout
- Cap at 3-5 teams initially

**Why:** Users want to onboard additional cricket teams with isolated data. Current single-team architecture hardcodes "Sunrisers Manteca" everywhere.

**How to apply:** Full design doc at `docs/MULTI_TEAM_DESIGN.md`. Implementation phases: Schema > RPCs > Store/Hooks > Team Switcher UI > Onboarding > Tests.
