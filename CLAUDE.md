# CLAUDE.md — Project Guide for AI Assistants

## Project Overview

Viber's Toolkit — a personal productivity suite hosted on Cloudflare Pages. Two users (Bhaskar + wife). Multiple tools under one shell with hamburger menu navigation.

### Tools
- **Vibe Planner** — Kanban board + timeline for tasks/ideas (toolkit users)
- **Sports — Coin Toss** — 3D cricket coin toss with sound effects (toolkit users)
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
- `profiles.approved` boolean — cricket signups start as `false` until admin approves
- Signup URL determines role: `/` → toolkit, `/cricket` → cricket
- `RoleGate` component enforces route-level protection
- `AuthGate` accepts `variant` prop (`toolkit` | `cricket`) for themed login pages
- Shell header and HamburgerMenu adapt branding based on URL path and user role

## Tech Stack

- **Framework:** Next.js 15 (App Router, static export)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 with CSS custom properties for theming
- **State:** Zustand
- **Charts:** recharts (SVG-based, for cricket expense breakdowns)
- **Drag & Drop:** @dnd-kit/core
- **Auth & Database:** Supabase (PostgreSQL + Auth + Row Level Security)
- **Hosting:** Cloudflare Pages (static export, auto-deploys from `main`)
- **Theme:** next-themes (dark/light, stored in localStorage as `vibe_theme`)

## Project Structure

```
├── app/
│   ├── layout.tsx                  # Root layout: ThemeProvider, Shell
│   ├── page.tsx                    # Redirects to /vibe-planner
│   ├── globals.css                 # Tailwind + dark/light CSS variables
│   ├── providers.tsx               # ThemeProvider wrapper
│   └── (tools)/
│       ├── vibe-planner/           # Vibe Planner tool
│       │   ├── page.tsx
│       │   ├── components/         # Board, Timeline, VibeCard, Header, etc.
│       │   └── lib/                # constants, utils
│       ├── sports/toss/            # Cricket coin toss tool
│       │   └── page.tsx
│       ├── id-tracker/            # ID Tracker tool
│       │   ├── page.tsx
│       │   └── lib/               # constants (ID types), utils (urgency helpers)
│       └── cricket/               # Sunrisers HQ tool
│           ├── page.tsx
│           ├── components/         # SeasonSelector, PlayerManager, ExpenseForm, etc.
│           └── lib/                # constants, utils (balance calculations)
├── app/cricket/dues/              # Public share page (no auth required)
│   └── page.tsx
├── components/                     # Shared: Shell, AuthGate, RoleGate, HamburgerMenu, etc.
├── lib/                            # Supabase client, auth helpers, storage, nav
├── stores/                         # Zustand stores (auth-store, vibe-store, id-tracker-store, cricket-store)
├── types/                          # TypeScript types
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

Table `profiles`: `id` (UUID, FK to auth.users), `email`, `full_name`, `is_admin`, `disabled`, `access` (text array, e.g. `{toolkit,cricket,admin}`), `approved` (boolean), `created_at`.

Table `vibes`: `id` (UUID), `user_id`, `text`, `status`, `category`, `time_spent`, `notes`, `due_date`, `position`, `completed_at`, `deleted_at`, `created_at`, `updated_at`.
Statuses: `spark`, `in_progress`, `scheduled`, `done`. Soft delete via `deleted_at`.

Table `id_documents`: `id` (UUID), `user_id`, `id_type`, `country` (US/IN), `label`, `owner_name`, `description`, `expiry_date`, `renewal_url`, `reminder_days` (integer array), `created_at`, `updated_at`.

### Cricket Tables
Table `cricket_players`: `id`, `user_id`, `name`, `jersey_number`, `phone`, `is_active`, `created_at`, `updated_at`.
Table `cricket_seasons`: `id`, `user_id`, `name`, `year`, `season_type`, `share_token` (UUID for public URL), `is_active`, `created_at`, `updated_at`.
Table `cricket_expenses`: `id`, `user_id`, `season_id`, `paid_by` (player FK), `category`, `description`, `amount` (NUMERIC), `expense_date`, `created_at`, `updated_at`.
Table `cricket_expense_splits`: `id`, `expense_id`, `player_id`, `share_amount` (NUMERIC). Junction table for equal splits.
Table `cricket_settlements`: `id`, `user_id`, `season_id`, `from_player`, `to_player`, `amount`, `settled_date`, `created_at`.
Table `cricket_season_fees`: `id`, `season_id`, `player_id`, `amount_paid` (NUMERIC), `paid_date`, `created_at`. Tracks per-player season fee payments (full/partial).

RPC: `get_public_season_data(token UUID)` — SECURITY DEFINER function returning all season data as JSON for the public share page.
RPC: `check_cricket_player_email(check_email TEXT)` — checks if a player exists with given email (for auto-approve on signup).

Full SQL in `docs/DATABASE_SCHEMA.sql` and `docs/cricket-schema.sql`.

## Key Architecture

- **Static export** (`output: 'export'`) — no server-side code at runtime
- **All Supabase calls are client-side** via `@supabase/ssr` browser client
- **Zustand stores** — `auth-store.ts` (auth state, login/signup/reset, role/access), `vibe-store.ts` (vibes CRUD, UI state), `id-tracker-store.ts` (ID documents CRUD), `cricket-store.ts` (players, seasons, expenses, splits, settlements)
- **Role-based access** — `profiles.access` array determines tool visibility; `RoleGate` component for route protection; `AuthGate` variant prop for themed login
- **RLS enforced** — every query filters by `user_id`, server-side RLS as backup
- **Soft delete** — `deleted_at` column, Recently Deleted UI with restore (vibes); `is_active` flag for cricket players
- **Public pages** — `/cricket/dues/` public share page bypasses auth, uses SECURITY DEFINER RPC function
- **Feature branches** — develop on branches, merge to `main` only when ready to deploy

## Git Workflow

- Use **feature branches** (e.g., `feat/sports-toss`), not direct push to main
- Main branch auto-deploys to Cloudflare Pages — limited build quota
- Commit convention: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`

## Security — MANDATORY Pre-Commit Checks

**ALWAYS run this before every commit:**

1. **Scan for secrets** — no Supabase URLs, API keys, passwords, or emails in committed files:
   ```bash
   git diff --cached | grep -iE "mcklzjmaivtwdhjauwtv|sb_publishable|Welcome|bmantrala@" && echo "SECRETS FOUND!" || echo "CLEAN"
   ```

2. **Verify .gitignore** — these must NEVER be committed:
   - `.env.local` (Supabase credentials)
   - `.claude/` (may contain credentials in settings)
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

## Email Templates

Branded email templates are in `docs/email-templates/`:
- `reset-password.html` — Password reset (uses `{{ .RedirectTo }}` + `{{ .TokenHash }}` for cross-browser support)
- `confirm-signup.html` — Signup confirmation
- `password-changed.html` — Password change notification (for future custom SMTP)

Configure in Supabase Dashboard > Authentication > Email Templates.
