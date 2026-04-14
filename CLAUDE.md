# CLAUDE.md — Project Guide for AI Assistants

## New Machine Setup

```bash
ln -s "$(pwd)/.claude/memory" ~/.claude/projects/-$(pwd | tr '/' '-' | sed 's/^-//')/memory
```

## Project Overview

Viber's Toolkit — personal productivity suite on Cloudflare Pages. Two users (Bhaskar + wife), plus Sunrisers Manteca cricket team members. Multiple tools under one shell with hamburger menu navigation.

**Tools:** Vibe Planner (Kanban), ID Tracker (documents), Sunrisers HQ (cricket expenses/scoring/moments), Admin Dashboard.
**Roles:** `toolkit` (auto-approved), `cricket` (admin approval), `admin` (manual DB flag). Stored in `profiles.access`.
**Features:** `profiles.features` controls tool visibility. `hasFeature()` = UI visibility, `hasAccess()` = RLS/privileges.
**Tech:** Next.js 15 (static export), TypeScript, Tailwind v4, Zustand, Supabase (Postgres + Auth + RLS), Cloudflare Pages.
**Monitoring:** Sentry (error tracking), Cloudflare Web Analytics (page views/Core Web Vitals).
**Icons:** `lucide-react` (primary) + `react-icons` (6 cricket-specific) + custom SVGs in `components/icons/`.
**PWA:** `manifest.json` + service worker for Add to Home Screen, offline fallback, auto-update toast.
**Auth flows:** See `docs/SIGNUP_FLOWS.md`. **CRITICAL:** `AuthGate` only renders `RequestAccess` after `userAccess.length > 0`.
**Player user_id linking:** Case-insensitive email match in 3 places (DB trigger, AuthGate, auth-store). Never set `user_id` to admin's auth ID.
**Multi-team:** `cricket_teams`, `team_members`, `team_invites` tables with RLS. See `docs/MULTI_TEAM_DESIGN.md`.

## Commands

```bash
npm run dev          # Local dev at localhost:3000
npm run build        # Static export to out/
npx serve out        # Preview production build
npm test             # Vitest (verbose + JUnit)
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

## Key Architecture

- **Static export** — no server-side code at runtime, all Supabase calls client-side
- **Zustand stores** — `auth-store`, `vibe-store`, `id-tracker-store`, `cricket-store`, `scoring-store`
- **Role-based access** — `RoleGate` checks both role AND feature; `AuthGate` variant prop for themed login
- **RLS enforced** — every query filters by `user_id`/`team_id`, server-side RLS as backup
- **Soft delete** — `deleted_at` column with Recently Deleted UI + restore
- **Splits** — peer-to-peer expense splitting (Splitwise-style), completely separate from pool fund. Tables: `cricket_splits`, `cricket_split_shares`, `cricket_split_settlements`. Store: `splits-store.ts`. Never in reports/PDFs/emails.
- **Public pages** — `/cricket/dues/` bypasses auth via SECURITY DEFINER RPC
- **Receipt uploads** — expenses support multiple image/PDF attachments. Stored in `expense-receipts` Supabase Storage bucket (path: `{team_id}/{expense_id}_{random}.{ext}`). Images compressed to 1200px/0.85 JPEG; PDFs uploaded as-is. Max 10 per expense. Direct Supabase public URLs (no proxy).
- **Storage backup** — Supabase Storage buckets (`player-photos`, `gallery-photos`, `team-logos`, `expense-receipts`) backed up daily to Cloudflare R2 via `rclone copy --checksum` in the backup workflow.

## Git Workflow

- **Feature branches** (e.g., `feat/sports-toss`), not direct push to main
- Main auto-deploys to Cloudflare Pages — limited build quota
- Commits: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`

## Reference Docs

| Topic | Location |
|-------|----------|
| Database schema | `docs/DATABASE_SCHEMA.sql`, `docs/cricket-schema.sql`, `docs/scoring-schema.sql` |
| Multi-team design | `docs/MULTI_TEAM_DESIGN.md` |
| Design system | `docs/DESIGN_SYSTEM.md` |
| Scoring UI & flows | `docs/SCORING_UI.md` |
| Signup flows | `docs/SIGNUP_FLOWS.md` |
| Testing guide | `docs/TESTING.md` |
| Backup/restore | `docs/BACKUP_RESTORE.md` |
| Email setup | `docs/EMAIL_SETUP.md` |
| Supabase setup | `docs/SUPABASE_SETUP.md` |
| Adding a new tool | `docs/NEW_TOOL_GUIDE.md` |
| Env variables | `.env.example` |
| GitHub Actions | `.github/workflows/` (backup, restore, weekly-activity-report, monthly-expense-report) |

