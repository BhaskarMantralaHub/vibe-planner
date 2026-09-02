-- ============================================================================
-- ADMIN ROLES — ONE GLOBAL ADMIN, THE REST ARE TEAM ADMINS
-- ============================================================================
-- Run in the Supabase SQL editor AFTER the matching frontend deploy (the one
-- that adds isTeamAdmin() to the cricket UI). Order matters: before that ships,
-- the app keys its admin controls on GLOBAL admin, so trimming first would
-- leave the team's captains unable to manage players, fees or matches.
--
-- WHY
-- ---
-- Three different things were being called "admin":
--   profiles.is_admin        — the platform console gate (/admin users, analytics)
--   profiles.access @> admin — is_global_admin(): bypasses team scoping in RLS
--                              across EVERY team and can write any profile
--   team_members.role        — is_team_admin(): the real, team-scoped authority
--
-- Captains had been given `access = admin` because that was the only way to
-- make the cricket UI show them management controls. That handed them
-- cross-team, cross-profile power to do a team-scoped job. With the UI now
-- keyed on is_team_admin(), the global grant is unnecessary.
--
-- RESULT
-- ------
--   * Global admin (access @> '{admin}') = the platform owner alone.
--   * Everyone who was managing the team keeps doing so, via team_members.role.
--   * No one loses a capability they legitimately used.
--
-- Deliberately keyed on ROLES, never on email addresses: the one account that
-- keeps global admin is identified by profiles.is_admin, which today is set on
-- exactly one row.
-- ============================================================================


-- ============================================================
-- 0. Before (read-only — run this first and keep the output)
-- ============================================================
--   SELECT p.email, p.access, p.is_admin, tm.role, tm.status
--   FROM profiles p LEFT JOIN team_members tm ON tm.user_id = p.id
--   WHERE p.access @> '{admin}' ORDER BY p.is_admin DESC NULLS LAST, p.email;


-- ============================================================
-- 1. Promote first: nobody loses their ability mid-migration
-- ============================================================
-- A global admin who is only a team PLAYER is administering the team through
-- the global grant. Removing it would silently demote them, so give them the
-- team-level authority they were actually exercising BEFORE the trim.
-- (Owners are left alone — 'owner' already outranks 'admin'.)

UPDATE team_members tm
SET role = 'admin'
FROM profiles p
WHERE p.id = tm.user_id
  AND p.access @> '{admin}'
  AND p.is_admin IS NOT TRUE     -- the platform owner is handled separately
  AND tm.role = 'player'
  AND tm.status = 'active';


-- ============================================================
-- 2. Trim global admin to the platform owner alone
-- ============================================================
-- is_admin = true marks the single platform owner. Everyone else drops the
-- 'admin' entry from access, which removes is_global_admin() — cross-team
-- reads, profile writes, the platform console — while leaving 'cricket'
-- (and 'toolkit', where present) untouched.

UPDATE profiles
SET access = array_remove(access, 'admin'),
    features = features  -- unchanged; features are separate from authority
WHERE access @> '{admin}'
  AND is_admin IS NOT TRUE;


-- ============================================================
-- 3. Safety net — never end up with zero global admins
-- ============================================================

DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM profiles WHERE access @> '{admin}';
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Refusing to finish: no global admin would remain. Set profiles.is_admin = true on the owner account first, then re-run.';
  END IF;
  RAISE NOTICE 'Global admins remaining: %', v_n;
END $$;


-- ============================================================
-- 4. After (read-only verification)
-- ============================================================
-- Exactly one global admin:
--   SELECT email, access, is_admin FROM profiles WHERE access @> '{admin}';
--
-- Everyone who manages the team, and how:
--   SELECT p.email, tm.role, tm.status, p.access
--   FROM team_members tm JOIN profiles p ON p.id = tm.user_id
--   WHERE tm.role IN ('owner','admin') ORDER BY tm.role, p.email;
--
-- Nobody left stranded (had global admin, now has neither):
--   SELECT p.email FROM profiles p
--   LEFT JOIN team_members tm ON tm.user_id = p.id AND tm.status = 'active'
--   WHERE NOT (p.access @> '{admin}')
--     AND COALESCE(tm.role, 'player') = 'player'
--     AND p.access @> '{cricket}';
--   -- expected: ordinary players only
