-- Check if a cricket player exists with a given email (for auto-approve on signup)
-- SECURITY DEFINER bypasses RLS so unauthenticated signups can check
CREATE OR REPLACE FUNCTION check_cricket_player_email(check_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM cricket_players
    WHERE email = check_email AND is_active = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_cricket_player_email(TEXT) TO anon;
