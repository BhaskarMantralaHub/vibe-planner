# Scoring UI Components, Match Lifecycle & Workflows

## UI Components

- `ScoringWizard.tsx` — 5-step setup (match details → Team A → Team B → toss → opening players)
- `ScoringScreen.tsx` — main scoring interface (scoreboard + batsmen/bowler + over timeline + button grid + tabs)
- `ButtonGrid.tsx` — premium scoring pad (circular run buttons, gradient boundaries, wicket bar, extras, undo/redo/end)
- `Scoreboard.tsx` — gradient score display (team, runs/wickets, overs, run rate, target)
- `OverTimeline.tsx` — colored ball circles for current over (3-tone: gray runs, blue boundaries, red wickets, amber extras)
- `BallByBallLog.tsx` — reverse chronological timeline with over summaries, innings break cards, match result card
- `FullScorecard.tsx` — batting table + bowling table + fall of wickets
- `WicketSheet.tsx` — multi-step Dialog: dismissal type → fielder → new batsman (handles all-out)
- `ExtrasSheet.tsx` — Dialog for wide/no-ball/bye with run selection
- `EndOfOverSheet.tsx` — Dialog showing bowling figures + next bowler selection (non-dismissible, must pick bowler or undo)
- `CoinFlipPage.tsx` — 3D coin flip animation with Web Audio sound effects, Continue/Flip Again buttons (wizard step 4a)
- `TossPage.tsx` — premium toss result page: hero image, team card tap targets, bat/bowl decision with gradient highlights (wizard step 4b)
- `FreeHitBanner.tsx` — subtle cricket-themed banner after no-ball ("FREE HIT — Only Run Out dismissal")
- `PostMatchSummary.tsx` — result screen with gradient hero, both innings scores, scorecard link
- `RetireSheet.tsx` — retire batsman dialog (pick who retires + pick replacement from yet-to-bat or can-return)
- `AddPlayerSheet.tsx` — add late-joining players mid-match (roster with photos + guest players + search)
- `scoring-utils.ts` — type converters between store (ScoringBall) and UI (BallResult, TimelineEntry, InningsSummary, RetirementData)
- `PageFooter.tsx` — shared "Designed by Bhaskar Mantrala" footer (used across cricket + scoring)

---

## Match Lifecycle

```
Landing Page → Start New Match → Wizard (5 steps) → Scoring Screen
  ↓ (each ball)                                        ↓
  recordBall → update scoreboard/batsmen/bowler       End of Over → select next bowler
  ↓ (all out / overs complete / target reached)        ↓
  Innings Over card → Start 2nd Innings               2nd Innings Setup Dialog → continue scoring
  ↓ (match complete)                                   ↓
  Match Result Screen → View Scorecard / Done         Back to Landing (match in history)

Match History:
  Previous Matches (paginated, 10 per page, Load More)
  ↓ three-dot menu
  View Scorecard / Delete Match (soft-delete → Recently Deleted)

  Recently Deleted (admin only)
  ↓ three-dot menu
  Restore Match / Delete Forever (permanent, CASCADE)
```

### Match Status Transitions

```
setup → scoring → [innings_break] → completed
  ↓         ↓            ↓              ↓
Create   Record      Start 2nd      End match
Match    Balls        Innings       Result
```

- **setup → scoring:** `startMatch()`
- **scoring → innings_break (after 1st):** `endInnings()` OR auto on all-out/overs
- **innings_break → scoring:** `startSecondInnings()`
- **scoring → completed (after 2nd):** `endMatch()` OR auto on all-out/overs/target

---

## Detailed Workflows

### FLOW 1: Landing Page (`page.tsx`)

**User Interactions:**
1. **View Local Match** — "Your Active Match" card shows in-progress match on this device
   - **Sync button** (MdSync icon): manually calls `resumeMatch(dbMatchId)` to refresh from server. If match was ended/deleted on another device → toast "Match was ended or deleted on another device" and refreshes history. If OK → toast "Synced with server".
   - Continue Scoring button: navigates to `ScoringScreen`
2. **View Active DB Matches** — matches by other players shown separately
   - Shows `scorer_name` (prevents accidental takeover)
   - "Resume Scoring" button → confirmation dialog before taking over
