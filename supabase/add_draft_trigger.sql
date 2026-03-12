-- Trigger to automatically advance draft pick when a pick is made
CREATE OR REPLACE FUNCTION public.advance_draft_pick_fn()
RETURNS TRIGGER AS $$
DECLARE
    v_total_teams INT;
    v_new_round INT;
    v_new_pick INT;
    v_roster_size INT;
BEGIN
    -- Get league details for the draft to calculate boundaries
    SELECT l.roster_size, COALESCE((SELECT COUNT(*) FROM public.teams WHERE league_id = l.id), 0)
    INTO v_roster_size, v_total_teams
    FROM public.drafts d
    JOIN public.leagues l ON d.league_id = l.id
    WHERE d.id = NEW.draft_id;

    -- Default to 1 if not found to avoid division by zero
    IF v_total_teams = 0 THEN
        v_total_teams := 1;
    END IF;

    -- Calculate next pick and round
    v_new_pick := NEW.pick_number + 1;
    v_new_round := NEW.round;
    
    -- If we completed a round
    IF v_total_teams > 0 AND NEW.pick_number % v_total_teams = 0 THEN
        v_new_round := NEW.round + 1;
    END IF;

    -- If draft is over
    IF NEW.pick_number >= (v_total_teams * v_roster_size) THEN
        UPDATE public.drafts 
        SET status = 'completed', updated_at = NOW() 
        WHERE id = NEW.draft_id;
        
        -- Also update league
        UPDATE public.leagues 
        SET draft_status = 'completed' 
        WHERE id = (SELECT league_id FROM public.drafts WHERE id = NEW.draft_id);
    ELSE
        -- Advance pick
        UPDATE public.drafts 
        SET current_round = v_new_round, current_pick = v_new_pick, updated_at = NOW() 
        WHERE id = NEW.draft_id;
    END IF;

    -- Also auto-add to roster
    INSERT INTO public.team_rosters (team_id, golfer_id, acquired_via)
    VALUES (NEW.team_id, NEW.golfer_id, 'draft')
    ON CONFLICT (team_id, golfer_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_draft_pick_made
  AFTER INSERT ON public.draft_picks
  FOR EACH ROW EXECUTE PROCEDURE public.advance_draft_pick_fn();
