# CLAUDE.md — Project Guide for AI Assistants

## New Machine Setup

After cloning, symlink Claude Code's memory to the repo copy so memory persists across devices:

```bash
# Find your project path (replace spaces/slashes with hyphens)
ln -s "$(pwd)/.claude/memory" ~/.claude/projects/-$(pwd | tr '/' '-' | sed 's/^-//')/memory
```

## Project Overview

Viber's Toolkit — a personal productivity suite hosted on Cloudflare Pages. Two users (Bhaskar + wife). Multiple tools under one shell with hamburger menu navigation.

### Tools
- **Vibe Planner** — Kanban board + timeline for tasks/ideas (toolkit users)
- **ID Tracker** — Track identity documents (US + India) for family members, with expiry reminders (toolkit users)
- **Sunrisers HQ** — Expense tracking, dues, settlements for Sunrisers Manteca cricket team (cricket users)
- **Admin Dashboard** — User management, pending approvals, activity stats (admin only)

### Role-Based Access
The app supports multiple user roles with isolated experiences:

| Role | Tools visible | Signup | Branding |
|------|---------------|--------|----------|
| `toolkit` | Vibe Planner, Sports, ID Tracker | Auto-approved | Viber's Toolkit |
| `cricket` | Cricket Dashboard | Requires admin approval | Sunrisers Manteca |
| `admin` | All tools + Admin | Manual DB flag | Viber's Toolkit |

- Roles stored in `profiles.access` (text array, e.g. `{toolkit,cricket,admin}`)
- **Features** stored in `profiles.features` (text array, e.g. `{vibe-planner,id-tracker}`, `{cricket}`)
- `profiles.approved` boolean — cricket signups start as `false` until admin approves
- Signup URL determines role: `/` → toolkit, `/cricket` → cricket
- `RoleGate` component enforces route-level protection (checks both role AND feature)
- `AuthGate` accepts `variant` prop (`toolkit` | `cricket`) for themed login pages
- Shell header and HamburgerMenu adapt branding based on URL path and user role

### Feature Toggles (Per-User Tool Visibility)

**Two separate concerns — roles vs features:**
- `profiles.access` = **roles/privileges** (controls RLS data access, admin capabilities)
- `profiles.features` = **tool visibility** (controls which tools appear in UI)
- `admin` in access grants management privileges but does NOT auto-grant tool visibility
- Only the **superadmin** (`NEXT_PUBLIC_SUPER_ADMIN_EMAIL`) can toggle features per user

**Feature values:** `vibe-planner`, `id-tracker`, `cricket`

**Default mapping on signup:**
| Signup path | `access` | `features` |
|-------------|----------|------------|
| `/` (toolkit) | `{toolkit}` | `{vibe-planner, id-tracker}` |
| `/cricket` | `{cricket}` | `{cricket}` |

**How it works:**
- `auth-store.ts` loads `userFeatures` from `profiles.features` on login
- Fallback: if `features` is null/empty, derives from `access` (backward compat)
- `hasFeature(f)` — checks features array, NO admin override
- `hasAccess(r)` — checks access array, admin IS an override (for RLS)
- `HamburgerMenu` filters tools by `userFeatures` (feature-gated tools) or `userAccess` (role-gated tools like Admin)
- `RoleGate` accepts optional `feature` prop — checks both role AND feature
- `lib/nav.tsx` — each Tool has a `feature` field mapping to the feature toggle value
- Admin page: superadmin sees feature badges (VP/ID/CR pills) per user + "Manage Features" drawer with toggle switches

**Migration:** `docs/feature-toggles-migration.sql` — adds column, populates defaults, idempotent

### Signup & Access Flows

Six flows cover all signup/login scenarios (pre-added player, existing toolkit user, random signup, etc.). Player linking uses case-insensitive email match in 3 places: DB trigger, AuthGate, auth-store backup.

**CRITICAL:** `AuthGate` only renders `RequestAccess` after `userAccess.length > 0` to prevent race condition (duplicate welcome posts).

Full flow details: `docs/SIGNUP_FLOWS.md`

## Tech Stack

- **Framework:** Next.js 15 (App Router, static export)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 with CSS custom properties for theming
- **State:** Zustand
- **Charts:** recharts (SVG-based, for cricket expense breakdowns)
- **Drag & Drop:** @dnd-kit/core
- **Design System:** CVA (class-variance-authority) + Radix UI + shadcn/ui pattern
- **Toasts:** sonner (lightweight toast notifications)
- **Class Utils:** clsx + tailwind-merge via `cn()` helper
- **Animations:** motion (framer-motion v11+), @formkit/auto-animate
- **Bottom Sheets:** vaul (iOS-style draggable drawers)
- **Icons:** lucide-react (Moments feed), react-icons (rest of app)
- **Auth & Database:** Supabase (PostgreSQL + Auth + Row Level Security)
- **Hosting:** Cloudflare Pages (static export, auto-deploys from `main`)
- **Theme:** next-themes (dark/light, stored in localStorage as `vibe_theme`)

