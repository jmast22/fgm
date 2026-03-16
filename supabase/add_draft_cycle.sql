-- Add draft_cycle column to leagues table
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_cycle TEXT DEFAULT 'season' CHECK (draft_cycle IN ('season', 'tournament'));

-- Associate drafts with tournaments explicitly to preserve history
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id);

