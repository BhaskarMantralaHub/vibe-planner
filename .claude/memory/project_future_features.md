---
name: Future cricket features planned
description: Match scheduling + post-match top 3 performers — approved by user, needs DB tables + UX design
type: project
---

Two new cricket features to build (user approved 2026-03-25):

1. **Match Schedule** — Date, time, venue, opponent. Admin posts match details. Players can see upcoming matches.
2. **Post-Match Summary** — Match result (Won/Lost/Tied), top 3 performers (selected by admin), auto-posts to Moments feed as a special "Match Result" card.

**Why:** Currently scheduling happens in WhatsApp but user wants a simplified version in the app. Post-match summaries add engagement to Moments feed.

**How to apply:** Needs new database tables (matches, match_performers), new cricket store actions, new UI components. Form a council (UX + data + features agents) before implementation. Design the data model first.
