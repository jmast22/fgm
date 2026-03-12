-- Add waiver rules and trade settings to leagues
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS waiver_rule TEXT DEFAULT 'Free Agency';
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS trade_deadline TIMESTAMPTZ;

-- Create Trades table
CREATE TABLE IF NOT EXISTS public.trades (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
    offering_team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    receiving_team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    offered_golfers UUID[] NOT NULL,
    requested_golfers UUID[] NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'cancelled', 'completed'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for Trades
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trades viewable by everyone in league" ON public.trades FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.teams 
        WHERE teams.league_id = trades.league_id 
        AND teams.user_id = auth.uid()
    )
);

CREATE POLICY "Users can create trades for their team" ON public.trades FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.teams WHERE teams.id = offering_team_id AND teams.user_id = auth.uid())
);

CREATE POLICY "Users can update their own trades (cancel/respond)" ON public.trades FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.teams WHERE teams.id = offering_team_id AND teams.user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.teams WHERE teams.id = receiving_team_id AND teams.user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.leagues WHERE leagues.id = trades.league_id AND leagues.commissioner_id = auth.uid())
);

-- Trigger for updated_at
CREATE TRIGGER set_trades_updated_at BEFORE UPDATE ON public.trades FOR EACH ROW EXECUTE FUNCTION set_updated_at();
