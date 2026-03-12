-- Add trade block functionality to team_rosters
ALTER TABLE public.team_rosters ADD COLUMN IF NOT EXISTS is_on_trade_block BOOLEAN DEFAULT false;

-- Optional: update RLS to ensure users can manage their own trade block status
-- (team_rosters already has a policy for ALL per team_id/auth.uid)