## Project Structure

```
├── app/
│   ├── layout.tsx                  # Root layout: ThemeProvider, Shell
│   ├── page.tsx                    # Redirects to /vibe-planner
│   ├── globals.css                 # Tailwind + dark/light CSS variables
│   ├── providers.tsx               # ThemeProvider + Toaster wrapper
│   └── (tools)/
│       ├── vibe-planner/           # Vibe Planner tool
│       │   ├── page.tsx
│       │   ├── components/         # Board, VibeCard, Header, etc.
│       │   └── lib/                # constants, utils
│       ├── id-tracker/            # ID Tracker tool
│       │   ├── page.tsx
│       │   └── lib/               # constants (ID types), utils (urgency helpers)
│       └── cricket/               # Sunrisers HQ tool
│           ├── page.tsx            # Dashboard with bottom tab bar (Players | Finances | Share)
│           ├── components/         # SeasonSelector, PlayerManager, ExpenseForm, Gallery, etc.
│           ├── lib/                # constants, utils (balance calculations)
│           ├── moments/            # Moments feed (standalone page, all seasons, hamburger menu)
│           │   └── page.tsx
│           ├── scoring/            # Live Scoring (standalone full-screen page)
│           │   ├── page.tsx        # Landing, wizard, match routing
│           │   ├── components/     # ScoringScreen, ButtonGrid, WicketSheet, PracticeLeaderboard, PodiumHero, etc.
│           │   ├── leaderboard/    # Practice Stats leaderboard (hamburger menu item)
│           │   │   └── page.tsx
│           │   └── lib/            # scoring-utils.ts (type converters), avatar.ts (shared)
│           ├── toss/               # Coin Toss standalone page (hamburger menu item)
│           │   └── page.tsx
│           └── schedule/           # League Schedule standalone page (hamburger menu item)
│               └── page.tsx
├── app/cricket/dues/              # Public share page (no auth required)
│   └── page.tsx
├── components/                     # Shared: Shell, AuthGate, RoleGate, HamburgerMenu, PageFooter, etc.
│   └── ui/                        # Design system: Button, Input, Dialog, Alert, Card, Badge, etc.
├── lib/                            # Supabase client, auth helpers, storage, nav, utils (cn), brand
├── stores/                         # Zustand stores (auth-store, vibe-store, id-tracker-store, cricket-store, scoring-store)
├── types/                          # TypeScript types (scoring.ts for live scoring)
├── tests/                          # Playwright E2E tests
├── public/                         # Static assets (hero.png, toss.png, cricket-hero.png, cricket-logo.png, _headers, _redirects)
├── .env.local                      # GITIGNORED — Supabase credentials
├── .env.example                    # Template for env vars
└── docs/SUPABASE_SETUP.md          # Database setup guide
```

## Commands

