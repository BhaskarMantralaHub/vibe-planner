# CLAUDE.md — Project Guide for AI Assistants

## Project Overview

Viber's Toolkit — a personal productivity suite hosted on Cloudflare Pages. Two users (Bhaskar + wife). Multiple tools under one shell with hamburger menu navigation.

### Tools
- **Vibe Planner** — Kanban board + timeline for tasks/ideas
- **Sports — Coin Toss** — 3D cricket coin toss with sound effects
- **ID Tracker** — Track identity documents (US + India) for family members, with expiry reminders
- **Admin Dashboard** — User management, activity stats, enable/disable users

## Tech Stack

- **Framework:** Next.js 15 (App Router, static export)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 with CSS custom properties for theming
- **State:** Zustand
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
│       └── id-tracker/            # ID Tracker tool
│           ├── page.tsx
│           └── lib/               # constants (ID types), utils (urgency helpers)
├── components/                     # Shared: Shell, AuthGate, HamburgerMenu, etc.
├── lib/                            # Supabase client, auth helpers, storage, nav
├── stores/                         # Zustand stores (auth-store, vibe-store, id-tracker-store)
├── types/                          # TypeScript types
├── tests/                          # Playwright E2E tests
├── public/                         # Static assets (hero.png, toss.png, _headers, _redirects)
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

Table `vibes`: `id` (UUID), `user_id`, `text`, `status`, `category`, `time_spent`, `notes`, `due_date`, `position`, `completed_at`, `deleted_at`, `created_at`, `updated_at`.

Statuses: `spark`, `in_progress`, `scheduled`, `done`.
Soft delete via `deleted_at` column. Auto-updated `updated_at` via DB trigger.

Table `id_documents`: `id` (UUID), `user_id`, `id_type`, `country` (US/IN), `label`, `owner_name`, `description`, `expiry_date`, `renewal_url`, `reminder_days` (integer array, e.g. {90,30,7}), `created_at`, `updated_at`.
RLS: users see own documents only; admins can read all. Auto-updated `updated_at` via trigger.

Full SQL in `docs/DATABASE_SCHEMA.sql`.

## Key Architecture

- **Static export** (`output: 'export'`) — no server-side code at runtime
- **All Supabase calls are client-side** via `@supabase/ssr` browser client
- **Zustand stores** — `auth-store.ts` (auth state, login/signup/reset), `vibe-store.ts` (vibes CRUD, UI state), `id-tracker-store.ts` (ID documents CRUD)
- **RLS enforced** — every query filters by `user_id`, server-side RLS as backup
- **Soft delete** — `deleted_at` column, Recently Deleted UI with restore
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
3. Add entry to `lib/nav.ts`
4. Test locally with `npm run dev`
5. Push to feature branch, create PR, merge when ready
