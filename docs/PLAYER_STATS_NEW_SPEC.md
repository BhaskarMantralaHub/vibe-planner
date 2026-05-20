# Cricket League Stats — Mobile-First Redesign Spec

> Source of truth for the `/cricket/league-stats` redesign. Companion to `docs/PLAYER_STATS_CURRENT.md` (what exists today).

## Vision

Premium mobile-first cricket analytics — Cricbuzz / Sofascore / FotMob / Apple Sports / IPL-app caliber. Stats-rich without spreadsheet fatigue. Touch-native. Emotionally engaging — momentum, competition, achievement.

**Replace**: spreadsheet-first, table-first, admin aesthetic.
**With**: leaderboard cards, storytelling dashboard, sports energy.

## Primary goals

1. Stats scannable within **3 seconds**
2. Eliminate horizontal table fatigue on phones
3. Surface top performers visually
4. Native-feeling drilldowns (bottom sheets, not inline rows)
5. Preserve dense cricket stats without clutter
6. Emotionally engaging

## Page architecture

```
Sticky Header
  ├─ Page title + Season selector
Hero Summary  (compact, 180-220px max)
  ├─ Win/Loss/Und + win-rate %
  ├─ Recent form pills (newest pulses)
  └─ Streak indicator
Top Performers Carousel
  ├─ Top Batter · Top Bowler · Best Economy
  ├─ Most Catches · Most Improved · MVP
  └─ Swipeable; each card: avatar + metric + trend + sparkline
Sticky Segmented Tabs (compact pill)
  ├─ 🏏 Batting · 🎯 Bowling · ⭐ All-Round · 🧤 Catches
Player Leaderboard (card-first, NOT tables)
  ├─ Rank medal · avatar · name · primary stats
  └─ Recent form chips · Expand CTA
Bottom Sheet (modal, draggable)
  ├─ Match-by-match timeline
  ├─ Trend sparklines
  ├─ Opponent breakdown
  └─ Achievements
Bottom Navigation (existing CricketSectionNav)
```

## Mobile UX principles

1. **Card-first, not table-first** — player cards, expandable summaries, bottom sheets, stacked layouts
2. **Progressive disclosure** — essential stats only initially; advanced on expansion
3. **Thumb-friendly** — 44px min targets, large spacing, swipe-friendly
4. **Visual hierarchy over density** — leaders/streaks/hot-players/recent-form readable at a glance
5. **Sports emotion** — momentum, competition, rankings, achievement

## Visual style

### Color direction (per tab)

| Tab | Accent |
|---|---|
| Batting | Green |
| Bowling | Blue |
| All-Round | Gold / teal |
| Catches | Purple |

### Surface styling

**Use**: layered cards, soft shadows, rounded **24px** containers, glassmorphism sparingly, subtle gradients.
**Avoid**: hard borders everywhere, dense separators, flat gray.

### Typography

- Oversized KPI numerals (Runs, Wickets, Score)
- Compact labels (uppercase, tracking-wide, muted)
- Bold rankings
- Dynamic weight hierarchy

## Hero section

**Sticky · ~180-220px max · compact.**

Contents in order:

1. **Season header**
   ```
   Season Stats
   2024 Season ▼
   ```

2. **Team momentum block**
   ```
   44W   11L   5UND
   73% Win Rate
   🔥 3 Match Win Streak
   ```

3. **Recent form pills** — `W W L W W` (newest first; newest has subtle pulse animation)

4. **Swipeable insight cards** (horizontal scroll, paged dots)
   - Top Run Scorer · Top Wicket Taker · Best Economy · Most Catches · Most Improved · MVP
   - Each card: avatar + metric + trend arrow + mini sparkline

## Sticky compact tabs

Pill-style. Sticky on scroll. Color-coded underline on active. Animated transitions.

```
🏏 Batting · 🎯 Bowling · ⭐ All-Round · 🧤 Catches
```

## Leaderboard cards (critical change)

Replace `<StatTable>` with mobile cards.

### Card structure (Batting example)

```
┌────────────────────────────────────┐
│ 🥇 Bhaskar Baachi              ▼  │
│ 231 Runs                          │
│ Avg 57.7 · SR 163                 │
│ HS 62* · 25×4 · 12×6              │
│                                    │
│ Recent Form                       │
│ 62* · 48 · 8 · 51 · 32*           │
└────────────────────────────────────┘
```

### Visible initially

- Rank medal · avatar · name
- Primary stats only
- Recent form (Batting only — other tabs drop it for compactness)

### Expansion: NOT inline-expand → fullscreen draggable bottom sheet

Native app feel. Smooth animation.

## Bottom sheet contents (per player)

**Header**
- Avatar · rank · role · season summary

