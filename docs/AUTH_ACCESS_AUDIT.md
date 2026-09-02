# Auth & Team Access — Phase 1 Audit Report

Date: 2026-09-01. Read-only audit; no code changed. Three parallel inspections
(frontend flows, database schema/RLS/RPCs, cross-cutting call-site sweep) over
the actual code — `docs/SIGNUP_FLOWS.md` was treated as a claim to verify, and
several of its claims turned out to be false (see §1.1).

Canonical DB source: `docs/cricket-schema.sql` (matches `docs/deploy-trigger-fix.sql`,
the last-deployed trigger). `docs/DATABASE_SCHEMA.sql` holds the `profiles`
policies and the `on_auth_user_created` trigger declaration — note the trigger
and its `supabase_auth_admin` grant exist ONLY there, not in cricket-schema.sql.

---

## 1. Current architecture (as it actually is)

Three concerns, currently tangled across four authorities:

- **Identity**: Supabase `auth.users` + `profiles` (email, full_name, `access text[]`,
  `approved bool`, `features text[]`, `is_admin`, `player_meta jsonb`).
- **Team authorization**: `team_members (team_id, user_id, role, approved bool)` with
  `UNIQUE(team_id, user_id)` ✓. `user_team_ids()` / `is_team_admin()` / `is_team_member()`
  all correctly require `approved = true` and gate ~69 RLS policies across every
  team-scoped table. **This chokepoint is sound.**
- **Player profile**: `cricket_players` (identity record per team), `user_id` nullable,
  linked by `lower(email) = lower(auth email)`.

Two things sit OUTSIDE the chokepoint:
- `profiles.approved` — a global boolean used by the client as a UX gate
  (auth-store signs you out when it is false). It cannot represent per-team state.
- The four **Storage buckets** (player-photos, gallery-photos, team-logos/expense/split
  receipts) — still gated by legacy `has_cricket_access()` (`profiles.access @> '{cricket}'`),
  which checks neither team nor approval. Acknowledged debt in cricket-schema.sql:1704.

### 1.1 Where the documentation is wrong

`docs/SIGNUP_FLOWS.md` describes several flows that DO NOT work as written,
because `profiles` has **no self-UPDATE policy** (`DATABASE_SCHEMA.sql:149-171`:
UPDATE requires `is_admin()`), and `cricket_players` UPDATE requires team admin
(the self-edit policy's `USING (user_id = auth.uid())` can never see an
unlinked row — `NULL = uid` is not true):

- "AuthGate auto-approves, adds cricket access, links player record" — the
  `profiles.update({access, approved:true})` at AuthGate.tsx:43 and the
  `cricket_players.update({user_id})` at :45-48 are **silent no-ops for every
  non-admin** (0 rows matched, no error, result unchecked). The path "works" in
  demos only because it also mutates local Zustand state and reloads; the DB
  state that actually admits the user comes from `accept_invite` or
  `request_cricket_access`, or because the tester was the global admin.
- "Player linking on login (backup)" — auth-store.ts:301-306 is likewise a
  **no-op for non-admins** under RLS. Real linking happens only in the
  SECURITY DEFINER paths: `handle_new_user`, `accept_invite`, `approve_team_member`,
  and `claim_umpiring_duty`'s opportunistic backfill.
- "Request Cricket Access" button (AuthGate.tsx:74, self `approved:false`) —
  also a silent no-op; the user sees "Request Sent" but nothing was written.

Consequence: the *only* live authorities for membership/linking are the
SECURITY DEFINER functions — which is where the real vulnerabilities are (§7).

---

## 2. Authentication flow map

**Client config** (`lib/supabase/client.ts`): `createBrowserClient(url, key)` with
ALL defaults — PKCE flow, `detectSessionInUrl: true`, cookie-backed session,
auto refresh. Static export (`output: 'export'`): no server routes exist.

