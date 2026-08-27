-- ============================================================
-- Umpiring Duties — Database Schema
-- ============================================================
-- MTCA assigns each league match two umpire slots, naming a TEAM per slot.
-- When a slot names our team, one of our players has to stand. This schema
-- stores one row per DUTY SLOT (not per match), because a single match may
-- give us one slot or both.
--
-- Design constraints:
--   • ADDITIVE ONLY on existing tables. The only object this file creates
--     against a pre-existing table is one partial index on cricket_seasons
--     (Section 0), explicitly approved by the user. No columns are added,
--     altered or dropped anywhere; no rows are touched.
--   • Team-scoped RLS matching the multi-team pattern:
--       SELECT               → user_team_ids() or is_global_admin()
--       INSERT/UPDATE/DELETE → is_team_admin(team_id) or is_global_admin()
--   • Players never get UPDATE rights. Self-claim goes through the
--     claim/release RPCs in Section 6, mirroring the existing claim_scorer.
--   • IDEMPOTENT. Safe to paste into the Supabase SQL editor repeatedly.
--
-- Swap handling (teams trade duties offline; MTCA is never updated):
--   • Duty handed to another team → admin soft-deletes (deleted_at).
--   • Duty taken over from another team → admin inserts source='swap_in'
--     with swap_team naming the other side, and cricclubs_fixture_id NULL.
--   The sync INSERTs if absent and PATCHes ONLY MTCA's own facts. That rule
--   is enforced structurally by the trigger in Section 4, not left to the
--   script to honour.
--
-- Review history: findings from SQL, architecture, design and QA reviews are
-- folded in. Notable ones are annotated inline as [ARCH-xx] / [DESIGN-xx].

-- ════════════════════════════════════════════════════════════
-- SECTION 0: Season resolution guard  [ARCH-C2]
-- ════════════════════════════════════════════════════════════
-- The sync must resolve exactly ONE active season per team to file duties
-- against. Two seasons are active today (one per team) and nothing stopped a
-- second from being activated on the same team, which would make the sync
-- pick arbitrarily and file every duty under the wrong team.
--
-- This is an INDEX, not an ALTER: it adds no column and touches no row.
-- Current data already satisfies it (one active season per team).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cricket_seasons_one_active_per_team
  ON cricket_seasons (team_id)
  WHERE is_active;

-- ════════════════════════════════════════════════════════════
-- SECTION 1: Per-season duty target
-- ════════════════════════════════════════════════════════════
-- "Every player should stand at least once per season" — stored so the rule
-- can be raised without a code change. Its own table specifically so that
-- cricket_seasons needs no new column.