```bash
npm run dev        # Local dev server at http://localhost:3000
npm run build      # Static export to out/
npx serve out      # Preview production build
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable anon key |
| `NEXT_PUBLIC_MAX_USERS` | Max allowed signups (default: 10) |

## Database Schema

Table `profiles`: `id` (UUID, FK to auth.users), `email`, `full_name`, `is_admin`, `disabled`, `access` (text array — roles/privileges, e.g. `{toolkit,cricket,admin}`), `features` (text array — tool visibility, e.g. `{vibe-planner,id-tracker,cricket}`), `approved` (boolean), `created_at`.

Table `vibes`: `id` (UUID), `user_id`, `text`, `status`, `category`, `time_spent`, `notes`, `due_date`, `position`, `completed_at`, `deleted_at`, `created_at`, `updated_at`.
Statuses: `spark`, `in_progress`, `scheduled`, `done`. Soft delete via `deleted_at`.

Table `id_documents`: `id` (UUID), `user_id`, `id_type`, `country` (US/IN), `label`, `owner_name`, `description`, `expiry_date`, `renewal_url`, `reminder_days` (integer array), `created_at`, `updated_at`.

### Cricket Tables
Table `cricket_players`: `id`, `user_id` (UUID, nullable — NULL for admin-created players until the player signs up and links via email match), `name`, `jersey_number`, `phone`, `photo_url` (Supabase Storage public URL), `is_active`, `is_guest` (BOOLEAN, true for auto-created guest players from practice matches — can be promoted to roster via `promote_guest_to_roster` RPC), `created_at`, `updated_at`. Unique index on `lower(name) WHERE is_guest = true AND is_active = true` prevents duplicate guests.
Storage bucket `player-photos`: Public bucket for player profile photos. Path: `{user_id}/{player_id}.jpg`. Only the player themselves can upload (RLS by `auth.uid()`).
Table `cricket_seasons`: `id`, `user_id`, `name`, `year`, `season_type`, `share_token` (UUID for public URL), `is_active`, `created_at`, `updated_at`.
Table `cricket_expenses`: `id`, `user_id`, `season_id`, `paid_by` (player FK), `category`, `description`, `amount` (NUMERIC), `expense_date`, `created_by` (TEXT), `updated_by` (TEXT), `deleted_at`, `deleted_by` (TEXT), `created_at`, `updated_at`.
Table `cricket_expense_splits`: `id`, `expense_id`, `player_id`, `share_amount` (NUMERIC). Junction table for equal splits.
Table `cricket_settlements`: `id`, `user_id`, `season_id`, `from_player`, `to_player`, `amount`, `settled_date`, `created_at`.
Table `cricket_season_fees`: `id`, `season_id`, `player_id`, `amount_paid` (NUMERIC), `paid_date`, `marked_by` (TEXT), `created_at`. Tracks per-player season fee payments (full/partial).
Table `cricket_sponsorships`: `id`, `season_id`, `sponsor_name`, `amount` (NUMERIC), `sponsored_date`, `notes`, `created_by` (TEXT), `updated_by` (TEXT), `deleted_at`, `deleted_by` (TEXT), `created_at`, `updated_at`.
Table `cricket_schedule_matches`: `id`, `season_id` (FK seasons CASCADE), `opponent`, `match_date` (DATE), `match_time` (TEXT HH:MM), `venue`, `match_type` ('league'|'practice'), `overs` (INTEGER DEFAULT 20), `status` ('upcoming'|'completed'), `notes`, `result` ('won'|'lost'|'tied'), `team_score`, `team_overs`, `opponent_score`, `opponent_overs`, `result_summary`, `created_by` (TEXT), `deleted_at`, `deleted_by` (TEXT), `created_at`, `updated_at`. Schema: `docs/schedule-schema.sql`.
Table `cricket_gallery`: `id`, `season_id`, `user_id`, `photo_url` (first photo, backward compat), `photo_urls` (TEXT array, multi-photo), `caption`, `posted_by` (TEXT), `deleted_at`, `created_at`.
Table `cricket_gallery_tags`: `id`, `post_id` (FK gallery), `player_id` (FK players), UNIQUE(post_id, player_id).
Table `cricket_gallery_comments`: `id`, `post_id` (FK gallery), `user_id`, `comment_by` (TEXT), `text`, `created_at`.
Table `cricket_gallery_likes`: `id`, `post_id` (FK gallery), `user_id`, UNIQUE(post_id, user_id).
Table `cricket_comment_reactions`: `id`, `comment_id` (FK gallery_comments), `user_id`, `emoji`, UNIQUE(comment_id, user_id, emoji).
Table `cricket_notifications`: `id`, `user_id`, `post_id` (FK gallery), `type` (tag/comment/like), `message`, `is_read`, `created_at`. Each user reads only their own (RLS by user_id).
Storage bucket `gallery-photos`: Public bucket for team gallery photos. Path: `{season_id}/{post_id}.jpg`. Any cricket user can upload.

### Player `user_id` Linking — CRITICAL
- `cricket_players.user_id` is **nullable**. Admin-created players start with `user_id: NULL`.
- When a player signs up/logs in, their `auth.users.id` is linked to `cricket_players.user_id` via **case-insensitive email match** (`ILIKE`) where `user_id IS NULL`.
- **Never set `user_id` to the admin's auth ID** when creating players — this was a past bug that caused wrong avatar/photo resolution across the app.
- Linking happens in 3 places: (1) DB trigger `handle_new_user` on signup, (2) `AuthGate` auto-approve flow, (3) `auth-store.ts` login backup.
- `user_id` is used to resolve player avatars in Moments (comments, likes, post headers). If `user_id` is wrong, the wrong photo shows.
- The `comment_by` and `posted_by` TEXT fields store the display name at time of action — but avatar resolution uses `user_id` → `cricket_players` → `photo_url`, NOT name matching (names can be ambiguous, e.g. "Venkat Kittu" vs "Venkat Subbu").

RPC: `get_public_season_data(token UUID)` — SECURITY DEFINER function returning all season data as JSON for the public share page.
RPC: `check_cricket_player_email(check_email TEXT)` — checks if a player exists with given email (for auto-approve on signup).
RPC: `get_signed_up_emails(check_emails TEXT[])` — SECURITY DEFINER function returning lowercase emails from auth.users that match the input array (case-insensitive). Used by PlayerManager to show signup status dots.
RPC: `create_welcome_post(new_user_id UUID, player_name TEXT)` — SECURITY DEFINER function that creates a welcome post in Moments + notifies all active players. Called by client on manual approval; also called internally by `handle_new_user` trigger for auto-approved players.

Full SQL in `docs/DATABASE_SCHEMA.sql` and `docs/cricket-schema.sql`.

### Live Scoring Tables & Architecture

**Route:** `/cricket/scoring` — standalone full-screen page (not inside cricket dashboard tabs).
**Store:** `stores/scoring-store.ts` (Zustand) — full match lifecycle, ball-by-ball logic, computed stats.
**Types:** `types/scoring.ts` — `ScoringMatch`, `ScoringBall`, `ScoringInnings`, `BattingStats`, `BowlingStats`.
**Schema:** `docs/scoring-schema.sql` — 4 tables, 17 RPCs, reviewed by DBA/Arch/SQL agents.

#### Tables
Table `practice_matches`: `id`, `season_id`, `created_by`, `title`, `match_date`, `overs_per_innings`, `status` (setup/scoring/innings_break/completed), `current_innings` (0 or 1), `team_a_name`, `team_b_name`, `toss_winner`, `toss_decision`, `result_summary`, `match_winner`, `mvp_player_id`, `scorer_name`, `scorer_id`, `active_scorer_id`, `scorer_heartbeat`, `previous_match_id` (rematch link), `match_number`, `share_token` (public URL), `started_at`, `completed_at`, `created_at`, `updated_at`.
Table `practice_match_players`: `id`, `match_id` (CASCADE), `player_id` (FK to cricket_players — set for ALL players including guests), `team` (team_a/team_b), `name`, `jersey_number`, `is_guest`, `is_captain`, `batting_order`, `created_at`. Match-local player snapshots — all ball references use these IDs, not global roster IDs.
Table `practice_innings`: `id`, `match_id` (CASCADE), `innings_number` (0 or 1), `batting_team`, `total_runs`, `total_wickets`, `total_overs`, `legal_balls`, `extras_wide`, `extras_no_ball`, `extras_bye`, `extras_leg_bye`, `striker_id`, `non_striker_id`, `bowler_id`, `target`, `is_completed`, `created_at`, `updated_at`. Denormalized totals updated after every ball for fast scoreboard reads.
Table `practice_balls`: `id`, `match_id` (CASCADE), `innings_number`, `sequence`, `over_number`, `ball_in_over`, `striker_id`, `non_striker_id`, `bowler_id`, `runs_bat` (0-7), `runs_extras`, `extras_type` (wide/no_ball/bye/leg_bye), `is_legal`, `is_free_hit`, `is_wicket`, `wicket_type` (bowled/caught/run_out/stumped/hit_wicket/retired), `dismissed_id`, `fielder_id`, `deleted_at` (soft delete for undo), `created_at`. Every delivery is an immutable row.

#### Key Constraints
- Wicket consistency: `is_wicket=true` requires `wicket_type` to be set
- Wide/no-ball must have `runs_extras >= 1`
- Toss: both `toss_winner` and `toss_decision` set together or both null
- Ball sequence: partial unique index `WHERE deleted_at IS NULL` (allows undo/redo)
- Players: partial unique on `(match_id, player_id, team) WHERE player_id IS NOT NULL` — allows same guest on both teams
- Overs validation: decimal part 0-5 only
- `created_by` immutable via trigger

#### RLS Policies
- **Read**: All cricket users can read all 4 tables
- **Write (balls/innings)**: Only `active_scorer_id` or `created_by`, AND match must be in `scoring`/`innings_break` status (blocked after completion)
- **Delete matches**: Creator or admin (CASCADE cleans up children)
- **Admin**: Can delete from any table regardless of match status (cleanup)

#### RPCs
- `create_practice_match(...)` → atomic: creates match + players + innings in one transaction, upserts guest players into `cricket_players` (ON CONFLICT dedup by `lower(name)`), returns server player ID mapping
- `get_match_history(status, limit, offset)` → paginated match list with both innings scores (landing page)
- `get_match_scorecard(match_id)` → full data dump: match + players + innings + balls (scorecard view)
- `get_public_match_scorecard(share_token)` → no-auth public view, internal IDs stripped
- `claim_scorer(match_id, name)` → atomic handoff with row-level lock (`FOR UPDATE NOWAIT`)
- `release_scorer(match_id)` → release scoring rights (self, creator, or admin)
- `get_rematch_template(match_id)` → pre-fill teams/players for back-to-back matches
- `get_practice_leaderboard(season_id, category, match_limit)` → season stats with optional last-N-matches filter: batting (runs, SR, 4s/6s), bowling (wickets, economy, excludes byes/leg-byes), fielding (sorted by total dismissals), all-rounder (combined score with matches count)
- `soft_delete_match(match_id, deleter_name)` → soft-delete (sets deleted_at), creator or admin only
- `restore_match(match_id)` → restores soft-deleted match, creator or admin only
- `permanent_delete_match(match_id)` → hard delete with CASCADE (admin only, requires deleted_at IS NOT NULL)
- `get_deleted_matches(limit)` → admin-only list of soft-deleted matches for Deleted filter tab
- `revert_match_to_scoring(match_id)` → admin-only, reverts abruptly ended match (no winner) back to scoring/innings_break. Smart logic: if 2nd innings has players → scoring, if 1st completed → innings_break, else scoring
- `get_guest_suggestions()` → returns `{id, name}` from `cricket_players WHERE is_guest = true` for autocomplete in wizard
- `promote_guest_to_roster(player_id, jersey, phone, email)` → admin-only, flips `is_guest=false`, validates email uniqueness, stats carry over
- `get_match_scorecard` returns `striker_id`, `non_striker_id`, `bowler_id` in innings data (needed for match resume)

#### Sync Architecture (Optimistic Local-First)
- **Match creation**: Awaited — must complete before scoring starts (need server player IDs for FK references)
- **Every ball**: Fire-and-forget — INSERT ball + UPDATE innings in background. If fails, toast warning, ball stays local.
- **Undo**: Fire-and-forget — UPDATE ball `deleted_at` + UPDATE innings totals
- **End match**: Awaited — UPDATE match status/result
- **Handoff**: Awaited — `claim_scorer` RPC with row lock
- **Match resume** (new device / page refresh): Call `get_match_scorecard` to hydrate store (includes striker/bowler IDs), then `claim_scorer` for RLS write access. "Continue Scoring" always re-hydrates from DB to avoid stale localStorage.
- **Stale match detection**: On landing mount, auto-verifies local match with server via `resumeMatch`. If match was completed/deleted on another device, `reset()` clears localStorage + sessionStorage. Sync button on active match card for manual check. "Resume Scoring" button on DB active match cards for multi-device handoff. Only one active match allowed at a time (blocks "Start New Match" when any active match exists in local store or DB).
- **End match result logic**: Only declares winner when both innings completed naturally (`is_completed` on both). Mid-innings abort = "No result". `endInnings` on 2nd innings delegates to `endMatch` for proper result computation. `match_winner` always derived from scores.
- **Revert match**: Admin can revert abruptly ended (no winner) matches. Smart status: if 2nd innings has players → `scoring`, if 1st innings completed → `innings_break`, else `scoring`.
- **Spectators**: Subscribe to Supabase Realtime on `practice_matches` + `practice_innings` for live score updates (planned)

#### Scoring UI & Match Lifecycle

Components in `app/(tools)/cricket/scoring/components/`. Match lifecycle: Landing → Wizard (5 steps) → Scoring → Innings Break → 2nd Innings → Result → History.

Full component list and lifecycle diagram: `docs/SCORING_UI.md`

## Design System (`components/ui/`)

Shared UI components following the **shadcn/ui pattern** (copy-paste, own-the-code) with CVA for type-safe variants, Radix UI for accessible primitives, and sonner for toast notifications.

### Stack
- **CVA** + **Radix UI** + **sonner** + **cn()** (`clsx + tailwind-merge`)
- **BrandProvider** (`lib/brand.tsx`) — toolkit (purple) / cricket (sky blue/navy) theming
- Themes configurable via 4 CSS vars each in `globals.css`: `--toolkit*` and `--cricket*`
- Components auto-detect brand from `BrandProvider`

Full component table with props, usage examples, brand context: `docs/DESIGN_SYSTEM.md`

### Rules for New Components
1. **Always use shared components** — never inline Tailwind for buttons, inputs, modals, alerts
2. **Use `cn()` for conditional classes** — never string concatenation
3. **Use CVA for new variants** — define in the component file, export the variants function
4. **Use Radix Dialog** for modals — never hand-roll overlay + panel + close button
5. **Use `toast()`** for user feedback — every create/update/delete action should confirm success or report failure
6. **Use `<Text>`** for ALL text elements — never use raw `text-[Xpx]` Tailwind classes. The Text component enforces the 7-size type scale (2xs/xs/sm/md/lg/xl/2xl) and prevents typography inconsistency.
6. **Use shared `Drawer`** for bottom sheets — never use raw `vaul` directly. The shared Drawer handles iOS Safari keyboard, scroll-to-dismiss, and viewport issues automatically via `useKeyboardHeight` hook.
7. **Viewport zoom is disabled** (`maximumScale: 1, userScalable: false` in `app/layout.tsx`) — appropriate for web app, prevents accidental pinch-zoom on iOS

## Key Architecture

- **Static export** (`output: 'export'`) — no server-side code at runtime
- **All Supabase calls are client-side** via `@supabase/ssr` browser client
- **Zustand stores** — `auth-store.ts` (auth state, login/signup/reset, role/access), `vibe-store.ts` (vibes CRUD, UI state), `id-tracker-store.ts` (ID documents CRUD), `cricket-store.ts` (players, seasons, expenses, splits, settlements, gallery/moments)
- **Moments feed** — Gallery/GalleryPost/GalleryUpload components use `motion/react` for animations (double-tap heart, post entrance), `vaul` for bottom sheet menus (post actions, comment actions, liked-by, confirm delete, upload), `@formkit/auto-animate` for comment list animations, `lucide-react` for icons
- **Role-based access** — `profiles.access` for RLS/privileges, `profiles.features` for tool visibility; `RoleGate` checks both role AND feature; `AuthGate` variant prop for themed login; superadmin toggles features per user from admin page
- **RLS enforced** — every query filters by `user_id`, server-side RLS as backup
- **Soft delete** — `deleted_at` column, Recently Deleted UI with restore (vibes, practice matches); `is_active` flag for cricket players. Practice matches support soft-delete → restore → permanent delete (CASCADE) with admin-only Recently Deleted section.
- **Public pages** — `/cricket/dues/` public share page bypasses auth, uses SECURITY DEFINER RPC function
- **Feature branches** — develop on branches, merge to `main` only when ready to deploy

## Git Workflow

- Use **feature branches** (e.g., `feat/sports-toss`), not direct push to main
- Main branch auto-deploys to Cloudflare Pages — limited build quota
- Commit convention: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`

