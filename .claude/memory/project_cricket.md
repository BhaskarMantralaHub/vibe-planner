---
name: project_cricket
description: Cricket Team Expenses tool for Sunrisers Manteca team — design decisions and context
type: project
---

Bhaskar is building a Cricket Team Expenses tool within Viber's Toolkit for his team **Sunrisers Manteca**.

**Key decisions (2026-03-16):**
- Team uses CricClubs for match stats/scorecards and WhatsApp for availability polling — no need to replicate those
- The tool focuses solely on **expense tracking and dues management**
- Treasurer (Bhaskar or 1-2 people with accounts) manages expenses; team views dues via public share link
- Public shareable link (`/cricket/dues/[token]`) — no login required for team to view dues
- Share link intended to be posted in WhatsApp group

**Why:** No existing cricket platform handles team expense splitting well. WhatsApp threads get buried, Splitwise lacks cricket context.

**How to apply:** Keep the scope narrow — expenses, splits, dues, settle up, public share. Don't build match tracking or availability features.
