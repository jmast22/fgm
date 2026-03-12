-- Add Commissioner management policies to bypass RLS for administrative actions

-- 1. Teams Policy Update
DROP POLICY IF EXISTS "Commissioners can manage all teams in their leagues" ON public.teams;
CREATE POLICY "Commissioners can manage all teams in their leagues" ON public.teams FOR ALL USING (
    EXISTS (SELECT 1 FROM public.leagues WHERE leagues.id = teams.league_id AND leagues.commissioner_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.leagues WHERE leagues.id = teams.league_id AND leagues.commissioner_id = auth.uid())
);

-- 2. Draft Picks Policy Update
DROP POLICY IF EXISTS "Commissioners can manage all picks in their league's drafts" ON public.draft_picks;
CREATE POLICY "Commissioners can manage all picks in their league's drafts" ON public.draft_picks FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.drafts 
        JOIN public.leagues ON leagues.id = drafts.league_id 
        WHERE drafts.id = draft_picks.draft_id AND leagues.commissioner_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.drafts 
        JOIN public.leagues ON leagues.id = drafts.league_id 
        WHERE drafts.id = draft_picks.draft_id AND leagues.commissioner_id = auth.uid()
    )
);

-- 3. Team Rosters Policy Update
DROP POLICY IF EXISTS "Commissioners can manage all rosters in their league" ON public.team_rosters;
CREATE POLICY "Commissioners can manage all rosters in their league" ON public.team_rosters FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.teams 
        JOIN public.leagues ON leagues.id = teams.league_id 
        WHERE teams.id = team_rosters.team_id AND leagues.commissioner_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.teams 
        JOIN public.leagues ON leagues.id = teams.league_id 
        WHERE teams.id = team_rosters.team_id AND leagues.commissioner_id = auth.uid()
    )
);
