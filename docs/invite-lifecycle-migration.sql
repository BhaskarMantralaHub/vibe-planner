-- ============================================================================
-- PHASE 4 — ROTATABLE, EXPIRING TEAM INVITE
-- ============================================================================
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
-- Depends on: auth-hardening-migration.sql + membership-status-migration.sql.
--
-- WHAT CHANGES
-- ------------
-- The team invite stops being a permanent bearer link and becomes a rotatable
-- credential with a real lifecycle: ACTIVE (is_active AND expires_at > now())
-- → EXPIRED (time) or REVOKED (admin). Exactly ONE invite is active per team.
--
--   generate_team_invite(team)  → revokes the current invite, mints a new one
--                                 with a 30-day expiry, returns the token
--   revoke_team_invite(team)    → kills the current invite, no replacement
--
-- Both are SECURITY DEFINER and gated on is_team_admin(p_team_id), so a team
-- admin can only ever touch THEIR OWN team's invite, and a plain member can
-- touch none. The client can no longer write team_invites at all (its INSERT
-- and UPDATE policies are removed below) — otherwise the 30-day server
-- default would be advisory, since a client could POST any expires_at it
-- liked, which is exactly how the current 2099-12-31 token came to exist.
-- Admin SELECT is KEPT so "Copy link" still works after a page reload.
--
-- TOKEN DESIGN (deliberate, see docs/AUTH_ACCESS_AUDIT.md §11 Phase D)
-- --------------------------------------------------------------------
-- Still `gen_random_uuid()`, still stored in plaintext:
--   * Randomness is not the weak point — pgcrypto's gen_random_uuid() is a
--     CSPRNG draw, 122 unpredictable bits, non-sequential, and derived from
--     neither team_id nor slug. Guessing is not a realistic attack.
--   * Hashing (token_hash + show-once) is the textbook answer, but it makes
--     the token unreadable after creation — and this admin re-copies the same
--     link into WhatsApp for weeks. Show-once would force a rotation every
--     time the link is needed, and rotation invalidates everyone mid-signup.
--     The rotation + expiry added here removes most of what hashing would buy
--     (a leaked link now dies in 30 days, or instantly on Refresh).
--   * Exposure is already narrow: only team admins can SELECT the row, no RPC
--     echoes the token back, and validate_invite_token returns team info only.
-- Revisit if invites ever become per-player/email-bound.
--
-- BACKWARD COMPATIBILITY — the legacy link is REVOKED by this migration
-- ---------------------------------------------------------------------
-- The default plan was to leave today's 2099-12-31 token working until an
-- admin refreshed it. The admin chose to retire it immediately instead, so
-- §5 revokes it as part of this migration. Consequences, stated plainly:
--   * every previously shared link (WhatsApp, etc.) stops working at once;
--   * the team has NO active invite until an admin taps "Generate invite";
--   * nobody is mid-signup on it today (use_count was 0), so nothing breaks.
-- To keep the old link alive instead, delete §5 before running this file.
-- ============================================================================


-- ============================================================
-- 1. Expiry constant — ONE place
-- ============================================================
-- Both RPCs read this. Clients cannot pass an expiry, so the server value is
-- authoritative by construction (no max-clamp needed — there is no input).

CREATE OR REPLACE FUNCTION public.team_invite_ttl()
RETURNS INTERVAL
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$ SELECT INTERVAL '30 days'; $$;


-- ============================================================
-- 2. generate_team_invite — rotate: revoke the old, mint the new
-- ============================================================
-- Returns { token, expires_at, team_id }. One statement pair inside one
-- function call, so a team can never end up with two active invites even if
-- an admin double-taps.

CREATE OR REPLACE FUNCTION public.generate_team_invite(p_team_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token UUID;
  v_expires TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT is_team_admin(p_team_id) AND NOT is_global_admin() THEN
    RAISE EXCEPTION 'Only a team admin can create an invite for this team';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cricket_teams WHERE id = p_team_id AND deleted_at IS NULL) THEN
    RETURN json_build_object('error', 'Team not found');
  END IF;

  -- Rotate: whatever was live for this team stops working now.
  UPDATE team_invites
  SET is_active = false
  WHERE team_id = p_team_id AND is_active = true;

  v_expires := now() + team_invite_ttl();

  INSERT INTO team_invites (team_id, created_by, expires_at, max_uses, is_active)
  VALUES (p_team_id, auth.uid(), v_expires, NULL, true)
  RETURNING token INTO v_token;

  RETURN json_build_object(
    'token', v_token,
    'expires_at', v_expires,
    'team_id', p_team_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_team_invite(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_team_invite(UUID) TO authenticated;


-- ============================================================
-- 3. revoke_team_invite — kill the link, no replacement
-- ============================================================

CREATE OR REPLACE FUNCTION public.revoke_team_invite(p_team_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT is_team_admin(p_team_id) AND NOT is_global_admin() THEN
    RAISE EXCEPTION 'Only a team admin can revoke this team''s invite';
  END IF;

  UPDATE team_invites
  SET is_active = false
  WHERE team_id = p_team_id AND is_active = true;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN json_build_object('success', true, 'revoked', v_n);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_team_invite(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.revoke_team_invite(UUID) TO authenticated;


-- ============================================================
-- 4. RLS: the client may READ its team's invite, never write one
-- ============================================================
-- Removing INSERT/UPDATE is what makes the 30-day expiry authoritative: with
-- them in place a client could still POST expires_at = '2099-12-31'. All
-- writes now go through the two SECURITY DEFINER RPCs above.
-- SELECT stays (team admins only) so the admin UI can display and re-copy the
-- live link without minting a new one.

DROP POLICY IF EXISTS "Team admin can create invites" ON team_invites;
DROP POLICY IF EXISTS "Team admin can update invites" ON team_invites;

DROP POLICY IF EXISTS "Team admin can read invites" ON team_invites;
CREATE POLICY "Team admin can read invites"
  ON team_invites FOR SELECT
  USING (is_team_admin(team_id) OR is_global_admin());


-- ============================================================
-- 5. Retire the legacy permanent invite
-- ============================================================
-- The link in circulation today was created with expires_at = 2099-12-31 and
-- unlimited uses, before invites had a lifecycle. Revoking it here (per the
-- admin's explicit decision) means every link that has ever been pasted into
-- WhatsApp stops working now, and the team starts clean on the 30-day model.
-- The team is left with NO active invite on purpose — the admin taps
-- "Generate invite" to mint the first rotating one.
--
-- Scope: only invites whose expiry is beyond any horizon this system would
-- ever issue (30 days), i.e. unambiguously legacy rows.

UPDATE team_invites
SET is_active = false
WHERE is_active = true
  AND expires_at > now() + INTERVAL '90 days';


-- ============================================================
-- 6. Housekeeping index
-- ============================================================
-- "the live invite for this team" is the hot lookup for the admin UI.

CREATE INDEX IF NOT EXISTS idx_team_invites_active
  ON team_invites (team_id) WHERE is_active = true;


-- ============================================================
-- Verify (read-only)
-- ============================================================
--   SELECT t.name, ti.is_active, ti.expires_at, ti.use_count,
--          (ti.is_active AND ti.expires_at > now()) AS usable
--   FROM team_invites ti JOIN cricket_teams t ON t.id = ti.team_id
--   ORDER BY ti.created_at DESC;
--
-- Exactly one active invite per team (expect zero rows):
--   SELECT team_id, count(*) FROM team_invites WHERE is_active
--   GROUP BY team_id HAVING count(*) > 1;