## Bug Fixing — MANDATORY Process

When a user reports an issue is **not resolved after a fix attempt**, do NOT immediately try another quick fix. Instead:

1. **Stop and form an agent council** — Launch 2-3 specialist agents in parallel to research the root cause deeply (iOS Safari behavior, library GitHub issues, how production apps solve it, codebase analysis)
2. **Wait for all agents to report back** — Synthesize findings before writing any code
3. **Present the solution plan** — Explain the root cause and proposed fix to the user before implementing
4. **One permanent fix** — Never push iterative band-aids. Each failed attempt erodes trust and wastes deploy quota.

This applies especially to:
- iOS Safari / mobile browser issues (keyboard, viewport, scroll, touch)
- Cross-platform rendering differences
- Animation/positioning bugs (dialog repositioning, drawer conflicts)
- Auth flow edge cases

## Working Style — MANDATORY

- **One change at a time** — implement a single change, explain what changed, wait for the user to test on their device (especially mobile Safari), only commit/push when they approve. Never batch unrelated changes.
- **Never push without explicit consent** — the user says "push" or "looks good" before you push. This is a production app with real users.
- **No secrets in bash** — don't run bash commands that contain or grep for actual credentials, passwords, or emails. Use generic patterns or check git diff output manually.
- **UI design standards** — when redesigning, make a dramatic visual difference in one pass, not incremental tweaks. Prefer clean card styles over gradient backgrounds for text. Use `lucide-react` for icons. Bottom sheets for mobile actions. No features the user hasn't asked for.
- **Cross-platform mobile rules:**
  - Modals/dialogs: use flexbox centering (not CSS transform) to avoid mobile positioning bugs
  - Touch targets: minimum 44px for all interactive elements
  - Inputs: handle iOS keyboard viewport push, use `autoComplete` attributes
  - Bottom sheets (vaul): prefer over dropdowns on mobile
  - Avoid hover-only interactions — they don't work on touch devices
  - Use `px-4` padding on fixed overlays for safe area on small screens
  - Test animations on mobile — avoid heavy transforms that cause jank

