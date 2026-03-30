# Live Scoring — Requirements & Invariants

> This document captures every business rule, UI behavior, and invariant in the live scoring feature.
> Before making any change, verify existing requirements are not broken. Add new requirements as features are added.
> Last updated: 2026-03-30

---

## 1. Match Lifecycle (State Machine)

| From | To | Trigger |
|------|----|---------|
| `setup` | `scoring` | `startMatch()` after wizard completes |
| `scoring` | `scoring` | `recordBall`, `setBowler`, `setNextBatsman`, `retireBatsman`, `swapStrike` |
| `scoring` | `innings_break` | 1st innings completed (all out / overs complete / target N/A) |
| `innings_break` | `scoring` | `startSecondInnings()` |
| `scoring` | `completed` | 2nd innings completed OR `endMatch()` |
| `innings_break` | `completed` | `endMatch()` during break |

### Reverse transitions (undo only)
| From | To | Trigger |
|------|----|---------|
| `innings_break` | `scoring` | Undo last ball of 1st innings |
| `completed` | `scoring` | Undo completion ball; admin `revertMatch` RPC |

---

## 2. Ball Recording

### REQ-BALL-01: Guard conditions
A ball MUST NOT be recorded unless ALL of:
- `match.status === 'scoring'`
- `currentInnings.is_completed === false`
- `currentInnings.striker_id` is set
- `currentInnings.non_striker_id` is set
- `currentInnings.bowler_id` is set

### REQ-BALL-02: Extras minimum runs
- Wide and no-ball MUST carry at least 1 extra run (`runs_extras >= 1`).
- Bye additional runs start at 1 (0 byes = dot ball, not a bye).

### REQ-BALL-03: Legal ball classification
- A ball is legal when `extras_type` is NOT `wide` and NOT `no_ball`.

### REQ-BALL-04: Free hit
- After a no-ball, the next ball is a free hit (`is_free_hit = true`).
- Free hit state is consumed by the next ball, then reset.
- On undo, free hit state is restored from the ball before the undone one.

### REQ-BALL-05: Strike rotation
- Strike swaps when physical runs are ODD and there is no wicket.
- End-of-over: additional swap after the 6th legal ball.
- Net effect: odd runs on the last ball of an over cancel out (swap + end-of-over swap).

### REQ-BALL-06: Runs constraints
- `runs_bat` must be 0-7 per ball.
- `runs_extras` must be >= 0.

### REQ-BALL-07: Sequence uniqueness
- Ball sequences must be unique per innings (among non-deleted balls).

---

## 3. Wickets

### REQ-WICKET-01: Consistency
- If `is_wicket = true`, `wicket_type` MUST be set.
- If `is_wicket = false`, `wicket_type` and `dismissed_id` MUST be null.

### REQ-WICKET-02: Dismissal types
- Supported: bowled, caught, run_out, stumped, hit_wicket, retired.
- LBW is in the type system but not currently in the UI.

### REQ-WICKET-03: Fielder selection rules
- Caught: all bowling team players shown (bowler included).
- Stumped: bowler EXCLUDED from fielder list.
- Run out: all bowling team players shown.

### REQ-WICKET-04: New batsman after wicket
- If batsmen remain (yet to bat + retired), user must select a replacement.
- If no batsmen remain (all out), wicket confirms immediately with no replacement.

### REQ-WICKET-05: Run out of non-striker
- Run out allows selecting which batsman is dismissed (striker or non-striker).
- Runs completed (0-3) are recorded. Strike rotation applies before determining which slot to clear.

---

## 4. Innings Completion

### REQ-INN-01: Completion triggers (any one)
1. **All out**: wickets >= batting team size - 1.
2. **Overs complete**: legal balls >= overs_per_innings * 6.
3. **Target reached** (2nd innings only): total runs >= target.

### REQ-INN-02: 1st innings completion
- Sets 2nd innings target = 1st innings runs + 1.
- Match status -> `innings_break`.

### REQ-INN-03: 2nd innings completion
- Match status -> `completed`.
- Result determined: winner by runs/wickets, tied, or no result (if early end).

### REQ-INN-04: Result logic
- Both innings completed naturally:
  - 2nd > 1st: batting team wins by wickets remaining.
  - Equal: "Match tied", `match_winner = 'tied'`.
  - 1st > 2nd: 1st innings batting team wins by run difference.
- NOT both completed: "Match ended -- No result", `match_winner = null`.

---

