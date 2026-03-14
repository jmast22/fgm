-- Migration: Allow commissioners to manage lineups for any team in their league
-- Run this in Supabase SQL Editor

-- Commissioners can manage weekly lineups for any team in their league
CREATE POLICY "Commissioners can manage league lineups" ON public.weekly_lineups FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.teams 
        JOIN public.leagues ON leagues.id = teams.league_id
        WHERE teams.id = weekly_lineups.team_id 
        AND leagues.commissioner_id = auth.uid()
    )
);

-- Commissioners can manage lineup golfers for any team in their league
CREATE POLICY "Commissioners can manage league lineup golfers" ON public.lineup_golfers FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.weekly_lineups
        JOIN public.teams ON teams.id = weekly_lineups.team_id
        JOIN public.leagues ON leagues.id = teams.league_id
        WHERE weekly_lineups.id = lineup_golfers.lineup_id
        AND leagues.commissioner_id = auth.uid()
    )
);