## Shared Components — MANDATORY Check

Before writing ANY UI code, check `components/ui/` for an existing shared component. NEVER duplicate what already exists.

**Available shared components** (always use these instead of inline Tailwind):
- `Text` — ALL text elements (headings, body, labels, captions)
- `Button` — ALL buttons (primary, secondary, danger, ghost, link)
- `Input` — ALL form inputs (with label, error, brand focus)
- `PasswordInput` — Password fields (eye toggle + requirements)
- `Alert` — ALL error/success/warning banners
- `Card` — ALL bordered card containers
- `Badge` — ALL status pills/tags
- `Label` — ALL form labels (regular + uppercase)
- `Dialog` — ALL centered modals
- `Drawer` — ALL bottom sheets
- `Spinner` — ALL loading indicators
- `Skeleton` — ALL loading placeholders
- `EmptyState` — ALL empty data screens
- `FilterDropdown` — ALL category filters with counts
- `CardMenu` — ALL three-dot dropdown menus (never hand-roll portal menus)
- `RefreshButton` — ALL manual refresh actions (self-managed spinner, `bordered` or `glass` variant)
- `CapsuleTabs` — ALL primary tab navigation (expandable capsule with icon+text, gradient, animation)
- `SegmentedControl` — ALL sub-view toggles (matching capsule design: gradient, rounded-full, glow)
- `toast` (sonner) — ALL user feedback notifications