## 5. Bowler Rules

### REQ-BOWL-01: No consecutive overs
- A bowler who just completed an over cannot be selected for the next over.
- Enforced by UI (EndOfOverSheet disables `justBowled` bowlers).

### REQ-BOWL-02: End-of-over modal is mandatory
- The EndOfOverSheet cannot be dismissed (no X, no backdrop click, no escape).
- User MUST select a bowler to continue.

### REQ-BOWL-03: Undo from end-of-over
- "Undo Last Ball" link in the EndOfOverSheet undoes the 6th ball and closes the modal.

### REQ-BOWL-04: Back to Home from end-of-over
- "Back to Home" link navigates to the scoring landing page.
- Match state is preserved; mount-time detection will re-show the modal on resume.

### REQ-BOWL-05: Safety valve for small teams
- If ALL bowlers are marked `justBowled` (e.g., 2-player team), all are reset to selectable.

### REQ-BOWL-06: Page refresh at over boundary
- On mount, if at an over boundary AND current bowler = last over's bowler (not yet changed), re-show EndOfOverSheet.

---

## 6. Undo / Redo

### REQ-UNDO-01: Ball undo
- Removes last ball, recomputes innings totals from scratch.
- Restores striker, non-striker, bowler from the undone ball.
- Restores free hit state from the ball before.
- Can undo past innings break (reverts match status to `scoring`).
- Can undo past match completion (clears result_summary).

### REQ-UNDO-02: Retire undo
- Restores previous crease positions.
- Removes the retirement entry from retired_players.

### REQ-UNDO-03: canUndo after page refresh
- `actionStack` is cleared on `resumeMatch`/page refresh.
- `canUndo` must also check `balls.length > 0` as fallback.
- `undoLastBall` synthesizes a ball action from the last ball when actionStack is empty.

### REQ-UNDO-04: Redo clears on new action
- Recording a new ball or retiring a batsman clears redo stacks.

### REQ-UNDO-05: Undo closes all sheets
- Undo closes wicket, retire, extras, and end-of-over sheets.

---

## 7. Retirement

### REQ-RETIRE-01: Valid targets
- Only current striker or non-striker can be retired.

### REQ-RETIRE-02: Replacement
- A replacement must be selected from yet-to-bat or returned retired players.

### REQ-RETIRE-03: Returning retired players
- A retired player can return via `setNextBatsman`.
- If re-retired, the old entry is marked `returned: true` before creating a new one.

---

## 8. Toss & Wizard

### REQ-WIZARD-01: Step validation
- Step 1: title non-empty, overs > 0.
- Step 2: Team A >= 2 players.
- Step 3: Team B >= 2 players.
- Step 4: Always valid (defaults exist).
- Step 5: Striker, non-striker (different), and bowler all selected.

### REQ-WIZARD-02: Player exclusivity
- A roster player in Team A cannot be in Team B.
- Guest names are deduplicated across teams.

### REQ-WIZARD-03: Toss determines batting order
- (tossWinner=team_a AND bat) OR (tossWinner=team_b AND bowl) -> Team A bats first.

### REQ-WIZARD-04: Coin flip sub-step
- Step 4 shows CoinFlipPage first, then TossPage after "Continue".
- Back from TossPage returns to CoinFlipPage, not Step 3.
- Bottom bar hidden during coin flip (CoinFlipPage has its own buttons).
- "Skip Toss" option bypasses coin flip.

### REQ-WIZARD-05: Match creation is awaited
- Match creation must complete before scoring starts (need server player IDs).

---

## 9. Multi-Device & Sync

### REQ-SYNC-01: Ball sync is fire-and-forget
- Ball INSERT + innings UPDATE are background operations. Failure shows a toast warning.

### REQ-SYNC-02: Match creation is awaited
- Must complete before scoring (need server player IDs for FK references).

### REQ-SYNC-03: End match is awaited
- UPDATE match status/result must complete.

### REQ-SYNC-04: Scorer handoff
- `claim_scorer` uses row-level lock (`FOR UPDATE NOWAIT`).
- When `active_scorer_id` is set, ONLY that user can write balls/innings/match.
- `created_by` is a fallback ONLY when `active_scorer_id IS NULL` (no one has claimed).
- `is_cricket_admin()` is NOT allowed on scorer write policies — admin override is DELETE-only.
- This prevents both the match creator's AND admin's stale writes from overwriting the active scorer's data.
- Client-side: `syncToDb` checks `takenOverBy` flag and skips writes if takeover detected.
- `endMatch` is AWAITED (not fire-and-forget) to ensure `status: 'completed'` persists.