## Email

Transactional emails via **Resend** (SMTP) + Supabase Auth. Sender: `noreply@viberstoolkit.com`. See `docs/EMAIL_SETUP.md`.

---

## MANDATORY RULES

Everything below this line is behavioral — follow exactly on every task.

### Bug Fixing Process

When an issue is **not resolved after a fix attempt**, do NOT try another quick fix:
1. **Form an agent council** — 2-3 specialist agents researching root cause in parallel
2. **Wait for all to report** — synthesize before writing code
3. **Present solution plan** — explain root cause and fix before implementing
4. **One permanent fix** — never push iterative band-aids

Applies especially to: iOS Safari issues, cross-platform rendering, animation/positioning bugs, auth edge cases.

### Working Style

- **One change at a time** — implement, explain, wait for user to test (especially mobile Safari), commit only when approved
- **Never push without explicit consent** — user says "push" or "looks good" first
- **No secrets in bash** — never run commands containing actual credentials, passwords, or emails
- **UI design standards** — dramatic visual difference in one pass, clean card styles, `lucide-react` icons, bottom sheets for mobile, no unrequested features
- **Cross-platform mobile rules:**
  - Flexbox centering for modals (not CSS transform)
  - 44px minimum touch targets
  - Handle iOS keyboard viewport push
  - Prefer bottom sheets (vaul) over dropdowns on mobile
  - No hover-only interactions
  - `px-4` padding on fixed overlays for safe area

### Shared Components — Check First

Before writing ANY UI code, check `components/ui/`. NEVER duplicate what exists.

**Available:** `Text`, `Button`, `Input`, `PasswordInput`, `Alert`, `Card`, `Badge`, `Label`, `Dialog`, `Drawer`, `Spinner`, `Skeleton`, `EmptyState`, `FilterDropdown`, `CardMenu`, `RefreshButton`, `CapsuleTabs`, `SegmentedControl`, `toast` (sonner).

**Rules:** Always use shared components. Use `cn()` for conditional classes. Use CVA for new variants. Use `<Text>` for ALL text (never raw `text-[Xpx]`). Use shared `Drawer` for bottom sheets (never raw `vaul`). Use `toast()` for all user feedback. See `docs/DESIGN_SYSTEM.md` for props/usage.

**New component?** Create in `components/ui/`, add to `index.ts` barrel export, document in this section.

### QA Before Presenting Changes

1. `npx vitest run` must pass
2. `npx next build` must pass with zero errors
3. Mentally trace on desktop AND mobile viewports
4. Check edge cases: empty data, dark/light mode, iOS Safari
5. Test interactions: modals open AND close, forms submit AND cancel

### Scoring Flows Preservation

Before modifying `stores/scoring-store.ts`, `app/(tools)/cricket/scoring/`, or `types/scoring.ts`:
1. **Read `docs/SCORING_UI.md`** first — all workflows, edge cases, component contracts
2. **Proactive conflict detection** — if a change would break a documented flow, STOP and tell the user which flow is affected. Ask for confirmation before proceeding.
3. **After implementing**, update `docs/SCORING_UI.md` to stay in sync.

### Testing

- Every new store action MUST have a test
- Every bug fix SHOULD include a regression test
- Run `npx vitest run && npx next build` before every push
- Full guide: `docs/TESTING.md`

### Security — Pre-Commit Checks

1. **Scan for secrets:**
   ```bash
   git diff --cached | grep -iE "mcklzjmaivtwdhjauwtv|sb_publishable|Welcome|bmantrala@" && echo "SECRETS FOUND!" || echo "CLEAN"
   ```
2. **Never commit:** `.env.local`, `.claude/settings.json`, `.claude/settings.local.json`, `node_modules/`, `.next/`, `out/`
3. **Test files** use `process.env.TEST_EMAIL` / `process.env.TEST_PASSWORD`, never hardcoded
4. **Build check:** `npx next build` must pass before pushing

### Documentation Updates

When making changes, update these if affected:
1. `docs/DATABASE_SCHEMA.sql` — SQL changes
2. `docs/SUPABASE_SETUP.md` — config/setup changes
3. `CLAUDE.md` — architecture/workflow changes
4. `README.md` — features/tech stack changes
5. `.env.example` — new env variables
6. `.github/workflows/backup.yml` + `restore.yml` — new tables

### SQL Changes — Agent Review

For ANY SQL schema change (`docs/*.sql`):
1. **DBA agent** — data integrity, constraints, indexes, performance
2. **Architecture agent** — RLS policies, security, access control
3. **SQL specialist agent** — query correctness, function safety, injection vectors
4. Fix all CRITICAL and HIGH issues before committing.
