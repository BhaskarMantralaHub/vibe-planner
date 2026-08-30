# CLAUDE.md — Project Guide for AI Assistants

## New Machine Setup

```bash
ln -s "$(pwd)/.claude/memory" ~/.claude/projects/-$(pwd | tr '/' '-' | sed 's/^-//')/memory
```

## Project Overview

Viber's Toolkit — personal productivity suite on Cloudflare Pages. Two users (Bhaskar + wife), plus Sunrisers Manteca cricket team members. Multiple tools under one shell with hamburger menu navigation.

**Tools:** Vibe Planner (Kanban), ID Tracker (documents), Sunrisers HQ (cricket expenses/scoring/moments/umpiring), Admin Dashboard.
**Roles:** `toolkit` (auto-approved), `cricket` (admin approval), `admin` (manual DB flag). Stored in `profiles.access`.
**Features:** `profiles.features` controls tool visibility. `hasFeature()` = UI visibility, `hasAccess()` = RLS/privileges.
**Tech:** Next.js 15 (static export), TypeScript, Tailwind v4, Zustand, Supabase (Postgres + Auth + RLS), Cloudflare Pages.
**Monitoring:** Sentry (error tracking), Cloudflare Web Analytics (page views/Core Web Vitals).
**Icons:** `lucide-react` (primary) + `react-icons` (6 cricket-specific) + custom SVGs in `components/icons/`.
**PWA:** `manifest.json` + service worker for Add to Home Screen, offline fallback, auto-update toast.
**Auth flows:** See `docs/SIGNUP_FLOWS.md`. **CRITICAL:** `AuthGate` only renders `RequestAccess` after `userAccess.length > 0`.
**Player user_id linking:** Case-insensitive email match in 3 places (DB trigger, AuthGate, auth-store). Never set `user_id` to admin's auth ID.
**Multi-team:** `cricket_teams`, `team_members`, `team_invites` tables with RLS. See `docs/MULTI_TEAM_DESIGN.md`.
**Season rosters:** `cricket_season_players (season_id, player_id, team_id, is_guest, left_at, joined_at)`, PK `(season_id, player_id)`. Schema in `docs/season-roster-migration.sql` + `docs/season-roster-fixes.sql` (read BOTH — the migration alone no longer describes production). `cricket_players` stays the single identity record (name, photo, email, jersey, `user_id`); season membership is a separate concern, so a player can sit out a season without being erased from earlier ones.
- **PARTIALLY wired.** Writers are done: `addPlayer` enrols into the selected season, and `PlayerManager`'s ⋮ menu has "Add to / Remove from &lt;Season&gt;" (`enrollInSeason` / `removeFromSeason`, both returning a boolean so a failed write cannot toast success). Readers done: **dues** (`FeeTracker`) and the dashboard **Players** count, via `seasonRoster` / `billableRoster` in `app/(tools)/cricket/lib/season-roster.ts`. Still team-wide: umpiring (`computeDutyStats`), splits and gallery pickers, `PlayerManager`'s own Roster/Guests tabs, scoring XI, and `.github/scripts/send-monthly-report.sh` (widest blast radius — it emails everyone).
- **`is_guest` is TWO DIFFERENT FACTS, not one duplicated fact — do NOT drop `cricket_players.is_guest`.** This is the key design call:
  - **Record-level** (`cricket_players.is_guest`, KEEP PERMANENTLY) = "this identity row is a walk-in stub — no email, no account, dedupe by name". Wanted by scoring (`scoring-utils.ts`, `AddPlayerSheet`, `scoring-store`), the `(G)` labels, `create_practice_match`'s name dedupe, the claim RPCs, and 9 player-stats SQL functions. ~15 sites, all correct as-is.
  - **Season-level** (`cricket_season_players.is_guest`) = "does not count toward THIS season's fee and duty denominators". Only ~8 sites need this.
  Splitting the meaning turns a 23-site atomic commit into ~8 incremental ones. **Dropping the column would also drop the partial index at `docs/cricket-schema.sql:612`, and `create_practice_match`'s `ON CONFLICT` would then fail at runtime** ("no unique or exclusion constraint matching") on the next practice match — in a code path no roster PR would think to test.
  Exception: `DutyAssignSheet.tsx:44,107` and `DutyPlayerSheet.tsx:165,180` render "guests are not counted toward the target" — a SEASON claim from a RECORD field. Those two labels must read the join row or the badge will contradict the denominator.