CREATE TABLE IF NOT EXISTS cricket_umpiring_settings (
  season_id   UUID PRIMARY KEY REFERENCES cricket_seasons(id) ON DELETE CASCADE,
  team_id     UUID NOT NULL REFERENCES cricket_teams(id),
  duty_target SMALLINT NOT NULL DEFAULT 1,

  -- [QA-DISCOVERY-A] Our team's NUMERIC cricclubs id for this season's league
  -- (Sunrisers Manteca = 1014 in league 87). Every umpire cell on the fixtures
  -- page is an <a href="…viewTeam.do?teamId=NNNN">, so "is this slot ours?" is
  -- an integer equality rather than a string match. That removes the entire
  -- class of name-matching bugs — prefix drift ("MTCA " present or absent),
  -- casing, zero-width characters, and the confusables that actually exist in
  -- this league ("Sky Risers" / "Risers" / "Valley Risers", and our own second
  -- team "Manteca Top Guns" sharing the token "Manteca").
  --
  -- It also fixes the one failure that is otherwise undetectable: if MTCA
  -- renames the team, a name match silently returns zero duties forever while
  -- reporting success. An id match is immune.
  --
  -- Lives here rather than on cricket_seasons or cricket_teams because the id
  -- is league-scoped and this table is new (no ALTER on existing tables).
  cricclubs_team_id BIGINT,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE cricket_umpiring_settings IS
  'Per-season umpiring duty target. Absent row means the default of 1.';

-- ════════════════════════════════════════════════════════════
-- SECTION 2: Duty slots
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cricket_umpiring_duties (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id              UUID NOT NULL REFERENCES cricket_teams(id),
  season_id            UUID NOT NULL REFERENCES cricket_seasons(id) ON DELETE CASCADE,

  -- Identity of the slot on the MTCA fixture list. NULL fixture id means the
  -- duty did not come from MTCA (we took it over offline), which is also what
  -- keeps the sync from ever seeing or touching it.
  cricclubs_fixture_id BIGINT,
  role_slot            SMALLINT NOT NULL,   -- 1 = Umpire1 column, 2 = Umpire2

  -- MTCA's facts about the match being umpired. The ONLY fields the sync may
  -- refresh on an existing row (enforced in Section 4).
  match_date           DATE NOT NULL,
  match_time           TEXT,                -- 'HH:MM' 24h, matching schedule schema
  venue                TEXT,
  team_a               TEXT NOT NULL,       -- the two sides playing (usually not us)
  team_b               TEXT NOT NULL,
  match_type           TEXT,                -- 'league' | 'practice' | NULL

  -- [QA-DISCOVERY-A] The numeric cricclubs team id parsed from the umpire
  -- cell's href. This is what the extractor MATCHED ON to decide the slot is
  -- ours; stored so a spurious duty can be traced to the exact id.
  umpire_team_cricclubs_id BIGINT,
  -- [DESIGN-B2] The exact string MTCA published for this slot. Diagnostic
  -- only: when a duty is missing or spurious, this distinguishes a parser bug
  -- from a fixture-list change without re-saving the page from a browser.
  umpire_team_raw      TEXT,

  -- 'mtca'    — published by MTCA and assigned to us
  -- 'swap_in' — we took this on from another team offline  [DESIGN-B1]
  -- 'manual'  — admin-invented (practice, or a duty MTCA never published)
  source               TEXT NOT NULL DEFAULT 'manual',
  swap_team            TEXT,                -- the other club in a swap, either direction

  -- Assignment. NULL player = open slot awaiting a volunteer.
  assigned_player_id   UUID REFERENCES cricket_players(id) ON DELETE SET NULL,
  -- [ARCH-H3] Name snapshot. cricket_players has no deleted_at, so players are
  -- HARD deleted (PlayerManager.tsx:1527). Without this, ON DELETE SET NULL
  -- would both break chk_umpiring_assignment and silently erase who stood.
  assigned_player_name TEXT,
  assigned_by          TEXT,                -- 'self' or the admin's name
  assigned_at          TIMESTAMPTZ,

  status               TEXT NOT NULL DEFAULT 'open',
  -- [QA-H3] 'cancelled' was overloaded — it could not distinguish "an admin
  -- cancelled this" from "the sync saw MTCA take it away", which made a safe
  -- revive rule impossible: if MTCA re-lists us on a later run there was no
  -- way to know whether reopening the slot would stomp a human decision.
  cancelled_reason     TEXT,                -- 'admin' | 'mtca_removed'
  completed_by         TEXT,                -- admin who closed it out
  completed_at         TIMESTAMPTZ,
  notes                TEXT,                -- visible to the whole team

  -- [ARCH-M1] Set by the sync when a still-upcoming MTCA fixture is present on
  -- the page but NO LONGER names us — i.e. MTCA reassigned the slot away.
  -- Never auto-deleted: the duty may already be claimed, or the reassignment
  -- may be our own swap. Surfaced to admins as a review item.
  mtca_removed_at      TIMESTAMPTZ,

  deleted_at           TIMESTAMPTZ DEFAULT NULL,  -- tombstone; see unique index
  deleted_by           TEXT DEFAULT NULL,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- ── CHECK constraints (idempotent) ────────────────────────
DO $$
BEGIN
  -- MTCA's fixtures page has exactly two umpire columns (Umpire1, Umpire2), so
  -- a SYNCED duty is always slot 1 or 2 — the extractor cannot produce more.
  -- The range is wider than that on purpose: allocation varies match to match
  -- (one spot, two spots on one match, one spot each to two different teams),
  -- and a hand-added swap_in/manual duty may legitimately need a third or
  -- fourth person that MTCA has no column to publish. Widening a CHECK on a
  -- new empty table is free; doing it later is a migration.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_umpiring_role_slot') THEN
    ALTER TABLE cricket_umpiring_duties
      ADD CONSTRAINT chk_umpiring_role_slot CHECK (role_slot BETWEEN 1 AND 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_umpiring_source') THEN
    ALTER TABLE cricket_umpiring_duties
      ADD CONSTRAINT chk_umpiring_source CHECK (source IN ('mtca', 'swap_in', 'manual'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_umpiring_status') THEN
    ALTER TABLE cricket_umpiring_duties
      ADD CONSTRAINT chk_umpiring_status
      CHECK (status IN ('open', 'claimed', 'completed', 'no_show', 'cancelled'));
  END IF;

  -- [SQL-C1] Constrains ONLY the 'open' direction, deliberately.
  --
  -- The earlier version also required a player id for 'claimed' and
  -- 'completed'. That made hard-deleting a player FAIL: cricket_players has no
  -- deleted_at, so PlayerManager's "Delete Permanently" / "Leave Team" issues a
  -- real DELETE; the FK's ON DELETE SET NULL then runs as an ordinary UPDATE,
  -- CHECK constraints ARE evaluated on it, and the whole delete aborts with
  -- error 23514. PlayerManager.tsx:1527 does not inspect the error and fires
  -- toast.success anyway — so the admin is told it worked, the row survives,
  -- and it reappears on reload.
  --
  -- This still forbids the state that actually matters (an "open" slot that
  -- secretly has someone on it) while making an orphaned completed duty a
  -- legal, honest state. assigned_player_name preserves who stood.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_umpiring_assignment') THEN
    ALTER TABLE cricket_umpiring_duties
      ADD CONSTRAINT chk_umpiring_assignment CHECK (
        status <> 'open'
        OR (assigned_player_id IS NULL AND assigned_at IS NULL)
      );
  END IF;

  -- [SQL-M4] Was a strict biconditional, which made 'completed' → 'cancelled'
  -- impossible: cancelling kept completed_at set and was rejected, while
  -- clearing completed_at to satisfy it destroyed the record of when the duty
  -- happened. 'cancelled' may now retain a prior completion stamp.
  --
  -- STORE CONTRACT: status and completed_at must move in the SAME update.
  -- Marking complete → set both. Reversing a mistaken completion back to
  -- 'claimed' → clear both. Two sequential PATCHes will fail on the first.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_umpiring_completed_at') THEN
    ALTER TABLE cricket_umpiring_duties
      ADD CONSTRAINT chk_umpiring_completed_at CHECK (
        CASE status
          WHEN 'completed' THEN completed_at IS NOT NULL
          WHEN 'no_show'   THEN completed_at IS NOT NULL
          WHEN 'cancelled' THEN true
          ELSE completed_at IS NULL
        END
      );
  END IF;

  -- [QA-H3] Reason is required exactly when the duty is cancelled, so the
  -- revive rule can tell a human decision from a sync observation.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_umpiring_cancelled_reason') THEN
    ALTER TABLE cricket_umpiring_duties
      ADD CONSTRAINT chk_umpiring_cancelled_reason CHECK (
        (status = 'cancelled') = (cancelled_reason IS NOT NULL)
        AND (cancelled_reason IS NULL
             OR cancelled_reason IN ('admin', 'mtca_removed'))
      );
  END IF;

  -- [SQL-M6] The parser emits cricclubs' raw text, so without a CHECK this
  -- column silently accumulates whatever vocabulary MTCA uses. The sync must
  -- normalize before writing.
  --
  -- Deliberately DIFFERENT from cricket_schedule_matches.match_type:
  --   • 'practice' is EXCLUDED. Umpiring duties only ever come from MTCA's
  --     league and playoff fixtures — nobody is assigned to umpire a practice
  --     match, so allowing it would only invite bad data.
  --   • 'semi_final' and 'final' are INCLUDED. The real league-wide fixtures
  --     page carries both, and duties do get assigned on them. The existing
  --     normalizeMatchType maps them to NULL, which would silently drop the
  --     fact that a duty is for a final — worth showing on the card.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_umpiring_match_type') THEN
    ALTER TABLE cricket_umpiring_duties
      ADD CONSTRAINT chk_umpiring_match_type CHECK (
        match_type IS NULL
        OR match_type IN ('league', 'semi_final', 'final')
      );
  END IF;

  -- [SQL-L11] match_time is TEXT to mirror the schedule schema. Sync-written
  -- values are zero-padded by parseTime12To24 so they sort correctly as text;
  -- the exposure is admin manual entry, where one '9:00 AM' silently breaks
  -- within-day ordering.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_umpiring_match_time') THEN
    ALTER TABLE cricket_umpiring_duties
      ADD CONSTRAINT chk_umpiring_match_time CHECK (
        match_time IS NULL OR match_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      );
  END IF;

  -- An MTCA-published duty must carry the fixture id that identifies it.
  -- swap_in and manual duties deliberately have none.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_umpiring_mtca_fixture') THEN
    ALTER TABLE cricket_umpiring_duties
      ADD CONSTRAINT chk_umpiring_mtca_fixture CHECK (
        source <> 'mtca' OR cricclubs_fixture_id IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_umpiring_duty_target') THEN
    ALTER TABLE cricket_umpiring_settings
      ADD CONSTRAINT chk_umpiring_duty_target CHECK (duty_target BETWEEN 0 AND 20);
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────
-- Sync identity key. Three deliberate details — DO NOT "tidy" any of them:
--
--  1. NO `WHERE cricclubs_fixture_id IS NOT NULL` predicate  [SQL-H2].
--     Postgres accepts a PARTIAL unique index as an ON CONFLICT arbiter only
--     if the statement repeats the index predicate, and PostgREST's
--     `on_conflict=` parameter emits only a column list — it cannot express a
--     WHERE. With the predicate, every sync upsert fails with 42P10 "no unique
--     or exclusion constraint matching the ON CONFLICT specification".
--     Dropping it is semantically FREE: a unique B-tree treats NULLs as
--     distinct, so manual duties (NULL fixture id) remain as unconstrained as
--     before — the index merely also stores them.
--     Corroborated by the repo: the one cricclubs key that upserts
--     successfully is non-partial (cricket-schema.sql:1968), while the
--     schedule table's partial index is never upserted against — ingest-html
--     does SELECT → diff → PATCH instead.
--
--  2. season_id IS included  [ARCH-H4 / SQL-H3]. cricclubs fixture ids come
--     from the row's deleteRow{N} DOM id, and whether that counter is
--     installation-wide or per-league could not be settled from one saved
--     page. The asymmetry decides it: if ids are global the column is free; if
--     they are not, omitting it lets a 2027 fixture id collide with a 2026 one
--     and the upsert rewrites last season's COMPLETED duty — silently
--     corrupting the record AND hiding the new season's open slot.
--
--  3. NO `deleted_at IS NULL` predicate. A soft-deleted (handed-away) duty
--     must keep occupying its key so the sync cannot resurrect it as a fresh
--     open slot. Two things must hold for this to protect rather than merely
--     error: the sync must NOT filter deleted_at when checking existence (or
--     it concludes "absent", inserts, and hits the unique violation), and it
--     must PATCH only MTCA fact columns. Recovery when MTCA legitimately
--     re-assigns the slot is an admin RESTORE in the Deleted tab — the same
--     Recently-Deleted pattern the schedule and splits pages already use. If
--     that UI is not built, the duty really is unrecoverable in practice.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_umpiring_duty_fixture_slot
  ON cricket_umpiring_duties (team_id, season_id, cricclubs_fixture_id, role_slot);

-- [SQL-L12] Manual and swap_in duties have a NULL fixture id and so no
-- uniqueness at all — an admin double-tapping "Add duty" inserts two rows that
-- both read as open and both inflate the open-slot count. Partial is fine
-- here: nothing upserts against this index, so SQL-H2 does not apply.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_umpiring_duty_manual_slot
  ON cricket_umpiring_duties (team_id, match_date, team_a, team_b, role_slot)
  WHERE cricclubs_fixture_id IS NULL AND deleted_at IS NULL;

-- [SQL-L8] season_id leads, not team_id. RLS contributes
-- `team_id IN (SELECT * FROM user_team_ids())`, which the planner turns into a
-- hashed SubPlan filter rather than an index qual, so a leading team_id earns
-- nothing. The trigger guarantees season_id → team_id anyway.
--
-- STORE CONTRACT: a partial index is only a candidate when the query's WHERE
-- provably implies its predicate. `.eq('season_id', …)` alone does NOT imply
-- `deleted_at IS NULL`, so every duty query MUST include
-- `.is('deleted_at', null)` explicitly — otherwise it is both wrong (shows
-- handed-away duties) and slow (loses the index).
CREATE INDEX IF NOT EXISTS idx_umpiring_duties_season_date
  ON cricket_umpiring_duties (season_id, match_date)
  WHERE deleted_at IS NULL;

-- Per-player counts for the roster metric and the monthly email.
CREATE INDEX IF NOT EXISTS idx_umpiring_duties_player
  ON cricket_umpiring_duties (assigned_player_id, season_id)
  WHERE assigned_player_id IS NOT NULL AND deleted_at IS NULL;

-- Admin review queue for duties MTCA took back.
CREATE INDEX IF NOT EXISTS idx_umpiring_duties_mtca_removed
  ON cricket_umpiring_duties (team_id, season_id)
  WHERE mtca_removed_at IS NOT NULL AND deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════
-- SECTION 3: team_id derivation and assignee validation
-- ════════════════════════════════════════════════════════════
-- team_id is denormalized onto both tables so RLS can check it without a
-- subquery (the pattern used across the cricket schema). A composite FK to
-- cricket_seasons(id, team_id) would enforce it for free but needs a new
-- UNIQUE constraint on cricket_seasons — an ALTER we will not make. A trigger
-- derives team_id from the season instead, so the two can never disagree
-- regardless of what the client sends.
--
-- [ARCH-L3] SECURITY INVOKER, not DEFINER. A team admin can already read their
-- own seasons via the team-members SELECT policy, and under INVOKER an attempt
-- against another team's season raises "season does not exist" rather than an
-- RLS error that would confirm the UUID resolves. The service role bypasses
-- RLS regardless, so the sync is unaffected.

CREATE OR REPLACE FUNCTION umpiring_sync_team_id()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  SELECT team_id INTO v_team_id FROM public.cricket_seasons WHERE id = NEW.season_id;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'season % does not exist', NEW.season_id;
  END IF;
  NEW.team_id := v_team_id;
  RETURN NEW;
END;
$$;

-- [ARCH-M2] assigned_player_id is a bare FK to cricket_players with no team
-- check, so a team-A admin could assign a team-B player's UUID. RLS would then
-- hide the referenced row and the UI would render a blank name while the
-- roster credited nobody. Validate the assignee belongs to the duty's team,
-- and snapshot their name in the same pass.
CREATE OR REPLACE FUNCTION umpiring_validate_assignee()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF NEW.assigned_player_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_name
  FROM public.cricket_players
  WHERE id = NEW.assigned_player_id AND team_id = NEW.team_id;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'player % is not on team %', NEW.assigned_player_id, NEW.team_id;
  END IF;

  NEW.assigned_player_name := v_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_umpiring_duties_team_id ON cricket_umpiring_duties;
CREATE TRIGGER set_umpiring_duties_team_id
  BEFORE INSERT OR UPDATE OF season_id, team_id ON cricket_umpiring_duties
  FOR EACH ROW EXECUTE FUNCTION umpiring_sync_team_id();

DROP TRIGGER IF EXISTS set_umpiring_settings_team_id ON cricket_umpiring_settings;
CREATE TRIGGER set_umpiring_settings_team_id
  BEFORE INSERT OR UPDATE OF season_id, team_id ON cricket_umpiring_settings
  FOR EACH ROW EXECUTE FUNCTION umpiring_sync_team_id();

-- Runs after team_id is settled, so the team check compares against the
-- derived value rather than whatever the client sent.
DROP TRIGGER IF EXISTS validate_umpiring_assignee ON cricket_umpiring_duties;
CREATE TRIGGER validate_umpiring_assignee
  BEFORE INSERT OR UPDATE OF assigned_player_id ON cricket_umpiring_duties
  FOR EACH ROW EXECUTE FUNCTION umpiring_validate_assignee();

-- ── updated_at maintenance (reuses the existing shared trigger fn) ──
DROP TRIGGER IF EXISTS set_cricket_umpiring_duties_updated_at ON cricket_umpiring_duties;
CREATE TRIGGER set_cricket_umpiring_duties_updated_at
  BEFORE UPDATE ON cricket_umpiring_duties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_cricket_umpiring_settings_updated_at ON cricket_umpiring_settings;
CREATE TRIGGER set_cricket_umpiring_settings_updated_at
  BEFORE UPDATE ON cricket_umpiring_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ════════════════════════════════════════════════════════════
-- SECTION 4: Protect human-authored columns from the sync  [ARCH-H1]
-- ════════════════════════════════════════════════════════════
-- The sync writes with the service-role key from an iPhone Scriptable script,
-- which bypasses RLS entirely — but NOT triggers. So the "PATCH only MTCA
-- facts" rule is structurally enforceable, and this is where it is enforced.
--
-- Why this is not paranoia: CLAUDE.md records a prior incident in this very
-- script where a missing `on_conflict` target silently degraded upserts. If a
-- payload builder ever includes table defaults (status:'open',
-- assigned_player_id:null) in a merge-duplicates upsert, PostgREST emits
-- DO UPDATE SET for every column present — resetting every claimed and
-- completed duty in the season in a single weekend run. That is player-
-- authored data, recoverable only from the nightly backup.
--
-- Silently coercing rather than raising is deliberate: the sync is idempotent
-- and should keep making progress on MTCA facts, not abort mid-run.
--
-- CONSEQUENCE, and it is a feature: because `status` is frozen, THE SYNC CAN
-- NEVER CANCEL A DUTY. When MTCA takes a slot back the sync only stamps
-- mtca_removed_at (the one human-facing column left unfrozen, so it can also
-- be CLEARED when MTCA re-lists us). An admin decides whether to cancel.
--
-- That resolves three problems the reviews raised at once:
--   • FLAPPING [QA-H4] — MTCA's page is hand-edited and the sync runs 6× a
--     weekend. A stamp that can be set and cleared is naturally idempotent; an
--     auto-cancel would thrash a player's claim.
--   • REVIVE [QA-H3] — no cancelled row to un-cancel, so there is no ambiguity
--     about whether reopening would stomp a human decision.
--   • ROLE-SLOT SWAP [QA-H1] — MTCA moving us from the umpire1 column to
--     umpire2 must NOT destroy a live claim. The sync reconciles at FIXTURE
--     level by counting how many slots name us and comparing to how many live
--     duties we hold; an unchanged count means do nothing, whatever column
--     moved. Slot-level logic would have cancelled one claim and opened a new
--     empty slot with nobody told.
--
-- The sync must also NEVER cancel on a blank umpire cell (blank means "not yet
-- assigned", not "reassigned"), on a fixture absent from the feed, or on a
-- feed that parsed to zero rows [QA-H5/H6/H7].

CREATE OR REPLACE FUNCTION umpiring_freeze_human_columns()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- nullif(..., '') is NOT optional. current_setting returns NULL when the
  -- setting was never set (fine — NULL::jsonb is NULL), but an EMPTY STRING
  -- when something has explicitly cleared it, and ''::jsonb raises 22P02
  -- "invalid input syntax for type json". Without the nullif, any UPDATE on
  -- this table inside such a session fails outright — including every admin
  -- action in the app. Found by docs/umpiring-rpc-verification.sql.
  IF coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) = 'service_role' THEN
    NEW.status               := OLD.status;
    NEW.cancelled_reason     := OLD.cancelled_reason;
    NEW.assigned_player_id   := OLD.assigned_player_id;
    NEW.assigned_player_name := OLD.assigned_player_name;
    NEW.assigned_by          := OLD.assigned_by;
    NEW.assigned_at          := OLD.assigned_at;
    NEW.completed_by         := OLD.completed_by;
    NEW.completed_at         := OLD.completed_at;
    NEW.deleted_at           := OLD.deleted_at;
    NEW.deleted_by           := OLD.deleted_by;
    NEW.notes                := OLD.notes;
    NEW.swap_team            := OLD.swap_team;
    -- source is frozen too: the sync must never downgrade a swap_in duty.
    NEW.source               := OLD.source;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS freeze_umpiring_human_columns ON cricket_umpiring_duties;
CREATE TRIGGER freeze_umpiring_human_columns
  BEFORE UPDATE ON cricket_umpiring_duties
  FOR EACH ROW EXECUTE FUNCTION umpiring_freeze_human_columns();

-- ════════════════════════════════════════════════════════════
-- SECTION 5: Row Level Security
-- ════════════════════════════════════════════════════════════
-- Players get SELECT only. All mutation is admin-only at the policy level;
-- self-claim is delegated to the RPCs in Section 6 so a player can change
-- ONLY the assignment fields and only on an open slot.
--
-- Note: no_show is readable by every team member and there is no column
-- masking, so hiding it from non-admins is a UI responsibility.

ALTER TABLE cricket_umpiring_duties ENABLE ROW LEVEL SECURITY;
ALTER TABLE cricket_umpiring_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can read umpiring duties" ON cricket_umpiring_duties;
CREATE POLICY "Team members can read umpiring duties"
  ON cricket_umpiring_duties FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

DROP POLICY IF EXISTS "Team admin can create umpiring duties" ON cricket_umpiring_duties;
CREATE POLICY "Team admin can create umpiring duties"
  ON cricket_umpiring_duties FOR INSERT
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());

DROP POLICY IF EXISTS "Team admin can update umpiring duties" ON cricket_umpiring_duties;
CREATE POLICY "Team admin can update umpiring duties"
  ON cricket_umpiring_duties FOR UPDATE
  USING (is_team_admin(team_id) OR is_global_admin());

DROP POLICY IF EXISTS "Team admin can delete umpiring duties" ON cricket_umpiring_duties;
CREATE POLICY "Team admin can delete umpiring duties"
  ON cricket_umpiring_duties FOR DELETE
  USING (is_team_admin(team_id) OR is_global_admin());

DROP POLICY IF EXISTS "Team members can read umpiring settings" ON cricket_umpiring_settings;
CREATE POLICY "Team members can read umpiring settings"
  ON cricket_umpiring_settings FOR SELECT
  USING (team_id IN (SELECT * FROM user_team_ids()) OR is_global_admin());

DROP POLICY IF EXISTS "Team admin can create umpiring settings" ON cricket_umpiring_settings;
CREATE POLICY "Team admin can create umpiring settings"
  ON cricket_umpiring_settings FOR INSERT
  WITH CHECK (is_team_admin(team_id) OR is_global_admin());

DROP POLICY IF EXISTS "Team admin can update umpiring settings" ON cricket_umpiring_settings;
CREATE POLICY "Team admin can update umpiring settings"
  ON cricket_umpiring_settings FOR UPDATE
  USING (is_team_admin(team_id) OR is_global_admin());

-- [ARCH-L1] Present for symmetry. Without it, an admin "reset to default"
-- delete would silently affect zero rows and return no error.
DROP POLICY IF EXISTS "Team admin can delete umpiring settings" ON cricket_umpiring_settings;
CREATE POLICY "Team admin can delete umpiring settings"
  ON cricket_umpiring_settings FOR DELETE
  USING (is_team_admin(team_id) OR is_global_admin());

-- ════════════════════════════════════════════════════════════
-- SECTION 6: Self-claim / release RPCs
-- ════════════════════════════════════════════════════════════
-- Mirrors the existing claim_scorer / release_scorer pair. Two deliberate
-- differences:
--
--  1. Returns a TEXT reason code rather than a bare BOOLEAN, so the UI can
--     explain WHY a claim failed ("someone just took it" vs "you already have
--     the other slot") instead of a generic error.
--  2. Identity resolves against the SET of the caller's player rows, not one
--     row [ARCH-H2]. `LIMIT 1` with no ORDER BY broke three ways: wrong
--     attribution, a permanently unreleaseable duty, and a defeated
--     duplicate-slot check.
--
-- Identity also falls back to a case-insensitive EMAIL match [ARCH-M5 /
-- DESIGN-P0-1]. This is not a nicety: the app resolves "which player am I" by
-- email in 8+ places because user_id is only backfilled opportunistically, and
-- a probe of live data found 2 of 18 active players have no user_id. A
-- user_id-only lookup would show those two a Claim button that always fails.
-- The email path requires a CONFIRMED address so an unverified sign-up cannot
-- be used to claim someone else's roster row. user_id is backfilled on success.
--
-- Reason codes:
--   ok · not_found · not_member · no_player · not_open · past
--   duplicate_slot · not_yours · locked

CREATE OR REPLACE FUNCTION claim_umpiring_duty(p_duty_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_duty       public.cricket_umpiring_duties;
  v_team_id    UUID;
  v_my_players UUID[];
  v_player_id  UUID;
  v_email      TEXT;
  v_today      DATE := (now() AT TIME ZONE 'America/Los_Angeles')::date;
BEGIN
  -- [ARCH-L2] Membership is checked BEFORE taking the row lock, so a user
  -- cannot create lock contention on another team's duties.
  SELECT team_id INTO v_team_id
  FROM public.cricket_umpiring_duties
  WHERE id = p_duty_id AND deleted_at IS NULL;

  IF v_team_id IS NULL THEN RETURN 'not_found'; END IF;

  IF NOT (public.is_team_member(v_team_id) OR public.is_global_admin()) THEN
    RETURN 'not_member';
  END IF;

  -- Lock the slot so two players tapping at once cannot both win.
  SELECT * INTO v_duty
  FROM public.cricket_umpiring_duties
  WHERE id = p_duty_id AND deleted_at IS NULL
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF v_duty.status <> 'open' OR v_duty.assigned_player_id IS NOT NULL THEN
    RETURN 'not_open';
  END IF;

  IF v_duty.match_date < v_today THEN RETURN 'past'; END IF;

  -- Confirmed email for the fallback path.
  SELECT lower(email) INTO v_email
  FROM auth.users
  WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;

  -- ALL of the caller's player rows on this team, deterministically ordered.
  SELECT array_agg(id ORDER BY created_at ASC, id ASC) INTO v_my_players
  FROM public.cricket_players
  WHERE team_id = v_duty.team_id
    AND is_active = true
    AND is_guest = false
    AND (
      user_id = auth.uid()
      OR (v_email IS NOT NULL AND lower(email) = v_email)
    );

  IF v_my_players IS NULL OR array_length(v_my_players, 1) = 0 THEN
    RETURN 'no_player';
  END IF;

  v_player_id := v_my_players[1];

  -- One person cannot stand in both umpire slots of the same match. Matched by
  -- fixture id for MTCA duties, and by a normalized (date, sides) key for
  -- swap_in / manual duties [DESIGN-P2-11] — the case where both slots are
  -- most likely to be ours. LEAST/GREATEST normalizes the ordering because an
  -- admin hand-typing two rows may enter the sides in opposite order.
  IF EXISTS (
    SELECT 1 FROM public.cricket_umpiring_duties d
    WHERE d.team_id = v_duty.team_id
      AND d.id <> v_duty.id
      AND d.deleted_at IS NULL
      AND d.status IN ('claimed', 'completed', 'no_show')
      AND d.assigned_player_id = ANY(v_my_players)
      AND (
        (v_duty.cricclubs_fixture_id IS NOT NULL
          AND d.season_id = v_duty.season_id
          AND d.cricclubs_fixture_id = v_duty.cricclubs_fixture_id)
        OR
        (v_duty.cricclubs_fixture_id IS NULL
          AND d.match_date = v_duty.match_date
          AND LEAST(d.team_a, d.team_b)    = LEAST(v_duty.team_a, v_duty.team_b)
          AND GREATEST(d.team_a, d.team_b) = GREATEST(v_duty.team_a, v_duty.team_b))
      )
  ) THEN
    RETURN 'duplicate_slot';
  END IF;

  UPDATE public.cricket_umpiring_duties
  SET assigned_player_id = v_player_id,
      assigned_by        = 'self',
      assigned_at        = now(),
      status             = 'claimed'
  WHERE id = p_duty_id;

  -- Opportunistic backfill, mirroring accept_invite. Only fills a NULL; never
  -- overwrites an existing link.
  UPDATE public.cricket_players
  SET user_id = auth.uid()
  WHERE id = v_player_id AND user_id IS NULL;

  RETURN 'ok';

EXCEPTION WHEN lock_not_available THEN
  RETURN 'locked';
END;
$$;

CREATE OR REPLACE FUNCTION release_umpiring_duty(p_duty_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_duty       public.cricket_umpiring_duties;
  v_team_id    UUID;
  v_my_players UUID[];
  v_email      TEXT;
  v_is_admin   BOOLEAN;
  v_today      DATE := (now() AT TIME ZONE 'America/Los_Angeles')::date;
BEGIN
  SELECT team_id INTO v_team_id
  FROM public.cricket_umpiring_duties
  WHERE id = p_duty_id AND deleted_at IS NULL;

  IF v_team_id IS NULL THEN RETURN 'not_found'; END IF;

  IF NOT (public.is_team_member(v_team_id) OR public.is_global_admin()) THEN
    RETURN 'not_member';
  END IF;

  v_is_admin := public.is_team_admin(v_team_id) OR public.is_global_admin();

  SELECT * INTO v_duty
  FROM public.cricket_umpiring_duties
  WHERE id = p_duty_id AND deleted_at IS NULL
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  -- Only a live claim can be given up. Once an admin has marked the duty
  -- completed or no_show it is a historical record, not a booking.
  IF v_duty.status <> 'claimed' THEN RETURN 'not_open'; END IF;

  SELECT lower(email) INTO v_email
  FROM auth.users
  WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;

  SELECT array_agg(id) INTO v_my_players
  FROM public.cricket_players
  WHERE team_id = v_duty.team_id
    AND is_active = true
    AND is_guest = false
    AND (
      user_id = auth.uid()
      OR (v_email IS NOT NULL AND lower(email) = v_email)
    );

  -- A player may drop their own slot; an admin may clear anyone's. Compared
  -- against the whole set so a duplicate roster row cannot strand a player
  -- with a duty they are unable to release.
  IF NOT v_is_admin
     AND (v_my_players IS NULL
          OR NOT (v_duty.assigned_player_id = ANY(v_my_players))) THEN
    RETURN 'not_yours';
  END IF;

  IF v_duty.match_date < v_today AND NOT v_is_admin THEN
    RETURN 'past';
  END IF;

  UPDATE public.cricket_umpiring_duties
  SET assigned_player_id   = NULL,
      assigned_player_name = NULL,
      assigned_by          = NULL,
      assigned_at          = NULL,
      status               = 'open'
  WHERE id = p_duty_id;

  RETURN 'ok';

EXCEPTION WHEN lock_not_available THEN
  RETURN 'locked';
END;
$$;

REVOKE ALL ON FUNCTION claim_umpiring_duty(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION release_umpiring_duty(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_umpiring_duty(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION release_umpiring_duty(UUID) TO authenticated;
