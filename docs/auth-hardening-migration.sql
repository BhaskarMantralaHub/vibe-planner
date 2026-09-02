-- ============================================================================
-- AUTH HARDENING — PHASE A: CRITICAL SECURITY HOTFIXES
-- ============================================================================
-- Run in the Supabase SQL editor BEFORE docs/membership-status-migration.sql.
-- Idempotent — safe to re-run. No frontend changes required for this file;
-- it only tightens what should never have been open.
--
-- Fixes (see docs/AUTH_ACCESS_AUDIT.md §7 for the findings):
--   A1  reject_user: was callable by ANY authenticated user with zero checks,
--       deleting arbitrary auth.users accounts. Now global-admin-only, never
--       self, search_path pinned. Team rejection no longer deletes accounts
--       at all (Phase B makes reject_team_member the rejection path).
--   A2  handle_new_user: trusted raw_user_meta_data->>'access' — signing up
--       with access='admin' granted global admin. Now allowlisted.
--   A3  request_cricket_access: was anon-callable with an arbitrary email —
--       anonymous account lockout + oldest-team assignment + email oracle.
--       Replaced with an authenticated, self-identity, explicit-team version.
--   A4  handle_new_user player linking: not null-guarded (stole existing
--       links), linked every matching row, and let signup metadata overwrite
--       admin-entered roster data. Now links ONE unlinked row and only fills
--       fields the roster does not already have.
--   A5  team_members UPDATE policy: USING-only — an admin could rewrite
--       team_id into a foreign team. WITH CHECK added.
--   A6  cricket_teams: UPDATE had no WITH CHECK (owner reassignment);
--       INSERT allowed any authenticated user to create teams with arbitrary
--       owner_id. Tightened; create_team() RPC remains the gated path.
--   A7  profiles INSERT policy was WITH CHECK (true). Self-scoped now.
--   A8  is_admin(): SECURITY DEFINER without SET search_path. Pinned.
--   A9  Player self-edit policy constrained only user_id — a linked player
--       could change their own team_id / is_active / is_guest / designation /
--       jersey_number. Column-restriction trigger added (email deliberately
--       stays self-editable — it is the player's own contact field and the
--       profile edit form exposes it; accepted trade-off, documented).
-- ============================================================================


-- ============================================================
-- A1. reject_user — deliberate account deletion, global admin only
-- ============================================================
-- This is no longer part of ordinary team rejection (Phase B uses
-- reject_team_member → status='rejected'). It remains as the separate,
-- deliberate "delete this account entirely" operation.