**If a component doesn't exist for your need:** Create it in `components/ui/`, add to `index.ts` barrel export, document in this section, then use it.

## QA Before Presenting to User — MANDATORY

Before presenting ANY code change to the user for review:
1. **Run tests** — `npx vitest run` must pass
2. **Run build** — `npx next build` must pass with zero errors
3. **Verify on localhost** — Mentally trace through the change on desktop AND mobile viewports
4. **Check edge cases** — What happens when the data is empty? What about dark/light mode? What about iOS Safari?
5. **Test the interaction** — If it's a modal, does it open AND close properly? If it's a button, does clicking it work? If it's a form, does submit + cancel both work?

Never present a half-tested change. The user should not be finding basic bugs like "modal doesn't close" or "wrong brand color".

## Scoring Flows — MANDATORY Preservation

Before modifying ANY code in `stores/scoring-store.ts`, `app/(tools)/cricket/scoring/`, or `types/scoring.ts`, you MUST:

1. **Read `docs/SCORING_UI.md`** — contains all documented workflows, edge cases, and component contracts
2. **Verify no flows are broken** — every change must preserve ALL of these critical flows:
   - **Ball recording** — runs, extras (wide/no-ball/bye/leg-bye with correct strike swap + run attribution), wickets (all 6 types), free hit mechanics
   - **Undo/redo** — unified action stack (balls + retirements), undo recovery after page refresh via `balls.length` fallback, redo clearing on new ball
   - **Scorer takeover** — `claim_scorer` RPC with row lock, proactive mount check, `syncToDb` error detection, non-dismissible dialog, write blocking via `takenOverBy` guard
   - **Player management** — add from roster/guest/new guest, remove/move with `canRemovePlayer` safety checks, move-to-other-team with failure recovery
   - **Change opening bowler** — only when `inningsBallCount === 0` (counts ALL ball types), undo restores editability
   - **End-of-over** — non-dismissible modal, "just bowled" filtering, tiny-team safety valve
   - **Innings break** — 2nd innings setup dialog with tap-to-select/deselect batsmen, target display, validation
   - **Match completion** — result computation (win/tie/no-result), inline result screen with mini scorecards + 3 action buttons
   - **4-tab navigation** — Scoring/Ball-by-Ball/Scorecard/Squads tabs with correct visibility
   - **Retired player states** — retirement, undo retirement, return-to-crease, replacement tracking
   - **Stale match detection** — sync button, resumeMatch hydration, reset on completed/deleted
   - **Revert match** — admin only, `!match_winner` condition, smart status restoration

