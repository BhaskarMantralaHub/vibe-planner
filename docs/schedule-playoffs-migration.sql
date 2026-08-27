-- ============================================================
-- Allow playoff rounds on the match schedule
-- ============================================================
-- cricket_schedule_matches.match_type allowed only 'league' and 'practice', so
-- a semi-final or final could not be inserted AT ALL — the CHECK rejected it.
-- Sunrisers Manteca has qualified for the semis, so this blocks real data.
--
-- WIDENING a CHECK only ever ALLOWS more values. No column is added or dropped,
-- no row is rewritten, and the existing rows (all 'league') satisfy the new
-- constraint, so re-validation passes trivially.
--
-- Deliberately kept to two statements. An earlier version wrapped these in an
-- explicit BEGIN/COMMIT with a probe INSERT to prove the constraint accepted a
-- semi-final; run through `supabase db query`, which manages its own
-- transaction, the change silently did not stick. Verification belongs in a
-- separate read-only query, not inside the migration.
--
-- Matches the vocabulary already used by cricket_umpiring_duties. The two
-- tables deliberately still differ on 'practice': you PLAY practice matches,
-- but MTCA never assigns umpires to them.
--   cricket_schedule_matches : league | practice | semi_final | final
--   cricket_umpiring_duties  : league |            semi_final | final
--
-- Run:  supabase db query --linked -f docs/schedule-playoffs-migration.sql
-- Then: SELECT pg_get_constraintdef(oid) FROM pg_constraint
--        WHERE conname = 'chk_schedule_match_type';

ALTER TABLE public.cricket_schedule_matches
  DROP CONSTRAINT IF EXISTS chk_schedule_match_type;

ALTER TABLE public.cricket_schedule_matches
  ADD CONSTRAINT chk_schedule_match_type
  CHECK (match_type IN ('league', 'practice', 'semi_final', 'final'));
