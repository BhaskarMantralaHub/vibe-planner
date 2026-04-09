# Multi-Team Architecture Design

> Council-reviewed design for adding multi-team support to the cricket module.
> Reviewed by: DB Architect, Frontend Architect, Security Architect, QA Architect, Product Architect.
> Date: 2026-04-06

---

## Overview

Transform the cricket module from single-team (Sunrisers Manteca) to multi-tenant, where:
- Each team has isolated data (players, seasons, expenses, matches, gallery)
- A player can belong to multiple teams and toggle between them
- Teams are onboarded independently via invite links
- A single super admin manages the platform; each team has its own owner/admins

---

## New Tables

### `cricket_teams`

```sql
CREATE TABLE cricket_teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  logo_url    TEXT,
  primary_color TEXT DEFAULT '#0369a1',  -- hex color for team branding
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at  TIMESTAMPTZ,               -- soft delete, never CASCADE
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT cricket_teams_slug_unique UNIQUE (slug),
  CONSTRAINT cricket_teams_slug_format CHECK (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  CONSTRAINT cricket_teams_name_unique UNIQUE (name)
);
```

### `team_members`

```sql
CREATE TABLE team_members (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id  UUID NOT NULL REFERENCES cricket_teams(id) ON DELETE RESTRICT,
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('owner', 'admin', 'player')),
  approved BOOLEAN NOT NULL DEFAULT true,  -- per-team approval
  joined_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT team_members_unique UNIQUE (team_id, user_id)
);

-- Prevent self-role-update
CREATE POLICY "members_update" ON team_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
    AND user_id != auth.uid()  -- cannot modify own row
  );

-- Prevent owner role assignment via direct update
CREATE OR REPLACE FUNCTION prevent_owner_escalation() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'owner' AND OLD.role != 'owner' THEN
    RAISE EXCEPTION 'Owner role can only be transferred via dedicated RPC';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_no_owner_escalation
  BEFORE UPDATE ON team_members FOR EACH ROW
  EXECUTE FUNCTION prevent_owner_escalation();
```

---

## Helper Functions (RLS)

```sql
-- Returns APPROVED team IDs only (chokepoint for ALL RLS policies)
CREATE OR REPLACE FUNCTION user_team_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT team_id FROM public.team_members
  WHERE user_id = auth.uid() AND approved = true;
$$;

-- Team-scoped admin check
CREATE OR REPLACE FUNCTION is_team_admin(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

-- Platform admin (super admin only) — use sparingly
CREATE OR REPLACE FUNCTION is_global_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND access @> '{admin}'
  );
$$;
```

---

## Tables Getting `team_id`

### Parent Tables (direct `team_id` FK + RLS + index)

| Table | Notes |
|-------|-------|
| `cricket_players` | Duplicate records per team (same user_id, different team_id). Stats are per-team. |
| `cricket_seasons` | Each team has its own seasons. |
| `cricket_expenses` | Scoped to team via season, but direct team_id for RLS performance. |
| `cricket_settlements` | Per-team financial settlements. |
| `cricket_season_fees` | Per-team fee tracking. |
| `cricket_sponsorships` | Per-team sponsorship income. |
| `cricket_gallery` | Per-team social feed. |
| `cricket_schedule_matches` | Per-team match schedule. |
| `practice_matches` | Per-team practice/scoring. |

### High-Volume Children (team_id via trigger + RLS)

