# Signup & Access Flows

## Player pre-added by admin → signs up on cricket
Admin adds player with email in `cricket_players` (`user_id: NULL`) → player signs up on `/cricket` with same email → `auth.users` record created → `profiles` record created with `access: {cricket}` → DB trigger `handle_new_user` checks `cricket_players` for email match → found → sets `profiles.approved: true`, links `cricket_players.user_id` → `create_welcome_post` RPC fires → welcome post + notifications created → player confirms email → signs in.

## Player pre-added by admin → already has toolkit account
Player tries signup on `/cricket` → email already registered → code checks `cricket_players` by email → match found → shows "You're on the team. Please sign in instead." → player signs in → `AuthGate` auto-approves, adds `cricket` to `profiles.access`, links `cricket_players.user_id` (via `ilike` email match where `user_id IS NULL`), creates welcome post → page reloads into cricket dashboard.

## Player linking on login (backup)
On every login for cricket users, `auth-store.ts` runs: `UPDATE cricket_players SET user_id = auth_user_id WHERE email ILIKE auth_email AND user_id IS NULL AND is_active = true`. This is a backup linking mechanism in case the DB trigger or AuthGate flow missed it.

## Toolkit user tries cricket signup (not a player)
Player tries signup on `/cricket` → email already registered → code checks `cricket_players` → no match → auto-calls `request_cricket_access` RPC (adds `cricket` to access, sets `approved: false`) → shows "Pending Approval" screen → admin approves or rejects.

## Random person signs up on cricket (no player record)
Signs up on `/cricket` → no email match → `approved: false` → sees "Pending Approval" screen → admin sees in pending approvals bell:
- **Approve**: sets `profiles.approved: true`, creates `cricket_players` record from signup metadata, fires `create_welcome_post` RPC → welcome post + notifications → player can sign in.
- **Reject (pure cricket signup)**: fully deletes from `auth.users` + `profiles` via `reject_user` RPC → can sign up again fresh.
- **Reject (existing toolkit user)**: removes `cricket` from access array, restores `approved: true` → toolkit access preserved, cricket denied.

## Toolkit user signs in on cricket (not a player, didn't try signup first)
Signs in on `/cricket` → `AuthGate` detects no cricket access → checks `cricket_players` → no match → shows "Request Cricket Access" screen → clicks request → `approved: false`, `cricket` added to access → admin approves or rejects from bell icon.

## IMPORTANT — AuthGate race condition guard
`AuthGate` only renders `RequestAccess` after `userAccess` has loaded from the profile (i.e., `userAccess.length > 0`). Without this, a brief window where `user` exists but `userAccess` is still `[]` would cause `RequestAccess` to render for existing users, re-triggering auto-approve + duplicate welcome posts.
