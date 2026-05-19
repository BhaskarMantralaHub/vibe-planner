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
**League stats:** `/cricket/league-stats` reads from `cricclubs_batting_season` + `cricclubs_bowling_season` views (populated weekly by `scripts/cricclubs-sync` via the GitHub Action). Catches and all-rounder rankings are computed client-side from raw `cricclubs_batting.dismissal` text.

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
- **Splits** — peer-to-peer expense splitting (Splitwise-style), completely separate from pool fund. Tables: `cricket_splits`, `cricket_split_shares`, `cricket_split_settlements`. Store: `splits-store.ts`. Never aggregated into pool-fund totals or PDFs. Splits MAY appear in monthly emails ONLY as a per-recipient personal section ("Your open splits") — each player sees only their own paid + share data, never anyone else's balances. Scope is the active season (not just the current month) so older unsettled splits surface. The section is hidden when the recipient has zero participation in season splits OR when their net season-wide balance (after applying all settlements) is within $0.01 of zero. Receipts: `cricket_splits.receipt_urls TEXT[]` populated in the same INSERT (storage RLS UPDATE is admin-only); files in `split-receipts` Supabase Storage bucket at `{team_id}/{split_id}_{uuid}.{ext}`. Soft delete sets `deleted_at` and keeps shares (so restore works); `permanentDeleteSplit` hard-deletes the row (shares cascade via FK) AND removes receipt blobs from `split-receipts` storage. Deleted tab in `SplitsDashboard` is admin-only.
- **Public pages** — `/cricket/dues/` bypasses auth via SECURITY DEFINER RPC
- **Receipt uploads** — expenses support multiple image/PDF attachments. Stored in `expense-receipts` Supabase Storage bucket (path: `{team_id}/{expense_id}_{random}.{ext}`). Images compressed to 1200px/0.85 JPEG; PDFs uploaded as-is. Max 10 per expense. Direct Supabase public URLs (no proxy).
- **Storage backup** — Supabase Storage buckets (`player-photos`, `gallery-photos`, `team-logos`, `expense-receipts`) backed up daily to Cloudflare R2 via `rclone copy --checksum` in the backup workflow.
- **Desktop layout cap** — `Shell.tsx` wraps the header inner row + `<main>` content in `max-w-6xl mx-auto lg:px-8`. Mobile/tablet (<1024px) stay edge-to-edge; desktop (≥1024px) caps at 1152px. Bottom tab bars use the same inner cap (their full-width blurred background stays viewport-wide). When adding a new full-bleed bar/FAB, mirror this pattern.
- **Global load indicator** — `TopProgressBar` (mounted once in `Shell.tsx`) reads `useUIStore.inflightCount` and shows a shimmering top progress bar whenever any async work is pending. Every new store load action MUST wrap its body in `useUIStore.getState().beginLoad()` / `endLoad()` (in a try/finally so it decrements on error). Wired today in `cricket-store.loadAll`/`loadMoments`, `splits-store.loadSplits`, `id-tracker-store.loadDocuments`. This is what tells users "data is being fetched" during silent cache-revalidation loads (where store-level `loading` flags stay false).

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
| GitHub Actions | `.github/workflows/` (backup, restore, weekly-activity-report, monthly-expense-report, cricclubs-sync). Heavy bash for monthly-expense-report lives in `.github/scripts/send-monthly-report.sh` (workflow run-block has a 21k-char GHA limit). The `cricclubs-sync` job runs 6× per weekend (Sat & Sun 11 AM / 2:30 PM / 6 PM PT); logic lives in `scripts/cricclubs-sync/` (TypeScript + Playwright). After upserting cricclubs data it (1) refreshes upcoming `cricket_schedule_matches` rows from `fixtures.do` — date/time/venue/umpire/opponent/match_type/is_home — linking via `cricclubs_fixture_id` (with opponent+nearest-date and date+venue fuzzy fallbacks for legacy rows), and (2) auto-completes any past `cricket_schedule_matches` rows whose result is null. Never overwrites admin-entered results. As of 2026-05-18, this path is **fallback only** — Cloudflare bot-challenges GitHub Actions runner IPs intermittently, so the headless-Playwright fetch can time out. The primary sync path is now the iOS Shortcut (see below). |
| Scriptable sync (primary path, 2026-05-18+) | `scripts/scriptable/cricclubs-sync.js` is a single-file Scriptable (iOS) script that does **both** fixture refresh and scorecard ingest. Runs from one home-screen icon: fetches `fixtures.do` + `listMatches.do` + per-scorecard `viewScorecard.do` from the iPhone's residential IP (bypasses Cloudflare), parses each in a hidden `WKWebView` using vanilla DOM (cheerio-equivalent on iOS), and writes via Supabase PostgREST with a service-role key stored in iOS Keychain. Fixture refresh diffs each upcoming fixture against `cricket_schedule_matches` and PATCHes only changed fields (linking by `cricclubs_fixture_id` with opponent+date and date+venue fallbacks; never overwrites admin-entered results). Scorecard step upserts `cricclubs_matches` / `cricclubs_match_html` / `cricclubs_batting` / `cricclubs_bowling` and auto-completes the matching schedule row. Includes skip-already-synced optimization and per-scorecard `withRetry()` + try/catch. Parser bodies (`FIXTURES_PARSER`, `MATCH_LIST_PARSER`, `SCORECARD_PARSER`) are vanilla-DOM ports of `scripts/cricclubs-sync/parser.ts` and must be kept in sync when cricclubs HTML drifts. |
| Scriptable sync (canonical scorecard path) | `scripts/scriptable/cricclubs-sync.js` is the one reliable end-to-end sync. Runs from a home-screen icon on the team admin's iPhone — uses the phone's residential IP (Cloudflare's never flagged it) to fetch `fixtures.do` + `listMatches.do` + per-scorecard `viewScorecard.do`, parses each in a hidden `WKWebView` using vanilla DOM, and writes via Supabase PostgREST with a service-role key stored in iOS Keychain. Includes skip-already-synced, per-scorecard `withRetry()`, schedule auto-completion. Parser bodies (`FIXTURES_PARSER`, `MATCH_LIST_PARSER`, `SCORECARD_PARSER`) are vanilla-DOM ports of `scripts/cricclubs-sync/parser.ts`; keep both in sync when cricclubs HTML drifts. |
| Edge Function `cricclubs-ingest` (V1 fixtures only) | `supabase/functions/cricclubs-ingest/` (Deno + cheerio) supports `POST ?type=fixtures` for the legacy iOS Shortcut path that POSTs pre-fetched HTML. The `?type=full-sync` route exists in code but is **NOT surfaced in the UI** — testing on 2026-05-19 found cricclubs.com's Cloudflare rejects every Apify residential proxy exit IP with 403 (both `apify/cheerio-scraper` HTTP-only AND `apify/web-scraper` real-Chromium fail identically). The full-sync route is still callable via `X-Sync-Secret` for future use if a working proxy becomes available (Bright Data Web Unlocker, etc.). Singleton lock (`cricclubs_sync_state` + `acquire_cricclubs_sync_lock` / `release_cricclubs_sync_lock` RPCs from migration 009) and parser parity tests (`__tests__/parser.test.ts`) stay in place. To re-enable the UI button, restore from git history at commit `0c0df2e` and swap the proxy backend in `apify.ts`. |
| Local Node sync (escape hatch) | `scripts/cricclubs-sync/sync.ts` (Playwright + cheerio) runs from a contributor's laptop with `npm run sync` for one-off backfills. Uses the laptop's residential IP — works because it's not Apify. The GitHub Action workflow stays dormant. |

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
  - **Composer drawers (text input + iOS keyboard): use the shared `ComposerModal`** from `components/ui/composer-modal.tsx`. It implements the full-screen-mobile + centered-desktop pattern with `100svh` sizing and a `window.visualViewport` listener that translates the footer above the keyboard. Place text inputs FIRST in the body so they sit in the visible upper half when the keyboard rises; tap-to-select widgets (categories, photo pickers, action chips) BELOW. Used by `GalleryUpload`, `ExpenseForm`, `SplitForm`, `SponsorshipSection`. **Do NOT use vaul `Drawer` for forms with text inputs** — vaul's `repositionInputs` is broken (issues #294/#298/#312/#514). Vaul `Drawer` stays for tap-only flows (confirmations, action sheets).
  - Prefer bottom sheets (vaul) over dropdowns on mobile
  - No hover-only interactions
  - `px-4` padding on fixed overlays for safe area

### Shared Components — Check First

Before writing ANY UI code, check `components/ui/`. NEVER duplicate what exists.

**Available:** `Text`, `Button`, `Input`, `PasswordInput`, `Alert`, `Card`, `Badge`, `Label`, `Dialog`, `Drawer`, `ComposerModal`, `Spinner`, `Skeleton`, `EmptyState`, `FilterDropdown`, `CardMenu`, `RefreshButton`, `CapsuleTabs`, `SegmentedControl`, `toast` (sonner).

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
