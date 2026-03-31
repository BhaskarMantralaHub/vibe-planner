---
name: Cross-platform compatibility requirement
description: All UI must work on desktop browsers, iPhone Safari, and Android Chrome — test for touch targets, viewport, and mobile quirks
type: feedback
---

All components and UI must work across desktop browsers, iPhone (Safari), and Android (Chrome).

**Why:** User accesses the app from multiple devices and expects consistent experience everywhere.

**How to apply:**
- Dialog/modal: use flexbox centering (not transform) to avoid mobile positioning bugs
- Touch targets: minimum 44px for buttons/interactive elements
- Inputs: handle iOS keyboard viewport push, use `autoComplete` attributes
- Bottom sheets (vaul): prefer over dropdowns on mobile
- Test animations on mobile — avoid heavy transforms that cause jank
- Use `px-4` padding on fixed overlays for safe area on small screens
- Avoid hover-only interactions — they don't work on touch devices
