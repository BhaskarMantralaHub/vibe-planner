---
name: Never push without user consent
description: Always wait for user to test and approve before pushing — implement one change at a time
type: feedback
---

Do NOT push changes without explicit user approval. Implement one change at a time, let the user test on localhost, and only push when they say "push" or "looks good".

**Why:** User needs to visually verify each change on their device (especially mobile Safari) before deploying. Batching multiple changes makes it hard to identify what broke.

**How to apply:**
- Make the code change
- Tell the user what changed
- Wait for them to test and approve
- Only then commit and push
- Never batch multiple unrelated changes into one push without consent