### REQ-SYNC-04a: claim_scorer MUST be awaited in resumeMatch
- `claim_scorer` MUST complete before `resumeMatch` returns true.
- Without this, RLS blocks all writes from the new scorer (active_scorer_id still points to the previous scorer).
- This caused real data loss: Player B's entire 2nd innings was silently rejected by RLS.

### REQ-SYNC-05: Stale match detection
- On landing mount, local match is verified against server.
- If completed/deleted on another device, local state is reset.

### REQ-SYNC-06: Resume vs View scorecard
- Active matches: `resumeMatch` (claims scorer for write access).
- Completed matches: `viewScorecard` (no claim, read-only).

---

## 10. Stats Computation

### REQ-STATS-01: Batting
- Balls faced = legal balls + no-balls where player was striker.
- Strike rate = (runs / balls faced) * 100.
- Retired players show `how_out: 'retired'` (not counted as dismissal).

### REQ-STATS-02: Bowling
- Runs conceded = runs_bat + runs_extras for all balls by this bowler.
- Wickets = non-retired dismissals only.
- Maidens = overs with 6 legal balls and 0 total runs.
- Economy = (runs conceded / legal balls) * 6.

### REQ-STATS-03: Leaderboard
- Only counts completed, non-deleted matches.
- All-rounder score = runs + wickets*25 + catches*10.

---

## 11. Database Constraints

### REQ-DB-01: Match constraints
- `overs_per_innings`: 1-50.
- `current_innings`: 0 or 1.
- Toss consistency: both null or both non-null.
- `created_by` immutable after creation.

### REQ-DB-02: Ball constraints
- `runs_bat`: 0-7.
- Wide/no-ball: `runs_extras >= 1`.
- Wicket consistency: is_wicket requires wicket_type.
- Sequence unique per innings (soft-delete aware).

### REQ-DB-03: Overs validation
- Decimal part of `total_overs` must be 0-5.

### REQ-DB-04: RLS — completed match protection
- Completed matches' innings and balls CANNOT be modified through normal RLS.

### REQ-DB-05: Player limits
- Minimum 2 players per match (RPC validation).
- Maximum 30 players per match (RPC validation).

### REQ-DB-06: Deletion rules
- Soft delete: creator or admin.
- Restore: creator or admin.
- Permanent delete: admin only, only on already soft-deleted matches.

---

## 12. UI Behaviors

### REQ-UI-01: canScore guard
- Scoring buttons functional only when match is scoring, innings not completed, and all three positions (striker, non-striker, bowler) are set.

### REQ-UI-02: Swap strike
- Tapping striker/non-striker area triggers swap (only when innings not completed).

### REQ-UI-03: Match result screen
- Shows after match completion with result summary, both innings scores.
- "View Full Scorecard", "Practice Stats", "Done" buttons.

### REQ-UI-04: Refresh button
- Available on scorecard top bar, match result screen, landing page, and practice stats.
- Shows spinner while loading, toast on completion.

### REQ-UI-05: End-of-over detection
- Fires when legal ball count crosses a multiple of 6.
- On page refresh, re-fires if at boundary with unchanged bowler.

### REQ-UI-06: Hamburger menu scroll lock
- Body scroll is locked when menu is open (position:fixed technique for iOS Safari).
- Scroll position restored on close.
- Menu nav scrollbar hidden for consistent width.

---

## 13. Forbidden States (Must NEVER Occur)

1. Ball recorded when `is_completed = true`.
2. Ball recorded without striker, non-striker, AND bowler.
3. Wide or no-ball with `runs_extras < 1`.
4. Wicket ball without `wicket_type`.
5. Non-wicket ball with `wicket_type` or `dismissed_id`.
6. `total_overs` decimal part > 5 (e.g., "3.7 overs").
7. `current_innings` > 1 (no third innings).
8. Toss fields partially set (one null, one non-null).
9. `created_by` changed after match creation.
10. Completed match modified via normal RLS.
11. Permanent deletion of non-soft-deleted match.
12. Same bowler bowling consecutive overs (UI-enforced).
13. Same player as both striker and non-striker.
14. More than 30 or fewer than 2 players in a match.
15. `runs_bat` outside 0-7 range.
16. Duplicate ball sequence in the same innings (non-deleted).
