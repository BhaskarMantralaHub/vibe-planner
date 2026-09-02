-- ============================================================================
-- AUTH HARDENING — PHASE B: MEMBERSHIP STATUS MODEL + ONE ACTIVATION PATH
-- ============================================================================
-- Run AFTER docs/auth-hardening-migration.sql. Idempotent — safe to re-run.
--
-- What this changes (docs/AUTH_ACCESS_AUDIT.md §11):
--   B1  team_members gains status ('pending'|'active'|'rejected'|'removed'),
--       backfilled from approved. `approved` is KEPT as a legacy mirror,
--       synchronized both ways by trigger, so un-migrated readers/writers
--       keep working. status is the authoritative team authorization state.
--       profiles.approved is hereby demoted to a UX hint ONLY (the pending
--       screen) — never an authorization input.
--   B2  user_team_ids() / is_team_admin() / is_team_member() flip to
--       status = 'active'. The ~69 dependent RLS policies are untouched.
--   B3  Rejection = status='rejected' (+ rejected_at/rejected_by). It no
--       longer deletes the membership row and NEVER deletes auth accounts.
--   B4  ONE activation path: activate_team_membership() is the only place
--       that (a) activates the membership, (b) links the roster player,
--       (c) posts the welcome — idempotent via team_members.welcomed_at,
--       claimed in the same transaction. handle_new_user, accept_invite and
--       approve_team_member all route through it.
--   B5  post_welcome_message derives the player's display name server-side —
--       callers can no longer inject an arbitrary name into an admin-authored
--       @Everyone post. The client-callable create_welcome_post RPC is
--       DROPPED (frontend callers are removed in the same release).
--   B6  Uniqueness: one linked user per team roster (partial unique index),
--       with a duplicate pre-check that ABORTS with a report instead of
--       failing cryptically. The email-uniqueness index is intentionally
--       advisory (skipped with a WARNING when duplicates exist — families
--       sharing an email are legal data, see notes inline).
--   B7  pending_members(p_team_id) RPC so TEAM admins (not only global
--       admins, whose profiles-read RLS the old UI depended on) can see
--       their own team's queue.
--   B8  create_team seats the owner as status='active' explicitly.
--   B9  has_cricket_access() (the Storage bucket gate) now requires an
--       ACTIVE membership — pending/rejected users lose file access.
--   B10 request_cricket_access re-issued status-aware.
--   B11 get_dashboard_data's pending queue → status='pending'
--       (RE-RUN docs/get-dashboard-data.sql after this file).
--
-- Council-reviewed (DBA / security / SQL-correctness, 2026-09-01): all
-- CRITICAL and HIGH findings fixed — self-edit trigger permits the system
-- self-claim, post_welcome_message revoked from client roles, status has no
-- column default (mirror derivation works), welcome claim taken late,
-- rejected memberships never auto-reactivate via invite, TOCTOU re-guards on
-- link UPDATEs, notification replay dedupe.
-- ============================================================================


-- ============================================================
-- B0. PRE-FLIGHT (read-only, fail-fast)
-- ============================================================
-- The B6 unique index requires clean data. Checking FIRST means a duplicate
-- aborts the migration before anything is altered — important if this file is
-- ever run statement-by-statement instead of as the editor's single
-- transaction.

DO $$
DECLARE
  dup RECORD;
  found_dupes BOOLEAN := false;
BEGIN
  FOR dup IN
    SELECT team_id, user_id, count(*) AS n, array_agg(id) AS ids
    FROM cricket_players
    WHERE user_id IS NOT NULL AND is_active = true
    GROUP BY team_id, user_id HAVING count(*) > 1
  LOOP
    found_dupes := true;
    RAISE WARNING 'Duplicate link: team % user % has % active rows: %',
      dup.team_id, dup.user_id, dup.n, dup.ids;
  END LOOP;
  IF found_dupes THEN
    RAISE EXCEPTION 'Resolve the duplicate player links above (keep one row, unlink or deactivate the rest), then re-run this migration';
  END IF;
END $$;


-- ============================================================
-- B1. Status column + audit columns + backfill + mirror sync
-- ============================================================

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
-- Durable idempotency marker for the welcome post (B4). Backfilled below so
-- existing members never receive a retroactive welcome.
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS welcomed_at TIMESTAMPTZ;

UPDATE team_members
SET status = CASE WHEN approved THEN 'active' ELSE 'pending' END
WHERE status IS NULL;

-- Existing active members joined before the marker existed; their welcome
-- (if any) already happened. Never re-fire it.
UPDATE team_members
SET welcomed_at = COALESCE(welcomed_at, joined_at, now())
WHERE status = 'active' AND welcomed_at IS NULL;