3. **View Completed Matches** — full history with **filter tabs**: All, Last 5, Last 10, Last 20, Deleted (admin only)
   - "View Scorecard" → `viewScorecard(matchId)` (read-only, no scorer claim)
   - **Filter change triggers different API calls:** switching to "Deleted" calls `loadDeletedMatches()`, switching to any other filter calls `loadMatchHistory(false)`.
   - **Deleted tab (admin only):** switches match list from completed to soft-deleted matches. Three-dot menu shows "Restore" and "Delete Forever" instead of normal actions.
4. **Manage Matches** (Admin only via three-dot menu)
   - Delete → soft-delete (moves to Recently Deleted)
   - Restore → restore from Recently Deleted
   - Permanent Delete → irreversible CASCADE
   - Revert → reset completed match back to `innings_break` (allows re-scoring). **Only available when `!match_winner`** (no-result or abruptly ended matches — matches with a declared winner cannot be reverted).
5. **Start New Match** → blocked if any active match exists (local or DB)

**Edge Cases:**
- Local match exists but was deleted on another device → `resumeMatch()` detects, clears local state, shows toast
- Stale local match on app refresh → `resumeMatch()` re-hydrates or clears based on DB status
- Another player is scoring → "Take Over Scoring" dialog with scorer name confirmation
- **Legacy match result detection:** Older matches may not have `match_winner` set. Match cards fall back to parsing `result_summary` text (e.g., `result_summary?.includes('won')`) to determine win/tie/no-result display.

---

### FLOW 2: Scoring Wizard (`ScoringWizard.tsx`)

**Step 1: Match Details**
- Match title (required, min 1 char)
- Overs per innings (required, 1–50)
- Match date (defaults to today)
- Scorer info display (read-only)
- Validation: `title.length > 0 && overs > 0`

