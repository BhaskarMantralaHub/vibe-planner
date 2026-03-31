---
name: feedback_branching
description: User prefers feature branches instead of pushing directly to main
type: feedback
---

Use feature branches for new features, not direct push to main.

**Why:** User has limited Cloudflare build quota and wants to test locally before deploying. Direct pushes to main trigger auto-deploy.

**How to apply:** For new features, create a branch (e.g., `feat/sports-toss`), develop there, and only merge to main when ready to deploy.