These get `team_id` to prevent direct-query data leakage (Security Architect finding #2).

| Table | Auto-populate from |
|-------|-------------------|
| `practice_balls` | `practice_matches.team_id` via `match_id` |
| `practice_innings` | `practice_matches.team_id` via `match_id` |
| `practice_match_players` | `practice_matches.team_id` via `match_id` |
| `cricket_gallery_comments` | `cricket_gallery.team_id` via `post_id` |
| `cricket_notifications` | `cricket_gallery.team_id` via `post_id` |

```sql
-- Example auto-populate trigger (repeat pattern for each child table)
CREATE OR REPLACE FUNCTION set_child_team_id()
RETURNS TRIGGER AS $$
BEGIN
  -- For practice_balls, practice_innings, practice_match_players
  IF TG_TABLE_NAME IN ('practice_balls', 'practice_innings', 'practice_match_players') THEN
    NEW.team_id := (SELECT team_id FROM practice_matches WHERE id = NEW.match_id);
  END IF;
  -- For gallery_comments
  IF TG_TABLE_NAME = 'cricket_gallery_comments' THEN
    NEW.team_id := (SELECT team_id FROM cricket_gallery WHERE id = NEW.post_id);
  END IF;
  -- For notifications
  IF TG_TABLE_NAME = 'cricket_notifications' THEN
    NEW.team_id := (SELECT team_id FROM cricket_gallery WHERE id = NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Low-Volume Children (RLS via parent join — acceptable)

| Table | Scoped via |
|-------|-----------|
| `cricket_expense_splits` | `expense_id` → `cricket_expenses.team_id` |
| `cricket_gallery_tags` | `post_id` → `cricket_gallery.team_id` |
| `cricket_gallery_likes` | `post_id` → `cricket_gallery.team_id` |
| `cricket_comment_reactions` | `comment_id` → `cricket_gallery_comments.team_id` |

---

## RLS Pattern

```sql
-- READ: user can see data from teams they belong to
CREATE POLICY "team_read" ON cricket_players FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()));

-- WRITE: team admins can insert/update
CREATE POLICY "team_write" ON cricket_players FOR INSERT
  WITH CHECK (is_team_admin(team_id));

-- Low-volume child table pattern (via parent join)
CREATE POLICY "splits_read" ON cricket_expense_splits FOR SELECT
  USING (expense_id IN (
    SELECT id FROM cricket_expenses WHERE team_id IN (SELECT * FROM user_team_ids())
  ));
```

---

## Index Strategy

```sql
-- team_members lookup (critical for RLS helper)
CREATE INDEX idx_team_members_user_team ON team_members(user_id, team_id);
CREATE INDEX idx_team_members_team ON team_members(team_id);

-- Parent tables (single)
CREATE INDEX idx_cricket_players_team ON cricket_players(team_id);
CREATE INDEX idx_cricket_seasons_team ON cricket_seasons(team_id);
CREATE INDEX idx_cricket_expenses_team ON cricket_expenses(team_id);
CREATE INDEX idx_cricket_settlements_team ON cricket_settlements(team_id);
CREATE INDEX idx_cricket_season_fees_team ON cricket_season_fees(team_id);
CREATE INDEX idx_cricket_sponsorships_team ON cricket_sponsorships(team_id);
CREATE INDEX idx_cricket_gallery_team ON cricket_gallery(team_id);
CREATE INDEX idx_cricket_schedule_matches_team ON cricket_schedule_matches(team_id);
CREATE INDEX idx_practice_matches_team ON practice_matches(team_id);

-- High-volume children
CREATE INDEX idx_practice_balls_team ON practice_balls(team_id);
CREATE INDEX idx_practice_innings_team ON practice_innings(team_id);
CREATE INDEX idx_practice_match_players_team ON practice_match_players(team_id);
CREATE INDEX idx_gallery_comments_team ON cricket_gallery_comments(team_id);
CREATE INDEX idx_notifications_team ON cricket_notifications(team_id);