**Step 2: Team A Players**
- Team name (defaults to "Team A")
- Roster selection (filtered, sortable by name, can't select same player for Team B)
- Guest addition with autocomplete from past matches
- Validation: `selected + guests ≥ 2`

**Step 3: Team B Players**
- Same as Team A (can't select Team A players)
- Validation: `selected + guests ≥ 2`

**Step 4: Toss**
- Sub-step 4a: `CoinFlipPage` (optional) — 3D coin flip animation, crypto.getRandomValues for fairness, sound effects
- Sub-step 4b: `TossPage` — team selection (tap to choose toss winner), decision (Bat/Bowl), confirmation sentence

**Step 5: Opening Players**
- Batting First Team: Select striker (first tap) + non-striker (second tap) — two different players required
- Bowling First Team: Select one bowler (radio mode)

**Store Actions Called:**
- `createMatch({title, overs, date, teamA, teamB, tossWinner, tossDecision, scorerName})` — creates match in local state + DB (RPC awaited for player ID mapping)
- `setOpeners(strikerId, nonStrikerId, bowlerId)` — sets opening batsmen + bowler
- `startMatch()` — sets status='scoring', shows ScoringScreen

---

### FLOW 3: Scoring Screen (`ScoringScreen.tsx`)

**4-Tab Navigation (SegmentedControl):**
1. **"Scoring"** tab — active scoring interface (default during match, hidden when completed)
2. **"Ball by Ball"** tab — reverse chronological timeline of all deliveries with over summaries
3. **"Scorecard"** tab — full batting/bowling tables (shows both innings when match completed)
4. **"Squads"** tab — player roster management per team with add/remove/move actions

**Scoring Tab Layout (top to bottom):**
1. Header — back button + "Live Scoring" title + refresh icon
2. Scoreboard — team name, runs/wickets, overs, RR, target (2nd inn)
3. Free Hit Banner (if active)
4. Batsman Cards — striker and non-striker rows showing name, runs, balls, SR. **Tappable to manually swap strike** (only when innings not completed). Shows "not out" badge when innings is complete.
5. Bowler Card — current bowler with figures (overs, wickets, runs, economy). Tappable with pencil icon to change opening bowler (only when 0 balls bowled).
6. Over Timeline — visual 6-ball over display (colored circles, auto-scroll right)
7. Previous Over Summary — runs and bowler name from previous over
8. Ball-by-Ball Log — reverse chronological log with retirements & over summaries
9. Button Grid — scoring pad

**Change Opening Bowler (before first ball only):**
- The bowler card in the scoring screen shows a pencil icon and is tappable **only when `inningsBallCount === 0`** (no balls of ANY type — including wides/no-balls — bowled in current innings). A wide or no-ball before the first legal delivery also blocks bowler change.
- Tapping opens "Change Opening Bowler" dialog listing all bowling team players, with the current bowler highlighted.
- Select a different bowler → `setBowler(newId)` → toast confirmation → dialog closes.
- Once the first ball is delivered, the bowler card becomes read-only — bowler can only change at end-of-over via `EndOfOverSheet`.
- This applies to both 1st and 2nd innings (the check is `inningsBallCount === 0` for the *current* innings).
- **Undo restores bowler change:** If the player undoes the first ball of an innings (reducing `inningsBallCount` back to 0), the bowler card becomes tappable again with the pencil icon — the opening bowler can be changed again.

**Recording a Ball:**
1. Tap run button (0-3, 4, 6) → `recordBall({ runs_bat })` — auto-validates not all-out, updates totals/overs/strike
2. Tap Wide/No Ball/Bye/Leg Bye → `ExtrasSheet` dialog → select type + additional runs → `recordBall({ extras_type, runs_extras })`
   - **Wide:** 1 penalty run (team extras, not batsman) + optional additional runs if batsmen ran. Penalty doesn't swap strike, but additional runs do if odd. Not a legal ball. Charged to bowler's figures.
   - **No Ball:** 1 penalty run (team extras) + optional runs off bat (`runs_bat`) or additional runs if batsmen ran. All runs count for strike swap. Not a legal ball. Next ball is **free hit**. Counts as a ball faced for striker.
   - **Bye:** Batsmen physically ran but ball didn't touch bat — runs are team extras (not credited to striker's batting stats). Strike swaps on odd runs. Legal ball, counts toward over.
   - **Leg Bye:** Same as bye but ball hit pad/body. Runs are team extras. Strike swaps on odd runs. Legal ball, counts toward over. **Note:** The ExtrasSheet component accepts a `subType` parameter for bye/legbye distinction, but in the current UI flow, leg bye is selected as a separate button — the subType is passed by the parent ScoringScreen when the user taps the leg bye button.
   - In all extras cases: `runs_extras` added to innings total, bowler charged for wides/no-balls but NOT for byes/leg-byes in bowling economy.
3. Tap Wicket → `WicketSheet` dialog (multi-step):
   - Step 1: Select dismissal type (bowled, caught, lbw, run_out, stumped, hit_wicket)
   - Step 2a (caught/stumped): Select fielder (for stumped, the bowler is excluded from the fielder list since only the wicket-keeper can stump)
   - Step 2b (run_out): Which batsman out? Who ran them out? Runs completed (0-3)?
   - Step 3: Select new batsman (yet to bat or retired returning)
   - All-out: if no batsmen left, confirms all-out
4. Tap Retire → `RetireSheet` → select retiring batsman + replacement → `retireBatsman(retiredId, replacementId)`
5. Tap Undo → reverts last action (ball OR retirement). For balls: soft-deletes, reverts innings totals, restores striker/non-striker, cleans retired_players. For retirements: restores previous striker/non-striker, removes retirement entry. Both push to redo stack.
6. Tap Redo → re-applies last undone action
7. Tap End → `endMatch()` dialog
8. Tap Add Player → `AddPlayerSheet` dialog for a specific team:
   - **From roster:** Shows active roster players not already in match (either team), with photo + jersey. Search filter. Tap to add.
   - **From known guests:** Shows previously created guest players not already in match. Tap to add.
   - **New guest:** "Add Guest Player" button → name input with autocomplete from `guestSuggestions` (past match guests). Creates new guest in `cricket_players` table (upsert by `lower(name)`).
   - Player added to the selected team only. Cloud sync is **awaited** (needs server player ID for future ball FK references).
   - `existingPlayerIds` prevents the same player appearing on both teams.
9. Remove / Move Player (x icon on player row in squad list, only shown if `canRemovePlayer` returns true):
   - `canRemovePlayer(playerId)` checks: not currently at crease (striker/non-striker/bowler), never participated in any ball (as striker, non-striker, bowler, dismissed, or fielder), not an active replacement for a retired player.
   - If not removable: x icon is hidden entirely (player has participated).
   - If removable: x icon opens a confirmation dialog with **three actions**:
     - **"Move to {other team name}"** (primary button) — atomically removes from current team then adds to the opposite team. Uses `removePlayerFromMatch(fromTeam, id)` → on success → `addPlayerToMatch(toTeam, {...player, id: newUUID})`. If add fails, recovery logic adds player back to original team and shows "Move failed — player restored to original team" error toast.
     - **"Remove"** (danger button) — permanently removes from match. Deletes from local team + `practice_match_players` in DB + cleans `idMap` + removes any `retired_players` entries referencing them.
     - **"Cancel"** — closes dialog, no changes.

**After Each Ball:**
- Innings totals updated
- Strike swap logic applied (odd physical runs)
- End-of-over swap (every 6 legal balls)
- Free hit flag set (if no-ball)
- Over timeline + ball-by-ball log refresh
- Cloud sync triggered (fire-and-forget)

**End of Over Trigger:**
- After 6 legal balls, `EndOfOverSheet` modal appears (non-dismissible — cannot click outside or press Escape)
- Shows: over number, over runs, bowling figures for all bowlers, next bowler selection
- **"Just bowled" filtering:** The bowler who just completed the over is marked `justBowled: true` and is **disabled/unselectable** in the bowler list — prevents consecutive overs by same bowler.
- **Safety valve for tiny teams:** If ALL bowlers are marked `justBowled` (e.g., 2-player team), the safety valve re-enables all bowlers to prevent the modal from becoming stuck.
- Must select next bowler to continue
- Undo button available (undoes last ball, closes modal, returns to scoring)
- Exit button ends match early

**Match Completion Triggers:**
1. All-out: `total_wickets >= team_size - 1`
2. Overs complete: `legal_balls >= overs_per_innings * 6`
3. Target reached (2nd inn): `total_runs >= target`

---

### FLOW 4: Innings Break & 2nd Innings Setup

**State:** `status='innings_break'`, all 1st innings balls locked

**2nd Innings Setup Dialog UI:**
- **Target display** shown prominently at top: "Target: {1st innings total + 1}"
- **Opening batsmen selection** (batting 2nd team):
  - Tap a player to select as striker (first tap). Tap again to deselect.
  - Tap a different player to select as non-striker (second tap). Tap again to deselect.
  - Re-tapping a selected player toggles them off (deselect).
  - Striker and non-striker must be different players.
- **Opening bowler selection** (bowling 2nd team):
  - Radio mode — tap to select one bowler.
- **"Start 2nd Innings" button** — disabled until both batsmen and bowler are selected AND `striker !== nonStriker`.
- Calls `startSecondInnings(strikerId, nonStrikerId, bowlerId)` → sets `current_innings: 1`, `status: 'scoring'`, resets `isFreeHit = false`.

---

### FLOW 5: Match Completion (Result Screen)

**Shown After:** 2nd innings completes (all-out, overs, or target reached), OR manual "End Match"

**Result Computation:**
- If 2ndTotal > 1stTotal → "{2ndTeam} won by X wickets"
- If 2ndTotal === 1stTotal → "Match tied"
- If 2ndTotal < 1stTotal → "{1stTeam} won by X runs"
- Mid-innings abort → "No result" (match_winner stays null)

**Result Screen UI (rendered inline in ScoringScreen, NOT the PostMatchSummary component):**
- Gradient hero header with back + refresh buttons
- Result text prominently displayed
- **Mini score cards** showing both innings: team name, runs/wickets, overs (NOT the full scorecard tables)
- **Three action buttons:**
  1. **"View Full Scorecard"** — switches to the Scorecard tab (shows full batting/bowling tables for both innings)
  2. **"Practice Stats"** — navigates to `/cricket/scoring/leaderboard` (season leaderboard)
  3. **"Done"** — resets store (clears all local state) and returns to landing page

**Note:** The `PostMatchSummary.tsx` component exists with props for MVP, batting/bowling stats, and fall of wickets, but the actual result flow uses a simpler inline mini-card approach in ScoringScreen.

**Legacy match result fallback:** Older matches may not have `match_winner` set. The landing page falls back to parsing `result_summary` text to detect win/tie (e.g., `result_summary?.includes('won')`).

---

### FLOW 6: Practice Leaderboard (`/cricket/scoring/leaderboard`)

**Route:** `/cricket/scoring/leaderboard` — standalone page accessible from hamburger menu and result screen's "Practice Stats" button.
**Component:** `PracticeLeaderboard.tsx`

**4 Categories (SegmentedControl):**
1. **Batting** — columns: M (matches), R (runs), B (balls), SR (strike rate), 4s, 6s. Sorted by runs.
2. **Bowling** — columns: M, W (wickets), O (overs), Econ (economy), Wd (wides), Nb (no-balls). Sorted by wickets.
3. **Fielding** — columns: M, Dis (total dismissals), Ct (catches), RO (run outs), St (stumpings). Sorted by total dismissals.
4. **All-Round** — columns: M, Runs, Wkts, Ct, Pts. Points formula: `Runs + (Wickets × 25) + (Catches × 10)`. Sorted by points.

**Display:**
- Max 10 rows per category (`MAX_ROWS = 10`)
- **Rank badges:** gold (#1), silver (#2), bronze (#3) with gradient styling
- **Player photos** with gradient avatar fallback (first letter of name)
- **Refresh button** to reload leaderboard data from DB
- **Loading skeleton** with 5 placeholder rows during fetch
- **Empty state:** "No {category} stats yet" when no data

**Data Source:** `get_practice_leaderboard(season_id, category, match_limit)` RPC — season-scoped stats with optional last-N-matches filter.

---

## Ball Recording Logic

### Ball Properties Calculation
- `isLegal = extras_type not in [wide, no_ball]`
- `currentOver = legalBallsSoFar / 6` (integer division)
- `ball_in_over = legalBallsSoFar % 6` (0-5)

### Extras Types & Behavior

| Type | Runs | Legal? | Strike Swap | Free Hit Next? | Notes |
|------|------|--------|-------------|----------------|-------|
| Wide | 1 + runs | No | On non-penalty runs | No | Minimum 1 run |
| No Ball | 1 + runs | No | On all runs | Yes | Free hit next |
| Bye | runs | Yes | If odd runs | No | Non-striker only |
| Leg Bye | runs | Yes | If odd runs | No | Non-striker only |
| None | 0-6 | Yes | If odd | No | Regular batting |

### Strike Swap Rules

**Physical Runs Calculation:**
```
runs_bat                            (always counts)
+ (bye/leg_bye ? runs_extras : 0)   (extras count as runs)
+ (wide ? max(0, runs_extras-1) : 0) (penalty doesn't count, additional runs do)
```

**Swap applies when:** physical runs are odd. Also swaps at end of over (6 legal balls).
**Exceptions:** Wicket = no swap (slot becomes empty). Stumped = no swap.

### Wicket Types

| Type | Bowler Credit? | Fielder? | Notes |
|------|----------------|----------|-------|
| Bowled | Yes | No | Direct bowler responsibility |
| Caught | Yes | Yes | Fielder + bowler credit |
| LBW | Yes | No | Bowler credit |
| Run Out | No | Yes | Complex: which batsman? Runs completed? |
| Stumped | Yes | Yes | Wicket keeper |
| Hit Wicket | Yes | No | Batsman self-dismissal |
| Retired | N/A | N/A | Not a dismissal — player retires voluntarily |

### Run Out Complexity Example
```
Non-striker run out with 1 run completed:
1. User taps Wicket → "Run Out"
2. Which batsman? → Non-striker
3. Fielder? → Fielder A
4. Runs completed? → 1
5. Logic:
   a. Strike swap applied (1 odd run) → striker↔non-striker swap
   b. THEN non-striker marked out → slot cleared
   c. New batsman selected for empty slot
```

---

## Edge Cases & Special States

### Free Hit Mechanics
- **Trigger:** `extras_type === 'no_ball'`
- **Effect:** Next ball has `is_free_hit: true`
- **Dismissal Rule:** Only run-out permitted on free hit ball. Note: this restriction is enforced at the **store level** (`recordBall` logic), not in the WicketSheet UI — the WicketSheet itself does not filter dismissal types based on free hit state.
- **Display:** `FreeHitBanner` shown with yellow alert: "FREE HIT — Only Run Out dismissal"

### All-Out Detection
- **Trigger:** `total_wickets >= (team_size - 1)` (e.g., 10 wickets for 11-player team)
- Retired players DON'T count as dismissed
- If no batsmen available (none yet-to-bat, none retired-can-return) → ends innings immediately

### Target Reached (2nd Innings)
- `total_runs >= target` → innings auto-completes → match ends → win by X wickets

### Retired Player States
- On retirement: marked in `retired_players[]`, slot filled by replacement, runs/balls snapshot captured
- Undo retirement: remove from `retired_players[]`, restore to previous slot
- Can return if `returned: false` — selected via `setNextBatsman()`. Once `returned: true`, cannot bat again.

### Scorer Takeover Workflow (Multi-Device)

**Player B wants to take over from Player A:**
1. Player B opens scoring landing page → sees active match card showing "Scored by {Player A name}"
2. Player B taps "Resume Scoring" → **confirmation dialog** appears: "Take Over Scoring? {Player A} is currently scoring this match. Please ask {Player A} to stop scoring first, then continue." with Cancel and "Yes, Continue" buttons.
3. Player B confirms → `resumeMatch(matchId)` called:
   - Fetches full match data via `get_match_scorecard` RPC (match + players + innings + balls)
   - Hydrates local Zustand store from DB data (rebuilds `idMap`, restores all state)
   - Calls `claim_scorer` RPC → atomically sets `active_scorer_id = Player B's auth.uid()` with `FOR UPDATE NOWAIT` row lock
   - If claim fails → toast "Could not take over scoring — try again in a moment", resets store, stays on landing
   - If claim succeeds → Player B enters ScoringScreen with full write access via RLS

**What happens to Player A (the original scorer):**
1. **Proactive check on mount:** When ScoringScreen mounts, a `useEffect` immediately queries `practice_matches.active_scorer_id` and compares to current user. If different → sets `takenOverBy` immediately (catches takeover that happened while Player A's tab was in background).
2. **On next sync attempt:** When Player A records a ball/undo/etc., `syncToDb` fires → DB write fails (RLS blocks: `active_scorer_id` no longer matches Player A) → `checkScorerTakeover()` called → queries `active_scorer_id` + `scorer_name` → finds mismatch → sets `takenOverBy = "Player B name"`.
3. **Non-dismissible "Scoring Taken Over" dialog** appears: "{Player B} has taken over scoring for this match. Your changes since the takeover may not have been saved." Cannot click outside or press Escape.
4. **Only action:** "Back to Home" button → clears `takenOverBy`, calls `reset()` (clears all local match state + localStorage + sessionStorage), refreshes match history from DB, navigates back to landing page.

**Write blocking after takeover:**
- `syncToDb()` checks `takenOverBy` at the start — if set, **all writes are silently skipped** (no DB calls attempted)
- `addPlayerToMatch()` also checks `takenOverBy` guard — returns false immediately
- Player A's local state may diverge from DB after takeover — this is acceptable since the "Taken Over" dialog forces them back to landing

**`checkScorerTakeover()` details:**
- Guarded by `checkingTakeover` boolean to prevent concurrent checks
- Queries `practice_matches` for `active_scorer_id` and `scorer_name`
- Compares `active_scorer_id` against `auth.uid()` (current user)
- If different → `setState({ takenOverBy: data.scorer_name || 'Another player' })`
- Called from: (1) `syncToDb` on any error, (2) proactive `useEffect` on ScoringScreen mount

### Stale Local Match
- On app refresh: page.tsx checks local match status, calls `resumeMatch(dbMatchId)`
- If match completed/deleted elsewhere → `reset()` clears localStorage + sessionStorage, shows landing
- Sync button on active match card for manual server check

### Undo/Redo Edge Cases
- **Undo after page refresh:** `actionStack` cleared (in-memory only), but undo still works because `canUndo` checks `actionStack.length > 0 || balls.length > 0`. When actionStack is empty, `undoLastBall` synthesizes the action from the last ball in `balls[]` — so undo is available as long as there are balls to undo, even after refresh/resume.
- **Redo after undo:** `redoStack` + `redoActionStack` maintained in memory, `redoLastBall` re-records with original data. `canRedo` checks `redoStack.length > 0 || redoActionStack.length > 0`.
- **Clear redo on new ball:** any new `recordBall` call clears both redo stacks.
- **Both actionStack and redoStack/redoActionStack are in-memory only** — not persisted. All are lost on page refresh, but undo recovers via balls array.

### Read-Only / Spectator Mode (View Scoreboard)

**For active matches (scoring/innings_break):**
- Any cricket user can tap **"View Scoreboard"** on active match cards in the landing page
- Uses `viewScorecard(matchId)` — fetches match data without calling `claim_scorer` (no write access)
- `ScoringScreen` receives `readOnly={true}`:
  - **"Scoring" tab is hidden** — only Ball by Ball, Scorecard, and Squads tabs visible
  - **ButtonGrid is not rendered** — no run buttons, wicket, extras, undo/redo/end
  - **Default tab is "Ball by Ball"** instead of "Scoring"
  - **Proactive scorer takeover check is skipped** (no need to check `active_scorer_id`)
  - **Refresh uses `viewScorecard`** (not `resumeMatch`) to avoid claiming scorer
- Viewer sees: scoreboard, batsman/bowler cards, over timeline, partnership strip — all read-only
- Tapping "Back" clears readOnly state and returns to landing

### Completed Match (Read-Only)
- `status === 'completed'` — cannot record balls or modify players
- Can view scorecard + export
- Admin can `revertMatch()` to `innings_break` for re-scoring (only if no winner / abruptly ended)

---

## Store Actions Reference (`scoring-store.ts`)

| Action | Purpose | Cloud Sync |
|--------|---------|------------|
| `createMatch(...)` | Initialize match from wizard | Awaited (RPC returns player ID map) |
| `setOpeners(striker, nonStriker, bowler)` | Set opening players | Fire-and-forget |
| `startMatch()` | Set status='scoring' | Fire-and-forget |
| `recordBall(...)` | Core ball recording + all side effects | Fire-and-forget (chained: ball INSERT → innings UPDATE → match UPDATE) |
| `undoLastBall()` | Revert last action (ball or retirement) | Fire-and-forget (soft-delete ball + update innings) |
| `redoLastBall()` | Re-apply last undone action | Fire-and-forget |
| `retireBatsman(retiredId, replacementId)` | Retire active batsman | Fire-and-forget (update innings) |
| `swapStrike()` | Manual strike swap (correction) | Fire-and-forget |
| `setBowler(playerId)` | Change bowler (end of over or opening bowler change) | Fire-and-forget |
| `setNextBatsman(playerId)` | Fill empty batting slot | Fire-and-forget |
| `endInnings()` | Manually end 1st innings | Awaited |
| `startSecondInnings(striker, nonStriker, bowler)` | Start 2nd innings | Fire-and-forget |
| `endMatch()` | Complete match + compute result | Awaited |
| `addPlayerToMatch(team, player)` | Mid-match player addition | Awaited (needs server ID) |
| `removePlayerFromMatch(team, playerId)` | Remove player (pre-scoring only) | Awaited |
| `resumeMatch(matchId)` | Hydrate store from DB + claim scorer | Awaited |
| `viewScorecard(matchId)` | Load read-only match data | Awaited (no scorer claim) |

### Computed Getters (derived state from store)

| Getter | Returns | Used By |
|--------|---------|---------|
| `getBattingStats(inningsIdx)` | `BattingStats[]` — runs, balls, 4s, 6s, SR, dismissal per batsman | Scorecard tab, result screen |
| `getBowlingStats(inningsIdx)` | `BowlingStats[]` — overs, maidens, runs, wickets, economy, wides, no-balls per bowler | Scorecard tab, end-of-over sheet |
| `getBattingTeamPlayers()` | `ScoringPlayer[]` — current innings batting team | WicketSheet (new batsman), squad tab |
| `getBowlingTeamPlayers()` | `ScoringPlayer[]` — current innings bowling team | EndOfOverSheet, change bowler dialog |
| `getYetToBat()` | `ScoringPlayer[]` — batting team players who haven't batted yet (excludes dismissed, current crease, retired) | WicketSheet (new batsman selection) |
| `getRetiredBatsmen()` | `RetiredBatsmanOption[]` — retired players who can return (`returned: false`) with their runs/balls | WicketSheet, RetireSheet (replacement options) |

---

## Utility Functions (`scoring-utils.ts`)

### Display & Formatting
- `displayName(player)` → appends " (G)" for guests
- `formatOversDisplay(overs)` → "3.2" format
- `ballsToOvers(legalBalls)` → 7 balls = 1.1 overs
- `oversToLegalBalls(overs)` → 1.1 overs = 7 balls

### Store → Component Converters
- `scoringBallToBallResult(ball)` → BallResult (for OverTimeline)
- `scoringBallToBallEntry(ball, playerMap)` → BallEntry (for BallByBallLog)
- `buildTimeline(inningsIdx, balls, innings, match, playerMap)` → TimelineEntry[] (with retirements + summaries)
- `buildInningsSummary(...)` → InningsSummary (full scorecard)
- `bowlingStatsToBowlerFigures(stats)` → BowlerFigures[] (for EndOfOverSheet)

### Analytics
- `computePartnership(inningsIdx, balls)` → { runs, balls } (current partnership)
- `computePreviousOverRuns(inningsIdx, balls, playerMap)` → { runs, bowlerName } | null

### Dismissal Text
- `constructDismissalText(wicketType, bowlerName?, fielderName?, verbose?)` → "b Sanjay" | "c Ravi b Sanjay" | "run out by Pradeep"

---

## All Flows Summary

| Flow | Trigger | Entry Point | Key State Changes | Cloud Sync | Edge Cases |
|------|---------|-------------|-------------------|------------|------------|
| Landing | App load | page.tsx | Load matchHistory | resumeMatch() | Stale local match |
| Wizard | "Start New Match" | ScoringWizard | Create match | createMatch() RPC | Guest player suggest |
| Scoring | "Continue Scoring" | ScoringScreen | Record balls | recordBall() chained | Takeover detection |
| Extras | Tap W/NB/B | ExtrasSheet | runs_extras calc | recordBall() | Free hit after no-ball |
| Wicket | Tap Wicket | WicketSheet | dismissed_id set | recordBall() | All-out check |
| Retire | Tap Retire | RetireSheet | retired_players add | retireBatsman() | Undo retirement |
| Undo | Tap Undo | ButtonGrid | balls.pop(), revert | Soft-delete ball | Action synth on refresh |
| Redo | Tap Redo | ButtonGrid | Re-record ball | recordBall() chained | Clear on new ball |
| Change Opening Bowler | Tap bowler card (0 balls bowled) | Change Bowler Dialog | setBowler() | Fire-and-forget | Only before first ball of innings |
| End of Over | 6 legal balls | EndOfOverSheet | Select next bowler | setBowler() | Non-dismissible modal |
| Innings End | All-out/overs/target | recordBall() auto | is_completed=true | endInnings() + DB | Target check |
| Innings Break | 1st inn complete | ScoringScreen | Set target, pick openers | startSecondInnings() | — |
| Match End | 2nd inn complete | endMatch() | status=completed | endMatch() + DB | Result compute |
| Add Player | Tap Add Player | AddPlayerSheet | team.players updated | addPlayerToMatch() | Awaited for server ID |
| Scorer Takeover (Player B) | "Resume Scoring" on active match | Landing → confirm dialog | Hydrate store + claim_scorer RPC | Awaited (row lock) | Claim fail recovery |
| Takeover Detected (Player A) | Sync error or mount check | ScoringScreen | takenOverBy set, writes blocked | None (all skipped) | Non-dismissible dialog → Back to Home |
| Leaderboard | "Practice Stats" button or hamburger menu | leaderboard/page.tsx | Load stats per category | get_practice_leaderboard() RPC | 4 categories, max 10 rows |
| View Scoreboard (spectator) | "View Scoreboard" on active match | Landing → ScoringScreen(readOnly) | viewScorecard() hydration | Awaited (no scorer claim) | No Scoring tab, no ButtonGrid |
| Scorecard | "View Scorecard" | page.tsx | Load readonly | viewScorecard() RPC | No scorer claim |
| Delete | Three-dot menu | Landing | soft-delete | soft_delete_match() | Admin only for permanent |
| Restore | Three-dot menu | Landing | restore | restore_match() | Admin only |
| Revert | Three-dot menu | Landing | status→innings_break | revert_match_to_scoring() | Admin only, no-winner matches |
