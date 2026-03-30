-- ============================================================================
-- Migration 004: Fix created_by RLS bypass in scoring tables
-- ============================================================================
-- PROBLEM: The match creator (created_by) could write to innings/balls even
-- after another player claimed active_scorer_id. This caused data corruption
-- when Player A's stale local state overwrote Player B's correct data.
--
-- FIX: When active_scorer_id is set (someone claimed scoring), ONLY that
-- user can write. created_by fallback only applies when active_scorer_id
-- is NULL (no one has claimed).
-- ============================================================================

-- ── practice_innings UPDATE policy ──
DROP POLICY IF EXISTS "Scorer can update innings" ON practice_innings;
CREATE POLICY "Scorer can update innings"
  ON practice_innings FOR UPDATE USING (
    has_cricket_access() AND EXISTS (
      SELECT 1 FROM practice_matches WHERE id = match_id
        AND status IN ('scoring', 'innings_break')
        AND (
          active_scorer_id = auth.uid()
          OR (active_scorer_id IS NULL AND created_by = auth.uid())
        )
    )
  );

-- ── practice_balls INSERT policy ──
DROP POLICY IF EXISTS "Scorer can record balls" ON practice_balls;
CREATE POLICY "Scorer can record balls"
  ON practice_balls FOR INSERT WITH CHECK (
    has_cricket_access() AND EXISTS (
      SELECT 1 FROM practice_matches WHERE id = match_id
        AND status IN ('scoring', 'innings_break')
        AND (
          active_scorer_id = auth.uid()
          OR (active_scorer_id IS NULL AND created_by = auth.uid())
        )
    )
  );

-- ── practice_balls UPDATE policy ──
DROP POLICY IF EXISTS "Scorer can update balls" ON practice_balls;
CREATE POLICY "Scorer can update balls"
  ON practice_balls FOR UPDATE USING (
    has_cricket_access() AND EXISTS (
      SELECT 1 FROM practice_matches WHERE id = match_id
        AND status IN ('scoring', 'innings_break')
        AND (
          active_scorer_id = auth.uid()
          OR (active_scorer_id IS NULL AND created_by = auth.uid())
        )
    )
  );

-- ── practice_matches UPDATE policy ──
DROP POLICY IF EXISTS "Scorer can update match" ON practice_matches;
CREATE POLICY "Scorer can update match"
  ON practice_matches FOR UPDATE USING (
    has_cricket_access() AND (
      active_scorer_id = auth.uid()
      OR (active_scorer_id IS NULL AND created_by = auth.uid())
    )
  );

-- ── practice_innings INSERT policy ──
DROP POLICY IF EXISTS "Scorer can create innings" ON practice_innings;
CREATE POLICY "Scorer can create innings"
  ON practice_innings FOR INSERT WITH CHECK (
    has_cricket_access() AND EXISTS (
      SELECT 1 FROM practice_matches WHERE id = match_id
        AND status IN ('setup', 'scoring', 'innings_break')
        AND (
          active_scorer_id = auth.uid()
          OR (active_scorer_id IS NULL AND created_by = auth.uid())
        )
    )
  );

-- ── practice_match_players INSERT policy ──
DROP POLICY IF EXISTS "Scorer can manage match players" ON practice_match_players;
CREATE POLICY "Scorer can manage match players"
  ON practice_match_players FOR INSERT WITH CHECK (
    has_cricket_access() AND EXISTS (
      SELECT 1 FROM practice_matches WHERE id = match_id
        AND status IN ('setup', 'scoring', 'innings_break')
        AND (
          active_scorer_id = auth.uid()
          OR (active_scorer_id IS NULL AND created_by = auth.uid())
        )
    )
  );

-- ── practice_match_players UPDATE policy ──
DROP POLICY IF EXISTS "Scorer can update match players" ON practice_match_players;
CREATE POLICY "Scorer can update match players"
  ON practice_match_players FOR UPDATE USING (
    has_cricket_access() AND EXISTS (
      SELECT 1 FROM practice_matches WHERE id = match_id
        AND status IN ('setup', 'scoring', 'innings_break')
        AND (
          active_scorer_id = auth.uid()
          OR (active_scorer_id IS NULL AND created_by = auth.uid())
        )
    )
  );