-- Composite indexes (frequent filter combinations)
CREATE INDEX idx_seasons_team_active ON cricket_seasons(team_id, is_active);
CREATE INDEX idx_expenses_team_season ON cricket_expenses(team_id, season_id);
CREATE INDEX idx_gallery_team_season ON cricket_gallery(team_id, season_id);
CREATE INDEX idx_practice_matches_team_season ON practice_matches(team_id, season_id);
```

---

## Role Permissions Matrix

| Permission | owner | admin | player |
|---|---|---|---|
| Manage team settings (name, color, logo) | yes | no | no |
| Transfer ownership | yes | no | no |
| Delete team (soft) | yes | no | no |
| Add/remove players | yes | yes | no |
| Manage expenses/settlements/fees | yes | yes | no |
| Manage seasons | yes | yes | no |
| Record match scores | yes | yes | yes |
| Post in gallery | yes | yes | yes |
| View all team data | yes | yes | yes |

---

## Player Multi-Team Model

**Approach: Duplicate records (Option A)**

- Same `user_id` appears in `cricket_players` multiple times with different `team_id`
- Stats, jersey number, photo, active status are all per-team
- Guest unique constraint becomes team-scoped:
  ```sql
  CREATE UNIQUE INDEX idx_guest_unique_per_team
    ON cricket_players(lower(name), team_id)
    WHERE is_guest = true AND is_active = true;
  ```
- Player linking on signup is team-scoped (match email within the target team)

---

## Frontend Architecture

### Routing (Static Export Compatible)

Team context via query param, NOT path segments:

```
/cricket?team=sunrisers-manteca
/cricket/scoring?team=sunrisers-manteca
/cricket/moments?team=sunrisers-manteca
```

### State Resolution (`useTeamContext()` hook)

Priority order:
1. `searchParams.get('team')` — URL param (source of truth)
2. `authStore.currentTeamId` — Zustand runtime state
3. `localStorage.getItem('vibe_last_team')` — persistence across sessions
4. First team in user's team list — fallback for single-team users

### Team Switcher UX

- **Single-team users:** Static team name in header, no switcher affordance
- **Multi-team users:** Tappable team name in header with `▾` chevron
  - Desktop: dropdown menu
  - Mobile: bottom sheet (existing `Drawer` component)
- **Blocked during scoring:** If active match exists, warn before team switch

### Data Loading on Team Switch

1. Reset all cricket store arrays to empty
2. Show skeleton states
3. `loadAll(newTeamId)` with parallel fetches
4. On error: toast, keep previous state visible

### Brand Theming

Each team stores `primary_color` (hex). `BrandProvider` sets CSS variables dynamically:
```typescript
document.documentElement.style.setProperty('--cricket', team.primary_color);
```
Offer 6-8 preset palettes (no full color picker — prevents accessibility issues).

---

## Onboarding Flow

### New Team Creation (target: under 5 minutes)

1. Land on marketing page → "Create Your Team" button
2. Sign up (name, email, password)
3. Team setup: team name, city, primary color (3 fields, 1 screen)
4. Auto-redirect to empty dashboard with guided prompts

### Player Invite

- Team admin gets a permanent shareable link: `/cricket?join=<uuid-token>`
- Tokens stored in `team_invites` table (permanent, no expiry/max-use for primary link)
- Direct `/cricket` signup is gated — requires an invite link (login still works without one)
- `team_slug` passed through signup metadata for deterministic team assignment

### Per-Team Approval

- **Pre-added players** (admin added email to roster) → auto-approved on signup
- **Existing multi-team players** (approved on another team) → auto-approved
- **Unknown players** → `team_members.approved = false` + `profiles.approved = false`
- `user_team_ids()` only returns teams where `approved = true` — single chokepoint for all RLS
- Pending user is signed out and sees "Pending Approval" screen (existing auth-store flow via `profiles.approved`)
- Admin sees "New Signups" popup in Shell header (PendingApprovals component) — scoped to current team
- **Approve** → sets both `team_members.approved` and `profiles.approved` to true, creates player record + welcome post
- **Reject** → deletes `team_members` row, removes cricket access or deletes user entirely
- RPCs: `approve_team_member(team_id, user_id)`, `reject_team_member(team_id, user_id)`

---

## Migration Plan

### Phase 1: Schema (HIGHEST RISK)

```sql
-- Step 1: Create tables
CREATE TABLE cricket_teams (...);
CREATE TABLE team_members (...);

-- Step 2: Insert existing team
INSERT INTO cricket_teams (id, name, slug, owner_id)
VALUES ('<fixed-uuid>', 'Sunrisers Manteca', 'sunrisers-manteca', '<bhaskar-uid>');

-- Step 3: Add team_id as NULLABLE to all tables
ALTER TABLE cricket_players ADD COLUMN team_id UUID REFERENCES cricket_teams(id);
-- ... repeat for all 14 tables (9 parent + 5 high-volume children)

-- Step 4: Backfill
UPDATE cricket_players SET team_id = '<fixed-uuid>';
-- ... all tables

-- Step 5: NOT NULL constraint
ALTER TABLE cricket_players ALTER COLUMN team_id SET NOT NULL;
-- ... all tables

-- Step 6: Indexes (see Index Strategy above)

-- Step 7: Populate team_members
INSERT INTO team_members (team_id, user_id, role)
SELECT '<fixed-uuid>', p.id,
  CASE WHEN p.access @> '{admin}' THEN 'admin' ELSE 'player' END
FROM profiles p
WHERE p.access @> '{cricket}';

