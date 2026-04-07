-- Fix: Add missing INSERT/UPDATE policy for tournament_golfers
-- This allows the field scraper (run by authenticated users) to upsert field data

DROP POLICY IF EXISTS "Authenticated users can manage tournament golfers" ON public.tournament_golfers;
CREATE POLICY "Authenticated users can manage tournament golfers" ON public.tournament_golfers 
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Also add missing INSERT policy for golfers table (needed for "Create New Golfer" from admin)
DROP POLICY IF EXISTS "Authenticated users can manage golfers" ON public.golfers;
CREATE POLICY "Authenticated users can manage golfers" ON public.golfers 
  FOR ALL USING (auth.uid() IS NOT NULL);