- **The roster is ADVISORY — nothing structurally ties season data to it.** `cricket_season_fees`, `cricket_expenses.paid_by`, `cricket_umpiring_duties.assigned_player_id`, `cricket_splits.paid_by`, `cricket_split_shares` and `cricket_gallery_tags` all FK to `cricket_players`, never to `(season_id, player_id)`. So a fee can be recorded for a non-participant — which is exactly what makes `FeeTracker`'s `unpaidCount` go **negative**. Clean today (18 Spring fee rows, all on-roster, 0 off-roster). Add a composite FK on `cricket_season_fees(season_id, player_id)` at minimum: it's the money, and it makes the invariant structural instead of a convention six files must remember.
- **Roster reads can flip INCREMENTALLY, one screen per commit** — but only via a single shared `useSeasonRoster(seasonId)` selector that **falls back to the team-wide list when a season's roster is empty**. That fallback is what makes each step reversible and makes an un-seeded season render today's numbers instead of blank (it also covers local/non-cloud mode, where `LocalData` has no roster). Non-negotiable ordering: **writers before readers** — if `FeeTracker` filters by roster before `PlayerManager` can enrol anyone, an admin adds a player who exists, appears nowhere, and cannot be given a fee.
- **`is_active` vs roster membership overlap and the rule must be written down first.** `is_active` is load-bearing for the claim RPCs, `auth-store.ts:304`, `AuthGate.tsx:48`, `check_cricket_player_email` (anon) and the guest partial index. The rule: `is_active` = still associated with the club at all; a roster row = played this season; "Removed" means deactivated, NOT "not in this season". `PlayerManager` needs "Remove from this season" (`left_at`) as a control distinct from "Deactivate".
- **`left_at` cannot express a rejoin** within one season (nulling it loses the fact), and has no `CHECK (left_at >= joined_at)`. Accepted trade-off at ~20 players over a full history table.
- **Hard-deleting a player now FAILS by design** (player-leg `RESTRICT`). Both `PlayerManager` delete paths were rewritten to **deactivate** instead — which is what the permanent-delete dialog always claimed it did. The old permanent-delete had no error check and optimistically dropped the row, so the failure was invisible: toast said "permanently deleted", player returned on refresh.
- **FK legs are deliberately asymmetric**: season leg `ON DELETE CASCADE` (deleting a season should take its roster), player leg `ON DELETE RESTRICT` (a hard player delete must FAIL rather than silently erase roster history). RESTRICT matches `cricket_splits.paid_by` / `cricket_settlements`. `SET NULL` is impossible — `player_id` is half the PK. Note `PlayerManager.tsx:1527` hard-deletes any player while its dialog (line 1508) claims the record is "kept for audit"; that delete now errors if the player is on any roster.
- **Composite FKs reference `(id, team_id)`** on both parents via the `uniq_cricket_seasons_id_team` / `uniq_cricket_players_id_team` indexes, making cross-team enrolment unrepresentable rather than merely disallowed by RLS. Side effect: `ON UPDATE` defaults to NO ACTION, so **`UPDATE`-ing `team_id` on a player or season that has roster rows now fails**. Nothing does this today; moving a player between teams is now multi-step.
- **`cricket_seasons.opening_balance`** — pool money carried in from the previous season. **NULL means "derive live from the previous season"; a value means FROZEN at that figure.** It has **no DEFAULT** (dropped in `docs/opening-balance-default-fix.sql`) precisely so a new season is born NULL — the original `DEFAULT 0` made every season born *frozen at zero*, which rendered the carried-forward entry as nothing. Also nullable because `restore.yml` rebuilds rows with `json_populate_recordset`, which does not apply defaults. **Never collapse the null check with `?? 0` or `|| 0`** — a deliberately frozen zero would silently start re-deriving. See the carry-forward bullet below.
- **Pool balance now has ONE implementation** — `computePoolBalance` / `computeSeasonPool` in `app/(tools)/cricket/lib/utils.ts`, pinned by `tests/unit/pool-balance.test.ts`. It replaced four copies that had drifted: `ShareButton`'s WhatsApp-text share was computing `fees − expenses`, **omitting sponsorships**, so the text and image shares printed different balances for the same season (out by $420 for Spring 2026). Three of the four are converted; `.github/scripts/send-monthly-report.sh:185` is bash and **still has its own copy** — the last place that can disagree.
- **Carry-forward is LIVE until frozen, and that is deliberate.** `computeCarriedForward` derives a season's opening figure from the previous season's *current* balance while `opening_balance IS NULL`, so it stays in sync — a snapshot taken while Spring is mid-playoffs goes stale the moment the semi-final ground is paid for. Setting `opening_balance` (the 🔓/🔒 button on the carried-forward entry, admin only) freezes it, which is what stops a permanent live chain letting one corrected old expense silently rewrite every later balance. **A frozen `0` must stay frozen** — never collapse the null check with `|| 0`, or "nothing carried over" silently re-derives. Recursion is bounded by a visited set plus the earliest season having no predecessor.
- The carried figure renders as a visible **entry** at the top of the Expenses view (`CarriedForwardEntry`), not a hidden column, so the balance adds up on screen. Hidden below $0.01. The "updates live" note is load-bearing — a number that moves without explanation destroys trust in a ledger.
- **League stats are now SEASON-SCOPED** (was career-wide). `cricclubs_batting_season` / `cricclubs_bowling_season` still group by `(team_id, player_id)` with no season dimension — the `_season` name is a misnomer, they are career totals — so the page no longer relies on them for display. Instead `app/(tools)/cricket/league-stats/lib/seasonAggregates.ts` reproduces both views' SQL client-side over the raw `cricclubs_batting`/`_bowling` rows, filtered to the season. Details in the League stats section above. Match-play is still deliberately NOT treated as season-roster membership.
- **`addSeason` inserts no roster rows**, so a season created in the UI starts empty and must render "no players on this season's roster" — never fall back to the team list. Falling back is the silent failure: it looks fine and bills the wrong people.
**League stats:** `/cricket/league-stats` reads from `cricclubs_batting_season` + `cricclubs_bowling_season` views (populated weekly by `scripts/cricclubs-sync` via the GitHub Action). Catches, run-outs (direct `run out (X)` or combined `run out (X/Y)` — both fielders credited), and all-rounder rankings are computed client-side from raw `cricclubs_batting.dismissal` text; the tab is labeled **Fielding** (key stays `catches`).
**League stats season scoping:** every figure on `/cricket/league-stats` follows the season pill. The link is `cricclubs_matches.cricclubs_league_id` → `cricket_seasons.cricclubs_league_id` — **never dates**, since MTCA issues a new league per season. Rules that matter:
- **A selected season with a NULL `cricclubs_league_id` scopes to ZERO matches, not to career figures.** MTCA hasn't published its league, so it provably has no matches; showing Spring's 13 under a "Fall 2026" pill is the exact lie this removes. Career figures apply only when *no* season is selected.
- `seasonAggregates.ts` reproduces the two views' SQL exactly. The asymmetries are load-bearing: batting `innings` is `count(DISTINCT match_row_id)` but bowling `innings` is `count(*)`; batting excludes `did_not_bat`, bowling has no such filter; batting average divides by **dismissals** not innings; bowling balls are `floor(overs)*6 + LEAST(round(frac*10), 5)` (the cap stops a malformed `3.7` claiming 7 balls); economy is `runs*6/balls`. `tests/unit/season-aggregates.test.ts` asserts the sum of all seasons equals the career total — if season and career figures ever disagree, people stop trusting both.
- The page **waits for the raw innings rows** before painting when scoped (`scoped && !rawLoaded`), rather than showing career aggregates and swapping. A visible self-correction of every number is worse than a longer skeleton.
- Downstream consumers are scoped by **shadowing**: `matchesAll`/`battingMatchesAll`/`bowlingMatchesAll` hold the fetched rows, and `matches`/`battingMatches`/`bowlingMatches` are the season-filtered derivations. So the W/L record, streak, top performers, matches-played and drilldowns are all scoped without each having to remember.
- **Player sheet:** everything is season-scoped except one section. `computePlayerHistory` (same module) builds a season-by-season table plus career totals from the UNSCOPED rows, because a personal best never decays and career context is otherwise invisible. Bounded by season count, not innings count — so the old "grows forever" match timeline dissolved rather than needing an accordion. Career rates are recomputed from all rows, never averaged from the season rows. The table only renders with 2+ seasons on record; the timeline caps at 8 rows behind "Show N more". The Fielding tile shows **Mat** (appearances) not Inns — catches accrue per appearance, and batting innings disagreed with the leaderboard's own Mat column.
- **`DrawerBody` uses `maxHeight`, which is a trap for any sheet whose content GROWS while open.** `DrawerContent` is `fixed bottom-0`, so content appearing under the cap grows the box UPWARD — the top edge jumps with no transition and whatever the reader is looking at teleports. Such a sheet needs a fixed `height: 70dvh`; add it as an opt-in prop when one actually does. The player sheet was expected to need this until season scoping bounded its list.
- `cricclubs_league_id` is written by **both** sync paths now. It was missing from `scripts/scriptable/cricclubs-sync.js` (the canonical one), so 6 of 13 matches had NULL until `docs/cricclubs-league-id-backfill.sql` repaired them. That backfill **refuses to run** once two seasons carry a league id, rather than guessing.