ALTER TABLE team_members ALTER COLUMN status SET NOT NULL;
-- NO column default, deliberately: defaults apply BEFORE row triggers, so a
-- default of 'pending' would make the sync trigger's NULL-derivation branch
-- unreachable and silently flip a legacy INSERT's approved=true to false
-- (council HIGH — it locked the create_team owner out of their own team).
-- With no default, an INSERT that omits status reaches the trigger as NULL
-- and derives from approved; the trigger always sets it, satisfying NOT NULL.
ALTER TABLE team_members ALTER COLUMN status DROP DEFAULT;

DO $$ BEGIN
  ALTER TABLE team_members
    ADD CONSTRAINT team_members_status_check
    CHECK (status IN ('pending', 'active', 'rejected', 'removed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The old default (approved = true) meant any INSERT that forgot the column
-- created an instantly-approved member (audit finding 17). Membership now
-- defaults to PENDING; paths that mean "active" say so explicitly.
ALTER TABLE team_members ALTER COLUMN approved SET DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_team_members_status_pending
  ON team_members(team_id) WHERE status = 'pending';

-- Two-way mirror during the transition:
--  * status is authoritative — writing status updates approved;
--  * a LEGACY writer that only sets approved gets status derived
--    (true→active, false→pending; it cannot express rejected/removed).
-- Remove the approved column (and this trigger) only after every reader and
-- writer has moved to status.
CREATE OR REPLACE FUNCTION public.sync_team_member_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL THEN
      NEW.status := CASE WHEN COALESCE(NEW.approved, false) THEN 'active' ELSE 'pending' END;
    END IF;
    NEW.approved := (NEW.status = 'active');
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.approved := (NEW.status = 'active');
    ELSIF NEW.approved IS DISTINCT FROM OLD.approved THEN
      NEW.status := CASE WHEN NEW.approved THEN 'active' ELSE 'pending' END;
    END IF;
    -- Reactivation clears the rejection audit trail regardless of which
    -- writer (status-native or legacy approved) performed it.
    IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
      NEW.rejected_at := NULL;
      NEW.rejected_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_team_member_status ON team_members;
CREATE TRIGGER trg_sync_team_member_status
  BEFORE INSERT OR UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_team_member_status();


-- ============================================================
-- B2. Authorization helpers → status = 'active'
-- ============================================================
-- Signatures unchanged; the ~69 dependent policies keep working verbatim.

CREATE OR REPLACE FUNCTION public.user_team_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT team_id FROM public.team_members
  WHERE user_id = auth.uid() AND status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.is_team_admin(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid()
      AND role IN ('owner', 'admin') AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid() AND status = 'active'
  );
$$;


-- ============================================================
-- B5 (first, because B4 depends on it):
-- post_welcome_message — server-derived name, idempotent
-- ============================================================
-- New contract: (p_user_id, p_team_id). The display name comes from the
-- linked roster row, else profiles.full_name, else the email local part —
-- never from a caller-supplied string. Idempotency: the function CLAIMS
-- team_members.welcomed_at first (single UPDATE ... WHERE welcomed_at IS
-- NULL); if the claim misses, someone already posted — return. Claim and
-- post commit or roll back together (same transaction).

DROP FUNCTION IF EXISTS public.post_welcome_message(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.post_welcome_message(
  p_user_id UUID,
  p_team_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id UUID;
  v_post_id UUID;
  admin_uid UUID;
  team_name TEXT;
  player_name TEXT;
  welcome_messages TEXT[] := ARRAY[
    'Welcome to the squad, %s! Let''s make this season one for the books',
    '%s has joined the team! Another warrior in the dugout',
    'Big welcome to %s! The team just got stronger',
    '%s is officially on the roster! Time to hit the ground running',
    'Welcome aboard, %s! Can''t wait to see you on the field',
    'The squad grows! %s joins the family',
    '%s has entered the arena! Welcome to the team',
    'New player alert! Welcome %s to the team',
    '%s just leveled up our roster! Welcome to the squad',
    'Say hello to our newest teammate — %s! Let''s go'
  ];
  caption TEXT;
BEGIN
  IF p_team_id IS NULL THEN RETURN; END IF;

  -- Fast-path out if already welcomed (the authoritative claim happens just
  -- before the INSERT below — claiming HERE would permanently burn the
  -- welcome when a precondition like "no active season yet" early-returns,
  -- council MEDIUM).
  IF EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND user_id = p_user_id AND welcomed_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  -- Server-derived display name — never caller-supplied.
  SELECT cp.name INTO player_name
  FROM cricket_players cp
  WHERE cp.team_id = p_team_id AND cp.user_id = p_user_id AND cp.is_active = true
  ORDER BY cp.created_at ASC LIMIT 1;
  IF player_name IS NULL THEN
    SELECT COALESCE(NULLIF(p.full_name, ''), split_part(u.email, '@', 1))
    INTO player_name
    FROM auth.users u LEFT JOIN profiles p ON p.id = u.id
    WHERE u.id = p_user_id;
  END IF;
  IF player_name IS NULL THEN RETURN; END IF;

  SELECT name INTO team_name FROM cricket_teams WHERE id = p_team_id;

  -- Current active season for this team
  SELECT id INTO v_season_id FROM cricket_seasons
  WHERE is_active = true AND team_id = p_team_id
  ORDER BY
    CASE
      WHEN season_type = (
        CASE
          WHEN EXTRACT(MONTH FROM now()) BETWEEN 3 AND 5 THEN 'spring'
          WHEN EXTRACT(MONTH FROM now()) BETWEEN 6 AND 9 THEN 'summer'
          ELSE 'fall'
        END
      ) AND year = EXTRACT(YEAR FROM now()) THEN 0
      ELSE 1
    END,
    year DESC, created_at DESC
  LIMIT 1;
  IF v_season_id IS NULL THEN RETURN; END IF;

  SELECT tm.user_id INTO admin_uid
  FROM team_members tm
  WHERE tm.team_id = p_team_id AND tm.role IN ('owner', 'admin') AND tm.status = 'active'
  ORDER BY tm.joined_at LIMIT 1;
  IF admin_uid IS NULL THEN RETURN; END IF;

  caption := format(
    welcome_messages[1 + floor(random() * array_length(welcome_messages, 1))::int],
    player_name
  ) || ' @' || player_name || ' @Everyone';

  -- THE idempotency claim — atomic gate, taken only once every precondition
  -- has passed, in the same transaction as the INSERT (a failure rolls both
  -- back, so the welcome stays retryable). A concurrent caller blocks on the
  -- row lock, re-evaluates welcomed_at IS NULL after commit, matches zero
  -- rows and returns. status='active': a welcome belongs to an ACTIVE
  -- membership only.
  UPDATE team_members
  SET welcomed_at = now()
  WHERE team_id = p_team_id AND user_id = p_user_id
    AND status = 'active' AND welcomed_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO cricket_gallery (user_id, season_id, team_id, caption, posted_by)
  VALUES (admin_uid, v_season_id, p_team_id, caption, COALESCE(team_name, 'Team'))
  RETURNING id INTO v_post_id;

  INSERT INTO cricket_notifications (user_id, post_id, team_id, type, message, is_read)
  SELECT DISTINCT cp.user_id, v_post_id, p_team_id, 'tag', player_name || ' joined the team!', false
  FROM cricket_players cp
  WHERE cp.is_active = true AND cp.user_id IS NOT NULL AND cp.user_id != p_user_id
    AND cp.team_id = p_team_id;
END;
$$;

-- NOT client-callable: a new function is EXECUTE-granted to PUBLIC by
-- default and PostgREST would expose rpc/post_welcome_message to anon —
-- exactly the forged-welcome vector this rewrite removes (council HIGH).
-- Internal SECURITY DEFINER callers run as the owner and are unaffected.
REVOKE ALL ON FUNCTION public.post_welcome_message(UUID, UUID) FROM anon, authenticated, public;

-- The client-callable wrapper is retired: activation posts the welcome
-- server-side, and the wrapper allowed any member to spam admin-authored
-- posts with an arbitrary injected name. Frontend callers are removed in the
-- same release (components/AuthGate.tsx, components/Shell.tsx).
DROP FUNCTION IF EXISTS public.create_welcome_post(UUID, TEXT, UUID);


-- ============================================================
-- B4. ONE activation path
-- ============================================================
-- Everything that can turn a membership ACTIVE calls this and nothing else:
--   * handle_new_user (pre-added signup)
--   * accept_invite (pre-added or existing-player auto-approve)
--   * approve_team_member (admin approval)
-- It is idempotent: repeated calls yield ONE active membership, ONE player
-- link (guarded by user_id IS NULL + the B6 unique index), ONE welcome post
-- (welcomed_at claim). NOT exposed to PostgREST — internal only.

CREATE OR REPLACE FUNCTION public.activate_team_membership(
  p_team_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_link_id UUID;
BEGIN
  -- (a) Membership → active (mirror kept by trigger). Insert if absent.
  INSERT INTO team_members (team_id, user_id, role, status)
  VALUES (p_team_id, p_user_id, 'player', 'active')
  ON CONFLICT (team_id, user_id) DO UPDATE
    SET status = 'active', rejected_at = NULL, rejected_by = NULL
    WHERE team_members.status IS DISTINCT FROM 'active';

  -- (b) Roster link: exactly one unlinked, active, email-matching row on THIS
  -- team; never steals an existing link (user_id IS NULL) and never relinks
  -- when the user already holds a row (unique index also enforces this).
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cricket_players
    WHERE team_id = p_team_id AND user_id = p_user_id AND is_active = true
  ) THEN
    SELECT id INTO v_link_id
    FROM cricket_players
    WHERE team_id = p_team_id
      AND lower(email) = lower(v_email)
      AND is_active = true
      AND user_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1;
    IF v_link_id IS NOT NULL THEN
      -- user_id IS NULL re-asserted: concurrent activations sharing a roster
      -- email must not overwrite each other's fresh link (TOCTOU).
      UPDATE cricket_players
      SET user_id = p_user_id, updated_at = now()
      WHERE id = v_link_id AND user_id IS NULL;
    END IF;
  END IF;

  -- (c) Clear the profiles.approved UX flag. It is NOT authorization (status
  -- is), but auth-store signs a user out and shows "Pending Approval" while
  -- it is false — and handle_new_user writes the profile row BEFORE it knows
  -- whether this person is pre-added, so every cricket signup starts false.
  -- Activation is the moment that stops being true, so it clears it here:
  -- one activation path, one place that owns the flag.
  UPDATE profiles SET approved = true WHERE id = p_user_id AND approved = false;

  -- (d) Welcome post — idempotent via the welcomed_at claim inside.
  BEGIN
    PERFORM post_welcome_message(p_user_id, p_team_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'activate_team_membership: welcome post failed for %: %', p_user_id, SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_team_membership(UUID, UUID) FROM anon, authenticated, public;


-- ============================================================
-- handle_new_user — route activation through the single path
-- ============================================================
-- Supersedes the Phase A version: identical validation (access allowlist,
-- server-computed approval, notifications), but membership creation and the
-- link/welcome now go through activate_team_membership for the auto-approved
-- case. Player metadata gap-filling for the pre-added row is retained, still
-- COALESCE(existing, metadata) — roster data wins.

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
BEGIN
  raw_access := NEW.raw_user_meta_data->>'access';

  -- [A2] allowlist — see auth-hardening-migration.sql
  IF raw_access IS NOT NULL AND raw_access NOT IN ('toolkit', 'cricket') THEN
    raw_access := 'toolkit';
  END IF;

  IF raw_access IS NOT NULL THEN
    user_access := ARRAY[raw_access];
  ELSE
    user_access := '{toolkit}';
  END IF;

  IF raw_access = 'cricket' THEN
    user_features := '{cricket}';
  ELSE
    user_features := '{vibe-planner,id-tracker}';
  END IF;

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

  v_team_slug := NEW.raw_user_meta_data->>'team_slug';
  IF v_team_slug IS NOT NULL THEN
    SELECT id INTO v_team_id FROM cricket_teams WHERE slug = v_team_slug AND deleted_at IS NULL;
  END IF;

  -- user_id IS NULL is load-bearing: a roster row already linked to another
  -- account must never auto-approve a signup that merely shares its email.
  IF v_team_id IS NOT NULL AND raw_access = 'cricket' THEN
    v_is_pre_added := EXISTS (
      SELECT 1 FROM cricket_players
      WHERE team_id = v_team_id AND lower(email) = lower(NEW.email)
        AND is_active = true AND user_id IS NULL
    );
  END IF;

  -- Cricket signups only: a toolkit signup carrying a forged team_slug in
  -- its client-controlled metadata must not receive any membership
  -- (user_approved is true for every non-cricket signup — council HIGH).
  IF v_team_id IS NOT NULL AND raw_access = 'cricket' THEN
    IF v_is_pre_added THEN
      -- Pre-added roster player (or non-cricket signup landing on a team):
      -- the ONE activation path — membership + gap-fill link + welcome.
      PERFORM activate_team_membership(v_team_id, NEW.id);

      -- Gap-fill the freshly linked row from signup metadata (never
      -- overwrites what the admin entered).
      IF v_is_pre_added THEN
        BEGIN
          UPDATE cricket_players
          SET jersey_number = COALESCE(jersey_number, (NEW.raw_user_meta_data->>'jersey_number')::integer),
              player_role   = COALESCE(player_role,   NEW.raw_user_meta_data->>'player_role'),
              batting_style = COALESCE(batting_style, NEW.raw_user_meta_data->>'batting_style'),
              bowling_style = COALESCE(bowling_style, NEW.raw_user_meta_data->>'bowling_style'),
              shirt_size    = COALESCE(shirt_size,    NEW.raw_user_meta_data->>'shirt_size'),
              updated_at = now()
          WHERE team_id = v_team_id AND user_id = NEW.id AND is_active = true;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'handle_new_user: player meta fill failed for %: %', NEW.email, SQLERRM;
        END;
      END IF;
    ELSE
      -- Unknown cricket signup → pending membership + admin notifications.
      INSERT INTO team_members (team_id, user_id, role, status)
      VALUES (v_team_id, NEW.id, 'player', 'pending')
      ON CONFLICT (team_id, user_id) DO NOTHING;

      INSERT INTO cricket_notifications (user_id, post_id, team_id, type, message)
      SELECT
        tm.user_id, NULL, v_team_id, 'join_request',
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
          || ' wants to join the team'
      FROM team_members tm
      WHERE tm.team_id = v_team_id
        AND tm.role IN ('owner', 'admin')
        AND tm.status = 'active';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================
-- accept_invite — status model + single activation path
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_invite(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_user_email TEXT;
  v_is_pre_added BOOLEAN := false;
  v_is_existing_player BOOLEAN := false;
  v_needs_approval BOOLEAN := false;
  v_pending_rows INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  SELECT ti.*, t.name AS team_name, t.slug AS team_slug
  INTO v_invite
  FROM team_invites ti
  JOIN cricket_teams t ON t.id = ti.team_id
  WHERE ti.token = p_token
    AND ti.is_active = true
    AND ti.expires_at > now()
    AND (ti.max_uses IS NULL OR ti.use_count < ti.max_uses)
    AND t.deleted_at IS NULL
  FOR UPDATE OF ti;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid or expired invite link');
  END IF;

  -- Already an ACTIVE member of this team? Short-circuit (and do NOT burn a
  -- use of a max_uses-limited link on a replay).
  IF EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = v_invite.team_id AND user_id = auth.uid() AND status = 'active'
  ) THEN
    RETURN json_build_object(
      'success', true, 'team_id', v_invite.team_id,
      'team_name', v_invite.team_name, 'team_slug', v_invite.team_slug,
      'pending_approval', false, 'already_member', true
    );
  END IF;

  -- user_id IS NULL: a roster row linked to a DIFFERENT account must never
  -- auto-approve whoever shares its email (players can edit their own
  -- roster email — that must not mint approvals for other addresses).
  v_is_pre_added := EXISTS (
    SELECT 1 FROM cricket_players
    WHERE team_id = v_invite.team_id AND lower(email) = lower(v_user_email)
      AND is_active = true AND user_id IS NULL
  );

  v_is_existing_player := EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid() AND team_id != v_invite.team_id AND status = 'active'
  );

  v_needs_approval := NOT v_is_pre_added AND NOT v_is_existing_player;

  -- A REJECTED or REMOVED membership never auto-reactivates through an
  -- invite, whatever the auto-approve signals say — the admin decided, and a
  -- replayed token must put the decision back in FRONT of the admin, not
  -- route around it.
  IF EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = v_invite.team_id AND user_id = auth.uid()
      AND status IN ('rejected', 'removed')
  ) THEN
    v_needs_approval := true;
  END IF;

  IF v_needs_approval THEN
    -- Pending request (a previously rejected user re-applying goes back to
    -- pending — the admin decides again). ROW_COUNT: a replay by a
    -- still-pending user changes nothing and must not re-notify the admins.
    INSERT INTO team_members (team_id, user_id, role, status)
    VALUES (v_invite.team_id, auth.uid(), 'player', 'pending')
    ON CONFLICT (team_id, user_id) DO UPDATE
      SET status = 'pending', rejected_at = NULL, rejected_by = NULL
      WHERE team_members.status IN ('rejected', 'removed');
    GET DIAGNOSTICS v_pending_rows = ROW_COUNT;
  ELSE
    -- The ONE activation path: membership + roster link + welcome.
    PERFORM activate_team_membership(v_invite.team_id, auth.uid());
  END IF;

  -- Cricket access + features on the caller's own profile.
  -- profiles.approved: UX hint only — set false ONLY for a brand-new
  -- cricket-only pending user; never downgrade someone with existing access.
  UPDATE profiles
  SET access = CASE WHEN NOT (access @> '{cricket}') THEN array_append(access, 'cricket') ELSE access END,
      features = CASE WHEN NOT (features @> '{cricket}') THEN array_append(features, 'cricket') ELSE features END,
      approved = CASE
        WHEN v_needs_approval AND approved = true THEN true
        WHEN v_needs_approval THEN false
        ELSE true
      END
  WHERE id = auth.uid();

  UPDATE team_invites SET use_count = use_count + 1 WHERE id = v_invite.id;

  IF v_needs_approval AND v_pending_rows > 0 THEN
    INSERT INTO cricket_notifications (user_id, post_id, team_id, type, message)
    SELECT
      tm.user_id, NULL, v_invite.team_id, 'join_request',
      COALESCE(
        (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = auth.uid()),
        split_part(v_user_email, '@', 1)
      ) || ' wants to join the team'
    FROM team_members tm
    WHERE tm.team_id = v_invite.team_id
      AND tm.role IN ('owner', 'admin')
      AND tm.status = 'active';
  END IF;

  RETURN json_build_object(
    'success', true, 'team_id', v_invite.team_id,
    'team_name', v_invite.team_name, 'team_slug', v_invite.team_slug,
    'pending_approval', v_needs_approval
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invite(UUID) TO authenticated;


-- ============================================================
-- approve_team_member — status model, atomic, idempotent
-- ============================================================

CREATE OR REPLACE FUNCTION public.approve_team_member(
  p_team_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
BEGIN
  IF NOT is_team_admin(p_team_id) AND NOT is_global_admin() THEN
    RAISE EXCEPTION 'Only team admins can approve members';
  END IF;

  SELECT tm.*, au.email, au.raw_user_meta_data->>'full_name' AS full_name,
         (SELECT player_meta FROM profiles WHERE id = p_user_id) AS player_meta
  INTO v_member
  FROM team_members tm
  JOIN auth.users au ON au.id = tm.user_id
  WHERE tm.team_id = p_team_id AND tm.user_id = p_user_id AND tm.status = 'pending'
  FOR UPDATE OF tm;

  IF NOT FOUND THEN
    -- Idempotent for double-clicks/races: an already-active member is success.
    IF EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = p_team_id AND user_id = p_user_id AND status = 'active'
    ) THEN
      RETURN json_build_object('success', true, 'already_active', true);
    END IF;
    RETURN json_build_object('error', 'No pending member found');
  END IF;

  -- The ONE activation path (membership active + link + welcome, all
  -- idempotent). THIS team only — other pending memberships are untouched.
  PERFORM activate_team_membership(p_team_id, p_user_id);

  -- No roster row could be linked (unknown player) → create one from the
  -- signup metadata stored on the profile. The jersey cast is guarded (a
  -- non-numeric metadata value must not abort the approval), and a
  -- unique-violation on the advisory email index (families legally share an
  -- email) degrades to an email-less row instead of failing the RPC.
  IF NOT EXISTS (
    SELECT 1 FROM cricket_players
    WHERE team_id = p_team_id AND user_id = p_user_id AND is_active = true
  ) THEN
    BEGIN
      INSERT INTO cricket_players (
        team_id, user_id, name, email, is_active, is_guest,
        jersey_number, player_role, batting_style, bowling_style, shirt_size
      )
      VALUES (
        p_team_id, p_user_id,
        COALESCE(v_member.full_name, split_part(v_member.email, '@', 1)),
        v_member.email, true, false,
        CASE WHEN v_member.player_meta->>'jersey_number' ~ '^\d+$'
             THEN (v_member.player_meta->>'jersey_number')::integer END,
        v_member.player_meta->>'player_role',
        v_member.player_meta->>'batting_style',
        v_member.player_meta->>'bowling_style',
        v_member.player_meta->>'shirt_size'
      );
    EXCEPTION WHEN unique_violation THEN
      INSERT INTO cricket_players (team_id, user_id, name, email, is_active, is_guest)
      VALUES (
        p_team_id, p_user_id,
        COALESCE(v_member.full_name, split_part(v_member.email, '@', 1)),
        NULL, true, false
      );
    END;
  END IF;

  -- profiles.approved is a UX hint: the user now has an active membership,
  -- so the pending sign-out screen must stop.
  UPDATE profiles SET approved = true WHERE id = p_user_id;

  INSERT INTO cricket_notifications (user_id, post_id, team_id, type, message)
  VALUES (
    p_user_id, NULL, p_team_id, 'approval',
    'Welcome! Your request to join the team has been approved'
  );

  RETURN json_build_object('success', true, 'user_id', p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_team_member(UUID, UUID) TO authenticated;


-- ============================================================
-- B3. reject_team_member — rejection is a STATUS, not a deletion
-- ============================================================

CREATE OR REPLACE FUNCTION public.reject_team_member(
  p_team_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_other_cricket BOOLEAN;
BEGIN
  IF NOT is_team_admin(p_team_id) AND NOT is_global_admin() THEN
    RAISE EXCEPTION 'Only team admins can reject members';
  END IF;

  UPDATE team_members
  SET status = 'rejected', rejected_at = now(), rejected_by = auth.uid()
  WHERE team_id = p_team_id AND user_id = p_user_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'No pending member found');
  END IF;

  -- A rejected cricket-only signup must not stay locked out of login by the
  -- profiles.approved UX gate, and a toolkit user keeps their toolkit.
  -- If they have no other live cricket membership, drop the cricket access
  -- hint and restore approved (their global identity remains valid — account
  -- deletion is a separate deliberate operation, reject_user, global-admin-only).
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = p_user_id AND team_id != p_team_id AND status IN ('active', 'pending')
  ) INTO v_has_other_cricket;

  IF NOT v_has_other_cricket THEN
    -- Strip the cricket hint, but NEVER leave access empty: the client reads
    -- an empty array as "profile still loading" in places, and an account
    -- with no access at all is not a state this app has a screen for. A
    -- rejected person keeps a baseline account ('toolkit') with no features
    -- enabled, so they land on the request-access screen rather than a
    -- spinner or a broken dashboard.
    UPDATE profiles
    SET access = CASE
          WHEN array_remove(access, 'cricket') = '{}' THEN ARRAY['toolkit']
          ELSE array_remove(access, 'cricket')
        END,
        features = array_remove(features, 'cricket'),
        approved = true
    WHERE id = p_user_id;
  END IF;

  -- Clean up the admin join-request notifications (text-matched — the rows
  -- carry no actor column; same-named pending users can collide, accepted at
  -- this app's scale). Equality, not LIKE: a % or _ in a display name must
  -- not over-match other users' notifications.
  DELETE FROM cricket_notifications
  WHERE team_id = p_team_id AND type = 'join_request'
    AND message = (
      COALESCE(
        (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = p_user_id),
        split_part((SELECT email FROM auth.users WHERE id = p_user_id), '@', 1)
      ) || ' wants to join the team'
    );

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_team_member(UUID, UUID) TO authenticated;


-- ============================================================
-- B7. pending_members — the queue, visible to TEAM admins
-- ============================================================
-- The old UI read profiles directly, which only a GLOBAL admin's RLS allows;
-- a team admin saw an empty queue. This returns exactly what the approval
-- card renders, gated on team admin.

CREATE OR REPLACE FUNCTION public.pending_members(p_team_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  requested_at TIMESTAMPTZ,
  player_meta JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.user_id,
         u.email,
         COALESCE(NULLIF(p.full_name, ''), split_part(u.email, '@', 1)),
         tm.joined_at,
         p.player_meta
  FROM team_members tm
  JOIN auth.users u ON u.id = tm.user_id
  LEFT JOIN profiles p ON p.id = tm.user_id
  WHERE tm.team_id = p_team_id
    AND tm.status = 'pending'
    AND (is_team_admin(p_team_id) OR is_global_admin());
$$;

REVOKE ALL ON FUNCTION public.pending_members(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pending_members(UUID) TO authenticated;


-- ============================================================
-- B6. Player uniqueness — with data pre-checks
-- ============================================================
-- (1) HARD: one linked account per active roster per team. Links are
-- system-controlled, so duplicates are corruption; the migration ABORTS with
-- a row-by-row report if any exist (fix by hand, re-run).

DO $$
DECLARE
  dup RECORD;
  found_dupes BOOLEAN := false;
BEGIN
  FOR dup IN
    SELECT team_id, user_id, count(*) AS n, array_agg(id) AS ids
    FROM cricket_players
    WHERE user_id IS NOT NULL AND is_active = true
    GROUP BY team_id, user_id HAVING count(*) > 1
  LOOP
    found_dupes := true;
    RAISE WARNING 'Duplicate link: team % user % has % active rows: %',
      dup.team_id, dup.user_id, dup.n, dup.ids;
  END LOOP;
  IF found_dupes THEN
    RAISE EXCEPTION 'Resolve the duplicate player links above (keep one row, unlink or deactivate the rest), then re-run this migration';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_players_linked_user_per_team
  ON cricket_players (team_id, user_id)
  WHERE user_id IS NOT NULL AND is_active = true;

-- (2) ADVISORY: unique active email per team makes email-based linking fully
-- deterministic — but a family legitimately sharing one email is real data,
-- so if duplicates exist the index is SKIPPED with a warning instead of
-- failing (linking already handles this by always taking the OLDEST unlinked
-- row). Revisit if the roster ever needs strict email uniqueness.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cricket_players
    WHERE email IS NOT NULL AND is_active = true
    GROUP BY team_id, lower(email) HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'Duplicate active roster emails exist — skipping uniq_players_email_per_team (linking stays deterministic via oldest-row-first)';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_players_email_per_team
      ON cricket_players (team_id, lower(email))
      WHERE email IS NOT NULL AND is_active = true;
  END IF;
END $$;


-- ============================================================
-- B8. create_team — the owner is ACTIVE, explicitly
-- ============================================================
-- The deployed version inserted the owner membership with neither approved
-- nor status; under the status model that row would derive 'pending' and the
-- creator would be locked out of the team they just made (council HIGH).

CREATE OR REPLACE FUNCTION public.create_team(
  p_name TEXT,
  p_slug TEXT,
  p_primary_color TEXT DEFAULT '#0369a1'
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  IF NOT is_global_admin() THEN
    RAISE EXCEPTION 'Only platform admin can create teams';
  END IF;

  -- Validate slug format
  IF p_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RAISE EXCEPTION 'Invalid slug: use lowercase letters, numbers, and hyphens only';
  END IF;

  INSERT INTO cricket_teams (name, slug, owner_id, primary_color)
  VALUES (p_name, p_slug, auth.uid(), p_primary_color)
  RETURNING id INTO v_team_id;

  -- Creator becomes team owner — ACTIVE from the first moment.
  INSERT INTO team_members (team_id, user_id, role, status)
  VALUES (v_team_id, auth.uid(), 'owner', 'active');

  RETURN json_build_object(
    'team_id', v_team_id,
    'name', p_name,
    'slug', p_slug
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_team(TEXT, TEXT, TEXT) TO authenticated;


-- ============================================================
-- B9. Storage gate — has_cricket_access() now means ACTIVE membership
-- ============================================================
-- All four Storage bucket policy sets (gallery-photos, player-photos,
-- expense-receipts, split-receipts) gate on this helper. Its old definition
-- (profiles.access @> '{cricket}') was satisfiable by a PENDING or REJECTED
-- requester — request_cricket_access and accept_invite both add 'cricket' to
-- access before any approval — so an unapproved user could read (and for
-- gallery-photos, delete) photos and financial receipts (council HIGH).
-- Redefining the helper closes every bucket at once with zero policy churn.
-- Remaining known gap, deferred to Phase D: an active member of team A can
-- still reach team B's files (cross-team scoping needs per-path team checks).

CREATE OR REPLACE FUNCTION public.has_cricket_access()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = auth.uid() AND status = 'active'
  );
$$;


-- ============================================================
-- B10. request_cricket_access — status-aware re-issue
-- ============================================================
-- Same contract as the Phase A version; now that status exists, a REJECTED
-- requester gets an honest 'rejected' instead of 'already_requested'.

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
  v_status TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'auth_required';
  END IF;

  SELECT email, raw_user_meta_data->>'full_name'
  INTO v_email, v_name
  FROM auth.users WHERE id = v_uid;

  IF v_team_id IS NULL THEN
    SELECT id INTO v_team_id
    FROM cricket_teams WHERE deleted_at IS NULL;
    IF NOT FOUND THEN RETURN 'no_team'; END IF;
    IF (SELECT count(*) FROM cricket_teams WHERE deleted_at IS NULL) > 1 THEN
      RETURN 'team_required';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM cricket_teams WHERE id = v_team_id AND deleted_at IS NULL) THEN
      RETURN 'no_team';
    END IF;
  END IF;

  SELECT status INTO v_status
  FROM team_members WHERE team_id = v_team_id AND user_id = v_uid;
  IF v_status = 'active' THEN RETURN 'already_member'; END IF;
  IF v_status = 'pending' THEN RETURN 'already_requested'; END IF;
  IF v_status IN ('rejected', 'removed') THEN RETURN 'rejected'; END IF;

  UPDATE profiles
  SET access = CASE WHEN NOT (access @> '{cricket}') THEN array_append(access, 'cricket') ELSE access END,
      features = CASE WHEN NOT (features @> '{cricket}') THEN array_append(features, 'cricket') ELSE features END
  WHERE id = v_uid;

  INSERT INTO team_members (team_id, user_id, role, status)
  VALUES (v_team_id, v_uid, 'player', 'pending')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  INSERT INTO cricket_notifications (user_id, post_id, team_id, type, message)
  SELECT
    tm.user_id, NULL, v_team_id, 'join_request',
    COALESCE(v_name, split_part(v_email, '@', 1)) || ' wants to join the team'
  FROM team_members tm
  WHERE tm.team_id = v_team_id
    AND tm.role IN ('owner', 'admin')
    AND tm.status = 'active';

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.request_cricket_access(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.request_cricket_access(UUID) TO authenticated;


-- ============================================================
-- B11. Dashboard pending queue
-- ============================================================
-- get_dashboard_data's pending_members section previously selected
-- tm.approved = false, which post-migration also matches REJECTED and
-- REMOVED members forever (council HIGH — an unresolvable approve/reject
-- loop in the admin UI). docs/get-dashboard-data.sql has been updated to
-- tm.status = 'pending':
--
--   >>> RE-RUN docs/get-dashboard-data.sql AFTER THIS FILE. <<<


-- ============================================================
-- B12. Repair: active members must never carry the pending UX flag
-- ============================================================
-- profiles.approved = false makes auth-store sign the user out into the
-- "Pending Approval" screen. Anyone with an ACTIVE membership is, by
-- definition, not pending — reconcile the flag (activate_team_membership now
-- maintains it going forward). Idempotent.

UPDATE profiles p
SET approved = true
WHERE p.approved = false
  AND EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = p.id AND tm.status = 'active'
  );

-- Same repair for the empty-access case: a previously rejected user left with
-- access = '{}' hangs the client on a loading spinner. Give them the baseline.
UPDATE profiles SET access = ARRAY['toolkit']
WHERE access IS NULL OR access = '{}';


-- ============================================================
-- Verify (read-only)
-- ============================================================
--   SELECT status, count(*) FROM team_members GROUP BY status;
--   SELECT status, approved, count(*) FROM team_members GROUP BY 1,2;  -- mirror agrees
--   SELECT proname FROM pg_proc WHERE proname = 'create_welcome_post'; -- zero rows
--   SELECT count(*) FROM team_members WHERE status = 'active' AND welcomed_at IS NULL; -- zero
