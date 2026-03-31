---
name: feedback_no_bash_secrets
description: User doesn't want bash commands that grep for real credentials - run security scans differently
type: feedback
---

Don't run bash commands that contain or grep for actual credentials/passwords/emails. The user rejects these.

**Why:** The bash command itself shows the secrets in the terminal, which feels insecure.

**How to apply:** For security scans, use generic patterns or just verify .gitignore coverage and check git diff output manually without specifying real credential values.