3. **Cross-reference edge cases** in `docs/SCORING_UI.md` "Edge Cases & Special States" section
4. **Run scoring-related tests** after any change to scoring code
5. **Proactive conflict detection** — When the user requests a change that would break or alter an existing documented flow:
   - **STOP before implementing.** Tell the user exactly which flow(s) from `docs/SCORING_UI.md` will be affected and how.
   - **Ask for explicit confirmation** before proceeding (e.g., "This will change the undo behavior after page refresh — currently it recovers via balls.length fallback. Should I proceed?").
   - **After implementing**, update `docs/SCORING_UI.md` to reflect the new behavior so the documentation stays in sync with the code. Never leave stale documentation.

Also reference: `docs/SIGNUP_FLOWS.md` (auth/access flows), `docs/BACKUP_RESTORE.md` (backup table list), `docs/DESIGN_SYSTEM.md` (component props), `docs/EMAIL_SETUP.md` (SMTP config), `docs/TESTING.md` (test structure).

## Testing — MANDATORY

**ALWAYS update or add unit tests when changing code.** Tests live in `tests/unit/` and use Vitest.

```bash
npm test                # Run all tests with verbose output + JUnit report
npm run test:watch      # Watch mode during development
npm run test:coverage   # Tests + coverage report (text + HTML)
npm run test:report     # Full report → open test-results/coverage/index.html
npx next build          # Must pass before pushing
```