**A. Signup via invite** (`/cricket?join=<token>`):
AuthGate blocks direct signup without a token ("Invite Link Required"); with one,
it calls `validate_invite_token` (anon-callable; token→team-name oracle) for
branding, then `signup()` sends metadata: `full_name`, `access` (string!),
`approved` (client-computed — **ignored server-side**, good), the five player
fields, `team_slug`. **No `emailRedirectTo` anywhere in the repo.**
After `signUp`: always the "check your email" card.

**B. Email confirmation return — THERE IS NO HANDLER.** The only `?code=`
consumer (`auth-store.init():214-216`) is hard-wired to the password-reset UX:
it exchanges the code, then sets `needsPasswordReset`, and Shell renders the
**Set New Password** form. A confirmation click therefore either dead-ends or
drops a brand-new player into a password-reset form; hence "verify → come back →
log in again" and the `check-email` copy saying exactly that.

**C. Login**: `signInWithPassword` → profile fetch → `disabled` gate →
`approved === false` → sign out + "Pending Approval" screen. A missing/RLS-blocked
profile row silently defaults to `access=['toolkit']`, `approved=true`
(auth-store.ts:138-139). Duplicate profile fetch per login (login() + the
auth-listener path). `init()` is called from two mounts and registers a NEW
`onAuthStateChange` listener each time, never unsubscribed.

**D. Password reset**: `resetPasswordForEmail(email, { redirectTo: origin + '/vibe-planner/' })`
— hard-coded; a cricket-only user lands on the toolkit route. Recovery via
`token_hash&type=recovery` or `?code=` both handled.

**E. Invite acceptance** (`InviteHandler`, mounted once on /cricket): reads
`?join=` or `sessionStorage['vibe_pending_invite']` (saved when logged out;
**never cleared on logout** — survives into the next account on that tab).
Validates, shows "Join {team}?", explicit button → `accept_invite` RPC. Strips
`?join=` on success/already-member, NOT on error. AuthGate's branding effect
never strips it.

---

## 3. Membership flow map (how users become members)

| Path | Authority | approved set to |
|---|---|---|
| Signup w/ invite, email pre-added on target team | `handle_new_user` trigger | true |
| Signup w/ invite, unknown email | `handle_new_user` | false (+ admin notifications) |
| Signup, non-cricket (`toolkit`) | `handle_new_user` | true, no team row |
| Logged-in user accepts invite | `accept_invite` RPC | true if pre-added on team OR approved on ANY other team; else false |
| "Already registered" during cricket signup | `request_cricket_access` RPC (**anon-callable**) | false, on the **oldest team in the system** |
| Admin approval | UI: Shell.tsx direct writes (live) / `approve_team_member` RPC (**dead code**) | true |
| Admin add-player with linked profile | cricket-store `addPlayer` direct `team_members` insert **without `approved`** → column default **true** (silent instant approval) |

Rejection today: Shell.tsx deletes ALL the user's pending `team_members` rows
(no team filter), then either strips cricket from `profiles.access` (toolkit
users) or calls `reject_user` → **hard-deletes `auth.users`**.

---

## 4. Player-linking flow map (every site that can set `cricket_players.user_id`)

Server-side (real): `handle_new_user` (cricket-schema.sql:1098-1108 — team-scoped,
**not null-guarded**: overwrites an already-linked row, and updates EVERY matching
row); `accept_invite` (:254-258 — team-scoped + null-guarded ✓);
`approve_team_member` (:1189-1202 — team-scoped + null-guarded ✓, plus INSERT path);
`claim_umpiring_duty` (umpiring-schema.sql:694 — null-guarded backfill ✓).

Client-side (no-ops for non-admins, live ONLY when the actor is an admin):
AuthGate.tsx:45-48 (**no null guard, no team scope** — as global admin it can
re-point an already-linked row cross-team); auth-store.ts:301-306 (null-guarded,
no team scope); Shell.tsx:102-118 (approve flow — email-matched with **no team
scope**, and the INSERT path creates a player row **without `team_id`**);
cricket-store addPlayer `linked_user_id` insert (admin, RLS-gated ✓).

