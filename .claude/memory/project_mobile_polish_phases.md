---
name: project-mobile-polish-phases
description: "Mobile-first polish is phased; Phase 1 (foundation + Expenses view) shipped 2026-08-31 on feat/mobile-polish-phase1, later phases pending"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8ef91dc7-61ba-46ea-a621-aad8ac4a1baf
  modified: 2026-09-01T02:11:23.291Z
---

The cricket app is getting a phased mobile-first polish (target 375–430px; desktop only needs to stay functional; the existing PWA is deliberately untouched).

**Phase 1 — DONE (2026-08-31, branch `feat/mobile-polish-phase1`, user opens the PR themselves):** `viewportFit: 'cover'` enabled (safe-area env() now real in browser Safari; header got safe-area top padding), global tap-highlight removal, `.pressable` + `.animate-view-in` + `.pb-cricket-nav` utilities and `--cricket-content-bottom` token in globals.css, toast `mobileOffset` above the nav pill, Drawer/ComposerModal safe-area bottom padding, Input 15→16px (stops iOS focus-zoom), 44px hamburger/dialog-close/segmented tabs, new shared `ActionSheet` (bottom-sheet ⋮ menu taking the same `CardMenuItem[]` as CardMenu), CardMenu vertical flip fix, ShareFab on the shared Drawer, EditExpenseDrawer→ComposerModal, and the balance-first Expenses recomposition (greeting+season pill one line; pool hero first; carried-forward entry moved INSIDE ExpenseList via a new `carriedSlot` prop; Expenses header moved above the list; metric strip is soft tiles not a hairline grid).

**Later phases still pending:** Players (worst screen — 5 modal implementations, w-[340px] portals, 32px ⋮), Matches (CardMenu→ActionSheet, centered delete Dialogs→sheets, meta-line overflow), Umpiring (32px "I'll do it"/"Give up" buttons, grid-cols-4 PlayerGrid), Moments (20–22px comment-layer targets, 13–14px inputs zoom on iOS), the deep Splits rework, and migrating the remaining `pb-32` pages to `.pb-cricket-nav`. Sticky finances tab bar is blocked by `overflow-hidden` on the page container (`app/(tools)/cricket/page.tsx`).

**Verified findings worth remembering:** Tailwind v4 already gates `hover:` utilities behind `@media (hover: hover)` — no global hover variant change needed. `gh` CLI is logged in as the work account `bmantralaupgrade`, which cannot create PRs on the personal `BhaskarMantralaHub/vibe-planner` repo — the user creates PRs there themselves. Full plan: `/Users/bmantrala/.claude/plans/eventual-hugging-popcorn.md`.

Related: [[project_cricket_separation]]