Tests in `tests/unit/` (per-store local + cloud modes, auth helpers, lib utilities) and `tests/integration/` (signup flows). Full test structure table, mock setup, output formats: `docs/TESTING.md`

### Rules
- Every new store action MUST have a corresponding test
- Every bug fix SHOULD include a regression test
- Run `npx vitest run && npx next build` before every push

## Backup & Disaster Recovery

Daily backup via GitHub Actions (`.github/workflows/backup.yml`) exports 20 tables as JSON to `vibe-planner-backups` repo. When creating a new table, **MUST** add it to both `backup.yml` and `restore.yml`.

Full details (table list, restore steps, what's backed up): `docs/BACKUP_RESTORE.md`

## Security — MANDATORY Pre-Commit Checks

**ALWAYS run this before every commit:**

1. **Scan for secrets** — no Supabase URLs, API keys, passwords, or emails in committed files:
   ```bash
   git diff --cached | grep -iE "mcklzjmaivtwdhjauwtv|sb_publishable|Welcome|bmantrala@" && echo "SECRETS FOUND!" || echo "CLEAN"
   ```

2. **Verify .gitignore** — these must NEVER be committed:
   - `.env.local` (Supabase credentials)
   - `.claude/settings.json`, `.claude/settings.local.json` (may contain credentials)
   - `node_modules/`, `.next/`, `out/`
   - `vibe-planner/config.js` (old vanilla JS credentials)

3. **Test files** — must use `process.env.TEST_EMAIL` / `process.env.TEST_PASSWORD`, never hardcoded credentials

4. **Build check** — `npx next build` must pass with zero errors before pushing

## Documentation — MANDATORY Updates

When making changes, ALWAYS update these files if affected:

1. **`docs/DATABASE_SCHEMA.sql`** — if any SQL changes (new tables, columns, policies, functions, triggers)
2. **`docs/SUPABASE_SETUP.md`** — if any config/setup changes (env vars, build settings, new tables)
3. **`CLAUDE.md`** — if architecture, commands, or workflow changes
4. **`README.md`** — if features, tech stack, or project structure changes
5. **`.env.example`** — if any new environment variables are added
6. **`.github/workflows/backup.yml` + `restore.yml`** — if any new tables are created, add them to the backup/restore table lists and update the Backed Up Tables count in CLAUDE.md

## SQL Changes — MANDATORY Agent Review

For ANY change to SQL schema files (`docs/*.sql`), you MUST:

1. **Get reviewed by DBA agent** — check data integrity, constraints, indexes, performance
2. **Get reviewed by Architecture agent** — check RLS policies, security, access control, data flow
3. **Get reviewed by SQL specialist agent** — check query correctness, function safety, injection vectors
4. Run all three reviews BEFORE committing. Fix all CRITICAL and HIGH issues. Document any accepted MEDIUM/LOW risks.

## Adding a New Tool

1. Create folder under `app/(tools)/your-tool/`
2. Add `page.tsx` inside it
3. Add entry to `lib/nav.ts` with `roles` array specifying which user roles can see it
4. Create Zustand store in `stores/` if the tool has data
5. Create types in `types/` for TypeScript definitions
6. Wrap page content in `<AuthGate>` (with optional `variant` for themed login)
7. Wrap page content in `<RoleGate allowed={['role1', 'admin']}>` for access control
8. Test locally with `npm run dev`
9. Push to feature branch, create PR, merge when ready

## Email

Transactional emails via **Resend** (SMTP) + Supabase Auth. Sender: `noreply@viberstoolkit.com`. Templates in `docs/email-templates/`. Rate limit: 60s per user.

Full setup (SMTP config, troubleshooting, template list): `docs/EMAIL_SETUP.md`