**Match timeline**
```
May 17 vs RICM   62* (38)
May 3 vs Hawks   48 (27)
…
```

**Trends** — Mini sparklines for runs / wickets / strike-rate.

**Achievements**
- Highest score · Best bowling · 50s · 5-wicket hauls · Catch streaks

## Tab-specific requirements

### Batting tab
- Priority order: Runs → Strike rate → Average → Form
- Runs visually largest
- Recent innings chips inline
- Boundaries secondary

### Bowling tab
- Priority order: Wickets → Economy → Best figures → Overs
- Wicket badge
- Economy heat color (green=low / red=high)
- "4/18 Best Spell" chip

### All-Round tab
- MVP ranking feel
- Formula card (animated metric pills): `Runs/25 + Wickets + Catches/2`
- Contribution bars per player (optional radar mini-chart)
- Highlight contribution balance

### Catches tab
- Expose the derived nature visually
- Card: `🧤 12 Catches · 1.2/Match · Best Match: 3 catches`
- Catch timeline with:
  - Opponent
  - Catch count per match
  - Caught-and-bowled badges
  - Wicketkeeper catches separately
- "What counts as a catch?" info card with the 4 dismissal patterns

## Data viz

**Allowed**: sparklines, radial charts, trend bars, contribution meters.
**Avoid**: heavy enterprise dashboards.

## Empty / loading / error states

- **Empty**: cricket-themed illustrations + iconography ("No bowling data yet", "No catches recorded this season")
- **Loading**: skeletons mimicking actual layout (cards, avatars, stat chips, charts) — NOT generic gray rectangles
- **Error**: same friendly tone + Retry CTA

## Motion design

**Use**: active tab transitions · card elevation on tap · streak pulse · count-up on numbers · bottom-sheet drag.
**Avoid**: excessive flash.

## Performance — maintain phased loading

- **Fast tier**: leaderboard cards · hero · tabs · top performers
- **Slow tier**: trends · charts · drilldowns · catch events

## Tech constraints

- Next.js App Router
- React + Tailwind + shadcn/ui
- Framer Motion (motion + bottom sheet drag)
- Supabase (existing data sources unchanged)

### Reuse where possible

`Text` · `NumberTicker` · `SeasonSelector` · `CricketSectionNav` · `EmptyState` · `Skeleton`

## Accessibility

- WCAG contrast on accent color pairings
- 44px+ touch targets
- Readable typography
- Screen-reader labels on icon-only buttons + rank badges

## Responsive

**Mobile-first ONLY.** Primary: iPhone Safari · Android Chrome at 360 / 390 / 430 px. Tablet secondary.

## DO NOT

- Wide desktop tables
- Horizontal scroll
- Tiny dense numbers
- Enterprise/admin aesthetic

## MUST

- Feel premium
- Feel mobile-native
- Feel fast
- Feel emotionally engaging
- Make stats instantly understandable

## Locked decisions (2026-05-19)

### MVP formula (distinct from All-Round)

All-Round = qualification/composite ranking. MVP = impact storytelling.

```
MVP Score =
  (runs / 20)
  + (wickets × 1.25)
  + catches
  + bonus points
```

Bonus points:
- +2 for 50+
- +3 for 5-wicket haul
- +1 for strike rate > 150 (min 15 balls)
- +1 for economy < 6 (min 2 overs)

### Most Improved — not in v1

Hide. Keep placeholder architecture for future. Future: rolling last-5 vs prev-5 comparison, weighted momentum score.

### Best Bowling (Inn) — compute as "4/18" display string

From `cricclubs_bowling` grouped by (player, match). Best by:
1. Wickets DESC
2. Runs ASC

Surface as: hero badge · bowling achievement chip · player-card highlight.

### "View Full X Stats" CTA — bottom sheet only

No new routes. Bottom sheet with snap points, drag-to-close, sticky player header, internal scroll. Maintains context.

```
Tap player card → opens player detail sheet
Tap "View Full Bowling Stats" → opens expanded leaderboard sheet
```

## Architecture layers

Three layers of progressive depth:

| Layer | What | Where |
|---|---|---|
| **Summary** | Hero · momentum · leaders · insights | Top of page |
| **Exploration** | Tabs · filters · rankings | Mid-page |
| **Deep Analysis** | Bottom sheets · trends · match history · charts | Modal |

## Product mantra

**`scan → compare → explore`** — NOT "read giant tables." That mindset shift is the key to making this page feel premium.

## Inspiration keywords

Cricbuzz · Sofascore · FotMob · ESPN · IPL app · Apple Sports · OneFootball

Premium sports UI · modern mobile analytics · leaderboard UX · sports storytelling · momentum · competition · performance tracking.