CREATE OR REPLACE FUNCTION public.reject_user(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_global_admin() THEN
    RAISE EXCEPTION 'Only a global admin can delete an account';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account from here';
  END IF;

  DELETE FROM public.profiles WHERE id = target_user_id;
  -- Team owners are protected by cricket_teams.owner_id ON DELETE RESTRICT:
  -- this raises rather than orphaning a team.
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- Grant stays on authenticated; the function now guards itself.
REVOKE ALL ON FUNCTION public.reject_user(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.reject_user(UUID) TO authenticated;


-- ============================================================
-- A2 + A4. handle_new_user — access allowlist + safe player linking
-- ============================================================
-- Same structure as the deployed version (docs/cricket-schema.sql:996), with
-- exactly three behavioral changes, each marked -- [A2] / [A4] below.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_access TEXT;
  user_access TEXT[];
  user_features TEXT[];
  user_approved BOOLEAN;
  meta JSONB;
  v_team_id UUID;
  v_team_slug TEXT;
  v_is_pre_added BOOLEAN := false;
  v_link_id UUID;
BEGIN
  raw_access := NEW.raw_user_meta_data->>'access';

  -- [A2] ALLOWLIST. Client metadata may only ever request 'toolkit' or
  -- 'cricket'. Anything else (notably 'admin', which is_global_admin() and
  -- is_admin() both test for) silently degrades to 'toolkit'. Admin access is
  -- granted only by an existing admin through the admin console.
  IF raw_access IS NOT NULL AND raw_access NOT IN ('toolkit', 'cricket') THEN
    raw_access := 'toolkit';
  END IF;

  IF raw_access IS NOT NULL THEN
    user_access := ARRAY[raw_access];
  ELSE
    user_access := '{toolkit}';
  END IF;

  -- Set default features based on signup role
  IF raw_access = 'cricket' THEN
    user_features := '{cricket}';
  ELSE
    user_features := '{vibe-planner,id-tracker}';
  END IF;

  -- Per-team approval: never trust client-supplied 'approved' metadata.
  -- Non-cricket users are always approved. Cricket users are approved only
  -- if pre-added (v_is_pre_added, checked below) — not from client metadata.
  user_approved := (raw_access IS NULL OR raw_access != 'cricket');

  IF raw_access = 'cricket' THEN
    meta := jsonb_build_object(
      'jersey_number', NEW.raw_user_meta_data->>'jersey_number',
      'player_role', NEW.raw_user_meta_data->>'player_role',
      'batting_style', NEW.raw_user_meta_data->>'batting_style',
      'bowling_style', NEW.raw_user_meta_data->>'bowling_style',
      'shirt_size', NEW.raw_user_meta_data->>'shirt_size'
    );
  ELSE
    meta := NULL;
  END IF;

  -- profiles.approved synced with team approval (backward compat with existing Shell.tsx PendingApprovals)
  INSERT INTO public.profiles (id, email, full_name, access, approved, player_meta, features)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    user_access,
    user_approved,
    meta,
    user_features
  )
  ON CONFLICT (id) DO NOTHING;

  -- Team membership: resolve from signup metadata team_slug
  v_team_slug := NEW.raw_user_meta_data->>'team_slug';
  IF v_team_slug IS NOT NULL THEN
    SELECT id INTO v_team_id FROM cricket_teams WHERE slug = v_team_slug AND deleted_at IS NULL;
  END IF;

  -- No fallback: signup without invite link → no team assigned.

  -- Check if player was pre-added (email match on target team). user_id IS
  -- NULL is load-bearing: a roster row already linked to a DIFFERENT account
  -- must not auto-approve a new signup that merely shares its email (a linked
  -- player can edit their own row's email — that must never mint approvals).
  IF v_team_id IS NOT NULL AND raw_access = 'cricket' THEN
    v_is_pre_added := EXISTS (
      SELECT 1 FROM cricket_players
      WHERE team_id = v_team_id AND lower(email) = lower(NEW.email)
        AND is_active = true AND user_id IS NULL
    );
  END IF;

  -- Create team membership with per-team approval. Cricket signups only —
  -- a toolkit signup carrying a team_slug in its (client-controlled) metadata
  -- must NOT be granted a membership (council HIGH: user_approved is true for
  -- every non-cricket signup, which made a forged team_slug an instant
  -- active membership).
  IF v_team_id IS NOT NULL AND raw_access = 'cricket' THEN
    INSERT INTO team_members (team_id, user_id, role, approved)
    VALUES (v_team_id, NEW.id, 'player', user_approved OR v_is_pre_added)
    ON CONFLICT (team_id, user_id) DO NOTHING;

    -- Notify team admins if pending approval
    IF NOT user_approved AND NOT v_is_pre_added THEN
      INSERT INTO cricket_notifications (user_id, post_id, team_id, type, message)
      SELECT
        tm.user_id,
        NULL,
        v_team_id,
        'join_request',
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
          || ' wants to join the team'
      FROM team_members tm
      WHERE tm.team_id = v_team_id
        AND tm.role IN ('owner', 'admin')
        AND tm.approved = true;
    END IF;
  END IF;

  -- Auto-approved cricket player: claim pre-added player record (team-scoped)
  IF raw_access = 'cricket' AND (user_approved OR v_is_pre_added) AND v_team_id IS NOT NULL THEN
    BEGIN
      -- [A4] Link exactly ONE row, only if it is UNLINKED (a new signup must
      -- never steal a row already linked to another account), and never let
      -- signup metadata overwrite roster data the admin already entered:
      -- COALESCE(existing, metadata) fills gaps only. The old version
      -- preferred metadata and updated every matching row.
      SELECT id INTO v_link_id
      FROM cricket_players
      WHERE lower(email) = lower(NEW.email)
        AND is_active = true
        AND team_id = v_team_id
        AND user_id IS NULL
      ORDER BY created_at ASC
      LIMIT 1;

      IF v_link_id IS NOT NULL THEN
        -- user_id IS NULL re-asserted in the UPDATE itself: two concurrent
        -- activations sharing a roster email must not overwrite each other's
        -- fresh link (TOCTOU between the SELECT above and this UPDATE).
        UPDATE cricket_players
        SET user_id = NEW.id,
            jersey_number = COALESCE(jersey_number, (NEW.raw_user_meta_data->>'jersey_number')::integer),
            player_role   = COALESCE(player_role,   NEW.raw_user_meta_data->>'player_role'),
            batting_style = COALESCE(batting_style, NEW.raw_user_meta_data->>'batting_style'),
            bowling_style = COALESCE(bowling_style, NEW.raw_user_meta_data->>'bowling_style'),
            shirt_size    = COALESCE(shirt_size,    NEW.raw_user_meta_data->>'shirt_size'),
            updated_at = now()
        WHERE id = v_link_id AND user_id IS NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: player link failed for %: %', NEW.email, SQLERRM;
    END;

    -- Auto-post welcome message in Moments (wrapped so signup never fails)
    BEGIN
      PERFORM post_welcome_message(
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        v_team_id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: welcome post failed for %: %', NEW.email, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================
-- A3. request_cricket_access — authenticated, self-identity, explicit team
-- ============================================================
-- The old TEXT-argument version accepted ANY email from ANYONE (anon grant):
-- it set that user's profiles.approved = false (instant lockout — the client
-- signs a not-approved user out) and enrolled them into the oldest team in
-- the database. Dropped outright; the replacement:
--   * requires an authenticated caller and acts only on the caller,
--   * takes an explicit team id; when omitted it resolves ONLY when exactly
--     one team exists (today's single-team reality) — never "the oldest",
--   * never touches profiles.approved of an already-approved account
--     (the pending state lives per-team in team_members).

DROP FUNCTION IF EXISTS public.request_cricket_access(TEXT);

CREATE OR REPLACE FUNCTION public.request_cricket_access(p_team_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_name TEXT;
  v_team_id UUID := p_team_id;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'auth_required';
  END IF;

  SELECT email, raw_user_meta_data->>'full_name'
  INTO v_email, v_name
  FROM auth.users WHERE id = v_uid;

  -- Resolve the team: explicit id wins; otherwise only an unambiguous
  -- single-team install may default.
  IF v_team_id IS NULL THEN
    SELECT id INTO v_team_id
    FROM cricket_teams WHERE deleted_at IS NULL;
    IF NOT FOUND THEN RETURN 'no_team'; END IF;
    -- More than one team → the single-row SELECT above raised no error but
    -- picked arbitrarily; guard explicitly instead.
    IF (SELECT count(*) FROM cricket_teams WHERE deleted_at IS NULL) > 1 THEN
      RETURN 'team_required';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM cricket_teams WHERE id = v_team_id AND deleted_at IS NULL) THEN
      RETURN 'no_team';
    END IF;
  END IF;

  -- Existing membership row? Never write, never re-notify — a caller in a
  -- loop must not be able to spam every admin with join_request rows, and a
  -- decided (rejected) request stays decided until an admin revisits it.
  -- (Phase B re-issues this function status-aware; pre-status, any existing
  -- unapproved row reads as "already requested".)
  IF EXISTS (SELECT 1 FROM team_members WHERE team_id = v_team_id AND user_id = v_uid) THEN
    IF EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = v_team_id AND user_id = v_uid AND approved = true
    ) THEN
      RETURN 'already_member';
    END IF;
    RETURN 'already_requested';
  END IF;

  -- Add cricket access + features to the CALLER's own profile only.
  -- profiles.approved is deliberately NOT touched: an existing toolkit user
  -- must keep working in the toolkit while their cricket request is pending.
  UPDATE profiles
  SET access = CASE WHEN NOT (access @> '{cricket}') THEN array_append(access, 'cricket') ELSE access END,
      features = CASE WHEN NOT (features @> '{cricket}') THEN array_append(features, 'cricket') ELSE features END
  WHERE id = v_uid;

  INSERT INTO team_members (team_id, user_id, role, approved)
  VALUES (v_team_id, v_uid, 'player', false)
  ON CONFLICT (team_id, user_id) DO NOTHING;

  -- Notify admins exactly once — only when the pending row was truly new
  -- (the EXISTS guard above means it always is here, but keep the invariant
  -- local so a future edit cannot reintroduce the spam).
  INSERT INTO cricket_notifications (user_id, post_id, team_id, type, message)
  SELECT
    tm.user_id, NULL, v_team_id, 'join_request',
    COALESCE(v_name, split_part(v_email, '@', 1)) || ' wants to join the team'
  FROM team_members tm
  WHERE tm.team_id = v_team_id
    AND tm.role IN ('owner', 'admin')
    AND tm.approved = true;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.request_cricket_access(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.request_cricket_access(UUID) TO authenticated;


-- ============================================================
-- A5. team_members UPDATE — WITH CHECK
-- ============================================================
-- USING alone checks only the OLD row; without WITH CHECK an admin of team A
-- could rewrite a membership's team_id into team B.

DROP POLICY IF EXISTS "Admin can update members" ON team_members;
CREATE POLICY "Admin can update members"
  ON team_members FOR UPDATE
  USING (
    (is_team_admin(team_id) AND user_id != auth.uid())
    OR is_global_admin()
  )
  WITH CHECK (
    (is_team_admin(team_id) AND user_id != auth.uid())
    OR is_global_admin()
  );


-- ============================================================
-- A6. cricket_teams — INSERT gated, UPDATE WITH CHECK
-- ============================================================
-- Direct INSERT allowed any authenticated user to create rows with an
-- arbitrary owner_id (the RLS-gated path is the create_team() RPC, which is
-- SECURITY DEFINER and global-admin-only, so it is unaffected).

DROP POLICY IF EXISTS "Authenticated can create teams" ON cricket_teams;
DROP POLICY IF EXISTS "Global admin can create teams" ON cricket_teams;
CREATE POLICY "Global admin can create teams"
  ON cricket_teams FOR INSERT
  WITH CHECK (is_global_admin());

DROP POLICY IF EXISTS "Owner can update team" ON cricket_teams;
CREATE POLICY "Owner can update team"
  ON cricket_teams FOR UPDATE
  USING (owner_id = auth.uid() OR is_global_admin())
  -- WITH CHECK keeps the row in the actor's control after the update: an
  -- owner cannot hand the team to someone else through a raw UPDATE
  -- (ownership transfer, if ever needed, gets its own RPC).
  WITH CHECK (owner_id = auth.uid() OR is_global_admin());


-- ============================================================
-- A7. profiles INSERT — self-scoped
-- ============================================================
-- Was WITH CHECK (true). handle_new_user is SECURITY DEFINER (owner bypasses
-- RLS), so the trigger path is unaffected; this only stops a client from
-- inserting a profile row for someone else's id.

DROP POLICY IF EXISTS "Allow insert via trigger" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);


-- ============================================================
-- A10. check_cricket_player_email — invite-scoped, no open oracle
-- ============================================================
-- The old (check_email, p_team_id) version was an anon-callable, unlimited
-- roster-email-existence oracle across ALL teams. The signup UX still needs
-- the check (to skip the player-info form for pre-added players), so it now
-- requires a VALID invite token and answers only for that token's team:
-- knowing the answer requires already holding an invitation to the team.

DROP FUNCTION IF EXISTS public.check_cricket_player_email(TEXT, UUID);
DROP FUNCTION IF EXISTS public.check_cricket_player_email(TEXT);

CREATE FUNCTION public.check_cricket_player_email(
  check_email TEXT,
  p_invite_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  SELECT ti.team_id INTO v_team_id
  FROM team_invites ti
  JOIN cricket_teams t ON t.id = ti.team_id
  WHERE ti.token = p_invite_token
    AND ti.is_active = true
    AND ti.expires_at > now()
    AND (ti.max_uses IS NULL OR ti.use_count < ti.max_uses)
    AND t.deleted_at IS NULL;

  IF v_team_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM cricket_players
    WHERE lower(email) = lower(check_email)
      AND is_active = true
      AND team_id = v_team_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_cricket_player_email(TEXT, UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.check_cricket_player_email(TEXT, UUID) TO anon, authenticated;


-- ============================================================
-- A8. is_admin() — pin search_path
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (is_admin = true OR access @> '{admin}')
  );
$$;


-- ============================================================
-- A9. Player self-edit — restrict which columns a player may change
-- ============================================================
-- The "Players can update own record" policy (docs/cricket-self-edit-migration.sql)
-- WITH CHECKs only user_id, so a linked player could flip their own
-- is_active/is_guest, change team_id, wear the armband (designation — now the
-- season mirror), or renumber their jersey. This trigger limits self-edits to
-- the fields the profile edit form legitimately offers: name, email,
-- cricclub_id, shirt_size, player_role, batting_style, bowling_style,
-- photo_url. Admin edits (team admin / global admin) are untouched.

CREATE OR REPLACE FUNCTION public.enforce_player_self_edit_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Enforce ONLY on a genuine self-edit: the row is currently linked to the
  -- caller. Everything else passes:
  --   * auth.uid() NULL — trigger/service contexts (handle_new_user);
  --   * OLD.user_id IS NULL — the system linking paths (accept_invite,
  --     activate_team_membership, claim_umpiring_duty's backfill) run as the
  --     joining USER via SECURITY DEFINER; blocking those broke invite
  --     acceptance and duty claiming outright (council CRITICAL). A direct
  --     client can never reach an unlinked row anyway: the self-edit RLS
  --     policy's USING is user_id = auth.uid(), and NULL never matches.
  --   * admins.
  IF auth.uid() IS NULL
     OR OLD.user_id IS DISTINCT FROM auth.uid()
     OR is_team_admin(OLD.team_id)
     OR is_global_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.team_id       IS DISTINCT FROM OLD.team_id
     OR NEW.user_id    IS DISTINCT FROM OLD.user_id
     OR NEW.is_active  IS DISTINCT FROM OLD.is_active
     OR NEW.is_guest   IS DISTINCT FROM OLD.is_guest
     OR NEW.designation IS DISTINCT FROM OLD.designation
     OR NEW.jersey_number IS DISTINCT FROM OLD.jersey_number THEN
    RAISE EXCEPTION 'This field can only be changed by a team admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_player_self_edit_columns ON cricket_players;
CREATE TRIGGER trg_player_self_edit_columns
  BEFORE UPDATE ON cricket_players
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_player_self_edit_columns();


-- ============================================================
-- Verify (read-only)
-- ============================================================
-- Functions carry pinned search_path:
--   SELECT proname, prosecdef, proconfig FROM pg_proc
--   WHERE proname IN ('reject_user','request_cricket_access','is_admin','handle_new_user');
-- Policies carry WITH CHECK:
--   SELECT polname, polcmd, pg_get_expr(polwithcheck, polrelid) FROM pg_policy
--   WHERE polrelid IN ('team_members'::regclass, 'cricket_teams'::regclass, 'profiles'::regclass);
