-- ============================================================
-- Accept Invite v2: Pending approval for unknown players
-- ============================================================
-- Pre-added players (email match) → auto-approved
-- Existing players from other teams → auto-approved
-- Unknown emails → pending approval (admin must approve)
-- ============================================================

CREATE OR REPLACE FUNCTION accept_invite(p_token UUID)
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get user's email
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  -- Validate and lock the invite
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

  -- Check if player was pre-added by admin (email match on this team)
  v_is_pre_added := EXISTS (
    SELECT 1 FROM cricket_players
    WHERE team_id = v_invite.team_id
      AND lower(email) = lower(v_user_email)
      AND is_active = true
  );

  -- Check if player exists on any other team (already verified)
  v_is_existing_player := EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid()
      AND team_id != v_invite.team_id
  );

  -- Unknown player needs admin approval
  v_needs_approval := NOT v_is_pre_added AND NOT v_is_existing_player;

  -- Add user to team (skip if already a member)
  INSERT INTO team_members (team_id, user_id, role)
  VALUES (v_invite.team_id, auth.uid(), 'player')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  -- Add cricket access + features
  UPDATE profiles
  SET access = CASE
    WHEN NOT (access @> '{cricket}') THEN array_append(access, 'cricket')
    ELSE access
  END,
  features = CASE
    WHEN NOT (features @> '{cricket}') THEN array_append(features, 'cricket')
    ELSE features
  END,
  -- Only auto-approve if pre-added or existing player
  approved = CASE
    WHEN v_needs_approval AND approved = true THEN true  -- don't downgrade existing approved users
    WHEN v_needs_approval THEN false
    ELSE true
  END
  WHERE id = auth.uid();

  -- Increment use count
  UPDATE team_invites SET use_count = use_count + 1 WHERE id = v_invite.id;

  -- Link player record if pre-added
  IF v_is_pre_added THEN
    UPDATE cricket_players
    SET user_id = auth.uid()
    WHERE team_id = v_invite.team_id
      AND lower(email) = lower(v_user_email)
      AND is_active = true
      AND user_id IS NULL;
  END IF;

  RETURN json_build_object(
    'success', true,
    'team_id', v_invite.team_id,
    'team_name', v_invite.team_name,
    'team_slug', v_invite.team_slug,
    'pending_approval', v_needs_approval
  );
END;
$$;

GRANT EXECUTE ON FUNCTION accept_invite(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
