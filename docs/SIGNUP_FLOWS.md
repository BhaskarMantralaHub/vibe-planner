# Signup & Access Flows

## Invite-gated signup (multi-team)
Direct `/cricket` signup is disabled — the AuthGate shows "Invite Link Required" if no `?join=` token is present. Login still works without a token. Each team has one permanent invite link (no expiry). The `team_slug` is passed through signup metadata so `handle_new_user` knows which team to assign.

## Player pre-added by admin → signs up via invite link
Admin adds player email to roster → player signs up via `/cricket?join=<token>` → `handle_new_user` trigger checks `cricket_players` for email match on the target team → found → sets `profiles.approved: true`, `team_members.approved: true`, links `cricket_players.user_id` → welcome post created → player confirms email → signs in.

## Player pre-added by admin → already has toolkit account
Player logs in on `/cricket` → `AuthGate` auto-approves, adds cricket access, links player record, creates welcome post → page reloads into cricket dashboard. If via invite link, `InviteHandler` calls `accept_invite` RPC which also auto-approves.

## Player linking on login (backup)
On every login for cricket users, `auth-store.ts` runs: `UPDATE cricket_players SET user_id = auth_user_id WHERE email ILIKE auth_email AND user_id IS NULL AND is_active = true`. Backup linking in case trigger or AuthGate missed it.

## Unknown player signs up via invite link
Signs up via `/cricket?join=<token>` → `handle_new_user`: no email match → `profiles.approved: false`, `team_members.approved: false` → admin notification created ("X wants to join the team") → player confirms email → tries to log in → auth-store detects `profiles.approved = false` → signs out, shows "Pending Approval" screen → admin sees "New Signups" popup in Shell header (scoped to current team):
- **Approve**: sets `profiles.approved: true` + `team_members.approved: true`, creates player record from signup metadata, fires `create_welcome_post` → player can sign in.
- **Reject (pure cricket signup)**: deletes `team_members` row + fully deletes from `auth.users` via `reject_user` RPC.
- **Reject (existing toolkit user)**: deletes `team_members` row, removes cricket from access, restores `approved: true`.

## Existing player joins another team via invite
Already approved on Team A → accepts invite for Team B via `accept_invite` RPC → auto-approved (existing multi-team player) → `team_members.approved: true` on Team B.

## Toolkit user tries cricket signup (not a player)
Player tries signup on `/cricket` → email already registered → code checks `cricket_players` → no match → auto-calls `request_cricket_access` RPC (adds cricket access, sets `approved: false`, creates pending `team_members` row) → shows "Pending Approval" screen.

## IMPORTANT — AuthGate race condition guard
`AuthGate` only renders `RequestAccess` after `userAccess` has loaded from the profile (i.e., `userAccess.length > 0`). Without this, a brief window where `user` exists but `userAccess` is still `[]` would cause `RequestAccess` to render for existing users, re-triggering auto-approve + duplicate welcome posts.

## Per-team approval security model
- `profiles.approved` = UX gate (signs user out, shows "Pending" screen)
- `team_members.approved` = security gate (RLS via `user_team_ids()` blocks all data)
- Both kept in sync: approve sets both true, pending sets both false
- Even if client spoofs `profiles.approved`, RLS prevents data access (empty dashboard)
