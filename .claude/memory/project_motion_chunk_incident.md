---
name: motion library blocked from prod by Cloudflare Pages dedup poisoning
description: Cloudflare Pages cached corrupt content-hashed chunks for motion/react utilities; motion-removal refactor planned next session (2026-05-07)
type: project
originSessionId: 623953da-468f-4f8c-8c49-a09fd6032c9f
---
**Incident summary (2026-05-07):**

Cloudflare Pages had a transient `502 Bad Gateway` upload failure during the deploy of commit `7fc580d` (the NumberTicker push). Two motion-library utility chunks (`08ok.yj72wl6o.js` and `0hhp_u-d~pmrr.js`) ended up with corrupt records in Cloudflare's asset storage. The deploy runner reported "Success" anyway. From that point, every subsequent deploy reused the same content-hashed chunks (motion's utility code is deterministic), which Cloudflare's dedup matched against the corrupt records → all subsequent deploys returned 500 on those chunks.

**Things we tried that didn't work:**
- Cache purge (twice) from Cloudflare dashboard — affects edge CDN, not asset storage records
- Bumping `motion` 12.38 → 12.37 — utility chunks were byte-identical
- Adding `experimental.optimizePackageImports: ['motion', 'lucide-react']` to next.config — chunks unchanged
- `dynamic(() => import('@/components/TeamSwitcher'), { ssr: false })` in Shell — initial HTML didn't reference broken chunks but runtime manifest still did via `t(50514)`
- `dynamic(() => import('../components/Gallery'), { ssr: false })` on moments page — same partial result
- Deleting the broken deployments from Cloudflare dashboard — dedup state survived deletion
- Empty redeploy commits (`git commit --allow-empty`) — same content = same hashes = same broken records served

**Final recovery:** Rolled back Cloudflare Pages live deployment to `d98309c` (the last healthy deploy before the incident). Local git was left at `80fd98d` (4 commits ahead of prod, containing NumberTicker, schedule/stats floating-pill nav, deleted-tab removal). **Any future push to main will trigger a Cloudflare deploy from `80fd98d`'s tree, which still generates the same broken chunks → prod will break again.**

**The fix planned for next session:** Remove `motion/react` library entirely from the codebase before the next push. Three known motion users:
1. `components/TeamSwitcher.tsx` — `motion.button`, `motion.div`, `AnimatePresence` for dropdown open/close. Replace with CSS `max-height` / `opacity` transitions.
2. `app/(tools)/cricket/components/Gallery.tsx` — entrance animations on post cards. Replace with CSS keyframes / Tailwind `animate-fade-in`.
3. `components/ui/number-ticker.tsx` — count-up via `useSpring`. Either remove the animation (revert league-stats to static numbers) or rewrite with `requestAnimationFrame`.
4. After removal, drop `motion` from `package.json`, run `npm install`.

Once motion is gone, build will produce different chunks entirely (no motion utility chunks at all) → Cloudflare's dedup poison becomes irrelevant.

**How to apply:** Before the user's next session resumes feature work, do the motion-removal first. The schedule/stats floating-pill nav (commit `b025fc3` content) plus NumberTicker (`7fc580d` content) are still in git history — can be revived after motion is gone, since the InteractiveMenu floating pill itself doesn't depend on motion (only on CSS).

**Reference for future Cloudflare Pages deploys:** if a deploy reports `502 Bad Gateway` mid-upload but then claims "Success", **do not trust it** — verify by curl-ing a freshly-named chunk after deploy. If you see the same flaky upload, immediately roll back via dashboard before traffic compounds the problem.

**Preventive fixes — status (2026-05-07):**
- ✅ **Cloudflare Pages build cache enabled** (user did this). Faster rebuilds, sidesteps some upload races.
- ⏳ **TODO next session: inject unique build ID into chunk graph.** Add `generateBuildId` + `env.NEXT_PUBLIC_BUILD_ID` in next.config.ts, reference the env var once in `app/layout.tsx`. This prevents content-hashed chunks from ever dedup-matching across deploys — every push uploads all assets fresh. This is the actual fix for the class of bug we hit (would have prevented this incident outright).
- ⏳ **TODO next session: post-deploy smoke test GitHub Action.** Curl `/cricket/`, `/vibe-planner/`, and a sample `/_next/static/chunks/*` after Cloudflare reports success. On 5xx, fail loudly. Cloudflare's runner reports false success on partial upload failure — we can't trust it.
