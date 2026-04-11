-- Initial Payout Columns
ALTER TABLE leagues
ADD COLUMN IF NOT EXISTS tournament_cost INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS payout_1st INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS payout_2nd INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS payout_3rd INTEGER DEFAULT 0;

-- Advanced Payout Rules
ALTER TABLE leagues
ADD COLUMN IF NOT EXISTS payout_1st_remaining_pot BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS payout_2nd_money_back BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS payout_3rd_money_back BOOLEAN DEFAULT false;

-- Payout History Snapshot Table
CREATE TABLE IF NOT EXISTS tournament_payout_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  pot_size INTEGER NOT NULL DEFAULT 0,
  payout_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, tournament_id)
);

-- RLS for Payout History
ALTER TABLE tournament_payout_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payout history for their leagues"
ON tournament_payout_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM league_members
    WHERE league_members.league_id = tournament_payout_history.league_id
    AND league_members.user_id = auth.uid()
  )
);

CREATE POLICY "Commissioners can manage payout history for their leagues"
ON tournament_payout_history FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM leagues
    WHERE leagues.id = tournament_payout_history.league_id
    AND leagues.commissioner_id = auth.uid()
  )
);
