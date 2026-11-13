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


-- ============================================================
-- S2a. get_signed_up_emails — drop (anon-callable auth.users email oracle)
-- ============================================================
-- SECURITY DEFINER over auth.users with default PUBLIC EXECUTE and no caller
-- check: anyone with the public anon key could ask "does this email have an
-- account?". Nothing calls it any more — get_dashboard_data computes
-- signed_up_emails inline (per-team-approval-migration.sql:597).

DROP FUNCTION IF EXISTS public.get_signed_up_emails(TEXT[]);


-- ============================================================
-- S2b. cricclubs sync-lock RPCs — service_role only
-- ============================================================
-- Migration 009 revoked PUBLIC, but Supabase's default privileges grant
-- EXECUTE to anon/authenticated by name, so they must be revoked explicitly.
-- Only the edge function (service role) takes this lock.

REVOKE ALL ON FUNCTION public.acquire_cricclubs_sync_lock(TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_cricclubs_sync_lock(UUID, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_cricclubs_sync_lock(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_cricclubs_sync_lock(UUID, TEXT) TO service_role;


-- ============================================================
-- S2c. suggest_players — stop leaking other teams' / non-active people's PII
-- ============================================================
-- Supersedes docs/multi-team-player-suggest.sql. Changes:
--   * caller must be a team admin (the only UI is the admin Add Player form);
--   * 'member' branch: ACTIVE members only, email comes from THIS team's
--     profile (never from the person's roster row on another team);
--   * 'other_team' branch: email is no longer returned (the file's own
--     comment says "NO email - privacy" but the SELECT returned it).

CREATE OR REPLACE FUNCTION public.suggest_players(
  p_query TEXT,
  p_team_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_query TEXT;
  result JSON;
BEGIN
  IF p_query IS NULL OR length(trim(p_query)) < 2 THEN RETURN '[]'::json; END IF;

  v_team_id := COALESCE(p_team_id, (
    SELECT team_id FROM team_members
    WHERE user_id = auth.uid() AND status = 'active'
    ORDER BY joined_at ASC LIMIT 1
  ));
  IF v_team_id IS NULL THEN RETURN '[]'::json; END IF;
  IF NOT is_team_admin(v_team_id) AND NOT is_global_admin() THEN RETURN '[]'::json; END IF;

  v_query := replace(replace(trim(p_query), '%', '\%'), '_', '\_');

  SELECT COALESCE(json_agg(json_build_object(
    'source', sub.source, 'name', sub.name, 'email', sub.email,
    'jersey_number', sub.jersey_number, 'player_role', sub.player_role,
    'batting_style', sub.batting_style, 'bowling_style', sub.bowling_style,
    'shirt_size', sub.shirt_size, 'cricclub_id', sub.cricclub_id,
    'designation', sub.designation
  )), '[]'::json)
  INTO result
  FROM (
    SELECT
      'member' AS source,
      COALESCE(xp.name, p.full_name) AS name,
      p.email AS email,
      xp.jersey_number,
      xp.player_role,
      xp.batting_style,
      xp.bowling_style,
      xp.shirt_size,
      xp.cricclub_id,
      xp.designation
    FROM team_members tm
    JOIN profiles p ON p.id = tm.user_id
    LEFT JOIN cricket_players cp ON cp.user_id = tm.user_id AND cp.team_id = v_team_id AND cp.is_active = true
    LEFT JOIN LATERAL (
      SELECT * FROM cricket_players op
      WHERE op.user_id = tm.user_id AND op.team_id != v_team_id AND op.is_active = true
      ORDER BY op.updated_at DESC LIMIT 1
    ) xp ON true
    WHERE tm.team_id = v_team_id
      AND tm.status = 'active'
      AND cp.id IS NULL
      AND (p.full_name ILIKE '%' || v_query || '%' OR xp.name ILIKE '%' || v_query || '%')

    UNION ALL

    SELECT
      'other_team' AS source,
      cp.name,
      NULL::text AS email,
      cp.jersey_number,
      cp.player_role,
      cp.batting_style,
      cp.bowling_style,
      cp.shirt_size,
      cp.cricclub_id,
      cp.designation
    FROM cricket_players cp
    WHERE cp.team_id != v_team_id
      AND cp.is_active = true
      AND cp.is_guest = false
      AND cp.name ILIKE '%' || v_query || '%'
      AND NOT EXISTS (
        SELECT 1 FROM cricket_players cp2
        WHERE cp2.team_id = v_team_id AND cp2.is_active = true
          AND (cp2.user_id = cp.user_id OR lower(cp2.name) = lower(cp.name))
      )

    ORDER BY source, name
    LIMIT 20
  ) sub;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.suggest_players(TEXT, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.suggest_players(TEXT, UUID) TO authenticated;


-- ============================================================
-- S3a. team_members — owner protection on INSERT / demote / DELETE
-- ============================================================
-- prevent_owner_escalation was BEFORE UPDATE only, so a team admin (captains
-- are auto-admins) could INSERT a role='owner' row, demote the real owner, or
-- delete them. The legitimate owner writers are all unaffected:
--   * create_team / the onboarding RPC run as a global admin (or with
--     auth.uid() NULL in migrations), both allowed below;
--   * cascades from deleting a team/user fire at trigger depth > 1.
-- The existing rule (nobody becomes owner by UPDATE) is kept for everyone.

CREATE OR REPLACE FUNCTION public.prevent_owner_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_trusted BOOLEAN := auth.uid() IS NULL OR is_global_admin();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'owner' AND NOT v_trusted THEN
      RAISE EXCEPTION 'Owner role can only be transferred via dedicated RPC';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.role = 'owner' AND OLD.role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Owner role can only be transferred via dedicated RPC';
    END IF;
    IF OLD.role = 'owner' AND NEW.role IS DISTINCT FROM 'owner' AND NOT v_trusted THEN
      RAISE EXCEPTION 'The team owner cannot be demoted';
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE
  IF OLD.role = 'owner' AND NOT v_trusted AND pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'The team owner cannot be removed';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_owner_escalation ON team_members;
CREATE TRIGGER trg_no_owner_escalation
  BEFORE INSERT OR UPDATE OR DELETE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_owner_escalation();


-- ============================================================
-- S3b. Cross-team sync triggers — only for a genuine member of the row's team
-- ============================================================
-- Both triggers are SECURITY DEFINER and trusted NEW.user_id to identify "the
-- same person", but a team admin can set user_id to anything on their own
-- team's roster rows. They could then edit that row and have the trigger
-- overwrite the target's rows on OTHER teams (and profiles.full_name).
-- Now the sync only fires when NEW.user_id is an ACTIVE member of NEW.team_id,
-- i.e. when the admin is managing a real member of their own team.

CREATE OR REPLACE FUNCTION public.sync_player_profile_across_teams()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RETURN NEW; END IF;

  IF NEW.name IS NOT DISTINCT FROM OLD.name
    AND NEW.email IS NOT DISTINCT FROM OLD.email
    AND NEW.player_role IS NOT DISTINCT FROM OLD.player_role
    AND NEW.batting_style IS NOT DISTINCT FROM OLD.batting_style
    AND NEW.bowling_style IS NOT DISTINCT FROM OLD.bowling_style
    AND NEW.shirt_size IS NOT DISTINCT FROM OLD.shirt_size
    AND NEW.cricclub_id IS NOT DISTINCT FROM OLD.cricclub_id
    AND NEW.photo_url IS NOT DISTINCT FROM OLD.photo_url
    AND NEW.phone IS NOT DISTINCT FROM OLD.phone
  THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = NEW.user_id AND team_id = NEW.team_id AND status = 'active'
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE cricket_players
  SET name = NEW.name,
      email = NEW.email,
      player_role = NEW.player_role,
      batting_style = NEW.batting_style,
      bowling_style = NEW.bowling_style,
      shirt_size = NEW.shirt_size,
      cricclub_id = NEW.cricclub_id,
      photo_url = NEW.photo_url,
      phone = NEW.phone,
      updated_at = now()
  WHERE user_id = NEW.user_id
    AND id != NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.sync_player_name_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
     AND NEW.user_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.team_members
       WHERE user_id = NEW.user_id AND team_id = NEW.team_id AND status = 'active'
     ) THEN
    UPDATE public.profiles SET full_name = NEW.name WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================
-- S4. Gallery family — INSERT bound to the caller
-- ============================================================
-- The INSERT policies (multi-team-migration.sql:606-680) checked team scope
-- only, so a member could post, comment, like or react AS another user by
-- sending someone else's user_id. UPDATE already binds user_id; INSERT now
-- does too. Every client writer passes the signed-in user's id
-- (stores/cricket-store.ts). Not changed on purpose: cricket_notifications
-- INSERT — the client legitimately writes notification rows for OTHER users
-- (like / comment / tag), so it stays team-scoped only.

DROP POLICY IF EXISTS "Team members can create posts" ON cricket_gallery;
CREATE POLICY "Team members can create posts"
  ON cricket_gallery FOR INSERT
  WITH CHECK (is_team_member(team_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS "Team members can create comments" ON cricket_gallery_comments;
CREATE POLICY "Team members can create comments"
  ON cricket_gallery_comments FOR INSERT
  WITH CHECK (is_team_member(team_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS "Team members can create likes" ON cricket_gallery_likes;
CREATE POLICY "Team members can create likes"
  ON cricket_gallery_likes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND post_id IN (SELECT id FROM cricket_gallery WHERE is_team_member(team_id))
  );

DROP POLICY IF EXISTS "Team members can add reactions" ON cricket_comment_reactions;
CREATE POLICY "Team members can add reactions"
  ON cricket_comment_reactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND comment_id IN (SELECT id FROM cricket_gallery_comments WHERE is_team_member(team_id))
  );


-- ============================================================
-- S5. Storage — team-scoped gallery-photos policies
-- ============================================================
-- gallery-photos: the old policies gated on has_cricket_access() (ANY active
-- membership on ANY team), so an active member of team A could list, upload
-- to and delete team B's photos. Object names are {season_id}/{post_id}_{i}.jpg
-- (GalleryUpload.tsx), so the first folder maps to a season, which maps to a
-- team. Compared as text on purpose: no uuid cast to blow up on odd paths.

DROP POLICY IF EXISTS "Cricket users can view gallery photos" ON storage.objects;
DROP POLICY IF EXISTS "Cricket users can upload gallery photos" ON storage.objects;
DROP POLICY IF EXISTS "Cricket users can delete gallery photos" ON storage.objects;
DROP POLICY IF EXISTS "Team members can view gallery photos" ON storage.objects;
DROP POLICY IF EXISTS "Team members can upload gallery photos" ON storage.objects;
DROP POLICY IF EXISTS "Team members can delete gallery photos" ON storage.objects;

CREATE POLICY "Team members can view gallery photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'gallery-photos'
  AND (
    is_global_admin()
    OR (storage.foldername(name))[1] IN (
      SELECT s.id::text FROM public.cricket_seasons s
      WHERE s.team_id IN (SELECT * FROM public.user_team_ids())
    )
  )
);

CREATE POLICY "Team members can upload gallery photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'gallery-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.cricket_seasons s
    WHERE s.team_id IN (SELECT * FROM public.user_team_ids())
  )
);

CREATE POLICY "Team members can delete gallery photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'gallery-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.cricket_seasons s
    WHERE s.team_id IN (SELECT * FROM public.user_team_ids())
  )
);


-- ============================================================
-- S6. receipt_urls — https only
-- ============================================================
-- Any team member can INSERT a split with arbitrary receipt_urls, and the app
-- opens those URLs on click. The client now refuses non-https (lib/safe-url.ts);
-- this CHECK keeps javascript:/data: values out of the database too. NOT VALID
-- so existing rows can never block the migration; new and updated rows are
-- checked immediately. Optional, once you have eyeballed the data:
--   ALTER TABLE <t> VALIDATE CONSTRAINT <name>;

CREATE OR REPLACE FUNCTION public.all_https_urls(urls TEXT[])
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(bool_and(
    u ~* '^https://'
    OR (u ~ '^/storage/[a-z0-9-]+/' AND u !~ '\.\.')
  ), true)
  FROM unnest(urls) AS u;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cricket_splits_receipt_urls_https') THEN
    ALTER TABLE public.cricket_splits
      ADD CONSTRAINT cricket_splits_receipt_urls_https
      CHECK (receipt_urls IS NULL OR public.all_https_urls(receipt_urls)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cricket_expenses_receipt_urls_https') THEN
    ALTER TABLE public.cricket_expenses
      ADD CONSTRAINT cricket_expenses_receipt_urls_https
      CHECK (receipt_urls IS NULL OR public.all_https_urls(receipt_urls)) NOT VALID;
  END IF;
END $$;
