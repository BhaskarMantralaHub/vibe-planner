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

### Signup & Access Flows

**Player pre-added by admin → signs up on cricket:**
Admin adds player with email in `cricket_players` (`user_id: NULL`) → player signs up on `/cricket` with same email → `auth.users` record created → `profiles` record created with `access: {cricket}` → DB trigger `handle_new_user` checks `cricket_players` for email match → found → sets `profiles.approved: true`, links `cricket_players.user_id` → `create_welcome_post` RPC fires → welcome post + notifications created → player confirms email → signs in.

**Player pre-added by admin → already has toolkit account:**
Player tries signup on `/cricket` → email already registered → code checks `cricket_players` by email → match found → shows "You're on the team. Please sign in instead." → player signs in → `AuthGate` auto-approves, adds `cricket` to `profiles.access`, links `cricket_players.user_id` (via `ilike` email match where `user_id IS NULL`), creates welcome post → page reloads into cricket dashboard.

**Player linking on login (backup):**
On every login for cricket users, `auth-store.ts` runs: `UPDATE cricket_players SET user_id = auth_user_id WHERE email ILIKE auth_email AND user_id IS NULL AND is_active = true`. This is a backup linking mechanism in case the DB trigger or AuthGate flow missed it.

**Toolkit user tries cricket signup (not a player):**
Player tries signup on `/cricket` → email already registered → code checks `cricket_players` → no match → auto-calls `request_cricket_access` RPC (adds `cricket` to access, sets `approved: false`) → shows "Pending Approval" screen → admin approves or rejects.

**Random person signs up on cricket (no player record):**
Signs up on `/cricket` → no email match → `approved: false` → sees "Pending Approval" screen → admin sees in pending approvals bell:
- **Approve**: sets `profiles.approved: true`, creates `cricket_players` record from signup metadata, fires `create_welcome_post` RPC → welcome post + notifications → player can sign in.
- **Reject (pure cricket signup)**: fully deletes from `auth.users` + `profiles` via `reject_user` RPC → can sign up again fresh.
- **Reject (existing toolkit user)**: removes `cricket` from access array, restores `approved: true` → toolkit access preserved, cricket denied.

