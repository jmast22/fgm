-- Trigger to automatically advance draft pick when a pick is made
CREATE OR REPLACE FUNCTION public.advance_draft_pick_fn()
RETURNS TRIGGER AS $$
DECLARE
    v_total_teams INT;
    v_new_round INT;
    v_new_pick INT;
    v_roster_size INT;
    v_tournament_id UUID;
BEGIN
    -- Get league details and tournament_id for the draft
    SELECT l.roster_size, COALESCE((SELECT COUNT(*) FROM public.teams WHERE league_id = l.id), 0), d.tournament_id
    INTO v_roster_size, v_total_teams, v_tournament_id
    FROM public.drafts d
    JOIN public.leagues l ON d.league_id = l.id
    WHERE d.id = NEW.draft_id;

    IF v_total_teams = 0 THEN
        v_total_teams := 1;
    END IF;

    -- Calculate next pick and round
    v_new_pick := NEW.pick_number + 1;
    v_new_round := NEW.round;
    
    IF v_total_teams > 0 AND NEW.pick_number % v_total_teams = 0 THEN
        v_new_round := NEW.round + 1;
    END IF;

    -- If draft is over
    IF NEW.pick_number >= (v_total_teams * v_roster_size) THEN
        UPDATE public.drafts 
        SET status = 'completed', updated_at = NOW() 
        WHERE id = NEW.draft_id;
        
        UPDATE public.leagues 
        SET draft_status = 'completed' 
        WHERE id = (SELECT league_id FROM public.drafts WHERE id = NEW.draft_id);
    ELSE
        UPDATE public.drafts 
        SET current_round = v_new_round, current_pick = v_new_pick, updated_at = NOW() 
        WHERE id = NEW.draft_id;
    END IF;

    -- Auto-add to roster WITH tournament_id from the draft
    INSERT INTO public.team_rosters (team_id, golfer_id, acquired_via, tournament_id)
    VALUES (NEW.team_id, NEW.golfer_id, 'draft', v_tournament_id)
    ON CONFLICT (team_id, golfer_id) DO UPDATE SET tournament_id = v_tournament_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_draft_pick_made ON public.draft_picks;
CREATE TRIGGER on_draft_pick_made
  AFTER INSERT ON public.draft_picks
  FOR EACH ROW EXECUTE PROCEDURE public.advance_draft_pick_fn();