Missing constraint: **no unique index on `cricket_players(team_id, user_id)`**
and none on `(team_id, lower(email)) WHERE is_active` — one user can hold N
player rows; duplicate roster emails make every email-match link multi-row.

---

## 5. Approval flow map

Live UI: `PendingApprovals` (Shell header, every page), visible when client-side
`userAccess` includes 'admin'. Five sequential direct writes, no transaction,
**no error checks**: player link/insert → `profiles.update({approved:true, features})`
(overwrites curated features) → `team_members.update({approved:true})` with
**no team filter** (approves ALL the user's pending teams) → welcome-post RPC.
A partial failure leaves a half-approved user.

Also: the pending list joins `profiles`, whose SELECT policy is `is_admin()`
(GLOBAL admin) — a team owner/admin who is not a global admin sees an empty
approval queue. The properly-scoped `approve_team_member` / `reject_team_member`
RPCs (admin-gated, team-scoped, welcome post + approval notification, correct
notification cleanup) exist in cricket-store as `approveMember`/`rejectMember` —
**with no UI caller. The safe path is dead code; the unsafe path is shipped.**

---

## 6. Welcome-post flow map

Creator: `post_welcome_message` (SECURITY DEFINER, no authz of its own, forges
the post as authored by a team admin, fans out notifications). Callers:
`handle_new_user` (pre-added signup), `approve_team_member` (RPC path — unused),
`create_welcome_post` RPC wrapper ← called by AuthGate auto-approve effect
(unguarded useEffect) and Shell approve flow.

**No duplicate guard anywhere** — no unique marker, no existence check.
`create_welcome_post` allows `auth.uid() = new_user_id` self-invocation with an
**arbitrary `player_name`** interpolated into the caption plus `@Everyone` —
any member can spam admin-authored welcome posts with injected mentions.
Welcome posts are detected on read by **caption text heuristic** (GalleryPost).

---

## 7. Security findings

### CRITICAL

1. **`reject_user` lets ANY authenticated user delete ANY account.**
   cricket-schema.sql:1129-1140: `DELETE FROM profiles; DELETE FROM auth.users;`
   — SECURITY DEFINER, **zero authorization checks**, granted to `authenticated`,
   and the only SECURITY DEFINER function here with **no `SET search_path`**.
   User UUIDs are visible to every teammate (team_members SELECT). One RPC call
   deletes the global admin's account (cascades through user_id FKs). Only team
   owners are shielded (owner_id FK RESTRICT).

2. **Self-service global admin via signup metadata.** `handle_new_user`
   (:1010-1015) copies `raw_user_meta_data->>'access'` into `profiles.access`
   with **no allowlist**. `supabase.auth.signUp({ options: { data: { access: 'admin' }}})`
   → `profiles.access = '{admin}'` → `is_global_admin()` and `is_admin()` both
   true → full RLS bypass on every table, all profiles writable. Toolkit signup
   has no invite gate, so this is reachable by anyone with the anon key (public
   in the JS bundle).

3. **Anonymous account lockout + arbitrary-team assignment via `request_cricket_access`.**
   Granted to `anon` (:1320), takes any email, no authz: sets that user's
   `profiles.approved = false` (→ auth-store force-signs them out as "pending")
   and enrolls them as pending on the **oldest team in the system** (not the
   team they asked for). Anyone can lock any known email out of the app,
   repeatedly, unauthenticated. Also an email-existence oracle.

### HIGH

4. **Storage buckets ignore teams and approval** — `has_cricket_access()` only.
   A pending (unapproved) user, or any member of team A, can read AND delete
   team B's player photos, gallery photos, and expense/split receipts.
5. **Shipped approval UI is unscoped and non-atomic** (§5): approve/reject act
   on ALL teams' pending rows; five unchecked writes; features overwritten;
   invisible to non-global team admins. Safe RPCs exist unused.
6. **Welcome-post forgery/spam** (§6): self-callable, arbitrary name, admin-authored,
   `@Everyone` mention injection, no idempotency.
7. **Self-edit policy hole**: `"Players can update own record"` WITH CHECK
   constrains only `user_id` — a linked player can change their own `email`
   (identity used for all linking!), `is_active`, `designation`, and `team_id`
   (partially mitigated by the roster composite FKs). Editing `name` writes
   through a SECURITY DEFINER trigger into `profiles.full_name`.
8. **`handle_new_user` linking is not null-guarded** — a new signup whose email
   matches an already-linked row **steals the link** and overwrites the roster
   row's name/jersey/role from signup metadata.
9. **`team_members`/`cricket_teams` UPDATE policies are USING-only** (no WITH
   CHECK): a team admin can rewrite a membership row's `team_id` into a foreign
   team; a team owner can reassign `owner_id`.
10. **No email-confirmation return path** (§2B): the only `?code=` handler routes
    confirmations into the password-reset form. Root cause of the double-login UX.

### MEDIUM

11. Invite token: plaintext at rest, permanent (`2099-12-31`, unlimited uses),
    **auto-created as a side effect of RENDERING the Teams admin tab**
    (TeamManager.tsx:110-115), no DELETE policy, `use_count` burned by member replays.
12. Account enumeration: `check_cricket_player_email` is an anon, unlimited
    roster-email oracle; signup error copy states "already have an account and
    are on the team"; login reveals "confirm your email"; anon `get_user_count`.
    (Forgot-password is already generic ✓.)
13. Client dead-writes create false confidence: AuthGate auto-approve, the
    "Request Access" button, and the login backup-link all silently do nothing
    (results unchecked) — UX shows success for writes that never happened.
14. `profiles` INSERT policy `WITH CHECK (true)`; `is_admin()` lacks
    `SET search_path`; `prevent_owner_escalation` is BEFORE UPDATE only.
15. `init()` leaks an `onAuthStateChange` listener per mount; duplicate profile
    fetch per login; `useTeamContext` writes state during render; pending-invite
    sessionStorage survives logout; reset redirect hard-codes `/vibe-planner/`.
16. Rejection deletes `auth.users` as the NORMAL path — a mis-click permanently
    destroys an account (and its notification cleanup matches on message TEXT,
    so same-named pending users clobber each other).
17. `addPlayer`'s direct `team_members` insert omits `approved` → default TRUE:
    linking a suggested cross-team profile instantly grants approved membership,
    bypassing any approval.

### LOW

18. Missing team check on `cricket_notifications` UPDATE/DELETE; `cricket_teams`
    INSERT allows arbitrary `owner_id`; raw signup errors console-logged;
    `?join=` left in URL on error paths; multi-tab state not synchronized;
    canonical schema file lacks the `on_auth_user_created` trigger declaration.

---

## 8. Race conditions

- **RequestAccess effect** (AuthGate.tsx:30-63): four server calls, deps include
  the ever-fresh `user` object, no ref guard/cleanup — duplicate `create_welcome_post`
  is the real (server-effective) duplicate; the rest are no-ops.
- **Welcome post**: three call paths, zero idempotency → the same activation can
  produce 2–3 posts (trigger + client + approval).
- **Double-approve**: Shell approve has only a spinner; two admins or a retry
  re-run all five writes (mostly idempotent by accident, features overwrite races).
- **Linking**: no unique `(team_id, user_id)` on players; duplicate roster emails
  → multi-row links; `handle_new_user` steal (finding 8) is itself a race with
  legitimate linking.
- **accept_invite** double-click: guarded by button state + `ON CONFLICT` upsert +
  row lock on the invite ✓ (this one is fine).
- **Email verification racing AuthGate**: confirmation lands with `?code=` →
  reset form, while `detectSessionInUrl`/auth listener signs in behind it.

## 9. RLS audit verdict

The core is **sound**: `user_team_ids()`-gated tables all require approved
membership; a client cannot self-approve (`profiles` UPDATE is admin-only), cannot
insert/approve its own `team_members` row, cannot self-link a player row, and
`handle_new_user` ignores client `approved` metadata. Pending/rejected/removed
users see no team data on those tables.

The bypasses are all in the **SECURITY DEFINER layer and the leftovers**:
`reject_user` (no authz), `request_cricket_access` (anon), the `access` allowlist
gap (finding 2 — which unlocks EVERYTHING, since `'{admin}'` in `profiles.access`
defeats every policy), Storage buckets, and the two USING-only UPDATE policies.
Fix those and the RLS story is genuinely strong.

## 10. Database changes actually necessary

Must: authz + search_path on `reject_user`; access allowlist in `handle_new_user`
(+ CHECK constraint on `profiles.access`); revoke anon + add authz on
`request_cricket_access`; null-guard `handle_new_user` linking; WITH CHECK on
`team_members`/`cricket_teams` UPDATE; column-restriction trigger on player
self-edit; welcome-post idempotency marker; `status` column on `team_members`
(see §11); partial unique indexes on `cricket_players(team_id, user_id)` and
`(team_id, lower(email))` — after a data dedupe check; team-scoped Storage
policies; `profiles` INSERT scoped to `auth.uid() = id`; `SET search_path` on
`is_admin()`; DELETE policy on `team_invites`.

Not necessary: replacing Supabase Auth, restructuring `cricket_players`,
new invite token table (the existing one gains columns), touching the 69
team-scoped policies (they're correct).

---

## 11. Target architecture (smallest safe)

**Keep**: Supabase Auth, `profiles` as identity, `team_members` as the sole
authorization chokepoint, `cricket_players` as player profile, existing invite
table + `accept_invite` + `approve_team_member`/`reject_team_member` (they are
already the correct, guarded implementations — they just aren't wired in).

**Membership becomes a status machine**: `team_members.status TEXT NOT NULL
DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','removed'))`,
backfilled from `approved`, with `approved` kept as a generated/synced legacy
mirror during transition (helpers `user_team_ids`/`is_team_admin`/`is_team_member`
flip to `status = 'active'`; 69 dependent policies untouched). Rejection =
`status='rejected'` + `rejected_at/rejected_by` — **never deletes auth.users**;
account deletion becomes a separate deliberate admin operation.
`profiles.approved` demoted to a documented UX-only hint (kept in sync for the
pending screen), never authoritative.

**One activation path**: membership activation (by trigger for pre-added, by
`accept_invite` auto-approve, or by `approve_team_member`) is the ONLY place that
links the player row and posts the welcome — enforced idempotent via
`team_members.welcomed_at` set inside `post_welcome_message` in the same
transaction. `create_welcome_post` client RPC is retired (revoked). All client
direct writes to profiles/team_members/cricket_players.user_id are deleted
(they are no-ops or admin-only accidents today).

**Approval UI**: `PendingApprovals` switches to the existing RPCs, plus a small
`pending_members(p_team_id)` SECURITY DEFINER list RPC so TEAM admins (not just
global admins) can see and act on their own team's queue, scoped per team.

**Signup UX** (the original complaint):
- Player Info fields hidden when the typed email matches the roster
  (`check_cricket_player_email` with the invite token as a required argument —
  closes the anon oracle while keeping the UX); required only for unknown signups.
- `signUp` gains `emailRedirectTo` back to the invite URL; `init()` learns to
  distinguish confirmation from recovery (recovery already arrives as
  `token_hash&type=recovery`; a `?code=` with no recovery marker = confirmation →
  session established → straight into the invite acceptance / team). **No second
  login, no password-reset form ambush.** (One Supabase dashboard check: the
  site URL/redirect allowlist must include the app origin; template unchanged.)
- Approval notification: `approve_team_member` already writes an in-app
  'approval' notification; add a Resend email in the same flow (optional phase).

**Invites**: stop the render-side-effect auto-creation; give the Teams tab
explicit "Generate link / Revoke" with a default 30-day expiry (keep the
existing permanent link working until regenerated). Optional later: token
hashing and per-email single-use roster invites (worthwhile, not required for
this team's threat model — documented trade-off).

## 12. Migration plan

- **Phase A — SQL hotfixes** (one migration file, no frontend impact, ship
  immediately): findings 1, 2, 3, 8, 9, 14 + `is_admin` search_path. Pure
  tightening; nothing user-visible changes.
- **Phase B — status model + one activation path** (second migration):
  `status` column + backfill + helper flip + `welcomed_at` idempotency +
  rejection-keeps-account + `pending_members` RPC + notification cleanup by id.
  `approved` stays mirrored (trigger) so any un-migrated frontend keeps working.
- **Phase C — frontend**: PendingApprovals → RPCs; delete dead client writes
  (AuthGate auto-approve/request, login backup-link); signup Player-Info
  hiding; emailRedirectTo + confirmation handling; init() singleton + listener
  cleanup; logout clears pending invite; reset redirect fix; enumeration copy
  softening; TeamManager explicit invite management.
- **Phase D — optional hardening**: Storage team-scoping (biggest remaining
  HIGH), token hashing, personal invites, approval emails.

## 13. Backward compatibility

Existing sessions: untouched (no auth config change besides adding redirect
handling). Existing users/memberships: `status` backfilled from `approved`
(`true→active`, `false→pending`); mirror trigger keeps old readers correct.
Existing invite links: the permanent token keeps validating until the admin
regenerates; `accept_invite` signature unchanged. Old confirmation emails
already in inboxes: land with `?code=`, which the new handler treats as
sign-in — strictly better than today. `docs/SIGNUP_FLOWS.md` rewritten to
match reality at the end of Phase C.

## 14. Test plan (maps to brief items A–S)

Integration (extend `tests/integration/signup-flows.test.ts`) + new SQL
verification script `docs/auth-hardening-verification.sql` (impersonation +
ROLLBACK, same pattern as umpiring-rpc-verification.sql):

- A pre-added player: signup w/ token → membership active, player linked once,
  ONE welcome post, no player-info required. B existing toolkit user: accept
  invite → active, linked. C unknown: pending → team-admin sees queue → approve →
  active + notification + ONE post. D second team: accept → second membership
  only, no new account. E toolkit-only: no cricket rows anywhere.
- F expired / G revoked / H wrong-email (personal invite, if built) / I re-accept
  (already_member) / J double-click accept (single membership) — RPC reason
  results asserted.
- K welcome idempotency: call activation twice → one post (welcomed_at).
- L RLS bypass: pending user selects team tables → zero rows; storage after
  Phase D. M spoof: self `profiles.update({approved:true, access:['admin']})` →
  0 rows; signup with `access:'admin'` metadata → profile gets 'toolkit'.
  reject_user as non-admin → error.
- N linking race: two simultaneous activations → one link (unique index).
- O reset: recovery lands in reset form ONLY for recovery. P confirmation:
  `?code=` signs in, no reset form, invite completes. Q enumeration: probe RPCs
  anon → denied/uniform copy. R multi-team switcher unchanged. S logout clears
  pending invite + state; restore works.

## 15. Files expected to change

SQL (new): `docs/auth-hardening-migration.sql` (Phase A),
`docs/membership-status-migration.sql` (Phase B),
`docs/auth-hardening-verification.sql` (tests). Updated in place:
`docs/cricket-schema.sql`, `docs/DATABASE_SCHEMA.sql` (policy records),
`docs/SIGNUP_FLOWS.md`, `CLAUDE.md`.

Frontend: `components/AuthGate.tsx`, `components/Shell.tsx` (PendingApprovals),
`components/InviteHandler.tsx`, `components/TeamManager.tsx`,
`stores/auth-store.ts`, `stores/cricket-store.ts` (wire approveMember/rejectMember,
fix addPlayer membership insert), `lib/auth.ts` (copy), `lib/use-team-context.ts`.
Tests: `tests/integration/signup-flows.test.ts` + new unit tests for auth-store
handlers.
