-- ============================================================
-- Cricket Team Expenses — Database Schema (Shared Team Model)
-- ============================================================
-- All cricket data is team-wide. Any user with 'cricket' access
-- can read. Only users with 'admin' access can create/edit/delete.
-- user_id is kept on records for audit trail only.
-- Pool Fund model: fees + sponsorships - expenses = balance

-- ── Helper functions ───────────────────────────────────────
CREATE OR REPLACE FUNCTION has_cricket_access()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND access @> '{cricket}'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_cricket_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND access @> '{admin}'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ── Players ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cricket_players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  jersey_number INTEGER,
  phone         TEXT,
  player_role   TEXT,           -- 'batsman' | 'bowler' | 'all-rounder' | 'keeper'
  batting_style TEXT,           -- 'right' | 'left'
  bowling_style TEXT,           -- 'pace' | 'medium' | 'spin'
  cricclub_id   TEXT,
  shirt_size    TEXT,           -- 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL'
  email         TEXT,
  designation   TEXT,           -- 'captain' | 'vice-captain'
  photo_url     TEXT,           -- Supabase Storage public URL (player-photos bucket)
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read players" ON cricket_players FOR SELECT USING (has_cricket_access());
CREATE POLICY "Admin can manage players" ON cricket_players FOR INSERT WITH CHECK (is_cricket_admin());
CREATE POLICY "Admin can update players" ON cricket_players FOR UPDATE USING (is_cricket_admin());
CREATE POLICY "Admin can delete players" ON cricket_players FOR DELETE USING (is_cricket_admin());

CREATE TRIGGER set_cricket_players_updated_at BEFORE UPDATE ON cricket_players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Seasons ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cricket_seasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  year        INTEGER NOT NULL,
  season_type TEXT,             -- 'spring' | 'summer' | 'fall'
  share_token UUID DEFAULT gen_random_uuid(),
  fee_amount  NUMERIC(10,2) DEFAULT 60,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read seasons" ON cricket_seasons FOR SELECT USING (has_cricket_access());
CREATE POLICY "Admin can manage seasons" ON cricket_seasons FOR INSERT WITH CHECK (is_cricket_admin());
CREATE POLICY "Admin can update seasons" ON cricket_seasons FOR UPDATE USING (is_cricket_admin());
CREATE POLICY "Admin can delete seasons" ON cricket_seasons FOR DELETE USING (is_cricket_admin());

CREATE TRIGGER set_cricket_seasons_updated_at BEFORE UPDATE ON cricket_seasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Expenses (pool fund model — no paid_by player) ──────────
CREATE TABLE IF NOT EXISTS cricket_expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  season_id    UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  paid_by      UUID REFERENCES cricket_players(id) ON DELETE SET NULL,  -- legacy, nullable
  category     TEXT NOT NULL,   -- 'ground' (jerseys) | 'equipment' (cricket kit) | 'tournament' | 'food' | 'other'
  description  TEXT,
  amount       NUMERIC(10,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by   TEXT DEFAULT NULL,
  updated_by   TEXT DEFAULT NULL,
  deleted_at   TIMESTAMPTZ DEFAULT NULL,
  deleted_by   TEXT DEFAULT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read expenses" ON cricket_expenses FOR SELECT USING (has_cricket_access());
CREATE POLICY "Admin can manage expenses" ON cricket_expenses FOR INSERT WITH CHECK (is_cricket_admin());
CREATE POLICY "Admin can update expenses" ON cricket_expenses FOR UPDATE USING (is_cricket_admin());
CREATE POLICY "Admin can delete expenses" ON cricket_expenses FOR DELETE USING (is_cricket_admin());

CREATE TRIGGER set_cricket_expenses_updated_at BEFORE UPDATE ON cricket_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Season Fees (per-player fee tracking) ───────────────────
CREATE TABLE IF NOT EXISTS cricket_season_fees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES cricket_players(id) ON DELETE CASCADE,
  amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_date   DATE,
  marked_by   TEXT,             -- who recorded the payment
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(season_id, player_id)
);

ALTER TABLE cricket_season_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read fees" ON cricket_season_fees FOR SELECT USING (has_cricket_access());
CREATE POLICY "Admin can manage fees" ON cricket_season_fees FOR INSERT WITH CHECK (is_cricket_admin());
CREATE POLICY "Admin can update fees" ON cricket_season_fees FOR UPDATE USING (is_cricket_admin());
CREATE POLICY "Admin can delete fees" ON cricket_season_fees FOR DELETE USING (is_cricket_admin());

