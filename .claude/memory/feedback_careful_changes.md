---
name: Careful changes — no auto-approve, verify before editing
description: User has been burned by auto-approved changes that broke builds and production features. Must be cautious and verify.
type: feedback
---

Never rush edits. Previous auto-approved changes broke builds and production features multiple times.

**Why:** Real production app with real users (cricket team). Broken builds waste Cloudflare Pages build quota and break the live app.

**How to apply:**
- Present the EXACT change (old → new) and explain WHY before editing
- Only change what is strictly necessary — do not rename surrounding code, refactor, or "improve" anything beyond the fix
- Run `npx vitest run && npx next build` after every change to verify nothing breaks
- If a change touches SQL (docs only, not deployed), clearly state it needs manual deployment to Supabase
- When fixing DB functions, only change the broken part — don't rename variables that aren't causing issues
