-- Fix RLS policies for league management (commissioners managing members and teams)

-- 1. League Members: Allow commissioners to manage members in their leagues
DROP POLICY IF EXISTS "Commissioners can add members" ON public.league_members;
CREATE POLICY "Commissioners can add members" ON public.league_members
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.leagues 
        WHERE leagues.id = league_members.league_id 
        AND leagues.commissioner_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Commissioners can remove members" ON public.league_members;
CREATE POLICY "Commissioners can remove members" ON public.league_members
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.leagues 
        WHERE leagues.id = league_members.league_id 
        AND leagues.commissioner_id = auth.uid()
    )
);

-- 2. Teams: Ensure commissioners can manage all teams
-- This allows them to assign orphans (update user_id) and delete teams
DROP POLICY IF EXISTS "Commissioners can manage all teams in their leagues" ON public.teams;
CREATE POLICY "Commissioners can manage all teams in their leagues" ON public.teams 
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.leagues 
        WHERE leagues.id = teams.league_id 
        AND leagues.commissioner_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.leagues 
        WHERE leagues.id = teams.league_id 
        AND leagues.commissioner_id = auth.uid()
    )
);
