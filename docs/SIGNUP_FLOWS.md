# Signup & Access Flows

Rewritten 2026-09-01 after the auth hardening (docs/AUTH_ACCESS_AUDIT.md; SQL in
`docs/auth-hardening-migration.sql` + `docs/membership-status-migration.sql`).
The earlier version of this document described several flows that never worked
as written — treat this file as accurate only as long as those migrations and
the same-release frontend are deployed together.

## The model

- **Authentication** (who are you): Supabase Auth + `profiles`. `profiles.approved`
  is a **UX hint only** (drives the "Pending Approval" sign-out screen) — it is
  never an authorization input.
- **Team authorization** (can you access this team): `team_members.status` —
  `pending | active | rejected | removed`. `user_team_ids()` / `is_team_admin()` /
  `is_team_member()` require `status = 'active'` and gate every team-scoped RLS
  policy. The legacy `approved` boolean is a trigger-maintained mirror
  (`approved = (status = 'active')`) kept for un-migrated readers.
- **Player profile** (which player are you here): `cricket_players`, linked by
  `lower(email)` match, **server-side only** — `handle_new_user`, `accept_invite`,
  `approve_team_member` (all via the internal `activate_team_membership`), plus
  `claim_umpiring_duty`'s null-guarded backfill. There is no client-side linking;
  every link requires `user_id IS NULL` (a link is never stolen) and one linked
  account per team is enforced by a partial unique index.
- **One activation path**: whatever turns a membership ACTIVE calls
  `activate_team_membership(team, user)` — membership upsert + single roster
  link + ONE welcome post (idempotent via `team_members.welcomed_at`, claimed
  atomically just before the post). `create_welcome_post` no longer exists.

## Invite-gated signup

Direct `/cricket` signup is disabled — AuthGate shows "Invite Link Required"
without `?join=<token>`. Login always works. Invite links are created and
revoked EXPLICITLY in the Teams admin tab (30-day expiry on new links; the
old permanent link keeps validating until regenerated). `team_slug` passes
through signup metadata; `handle_new_user` resolves the team from it —
**cricket signups only**; a forged `team_slug` on a toolkit signup creates no
membership, and metadata `access` is allowlisted to `toolkit|cricket` (an
`access: 'admin'` signup degrades to toolkit).

## Pre-added player → signs up via invite link

Admin adds the player (with email) to the roster → player opens
`/cricket?join=<token>` → the signup form probes `check_cricket_player_email`
(now requires the invite token — only invite holders can ask) and, on a match,
**hides the whole Player Info block** ("You're on the roster — your details are
already set"); they enter name + email + password only → `handle_new_user`
activates the membership, links the ONE unlinked matching roster row (roster
data wins; signup metadata only fills gaps), posts the single welcome →
confirmation email carries `emailRedirectTo` back to
`/cricket/?flow=confirm&join=<token>` → clicking it **signs them in** (init()
exchanges the code; `flow=confirm` never routes to the password-reset form) →
they land in the team. **No second login, no re-entered player info.**

## Pre-added player → already has an account

Logs in on `/cricket` (or follows the invite link, which is saved in
sessionStorage across the login and cleared on logout) → InviteHandler shows
"Join {team}?" → Accept → `accept_invite`: valid token + roster email match
(`user_id IS NULL` — a linked row never auto-approves someone else) →
`activate_team_membership` → active, linked, welcomed. An active member of any
other team is likewise auto-approved. A **rejected/removed** membership never
auto-reactivates — the replayed invite goes back to `pending` for the admin.

## Unknown person via invite link

Signs up → `handle_new_user`: no roster match → `status = 'pending'` +
join-request notifications to the team's active admins → confirms email (lands
signed in) → sees the pending state. Admin approval surface is the header
queue, fed by `pending_members(team)` (SECURITY DEFINER — TEAM admins see
their own queue, not just global admins):
- **Approve** → `approve_team_member` RPC: THIS team only, idempotent
  (double-click safe), activates + links or creates the roster record from
  signup metadata + one welcome + an 'approval' notification.
- **Reject** → `reject_team_member` RPC: `status = 'rejected'` (+
  `rejected_at/rejected_by`). **The account is never deleted**; a toolkit user
  keeps the toolkit, and a cricket-only signup keeps a working login.
  Account deletion is a separate deliberate operation (`reject_user`,
  global-admin-only).

## Existing toolkit user wants cricket (no invite)

Opens `/cricket` while logged in → RequestAccess screen → the button calls
`request_cricket_access()` (authenticated, **self only** — the old anon
version that accepted arbitrary emails is gone): creates a pending membership
on the team (explicit `p_team_id`, or the single team when only one exists)
and notifies admins once. Reason codes: `ok`, `already_member`,
`already_requested`, `rejected`, `team_required`, `no_team`. It never touches
`profiles.approved`, so their toolkit keeps working while they wait.

## Existing player joins another team

Same account accepts Team B's invite → `accept_invite` creates/updates
membership on Team B only. One auth account, N memberships.

## Password reset vs email confirmation

Two `?code=` arrivals, disambiguated by our own `flow` param on the redirect
URL (never a caller-supplied redirect):
- `flow=recovery` (and any legacy bare `?code=`) → password-reset form.
  Reset emails return to the page the user reset from, not `/vibe-planner/`.
- `flow=confirm` → session established, params stripped (keeping `join=`),
  normal signed-in flow continues.
`token_hash&type=recovery` links behave as before. `init()` runs exactly once
per page load (module-level guard) and registers a single auth listener.

## Security invariants (verified by docs/auth-hardening-verification.sql)

- Client metadata cannot mint admin (`access` allowlist) — profiles have NO
  self-UPDATE policy, so `approved`/`access` are unreachable from the client.
- `reject_user` (account deletion) is global-admin-only, never self.
- Approval/rejection are team-scoped RPCs; approving on Team A cannot touch
  Team B; both are idempotent.
- Welcome posts: at most one per membership (`welcomed_at`), server-derived
  name, not client-callable (`post_welcome_message` is revoked from all
  client roles).
- Player linking: null-guarded, team-scoped, one link per user per team
  (unique index); a player's self-edit cannot change `team_id`, `user_id`,
  `is_active`, `is_guest`, `designation`, or `jersey_number` (trigger), while
  the system self-claim (`user_id NULL → auth.uid()`) stays permitted.
- Storage buckets require an ACTIVE membership (`has_cricket_access()`
  redefined); cross-team file scoping remains Phase D.

## IMPORTANT — AuthGate race condition guard (unchanged)

`AuthGate` only renders `RequestAccess` after `userAccess` has loaded from the
profile (`userAccess.length > 0`). "Not loaded" must never be read as "no
access". RequestAccess itself no longer performs any write except the
`request_cricket_access` RPC, so a stray render can no longer create side
effects.
