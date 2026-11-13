-- ============================================================================
-- SECURITY AUDIT FIXES
-- ============================================================================
-- Run in the Supabase SQL editor AFTER docs/membership-status-migration.sql
-- and docs/captain-team-admin-migration.sql. Idempotent — safe to re-run.
-- Verify with docs/security-audit-fixes-verification.sql (ends in ROLLBACK).
--
-- Sections are independent; each ships with the commit that needs it:
--   S1  profiles INSERT lockdown (was: a profile-less user could insert
--       is_admin=true / access={admin} for themselves)
-- ============================================================================


-- ============================================================
-- S1. profiles — no client INSERT at all
-- ============================================================
-- "Users can insert own profile" (auth-hardening A7) only bound id, so a user
-- whose profiles row was deleted (admin Reject used to delete ONLY the profile,
-- leaving auth.users alive) could re-insert it with is_admin=true and
-- access={admin}. Nothing in the app inserts profiles from the browser:
-- handle_new_user is SECURITY DEFINER and writes the row as the table owner,
-- which bypasses RLS. So the safest policy is none.

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Allow insert via trigger" ON profiles;
REVOKE INSERT ON public.profiles FROM anon, authenticated;
