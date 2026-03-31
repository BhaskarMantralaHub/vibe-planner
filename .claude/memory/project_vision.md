---
name: project_vision
description: Bhaskar's Toolkit - multi-tool personal productivity suite architecture vision
type: project
---

**Bhaskar's Toolkit** — a personal productivity suite for Bhaskar and his wife.

**Vision:** Multiple tools (Vibe Planner is first) under one app with shared auth, hamburger menu navigation, and a unified shell.

**Key decisions (2026-03-11):**
- Migrating from vanilla HTML to a modern React/Node.js stack
- Shared layout shell with hamburger menu for tool switching
- Only 2 users (Bhaskar + wife), Supabase free tier
- Each tool is a self-contained module/route under the same app
- Scalability = easy to add new tools without touching existing ones

**Why:** The single-HTML-file approach hit its limits — manual state management, no package manager, full DOM rebuilds, can't leverage npm ecosystem.

**How to apply:** Design the architecture as a monorepo-style app with shared shell + pluggable tool modules. Each new tool should be addable as a new route/component without modifying the shell.
