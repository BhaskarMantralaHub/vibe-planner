---
name: Live scoring feature — full requirements
description: Practice match ball-by-ball scoring with multi-device handoff via unique code, separate page, hamburger menu entry
type: project
---

## Live Scoring for Practice Matches (user requirements 2026-03-26)

### Core Flow:
1. **New page** (`/cricket/scoring` or `/scoring`) — not inside the cricket dashboard tabs
2. **Hamburger menu entry** — anyone with cricket access can start scoring
3. **Match setup wizard:**
   - Team A name + captain + players (pick from roster)
   - Team B name + captain + players (pick from roster)
   - Who won the toss + chose to bat/bowl
   - Total overs
   - Who is scoring (the person operating the device)
4. **Scorer handoff:** Generate a **unique code** so another person can take over scoring on their device. Enter the code → resume live scoring.
5. **Ball-by-ball scoring:** Like CricClubs — 0,1,2,3,4,5,6, Wide (with runs), No Ball (with runs + free hit), Bye, Leg Bye, Wicket (types: bowled, caught, LBW, run out, stumped)
6. **Undo** last ball
7. **Auto end-of-over** → pick next bowler
8. **Innings break** → swap teams, show target
9. **Post-match:** Scorecard, MVP, post to Matches tab as Practice Match

### Key requirement: Multi-device scorer handoff (SIMPLIFIED)
- Scorer taps "Hand Off" → picks a player from the roster
- That player's `user_id` becomes the new `active_scorer_id`
- The selected player opens the app on their device → sees "You're the scorer" notification
- They tap to continue scoring from where it left off
- Original scorer's device becomes read-only
- NO codes, NO typing — just select a name and hand over
- Requires the next scorer to have signed up in the app with their email

### Design council already completed:
- DB schema: 4 tables (practice_matches, practice_teams, practice_innings, practice_balls)
- Scoring screen layout designed (scoreboard + batsmen/bowler + button grid)
- MVP calculation algorithm
- V1 vs V2 scope defined

**Why:** Internal practice matches need scoring. Players sometimes need to hand over the scoring device when it's their turn to play.

### Back-to-back matches (IMPORTANT)
- Teams play multiple practice matches in the same session (8-10 over games, back to back)
- After match ends, show "Start Another Match" option prominently
- Pre-fill: same date, same overs, same players
- Offer "Rematch (Same Teams)" as the PRIMARY action — one tap to restart with same teams
- Skip wizard entirely for rematch — just do toss and go

### Match history + scorecard viewing
- Previous match scorecards should be viewable from the Live Scoring page
- Landing page shows "Your Active Matches" AND "Previous Matches" (completed)
- Tapping a completed match opens the full scorecard (batting + bowling + extras + FOW)
- Also accessible from hamburger menu under "Live Scoring"

### Match lifecycle rules
- Only ONE active match per team at a time
- If a player tries to create a new match while an active match exists → show "End current match first"
- Who can end a match: the active scorer OR an admin
- Non-scorer players cannot end the match — they can only view the live score
- After match is ended (by scorer or admin), anyone can start a new one
- The post-match summary should NOT be a dead end — always lead to the next match

**How to apply:** This is a standalone page, not a tab inside cricket dashboard. Needs its own route, own store (practice-store.ts), and real-time sync via Supabase for multi-device handoff.
