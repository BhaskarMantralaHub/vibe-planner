# Player Stats Page — Current State

Reference doc describing the cricket league-stats page as it exists today. Use as the baseline for new design specs.

## Route

`/cricket/league-stats` — reached from the bottom nav bar's **Stats** tab on any cricket page.

## File layout

```
app/(tools)/cricket/league-stats/
├── page.tsx                       (56 LOC)
│   ├─ AuthGate (variant="cricket")
│   ├─ RoleGate (allowed: cricket, admin; feature: cricket)
│   ├─ Hero header card (gradient + Trophy decoration)
│   ├─ <LeagueStatsView/>
│   └─ CricketSectionNav (bottom)
└── components/
    └── LeagueStatsView.tsx        (1369 LOC) — all the stats logic + UI
```

## Page structure (top to bottom)

```
┌──────────────────────────────────────────────────────────┐
│  Hero card                                               │
│    Eyebrow: "LEAGUE PERFORMANCE" (cricket-tinted)        │
│    Title:   "Season Stats"                               │
│    Sub:     "Batting · Bowling · All-Rounders · Catches" │ ← stale, no Catches tab
│    Decorative Trophy icon at 7% opacity, top-right       │
│    Background: cricket-color gradient                    │
├──────────────────────────────────────────────────────────┤
│  Season selector (right-aligned)                         │
│    Dropdown of cricket_seasons. Switching changes        │
│    currentSeasonId in cricket-store.                     │
├──────────────────────────────────────────────────────────┤
│  SeasonScorecard — rich summary card                     │
│    • W / L / Undecided counts (animated NumberTicker)    │
│    • Recent form chips (newest first, W/L pills)         │
│    • Streak indicator if ≥2 in a row                     │
│    • Tap → /cricket/schedule#completed                   │
├──────────────────────────────────────────────────────────┤
│  SegmentedControl tabs:                                  │
│    [ Batting │ Bowling │ All-Round ]                     │
├──────────────────────────────────────────────────────────┤
│  StatTable (one of 3 tab bodies — see Tab Details)       │
│    Sortable headers · sticky first column · zebra rows   │
│    Tap row → expandable per-match drilldown panel        │
├──────────────────────────────────────────────────────────┤
│  CricketSectionNav (sticky bottom)                       │
│    [Upcoming · Completed · Stats · Moments · Home]       │
└──────────────────────────────────────────────────────────┘
```

## Data sources

| Source | Purpose | Notes |
|---|---|---|
| `cricclubs_batting_season` (Postgres view) | Season aggregates per player: innings, runs, balls, fours, sixes, not_outs, dismissals, highest_score, batting_average, strike_rate | `WITH (security_invoker = true)`; aggregates `cricclubs_batting` |
| `cricclubs_bowling_season` (view) | Season aggregates: innings, balls, maidens, runs, wickets, bowling_average, economy, best_wickets | same pattern |
| `cricclubs_batting` (table) | Per-innings rows (one per batter per match). Powers drilldowns + catches inference. | ~22 rows/match |
| `cricclubs_bowling` (table) | Per-innings rows (one per bowler per match). Powers drilldowns. | ~10 rows/match |
| `cricclubs_matches` | match_date, team_a/team_b, winner_team — used for opponent + date lookups in drilldowns | |
| `cricket_players` | Roster (id + name + is_active) — for name resolution + drilldowns | `eq('is_active', true)` |

All queries filter by `team_id = currentTeamId`. The **season selector currently does NOT filter the data** — switching seasons changes the cricket-store value but the queries here are team-wide, not season-scoped. Possible bug or known limitation.

### Phased loading

To minimize first paint, two query tiers fire in parallel:

- **Fast tier** (~tens of ms): batting_season + bowling_season + matches + roster → unblocks main tables.
- **Slow tier**: raw `cricclubs_batting` + `cricclubs_bowling` (per-innings) → fills drilldowns + catches/all-round derivations after first paint.

## Tab details

### Batting tab

Columns:

| # | Key | Label | Primary | Notes |
|---|---|---|---|---|
| 1 | `player_name` | Player | | with rank badge |
| 2 | `innings` | Inn | | innings count |
| 3 | `runs` | Runs | ✓ | sort default |
| 4 | `highest_score` | HS | | highest individual score |
| 5 | `batting_average` | Avg | | `runs / dismissals`, nullable |
| 6 | `strike_rate` | SR | | `(runs/balls)*100`, nullable |
| 7 | `fours` | 4s | | |
| 8 | `sixes` | 6s | | |

**Drilldown** (expand a row → per-innings table):

| Match | R(B) | 4s | 6s | SR |
|---|---|---|---|---|
| Sapphires · Apr 25 | 8(4) | 1 | 0 | 200.0 |
| RICM · May 17 | 32*(19) | 1 | 3 | 168.4 |
| ... | DNB | — | — | — |

(DNB = did not bat; an asterisk after runs = not out.)

### Bowling tab

Columns:

| # | Key | Label | Primary | Notes |
|---|---|---|---|---|
| 1 | `player_name` | Player | | with rank badge |
| 2 | `innings` | Inn | | |
| 3 | `balls` → derived `overs` | Overs | | formatted as `{floor(balls/6)}.{balls%6}` |
| 4 | `maidens` | M | | |
| 5 | `runs` | R | | |
| 6 | `wickets` | W | ✓ | sort default |
| 7 | `bowling_average` | Avg | | nullable |
| 8 | `economy` | Econ | | nullable |
| 9 | `best_wickets` | Best | | best wickets in one innings |

**Drilldown**:

| Match | O-M-R-W | Econ |
|---|---|---|
| Hawks · May 3 | 4.0-1-22-2 | 5.50 |

### All-Round tab

Columns:

