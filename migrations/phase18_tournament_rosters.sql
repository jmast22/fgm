-- Phase 18: Tournament-Scoped Rosters Migration
-- Run this in Supabase Dashboard → SQL Editor

-- ============================================================
-- STEP 1: Add tournament_id to team_rosters
-- ============================================================

-- Add the column (nullable for backward compat with season-long leagues)
ALTER TABLE public.team_rosters 
  ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL;

-- Add created_at if missing (for transaction history)
ALTER TABLE public.team_rosters 
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Drop the old primary key 
ALTER TABLE public.team_rosters DROP CONSTRAINT IF EXISTS team_rosters_pkey;

-- Create new composite primary key
-- For season-long leagues tournament_id will be NULL, for per-tournament it will be set
-- We use a unique index instead of PK since tournament_id is nullable
ALTER TABLE public.team_rosters 
  ADD CONSTRAINT team_rosters_pkey PRIMARY KEY (team_id, golfer_id);

-- Add a unique index that includes tournament_id for per-tournament uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_rosters_tournament 
  ON public.team_rosters (team_id, golfer_id, tournament_id) 
  WHERE tournament_id IS NOT NULL;

-- ============================================================
-- STEP 2: Add espn_event_id to tournaments
-- ============================================================

ALTER TABLE public.tournaments 
  ADD COLUMN IF NOT EXISTS espn_event_id TEXT;

-- ============================================================
-- STEP 3: Update the draft trigger to include tournament_id
-- ============================================================

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

    -- Auto-add to roster WITH tournament_id
    INSERT INTO public.team_rosters (team_id, golfer_id, acquired_via, tournament_id)
    VALUES (NEW.team_id, NEW.golfer_id, 'draft', v_tournament_id)
    ON CONFLICT (team_id, golfer_id) DO UPDATE SET tournament_id = v_tournament_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_draft_pick_made ON public.draft_picks;
CREATE TRIGGER on_draft_pick_made
  AFTER INSERT ON public.draft_picks
  FOR EACH ROW EXECUTE PROCEDURE public.advance_draft_pick_fn();

-- ============================================================
-- STEP 4: Backfill existing roster data with tournament_id
-- (Associates current rosters with their draft's tournament)
-- ============================================================

-- For any team that has a completed draft with a tournament_id,
-- update their roster entries to reference that tournament
UPDATE public.team_rosters tr
SET tournament_id = d.tournament_id
FROM public.draft_picks dp
JOIN public.drafts d ON dp.draft_id = d.id
WHERE tr.team_id = dp.team_id 
  AND tr.golfer_id = dp.golfer_id
  AND tr.tournament_id IS NULL
  AND d.tournament_id IS NOT NULL;