**Toolkit user signs in on cricket (not a player, didn't try signup first):**
Signs in on `/cricket` → `AuthGate` detects no cricket access → checks `cricket_players` → no match → shows "Request Cricket Access" screen → clicks request → `approved: false`, `cricket` added to access → admin approves or rejects from bell icon.

**IMPORTANT — AuthGate race condition guard:**
`AuthGate` only renders `RequestAccess` after `userAccess` has loaded from the profile (i.e., `userAccess.length > 0`). Without this, a brief window where `user` exists but `userAccess` is still `[]` would cause `RequestAccess` to render for existing users, re-triggering auto-approve + duplicate welcome posts.

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
│   └── ui/                        # Design system: Button, Input, Dialog, Alert, Card, Badge, etc.
├── lib/                            # Supabase client, auth helpers, storage, nav, utils (cn), brand
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
Table `cricket_players`: `id`, `user_id` (UUID, nullable — NULL for admin-created players until the player signs up and links via email match), `name`, `jersey_number`, `phone`, `photo_url` (Supabase Storage public URL), `is_active`, `created_at`, `updated_at`.
Storage bucket `player-photos`: Public bucket for player profile photos. Path: `{user_id}/{player_id}.jpg`. Only the player themselves can upload (RLS by `auth.uid()`).
Table `cricket_seasons`: `id`, `user_id`, `name`, `year`, `season_type`, `share_token` (UUID for public URL), `is_active`, `created_at`, `updated_at`.
Table `cricket_expenses`: `id`, `user_id`, `season_id`, `paid_by` (player FK), `category`, `description`, `amount` (NUMERIC), `expense_date`, `created_by` (TEXT), `updated_by` (TEXT), `deleted_at`, `deleted_by` (TEXT), `created_at`, `updated_at`.
Table `cricket_expense_splits`: `id`, `expense_id`, `player_id`, `share_amount` (NUMERIC). Junction table for equal splits.
Table `cricket_settlements`: `id`, `user_id`, `season_id`, `from_player`, `to_player`, `amount`, `settled_date`, `created_at`.
Table `cricket_season_fees`: `id`, `season_id`, `player_id`, `amount_paid` (NUMERIC), `paid_date`, `marked_by` (TEXT), `created_at`. Tracks per-player season fee payments (full/partial).
Table `cricket_sponsorships`: `id`, `season_id`, `sponsor_name`, `amount` (NUMERIC), `sponsored_date`, `notes`, `created_by` (TEXT), `updated_by` (TEXT), `deleted_at`, `deleted_by` (TEXT), `created_at`, `updated_at`.
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

## Design System (`components/ui/`)

Shared UI components following the **shadcn/ui pattern** (copy-paste, own-the-code) with CVA for type-safe variants, Radix UI for accessible primitives, and sonner for toast notifications.

### Stack
- **CVA** (class-variance-authority) — Type-safe variant definitions for components
- **Radix UI** — Accessible primitives (Dialog with focus trap, keyboard nav, ARIA)
- **sonner** — Toast notifications with theme integration
- **cn()** (`lib/utils.ts`) — Class merging via clsx + tailwind-merge
- **BrandProvider** (`lib/brand.tsx`) — React context for toolkit (purple) / cricket (sky blue/navy) theming
- **Cricket theme** is configurable via 4 CSS variables in `globals.css`: `--cricket`, `--cricket-accent`, `--cricket-hover`, `--cricket-glow` — change these to rebrand the entire cricket app

### Components
| Component | File | Key Props |
|-----------|------|-----------|
| `Button` | `button.tsx` | `variant` (primary/secondary/danger/ghost/link), `size` (sm/md/lg/xl/icon), `brand`, `loading`, `fullWidth`, `asChild` |
| `Input` | `input.tsx` | `label`, `error`, `brand` (auto-switches focus color) |
| `Dialog` | `dialog.tsx` | Radix Dialog: `DialogContent`, `DialogTitle`, `DialogDescription`, `DialogHeader`, `DialogFooter`, `DialogClose` |
| `Alert` | `alert.tsx` | `variant` (error/success/warning/info) |
| `Card` | `card.tsx` | `padding` (none/sm/md/lg), `shadow`, `animate` |
| `Badge` | `badge.tsx` | `variant` (purple/orange/red/green/blue/muted), `size` (sm/md) |
| `Spinner` | `spinner.tsx` | `size` (sm/md/lg), `brand`, `color` |
| `Skeleton` | `skeleton.tsx` | Just `className` — pulse loading placeholder |
| `Label` | `label.tsx` | `uppercase` flag |
| `EmptyState` | `empty-state.tsx` | `icon`, `title`, `description`, `action` |
| `Drawer` | `drawer.tsx` | `Drawer`, `DrawerHandle`, `DrawerTitle`, `DrawerHeader`, `DrawerBody`, `DrawerClose` — iOS keyboard-safe vaul wrapper |
| `Toaster` | `toast.tsx` | Added to `providers.tsx`, use `toast()` from sonner anywhere |

### Usage
```tsx
import { Button, Input, Alert, Card, Dialog, DialogContent, DialogTitle } from '@/components/ui';
import { toast } from 'sonner';

<Button variant="primary" size="lg" loading={saving} fullWidth>Save</Button>
<Alert variant="error">{error}</Alert>
toast.success('Saved!');
```

### Brand Context
Components auto-detect brand from `BrandProvider`. Cricket pages use orange, toolkit uses purple.
```tsx
<BrandProvider brand="cricket">
  <Button variant="primary">Save</Button>  {/* orange gradient */}
</BrandProvider>
```

### Rules for New Components
1. **Always use shared components** — never inline Tailwind for buttons, inputs, modals, alerts
2. **Use `cn()` for conditional classes** — never string concatenation
3. **Use CVA for new variants** — define in the component file, export the variants function
4. **Use Radix Dialog** for modals — never hand-roll overlay + panel + close button
5. **Use `toast()`** for user feedback — every create/update/delete action should confirm success or report failure
6. **Use shared `Drawer`** for bottom sheets — never use raw `vaul` directly. The shared Drawer handles iOS Safari keyboard, scroll-to-dismiss, and viewport issues automatically via `useKeyboardHeight` hook.
7. **Viewport zoom is disabled** (`maximumScale: 1, userScalable: false` in `app/layout.tsx`) — appropriate for web app, prevents accidental pinch-zoom on iOS

## Key Architecture

- **Static export** (`output: 'export'`) — no server-side code at runtime
- **All Supabase calls are client-side** via `@supabase/ssr` browser client
- **Zustand stores** — `auth-store.ts` (auth state, login/signup/reset, role/access), `vibe-store.ts` (vibes CRUD, UI state), `id-tracker-store.ts` (ID documents CRUD), `cricket-store.ts` (players, seasons, expenses, splits, settlements, gallery/moments)
- **Moments feed** — Gallery/GalleryPost/GalleryUpload components use `motion/react` for animations (double-tap heart, post entrance), `vaul` for bottom sheet menus (post actions, comment actions, liked-by, confirm delete, upload), `@formkit/auto-animate` for comment list animations, `lucide-react` for icons
- **Role-based access** — `profiles.access` array determines tool visibility; `RoleGate` component for route protection; `AuthGate` variant prop for themed login
- **RLS enforced** — every query filters by `user_id`, server-side RLS as backup
- **Soft delete** — `deleted_at` column, Recently Deleted UI with restore (vibes); `is_active` flag for cricket players
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

## QA Before Presenting to User — MANDATORY

Before presenting ANY code change to the user for review:
1. **Run tests** — `npx vitest run` must pass
2. **Run build** — `npx next build` must pass with zero errors
3. **Verify on localhost** — Mentally trace through the change on desktop AND mobile viewports
4. **Check edge cases** — What happens when the data is empty? What about dark/light mode? What about iOS Safari?
5. **Test the interaction** — If it's a modal, does it open AND close properly? If it's a button, does clicking it work? If it's a form, does submit + cancel both work?

Never present a half-tested change. The user should not be finding basic bugs like "modal doesn't close" or "wrong brand color".

## Testing — MANDATORY

**ALWAYS update or add unit tests when changing code.** Tests live in `tests/unit/` and use Vitest.

```bash
npm test                # Run all tests with verbose output + JUnit report
npm run test:watch      # Watch mode during development
npm run test:coverage   # Tests + coverage report (text + HTML)
npm run test:report     # Full report → open test-results/coverage/index.html
npx next build          # Must pass before pushing
```

- **Console**: verbose pass/fail per test with logs
- **JUnit XML**: `test-results/junit-report.xml` (CI-compatible)
- **HTML Coverage**: `test-results/coverage/index.html` (open in browser)

### Test Structure
| File | Coverage |
|------|----------|
| `tests/unit/auth-helpers.test.ts` | `lib/auth.ts` — error sanitization, password validation, rate limiting |
| `tests/unit/auth-store-init.test.ts` | Auth store init(), token flows, onAuthStateChange, checkProfileAndSetUser |
| `tests/unit/welcome-messages.test.ts` | Welcome message generation and @mention captions |
| `tests/unit/cricket-store-core.test.ts` | Players, seasons, expenses, settlements, fees, sponsorships (local mode) |
| `tests/unit/cricket-store-gallery.test.ts` | Gallery posts, comments, likes, reactions, notifications (local mode) |
| `tests/unit/cricket-store-cloud.test.ts` | All cricket store Supabase cloud-mode paths + ID reconciliation |
| `tests/unit/vibe-store.test.ts` | Vibe planner CRUD, timer, trash, views (local mode) |
| `tests/unit/vibe-store-cloud.test.ts` | Vibe store Supabase cloud-mode paths |
| `tests/unit/id-tracker-store.test.ts` | ID document CRUD (local mode) |
| `tests/unit/id-tracker-store-cloud.test.ts` | ID tracker Supabase cloud-mode paths |
| `tests/unit/lib-storage.test.ts` | localStorage load/save utilities |
| `tests/unit/lib-nav.test.ts` | Navigation config and role assignments |
| `tests/unit/lib-supabase-client.test.ts` | Supabase client singleton and null guards |
| `tests/integration/signup-flows.test.ts` | All 6 signup/access flows + login + password + edge cases |

### Mock Setup
- Supabase client is mocked via `vi.mock('@/lib/supabase/client')` — stores run in local-only mode
- Fixtures in `tests/mocks/fixtures.ts` — shared test data for all suites
- Supabase query builder mock in `tests/mocks/supabase.ts`
- Store state is reset in `beforeEach` using fixtures

### Rules
- Every new store action MUST have a corresponding test
- Every bug fix SHOULD include a regression test
- Run `npx vitest run && npx next build` before every push

## Backup & Disaster Recovery

### Automated Backups
- **GitHub Actions workflow** (`.github/workflows/backup.yml`) runs daily at 11 PM PT
- Exports all 16 tables as JSON to private repo `vibe-planner-backups`
- Keeps last 30 days, auto-deletes older backups
- Can trigger manually: Actions → Daily Supabase Backup → Run workflow
- Secrets required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VIBE_PLANNER_BACKUP` (GitHub PAT)

### Restore Process (if Supabase project is lost)
1. **Create new Supabase project** — note the new URL and keys
2. **Restore schema** — run `docs/cricket-schema.sql` in Supabase SQL Editor (creates tables, RLS policies, RPCs, triggers)
3. **Generate restore SQL** — Actions → Generate Restore SQL → Run workflow → enter date or "latest"
4. **Download artifact** — download the `.sql` file from the workflow run
5. **Restore data** — paste the SQL into Supabase SQL Editor and execute
6. **Update credentials** — update `.env.local` with new `SUPABASE_URL` and `SUPABASE_ANON_KEY`
7. **Update GitHub secrets** — update `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in repo settings
8. **Storage images** — NOT backed up. Player photos and gallery photos would need to be re-uploaded.

### What's Backed Up vs Not

| Backed up | Not backed up |
|-----------|---------------|
| All table data (JSON) | Storage bucket images |
| Schema + RPCs + triggers (git) | Auth user passwords/sessions |
| RLS policies (git) | Supabase project config |

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

## Email (Resend + Supabase SMTP)

Transactional emails (signup confirmation, password reset) are sent via **Resend** as the custom SMTP provider for Supabase Auth.

### Setup
1. **Resend account** — resend.com (free tier: 3,000 emails/month, no credit card)
2. **Domain verified** — `viberstoolkit.com` with SPF/DKIM/DMARC DNS records (auto-configured via Cloudflare)
3. **Supabase SMTP config** — Dashboard → Authentication → Email (SMTP Settings):
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: Resend API key (`re_...`)
   - Sender: `noreply@viberstoolkit.com`
   - Sender name: `Viber's Toolkit`

### How It Works
- Supabase Auth composes emails using templates in `docs/email-templates/`
- Resend delivers them via SMTP — it's a transport layer only
- Resend **never sees passwords** — only the rendered HTML with reset/confirm links
- Emails from `noreply@viberstoolkit.com` (not `noreply@mail.supabase.io`)

### Troubleshooting
- **Rate limit**: Supabase has 60-second minimum interval per user
- **Spam folder**: New domains start with low reputation — ask users to mark as "Not spam" and add `noreply@viberstoolkit.com` to contacts
- **Delivery status**: Check Resend dashboard → Emails tab for sent/delivered/bounced
- **Cache-busting**: If changing email templates, Supabase caches them — wait a few minutes or restart project

## Email Templates

Branded email templates are in `docs/email-templates/`:
- `reset-password.html` — Password reset (uses `{{ .RedirectTo }}` + `{{ .TokenHash }}` for cross-browser support)
- `confirm-signup.html` — Signup confirmation
- `password-changed.html` — Password change notification (for future custom SMTP)

Configure in Supabase Dashboard > Authentication > Email Templates.
