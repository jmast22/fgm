-- Remove unique constraint on drafts(league_id) to allow multiple drafts (per-tournament redrafting)
ALTER TABLE drafts DROP CONSTRAINT IF EXISTS drafts_league_id_key;

-- If it was a unique index instead of a constraint:
DROP INDEX IF EXISTS drafts_league_id_key;