| # | Key | Label | Primary | Notes |
|---|---|---|---|---|
| 1 | `player_name` | Player | | |
| 2 | `innings` | Inn | | |
| 3 | `runs` | Runs | | |
| 4 | `wickets` | W | | |
| 5 | `catches` | C | | computed client-side |
| 6 | `score` | Score | ✓ | `runs/25 + wickets + catches/2` |

Above the table sits an **info card** explaining the score formula as colored discipline pills:

```
Runs / 25  +  Wickets  +  Catches / 2
```

Players only appear if they contribute in **2+ disciplines** (single-skill players excluded).

## Catches — derived, not stored

There's no `catches` column on any table. They're inferred from `cricclubs_batting.dismissal` text via regex:

- `"c X b Y"`           → fielder = X
- `"c †X b Y"`          → fielder = X (with wicketkeeper marker)
- `"c & b X"`           → caught-and-bowled, fielder = X (the bowler)
- `"st †X b Y"`         → stumped (credited as fielder for v1)
- Anything else (run out, bowled, lbw, hit wicket, etc.) → no fielder credit

The fielder's short name (e.g. "Bhaskar B") is **prefix-matched case-insensitively** against the roster ("Bhaskar Baachi"). Mismatches mean the catch isn't counted for any player.

Only credited when `batting_team ≠ my_team` (opposition was batting, we were fielding).

A `catchEvents[]` array is built per match but currently has no UI surface beyond feeding the All-Round score.

## Interaction patterns

### Sortable headers
Click any column header → sort ascending/descending. Active column gets bold weight + ↑/↓ arrow + cricket-green if primary. Numeric defaults to descending; text defaults to ascending; nulls sink.

### Expandable rows
Tap any player row → detail panel slides open below with their per-match figures. Chevron indicator on the right:
- → (right) = collapsed
- ↓ (down, cricket-green) = expanded

Rows with `player_id = null` aren't expandable (no drilldown source).

### Sticky first column
Player name + rank stays visible during horizontal scroll on narrow viewports.

### Adaptive table width
`minWidth = max(260, 140 + numericColumns * 56)` so 2-column tables don't stretch awkwardly and wide tables get horizontal scroll instead of cramping.

### Loading + error states
- **Loading**: 3 stacked skeletons (hero, tabs, table)
- **Error**: `EmptyState` with `ChartColumnBig` icon + Retry button (re-fires the load effect via incrementing `reloadKey`)
- **Empty data**: per-tab empty message

## Visual elements

### RankBadge (top-3 medals)

- Rank 1: gold gradient `linear-gradient(135deg, #FFD700 0%, #FFA500 100%)`, dark-gold text
- Rank 2: silver `linear-gradient(135deg, #C0C0C0, #909090)`, dark text
- Rank 3: bronze `linear-gradient(135deg, #CD7F32, #A0522D)`, white text
- Rank 4+: muted text, no fill

20×20px circle, 10px font-weight 800.

### PlayerCell
Single-line name (no first/last split — names like "Manigopal V" don't split cleanly). Truncates with ellipsis. Optional trailing chevron for expandability.

## Notable engineering choices

1. **Noon-local date parsing** — every `match_date` is parsed as `YYYY-MM-DDT12:00:00` to avoid UTC-midnight pulling dates back a day in PT.
2. **MTCA prefix stripping** — every opponent name has `MTCA ` removed in display (`"MTCA Hawks"` → `"Hawks"`) since the prefix is league-wide noise.
3. **Phased load** — fast tier + slow tier separation, ~30-50% perceived-load improvement on growth.
4. **Stable sort secondary key** — ties broken by `player_name` alphabetical, so same-stat players appear in consistent order across loads.

## Known limitations / opportunities

| Area | Current | Improvement opportunity |
|---|---|---|
| Catches | Hidden inside All-Round score only | Add Catches as a first-class leaderboard tab; surface `catchEvents[]` as per-match drilldown ("vs Sapphires · Apr 25: 2 catches") |
| Season filtering | Stats are team-wide, season selector may not actually filter | Tie queries to `selectedSeasonId` |
| Head-to-head | Not supported | Per-player stats vs specific opponent |
| Milestones / PBs | Not surfaced | First 50, 5-fer, best figures — derivable from existing per-innings data |
| Player comparison | Not supported | Pick 2 players, see side-by-side |
| Charts | Purely tabular | Form/runs trend lines, opponent radar, etc. |
| Subtitle stale | Says "Catches" but no tab exists | Update or restore the Catches tab |
| Recent form | Inside SeasonScorecard, not drillable | Open per-opponent or per-venue breakdowns |
| Top performers per match | Not shown here | The `match.performers` field on `cricket_schedule_matches.Match` type exists but isn't populated |

## Shared components used

- `<Text>` — typography primitive
- `<SegmentedControl>` — tabs
- `<Skeleton>` — loading
- `<EmptyState>` — no-data + error
- `<NumberTicker>` — animated count-up (per memory: only for sports counts, never currency)
- `<SeasonSelector>` — season switcher (cricket-store)
- `<CricketSectionNav>` — bottom nav bar (used across all cricket pages)

## File: relevant lines for reference

| Concept | Line in `LeagueStatsView.tsx` |
|---|---|
| Type definitions | 21-123 |
| Catches inference | 125-172 |
| All-round score formula | 174-218 |
| `DetailTable` (drilldown mini-table) | 251-311 |
| `RankBadge` | 327-354 |
| `PlayerCell` | 359-382 |
| `StatTable` (the generic sortable table) | 384-540 |
| Data load effect (phased) | 619-691 |
| Tab rendering (batting / bowling / all-round) | 835-1000+ |
| `SeasonScorecard` (summary card) | grep around line 1100 |
| Bottom nav | inserted via `CricketSectionNav` in `page.tsx` |