-- Step 8: Set owner
UPDATE team_members SET role = 'owner'
WHERE user_id = '<bhaskar-uid>' AND team_id = '<fixed-uuid>';

-- Step 9: Drop old RLS, create new RLS
-- Step 10: Create/update helper functions
-- Step 11: Update all RPCs
```

### Phase 2: RPCs (HIGH RISK)

Audit and update all 17+ RPCs to accept/validate `team_id`:
- `create_practice_match` — validate all players belong to team
- `get_practice_leaderboard` — add team_id parameter
- `get_match_history` — team-scoped
- `create_welcome_post` — team-scoped gallery
- `get_public_season_data` — already token-scoped (verify)
- All others per scoring-schema.sql and cricket-schema.sql

### Phase 3: Store + Hooks

- `useTeamContext()` hook (URL param → store → localStorage)
- Auth store: load user's teams on login, set `currentTeamId`
- Cricket store: `loadAll(teamId)` with full reset + skeleton pattern
- Scoring store: pass `teamId` through match creation and resume

### Phase 4: Team Switcher UI

- Header inline team name (tappable for multi-team users)
- Bottom sheet team list on mobile
- Block during active scoring session

### Phase 5: Onboarding

- Team creation form (3 fields)
- Invite link generation and acceptance flow
- Remove hardcoded "Sunrisers Manteca" strings

### Phase 6: Tests (~80-100 new tests)

- RLS isolation tests (real Supabase or mocked)
- Multi-team store unit tests
- Migration validation queries
- Edge case matrix (12 cases identified)
- Post-migration smoke test checklist

---

## Feature Flag Strategy

```
Phase 1: Schema migration (no UI change)
  - Add team_id columns, backfill, new RLS
  - Keep existing UI behavior
  - Verify with validation queries

Phase 2: Behind feature flag
  - Add 'multi-team' to features array
  - Flag ON: team switcher visible, queries include team filter
  - Flag OFF: team_id silently injected as user's only team
  - Enable for admin first, then test user, then all

Phase 3: Remove flag
  - Drop old RLS policies
  - Team switcher always visible for multi-team users
```

---

## Security Checklist

- [ ] `team_id` on ALL queryable tables (parent + high-volume children)
- [ ] `user_team_ids()` STABLE SECURITY DEFINER helper
- [ ] `team_members` self-update blocked (trigger + policy)
- [ ] `is_team_admin()` vs `is_global_admin()` split
- [ ] Every SECURITY DEFINER RPC validates team membership internally
- [ ] Invite tokens use UUID (not guessable slugs) + expiry + max-use
- [ ] Email verification enforced in Supabase Auth settings
- [ ] Soft delete for teams (never CASCADE)
- [ ] Storage bucket RLS updated for team context

---

## Post-Migration Validation Queries

```sql
-- Zero NULLs on team_id
SELECT 'cricket_players', count(*) FROM cricket_players WHERE team_id IS NULL
UNION ALL SELECT 'cricket_seasons', count(*) FROM cricket_seasons WHERE team_id IS NULL
-- ... all tables

-- No cross-team data leaks
SELECT 'cross_team_split', count(*)
FROM cricket_expense_splits s
JOIN cricket_expenses e ON s.expense_id = e.id
JOIN cricket_players p ON s.player_id = p.id
WHERE e.team_id != p.team_id;

-- All team_ids reference existing teams
SELECT 'orphaned_players', count(*)
FROM cricket_players p
LEFT JOIN cricket_teams t ON p.team_id = t.id
WHERE t.id IS NULL AND p.team_id IS NOT NULL;

-- Teams have at least one owner
SELECT t.name, count(tm.id) AS owners
FROM cricket_teams t
LEFT JOIN team_members tm ON t.id = tm.team_id AND tm.role = 'owner'
GROUP BY t.name
HAVING count(tm.id) = 0;
```

---

## Scale Guidance

| Teams | Status | Action Needed |
|-------|--------|---------------|
| 1-5 | Comfortable | Current architecture |
| 5-10 | Monitor | Supabase Pro ($25/mo), image compression |
| 10-50 | Strained | Read replicas, co-maintainer or revenue |
| 50+ | Different product | Not a side project anymore |

**Cap at 3-5 teams for the first 6 months.** Invite teams you know personally. Build team admin self-service before onboarding team 2.