**League stats views:** each tab renders either a sortable `LeaderboardTable` (**default**) or a stack of `LeaderboardCard`s; the choice is persisted in `localStorage` under `league-stats:view-mode` and read via `useSyncExternalStore` (NOT `useState` + effect — the page is statically exported, so reading storage during render would desync hydration). Table rank re-numbers to follow the active sort. `LeagueStatsSkeleton` takes `viewMode` so the placeholder matches the view that will replace it.
**Playoffs:** both `cricket_schedule_matches.match_type` and `cricket_umpiring_duties.match_type` accept `semi_final` and `final` (MTCA's real fixture page carries 8 Semi Final + 4 Final rows). The two vocabularies deliberately DIFFER on `practice` — you *play* practice matches, but MTCA never assigns umpires to them:
- `cricket_schedule_matches` → `league | practice | semi_final | final` (widened by `docs/schedule-playoffs-migration.sql`)
- `cricket_umpiring_duties` → `league | semi_final | final`
- **`normalizeMatchType()` check ORDER is load-bearing** (duplicated in `scripts/cricclubs-sync/ingest-html.mts` and `scripts/scriptable/cricclubs-sync.js`): test `semi` BEFORE `final`, because *"Semi Final" contains the substring "final"* — reversed, every semi-final is recorded as a final. Playoffs are tested before `league` so "League Semi Final" isn't flattened. Pinned by `tests/unit/match-type-normalize.test.ts`.
- The sync only ever **updates** existing schedule rows (`refreshFixtures` does `if (!cur) continue`), so a newly published playoff fixture must still be added by hand in `MatchForm` — it will not appear on its own.

**Outbound message voice — no emoji, plain sentences.** Every WhatsApp template in `lib/duty-share.ts` is pasted into the team group under a real person's name, so it has to read like that person typed it. Emoji-per-line plus Title Case headings plus an em-dash in every other sentence is the exact texture people now read as machine-written, and it undercuts a message whose job is to sound like a teammate asking a favour. Rules: no emoji (where one carried meaning — `🧢 Madhu` — use the word, `Umpire: Madhu`); bold for the heading and the one ask only, never mid-sentence emphasis; sentence case headings; commas and full stops over em-dashes; contractions are fine. Pinned by the **`house voice`** block in `tests/unit/duty-share.test.ts`, which walks all 18 message variants (every branch, since the old emoji lived in the closing and ask lines a happy-path call never reaches) and fails if one reappears. There is deliberately **no** sentence-case test — headings legitimately contain proper nouns (team, player first name, ground), so such a rule fires on "Umpiring reminder, Madhu" and on every new MTCA venue; it would fail more often for being right than wrong.
- **Umpiring is framed as a shared RESPONSIBILITY, never a favour.** `buildDutyShareText` says "can anyone *cover* this?" not "help"; `buildThanksText` closes "Covering our umpiring duty is a responsibility we all share." "A big ask" casts the umpire as a volunteer doing charity, which makes everyone who hasn't stood yet a bystander rather than someone with a turn coming.
- **Never imply the team is playing while someone umpires.** An MTCA duty is at a match we are **not** in — that is the whole point. A draft that read "the rest of us get to play because you did" was simply untrue, and the person standing alone at someone else's ground is exactly who would notice.

**Umpiring duties:** `/cricket/umpiring` (hamburger + cricket bottom nav). MTCA assigns each league match TWO umpire slots, naming a *team* per slot; when a slot names us one of our players must stand — at a match we are **not playing**. Stored one row per SLOT in `cricket_umpiring_duties`, because allocation varies: one slot, both slots on one match, or one slot each on several matches at the same time. **`role_slot` is 1 or 2 only** — a match has exactly two umpire positions and there is no third to assign. The CHECK still permits 1–4 so any historical row stays valid, but `DutyForm` offers only 1 and 2; an "Extra" option existed briefly and was removed because it created duties corresponding to nothing on MTCA's fixture. The form's position picker is **multi-select** — MTCA regularly gives us both slots on one fixture, and one save creates one duty row per position. Tables/RLS/RPCs in `docs/umpiring-schema.sql`; per-season target + our numeric cricclubs team id live in `cricket_umpiring_settings`.
- **Identity:** `claim_umpiring_duty` / `release_umpiring_duty` are SECURITY DEFINER and resolve the caller against the SET of their `cricket_players` rows, by `user_id` **OR confirmed email** — the app resolves "which player am I" by email in 8+ places and only ~16/18 players have `user_id`, so a user_id-only lookup locks real players out. They return a TEXT reason code (`ok`/`not_open`/`past`/`duplicate_slot`/`no_player`/`locked`/…), not a boolean, so the UI can explain failures.
- **Matching MTCA is by NUMERIC teamId**, never by name. Each umpire cell is an `<a href="…viewTeam.do?teamId=NNNN">`; `parseFixtures` now captures those ids. Names are hostile — the `MTCA ` prefix is inconsistent, and the league contains "Sky Risers"/"Risers"/"Valley Risers" alongside "Sunrisers". An id match is also the only thing that survives an MTCA rename (a name match fails silent forever).
- **The sync must use TWO separate fetches.** Duties need the league-wide `fixtures.do` (no `teamId`); `refreshFixtures()` must only ever see fixtures we PLAY (`isOurFixture()`), because it resolves the opponent as "whichever side isn't us" and its date+venue fallback would rebind our own schedule rows to strangers' matches.
- **`umpiring_freeze_human_columns` trigger** silently restores status/assignment/notes/`deleted_at` on any service-role UPDATE, so a bad sync payload cannot wipe claims. Consequence: the sync can never cancel a duty — when MTCA drops a slot it only stamps `mtca_removed_at` (unfrozen, so it can also be cleared) and an admin decides. Reconcile at FIXTURE level by slot count, never per slot, or a column shuffle destroys a live claim.
- **Swap vs delete:** a swapped-away duty is `status='cancelled'` + `cancelled_reason='admin'` + `swap_team` and stays VISIBLE (MTCA still lists us, so hiding it looks stale). `deleted_at` is for mistakes. Both block re-insert by the sync.
- **`docs/umpiring-rpc-verification.sql`** exercises the RPCs as a real player (impersonating via `request.jwt.claims`, which is what `auth.uid()` reads) and rolls back — safe on production.

**Matches played:** `computeMatchesPlayed()` in `league-stats/lib/computeStats.ts` counts DISTINCT `match_row_id`s across raw `cricclubs_batting` + `cricclubs_bowling`. Never use the season views' `innings` for this — `cricclubs_batting_season` filters `NOT did_not_bat`, so a player who was in the XI but never batted is undercounted. It's built from the page's slow-tier queries, so it is empty on first paint; cards/table render `—` (never `0`) until it lands.

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
- **Zustand stores** — `auth-store`, `vibe-store`, `id-tracker-store`, `cricket-store`, `scoring-store`, `umpiring-store`
- **Role-based access** — `RoleGate` checks both role AND feature; `AuthGate` variant prop for themed login
- **RLS enforced** — every query filters by `user_id`/`team_id`, server-side RLS as backup
- **Soft delete** — `deleted_at` column with Recently Deleted UI + restore
- **Splits** — peer-to-peer expense splitting (Splitwise-style), completely separate from pool fund. Tables: `cricket_splits`, `cricket_split_shares`, `cricket_split_settlements`. Store: `splits-store.ts`. Never aggregated into pool-fund totals or PDFs. Splits MAY appear in monthly emails ONLY as a per-recipient personal section ("Your open splits") — each player sees only their own paid + share data, never anyone else's balances. Scope is the active season (not just the current month) so older unsettled splits surface. The section is hidden when the recipient has zero participation in season splits OR when their net season-wide balance (after applying all settlements) is within $0.01 of zero. Receipts: `cricket_splits.receipt_urls TEXT[]` populated in the same INSERT (storage RLS UPDATE is admin-only); files in `split-receipts` Supabase Storage bucket at `{team_id}/{split_id}_{uuid}.{ext}`. Soft delete sets `deleted_at` and keeps shares (so restore works); `permanentDeleteSplit` hard-deletes the row (shares cascade via FK) AND removes receipt blobs from `split-receipts` storage. Deleted tab in `SplitsDashboard` is admin-only.
- **Public pages** — `/cricket/dues/` is currently a **STUB** (`app/cricket/dues/page.tsx`): it renders "Public dues page - Coming soon" and echoes the share token from the URL. It reads no data and calls no RPC, so it carries no data-exposure risk today. The intent is to bypass auth via a SECURITY DEFINER RPC when built — build it **season-roster-aware and `opening_balance`-aware from the start**, and write the test before the page. (This line previously claimed the RPC already existed.)
- **Receipt uploads** — expenses support multiple image/PDF attachments. Stored in `expense-receipts` Supabase Storage bucket (path: `{team_id}/{expense_id}_{random}.{ext}`). Images compressed to 1200px/0.85 JPEG; PDFs uploaded as-is. Max 10 per expense. Direct Supabase public URLs (no proxy).
- **Storage backup** — Supabase Storage buckets (`player-photos`, `gallery-photos`, `team-logos`, `expense-receipts`) backed up daily to Cloudflare R2 via `rclone copy --checksum` in the backup workflow.
- **Desktop layout cap** — `Shell.tsx` wraps the header inner row + `<main>` content in `max-w-6xl mx-auto lg:px-8`. Mobile/tablet (<1024px) stay edge-to-edge; desktop (≥1024px) caps at 1152px. Bottom tab bars use the same inner cap (their full-width blurred background stays viewport-wide). When adding a new full-bleed bar/FAB, mirror this pattern.
- **Cricket FABs — always `CricketFab`, never a hand-rolled floating button.** `app/(tools)/cricket/components/CricketFab.tsx` is the only floating action button in the cricket app (Home share, Matches add, Umpiring add duty, Moments new post). It had drifted into four different buttons — two sizes, two colours (Moments was `var(--text)`, near-black), two vertical offsets 28px apart, and three z-indexes, one of which (`z-30` on Umpiring) put it *behind* the `z-40` nav pill. Rules baked in: vertical position reads **`--cricket-fab-bottom`** from `globals.css`, never a local `calc()` — the old hand-derived `60px + safe + 16px` cleared the real pill by **2px** on iPhone because the pill is `62px + safe×0.35`, not 60px; and the button sits at **`z-30`, deliberately below every overlay** (Dialog/Drawer/ComposerModal are all z-40+), so it can never float on top of an open modal. `--cricket-nav-inset` / `--cricket-nav-height` / `--cricket-fab-bottom` are the nav's published geometry and `CricketSectionNav` positions *itself* from them, so nav and FAB cannot drift apart. `--cricket-nav-height` (62px = 10 pad-top + 44 min-h tab + 8 pad-bottom) must be updated whenever the pill's padding in `CricketSectionNav` changes.
- **Global load indicator** — `TopProgressBar` (mounted once in `Shell.tsx`) reads `useUIStore.inflightCount` and shows a shimmering top progress bar whenever any async work is pending. Every new store load action MUST wrap its body in `useUIStore.getState().beginLoad()` / `endLoad()` (in a try/finally so it decrements on error). Wired today in `cricket-store.loadAll`/`loadMoments`, `splits-store.loadSplits`, `id-tracker-store.loadDocuments`. This is what tells users "data is being fetched" during silent cache-revalidation loads (where store-level `loading` flags stay false).

## Git Workflow

- **Feature branches** (e.g., `feat/sports-toss`), not direct push to main
- Main auto-deploys to Cloudflare Pages — limited build quota
- Commits: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`

## Reference Docs

| Topic | Location |
|-------|----------|
| Database schema | `docs/DATABASE_SCHEMA.sql`, `docs/cricket-schema.sql`, `docs/scoring-schema.sql`, `docs/schedule-schema.sql`, `docs/umpiring-schema.sql` (feature schema lives in its own file — `cricket_schedule_matches` and the umpiring tables are NOT duplicated into `cricket-schema.sql`) |
| Umpiring verification | `docs/umpiring-rpc-verification.sql` — run by hand; impersonates a real player, checks every RPC reason code, CHECK constraint and the freeze trigger, then ROLLBACKs |
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
| GitHub Actions | `.github/workflows/` (backup, restore, weekly-activity-report, monthly-expense-report, cricclubs-sync). Heavy bash for monthly-expense-report lives in `.github/scripts/send-monthly-report.sh` (workflow run-block has a 21k-char GHA limit). The `cricclubs-sync` job runs 6× per weekend (Sat & Sun 11 AM / 2:30 PM / 6 PM PT); logic lives in `scripts/cricclubs-sync/` (TypeScript + Playwright). After upserting cricclubs data it (1) refreshes upcoming `cricket_schedule_matches` rows from `fixtures.do` — date/time/venue/umpire/opponent/match_type/is_home — linking via `cricclubs_fixture_id` (with opponent+nearest-date and date+venue fuzzy fallbacks for legacy rows), and (2) auto-completes any past `cricket_schedule_matches` rows whose result is null. Never overwrites admin-entered results. As of 2026-06-22, this path is **dead** — cricclubs now serves a Cloudflare JS challenge that headless Playwright (and all automated browsers / datacenter IPs) can't clear. Workflow stays dormant. The canonical path is now the **Scriptable WKWebView** script (see below). |
| Scriptable sync (**canonical**, working path) | `scripts/scriptable/cricclubs-sync.js` is a single-file Scriptable (iOS) script that does **both** fixture refresh and scorecard ingest. Runs from one home-screen icon / weekend automation. **Cloudflare:** cricclubs serves a JS challenge ("Just a moment…") to plain HTTP GETs, so `fetchHtml` loads each page (`fixtures.do` / `listMatches.do` / `viewScorecard.do`) in a **hidden WKWebView** (a real browser engine that runs the challenge JS and clears it like Safari), polls until the interstitial resolves, then reads `outerHTML`. A **fresh WebView per fetch** + `raceTimeout` guards avoid hangs/stale reads; WKWebView's shared cookie store carries `cf_clearance` so only the first fetch pays the challenge cost. Parses each page in a **second** hidden `WKWebView` (vanilla DOM, cheerio-equivalent on iOS), and writes via Supabase PostgREST with a service-role key in iOS Keychain (roster query filters `is_active=eq.true` — `cricket_players` has no `deleted_at`). Fixture refresh diffs each upcoming fixture against `cricket_schedule_matches` and PATCHes only changed fields (linking by `cricclubs_fixture_id` with opponent+date and date+venue fallbacks; never overwrites admin-entered results). Scorecard step upserts `cricclubs_matches` / `cricclubs_match_html` / `cricclubs_batting` / `cricclubs_bowling`. **Every PostgREST upsert MUST pass an `on_conflict` target** (`team_id,cricclubs_match_id` for matches, `match_row_id` for html, the 4-col keys for batting/bowling) — without it PostgREST falls back to the PK (auto-gen uuid) → degrades to a plain INSERT → 409 on the UNIQUE constraint on every re-run, silently aborting `winner_team`/`scorecard_url` writes and schedule completion. Schedule completion is a **single global `autoCompleteAll()` pass** run once after the loop (mirrors `ingest-html.mts` autoComplete): it matches every unresolved past schedule row (`result IS NULL`, `match_date <= today PT`) to a cricclubs match by `date|normalizedOpponent`, sets won/lost/draw, and skips still-live same-day matches — deliberately decoupled from the per-scorecard loop so a skipped/failed match still completes on a later run. Never overwrites admin-entered results. Includes skip-already-synced optimization and per-scorecard `withRetry()` + try/catch. Parser bodies (`FIXTURES_PARSER`, `MATCH_LIST_PARSER`, `SCORECARD_PARSER`) are vanilla-DOM ports of `scripts/cricclubs-sync/parser.ts` and must be kept in sync when cricclubs HTML drifts (`MATCH_LIST_PARSER` reads `div.row.team-data[id^="deleteRow"]` blocks — `.sch-time`/`.schedule-logo`/`.schedule-text` — NOT a table). |
| Scriptable sync (canonical scorecard path) | `scripts/scriptable/cricclubs-sync.js` is the one reliable end-to-end sync. Runs from a home-screen icon on the team admin's iPhone — loads each page (`fixtures.do` / `listMatches.do` / per-scorecard `viewScorecard.do`) in a hidden `WKWebView` to clear Cloudflare's JS challenge (see the canonical row above), parses each in a second hidden `WKWebView` using vanilla DOM, and writes via Supabase PostgREST with a service-role key stored in iOS Keychain. Includes skip-already-synced, per-scorecard `withRetry()`, schedule auto-completion. Parser bodies (`FIXTURES_PARSER`, `MATCH_LIST_PARSER`, `SCORECARD_PARSER`) are vanilla-DOM ports of `scripts/cricclubs-sync/parser.ts`; keep both in sync when cricclubs HTML drifts. |
| Edge Function `cricclubs-ingest` (iOS Shortcut path **DEAD**) | `supabase/functions/cricclubs-ingest/` (Deno + cheerio). The "Sync cricclubs" iOS Shortcut that fed this is **broken** (2026-06-22): Shortcuts' `Get Contents of URL` is a plain HTTP GET that can't run Cloudflare's challenge JS, so it only gets the ~6 KB "Just a moment…" interstitial → 0 matches. Superseded by the Scriptable WKWebView script. The function stays deployed as a parse/upsert endpoint; bodies are normalized by `decode-body.ts` (accepts raw HTML, bare base64, or `{htmlBase64}`/`{html}` JSON — iOS strips tags from text/JSON fields, so Base64-in-JSON is required). All routes auth'd via `X-Sync-Secret` header. Four POST routes: `?type=fixtures` (fixtures.do HTML body → refresh schedule rows); `?type=list` (listMatches.do HTML body → returns parsed match list + scorecard URLs as JSON); `?type=scorecard` (JSON body `{listEntryJson, htmlBase64}` for iOS, or `{listEntry, html}` for programmatic callers → upserts cricclubs_matches/html/batting/bowling + auto-completes matching schedule row). **iOS Shortcuts quirk**: when a `Contents of URL` magic variable is referenced from a JSON Text field, iOS silently converts the HTML to bullet-list plain text (strips all tags), so the Shortcut MUST wrap the scorecard fetch with a `Base64 Encode` action and POST the result as `htmlBase64`; the Edge Function decodes via `atob` + `TextDecoder('utf-8')`. `?type=full-sync` (server-driven Apify path) is in code but **NOT in use** — cricclubs.com's Cloudflare rejects every Apify residential proxy IP with 403 (cheerio-scraper AND web-scraper both fail). Future-proof: swap `apify.ts` to Bright Data Web Unlocker to revive. Singleton lock (`cricclubs_sync_state` + `acquire_cricclubs_sync_lock` / `release_cricclubs_sync_lock` RPCs from migration 009) guards `?type=full-sync` and `?type=fixtures`; `?type=list`/`?type=scorecard` skip the lock since the iPhone's sequential loop is its own ordering. Parser parity tests in `__tests__/parser.test.ts`. |
| Umpiring in the Scriptable sync (**ported**) | `scripts/scriptable/cricclubs-sync.js` now syncs duties (section 5b), mirroring `ingest-html.mts` → `syncUmpiringDuties`. (1) A **second, league-wide** `fixtures.do` fetch via `leagueFixturesUrl()` with no `teamId` — MTCA assigns us to officiate matches we do NOT play, so our duties are absent from the team-filtered feed; that wider feed must **never** reach `refreshFixtures()`, which resolves the opponent as "whichever side isn't us" and would rebind our schedule rows to strangers' matches. (2) `teamIdFromCell` in the inline `FIXTURES_PARSER` captures numeric ids from `viewTeam.do?teamId=NNNN` hrefs — name matching is hostile (inconsistent `MTCA ` prefix; "Sky Risers"/"Risers"/"Valley Risers" alongside "Sunrisers") and dies silently on a rename. (3) Safety: an empty feed skips reconciliation entirely; surplus rows are **flagged** via `mtca_removed_at`, never cancelled or deleted; reconciliation is per FIXTURE not per slot, so a column shuffle remaps and preserves a live claim; patches use an explicit allow-list of MTCA facts. (4) **Season resolution is by LEAGUE ID, deliberately diverging from `ingest-html.mts`'s "exactly one active season" assertion.** The league id is the exact fact and is immune to an unrelated admin flag — verified necessary: Fall 2026 is marked active for fee collection while Spring 2026 playoffs are still being played, so keying on `is_active` would find Fall (no league id) and skip Spring duties for weeks. Bump `CONFIG.league_id` when MTCA publishes a new league and duties move to that season automatically. A season still needs a `cricket_umpiring_settings` row carrying `cricclubs_team_id`, or the sync skips with a warning. **Not yet exercised on a real device.** |
| Local ingest (escape hatch, **works**) | `scripts/cricclubs-sync/ingest-html.mts` (+ `run-ingest.mts` env wrapper). Save cricclubs pages from a **real browser** (Chrome clears Cloudflare) as `.html`/`.mhtml`, then `cd scripts/cricclubs-sync && node_modules/.bin/tsx run-ingest.mts *.html *.mhtml` — auto-routes Fixtures/Results/Scorecards (unwraps MHTML quoted-printable), upserts matches/batting/bowling, refreshes fixtures by `cricclubs_fixture_id`, auto-completes schedule (`lte` today + same-day guard, never overwrites a result); reads `.env.local` via the wrapper so the service-role key stays off the shell. (`scripts/cricclubs-sync/sync.ts` Playwright path is **dead** — Cloudflare blocks automated browsers, headless or headed.) |

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