-- ── Sponsorships (income to pool fund) ──────────────────────
CREATE TABLE IF NOT EXISTS cricket_sponsorships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  sponsor_name    TEXT NOT NULL,
  amount          NUMERIC(10,2) NOT NULL,
  sponsored_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_by      TEXT,
  updated_by      TEXT,
  deleted_at      TIMESTAMPTZ DEFAULT NULL,
  deleted_by      TEXT DEFAULT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_sponsorships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read sponsorships" ON cricket_sponsorships FOR SELECT USING (has_cricket_access());
CREATE POLICY "Admin can manage sponsorships" ON cricket_sponsorships FOR INSERT WITH CHECK (is_cricket_admin());
CREATE POLICY "Admin can update sponsorships" ON cricket_sponsorships FOR UPDATE USING (is_cricket_admin());
CREATE POLICY "Admin can delete sponsorships" ON cricket_sponsorships FOR DELETE USING (is_cricket_admin());

-- ── Profiles: Role-based access columns ─────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access text[] DEFAULT '{toolkit}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS player_meta JSONB DEFAULT NULL;

-- ── Welcome post function (called by trigger + RPC) ─────────────
-- Creates a welcome post in Moments and notifies all active players.
-- Uses SECURITY DEFINER to bypass RLS (trigger context has no auth.uid).
CREATE OR REPLACE FUNCTION post_welcome_message(
  new_user_id UUID,
  player_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  season_id UUID;
  post_id UUID;
  welcome_messages TEXT[] := ARRAY[
    'Welcome to the squad, %s! Let''s make this season one for the books',
    '%s has joined the team! Another warrior in the dugout',
    'Big welcome to %s! The team just got stronger',
    '%s is officially a Sunriser! Time to hit the ground running',
    'Welcome aboard, %s! Can''t wait to see you on the field',
    'The squad grows! %s joins the Sunrisers family',
    '%s has entered the arena! Welcome to Sunrisers Manteca',
    'New player alert! Welcome %s to the team',
    '%s just leveled up our roster! Welcome to the squad',
    'Say hello to our newest Sunriser — %s! Let''s go'
  ];
  caption TEXT;
BEGIN
  -- Get latest season
  SELECT id INTO season_id FROM cricket_seasons
  ORDER BY year DESC, created_at DESC LIMIT 1;

  IF season_id IS NULL THEN RETURN; END IF;

  -- Pick random welcome message
  caption := format(
    welcome_messages[1 + floor(random() * array_length(welcome_messages, 1))::int],
    player_name
  ) || ' @' || player_name || ' @Everyone';

  -- Create welcome post
  INSERT INTO cricket_gallery (user_id, season_id, photo_url, caption, posted_by)
  VALUES (new_user_id, season_id, '/cricket-logo.png', caption, 'Sunrisers Manteca')
  RETURNING id INTO post_id;

  -- Notify all active players (except the new player)
  INSERT INTO cricket_notifications (user_id, post_id, type, message, is_read)
  SELECT DISTINCT cp.user_id, post_id, 'tag', player_name || ' joined the team!', false
  FROM cricket_players cp
  WHERE cp.is_active = true AND cp.user_id != new_user_id;
END;
$$;

-- RPC wrapper so client-side can call it after manual approval
CREATE OR REPLACE FUNCTION create_welcome_post(new_user_id UUID, player_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM post_welcome_message(new_user_id, player_name);
END;
$$;

GRANT EXECUTE ON FUNCTION create_welcome_post(UUID, TEXT) TO authenticated;

-- ── Handle new user trigger (reads access/approved/player meta) ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_access TEXT;
  user_access TEXT[];
  user_approved BOOLEAN;
  meta JSONB;
BEGIN
  raw_access := NEW.raw_user_meta_data->>'access';

  IF raw_access IS NOT NULL THEN
    user_access := ARRAY[raw_access];
  ELSE
    user_access := '{toolkit}';
  END IF;

  user_approved := COALESCE(
    (NEW.raw_user_meta_data->>'approved')::boolean,
    true
  );

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

  INSERT INTO public.profiles (id, email, full_name, access, approved, player_meta)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    user_access,
    user_approved,
    meta
  );

  -- Auto-approved cricket player: claim pre-added player record
  -- Links user_id and overwrites with player's own signup preferences
  IF raw_access = 'cricket' AND user_approved THEN
    UPDATE cricket_players
    SET user_id = NEW.id,
        name = COALESCE(NEW.raw_user_meta_data->>'full_name', name),
        jersey_number = COALESCE((NEW.raw_user_meta_data->>'jersey_number')::integer, jersey_number),
        player_role = COALESCE(NEW.raw_user_meta_data->>'player_role', player_role),
        batting_style = COALESCE(NEW.raw_user_meta_data->>'batting_style', batting_style),
        bowling_style = COALESCE(NEW.raw_user_meta_data->>'bowling_style', bowling_style),
        shirt_size = COALESCE(NEW.raw_user_meta_data->>'shirt_size', shirt_size),
        updated_at = now()
    WHERE lower(email) = lower(NEW.email) AND is_active = true;

    -- Auto-post welcome message in Moments
    PERFORM post_welcome_message(
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Auto-approve: check if player email exists ───────────────
CREATE OR REPLACE FUNCTION check_cricket_player_email(check_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM cricket_players WHERE lower(email) = lower(check_email) AND is_active = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_cricket_player_email(TEXT) TO anon;

-- ── Public season data function (bypasses RLS) ───────────────
CREATE OR REPLACE FUNCTION get_public_season_data(token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  season_rec RECORD;
BEGIN
  SELECT id, name, year, season_type, fee_amount
  INTO season_rec
  FROM cricket_seasons
  WHERE share_token = token AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Season not found');
  END IF;

  SELECT json_build_object(
    'season', json_build_object(
      'name', season_rec.name, 'year', season_rec.year,
      'season_type', season_rec.season_type, 'fee_amount', season_rec.fee_amount
    ),
    'players', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', p.id, 'name', p.name, 'jersey_number', p.jersey_number,
        'player_role', p.player_role, 'designation', p.designation, 'is_active', p.is_active
      )), '[]'::json)
      FROM cricket_players p WHERE p.is_active = true
    ),
    'expenses', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', e.id, 'category', e.category, 'description', e.description,
        'amount', e.amount, 'expense_date', e.expense_date
      )), '[]'::json)
      FROM cricket_expenses e WHERE e.season_id = season_rec.id AND e.deleted_at IS NULL
    ),
    'fees', (
      SELECT COALESCE(json_agg(json_build_object(
        'player_id', f.player_id, 'amount_paid', f.amount_paid, 'paid_date', f.paid_date
      )), '[]'::json)
      FROM cricket_season_fees f WHERE f.season_id = season_rec.id
    ),
    'sponsorships', (
      SELECT COALESCE(json_agg(json_build_object(
        'sponsor_name', sp.sponsor_name, 'amount', sp.amount,
        'sponsored_date', sp.sponsored_date, 'notes', sp.notes
      )), '[]'::json)
      FROM cricket_sponsorships sp WHERE sp.season_id = season_rec.id AND sp.deleted_at IS NULL
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_season_data(UUID) TO anon;

-- ── Signed-up player emails (bypasses RLS, checks auth.users) ──
-- WHY: Player cards show signup status dots. Regular admins can't
--      read all profiles due to RLS, so this SECURITY DEFINER function
--      checks auth.users directly. Case-insensitive comparison.
CREATE OR REPLACE FUNCTION get_signed_up_emails(check_emails TEXT[])
RETURNS TEXT[] AS $$
  SELECT ARRAY(
    SELECT LOWER(email) FROM auth.users
    WHERE LOWER(email) = ANY(SELECT LOWER(unnest(check_emails)))
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── Gallery (team photo feed per season) ─────────────────────

CREATE TABLE IF NOT EXISTS cricket_gallery (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id     UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url     TEXT NOT NULL,
  caption       TEXT,
  posted_by     TEXT,              -- player name (denormalized for display)
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_gallery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read gallery" ON cricket_gallery FOR SELECT USING (has_cricket_access());
CREATE POLICY "Cricket users can create posts" ON cricket_gallery FOR INSERT WITH CHECK (has_cricket_access());
CREATE POLICY "Own user can soft-delete posts" ON cricket_gallery FOR UPDATE USING (has_cricket_access() AND user_id = auth.uid());

-- Player tags on gallery posts
CREATE TABLE IF NOT EXISTS cricket_gallery_tags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES cricket_gallery(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES cricket_players(id) ON DELETE CASCADE,
  UNIQUE(post_id, player_id)
);

ALTER TABLE cricket_gallery_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read tags" ON cricket_gallery_tags FOR SELECT USING (has_cricket_access());
CREATE POLICY "Cricket users can create tags" ON cricket_gallery_tags FOR INSERT WITH CHECK (has_cricket_access());

-- Comments on gallery posts
CREATE TABLE IF NOT EXISTS cricket_gallery_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES cricket_gallery(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_by    TEXT,              -- player name (denormalized)
  text          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_gallery_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read comments" ON cricket_gallery_comments FOR SELECT USING (has_cricket_access());
CREATE POLICY "Cricket users can create comments" ON cricket_gallery_comments FOR INSERT WITH CHECK (has_cricket_access());
CREATE POLICY "Own user can update comments" ON cricket_gallery_comments FOR UPDATE USING (has_cricket_access() AND user_id = auth.uid());
CREATE POLICY "Own or admin can delete comments" ON cricket_gallery_comments FOR DELETE USING (has_cricket_access() AND (user_id = auth.uid() OR is_cricket_admin()));

-- Likes on gallery posts
CREATE TABLE IF NOT EXISTS cricket_gallery_likes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES cricket_gallery(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  liked_by      TEXT,               -- player name (denormalized for display)
  UNIQUE(post_id, user_id)
);

ALTER TABLE cricket_gallery_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read likes" ON cricket_gallery_likes FOR SELECT USING (has_cricket_access());
CREATE POLICY "Cricket users can create likes" ON cricket_gallery_likes FOR INSERT WITH CHECK (has_cricket_access());
CREATE POLICY "Users can remove own likes" ON cricket_gallery_likes FOR DELETE USING (has_cricket_access() AND user_id = auth.uid());

-- Emoji reactions on comments
CREATE TABLE IF NOT EXISTS cricket_comment_reactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id    UUID NOT NULL REFERENCES cricket_gallery_comments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji         TEXT NOT NULL,       -- emoji character e.g. '🔥', '😂', '❤️', '👏', '💯'
  UNIQUE(comment_id, user_id, emoji)
);

ALTER TABLE cricket_comment_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cricket users can read reactions" ON cricket_comment_reactions FOR SELECT USING (has_cricket_access());
CREATE POLICY "Cricket users can add reactions" ON cricket_comment_reactions FOR INSERT WITH CHECK (has_cricket_access());
CREATE POLICY "Users can remove own reactions" ON cricket_comment_reactions FOR DELETE USING (has_cricket_access() AND user_id = auth.uid());

-- Notifications for gallery activity (tags, comments, likes)
CREATE TABLE IF NOT EXISTS cricket_notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id       UUID NOT NULL REFERENCES cricket_gallery(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,       -- 'tag' | 'comment' | 'like'
  message       TEXT NOT NULL,
  is_read       BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cricket_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications" ON cricket_notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Cricket users can create notifications" ON cricket_notifications FOR INSERT WITH CHECK (has_cricket_access());
CREATE POLICY "Users can update own notifications" ON cricket_notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own notifications" ON cricket_notifications FOR DELETE USING (user_id = auth.uid());

-- ── Storage: gallery-photos bucket ──────────────────────────────
-- Public bucket, 5MB limit, image/* MIME types
-- Path pattern: {season_id}/{post_id}.jpg
-- Any cricket user can upload (team-shared, not restricted by user_id path)

CREATE POLICY "Cricket users can view gallery photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'gallery-photos' AND has_cricket_access());

CREATE POLICY "Cricket users can upload gallery photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'gallery-photos' AND has_cricket_access());

CREATE POLICY "Cricket users can delete gallery photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'gallery-photos' AND has_cricket_access());

-- ── Storage: player-photos bucket ─────────────────────────────
-- WHY: Player photos stored in Supabase Storage. Bucket is public
--      for read access. Only the player themselves can upload/edit/delete
--      their own photo (matched by auth.uid() in the folder path).
-- Bucket: player-photos (public, 2MB limit, image/jpeg + image/png + image/webp)
-- Path pattern: {user_id}/{player_id}.jpg

CREATE POLICY "Cricket users can view photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'player-photos' AND has_cricket_access());

CREATE POLICY "Players can upload own photo"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'player-photos' AND has_cricket_access() AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Players can update own photo"
ON storage.objects FOR UPDATE
USING (bucket_id = 'player-photos' AND has_cricket_access() AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Players can delete own photo"
ON storage.objects FOR DELETE
USING (bucket_id = 'player-photos' AND has_cricket_access() AND (storage.foldername(name))[1] = auth.uid()::text);
