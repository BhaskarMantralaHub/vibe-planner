-- ============================================================
-- Season Dates Migration
-- ============================================================
-- Adds start_date and end_date columns to cricket_seasons for
-- CricClubs sync date range filtering. These are optional —
-- if not set, the sync falls back to deriving from season_type.

-- Add columns (nullable, no default — explicit dates only)
ALTER TABLE cricket_seasons
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE;

-- Add check constraint: end_date must be >= start_date when both set
ALTER TABLE cricket_seasons
  ADD CONSTRAINT chk_season_date_order
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

COMMENT ON COLUMN cricket_seasons.start_date IS 'CricClubs sync filter start date (MM/DD/YYYY format used in URL)';
COMMENT ON COLUMN cricket_seasons.end_date IS 'CricClubs sync filter end date (MM/DD/YYYY format used in URL)';
