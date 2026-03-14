-- Migration: Add made_cut column to golfer_round_stats
-- Run this in Supabase SQL Editor before seeding score data

-- Add the made_cut column
ALTER TABLE public.golfer_round_stats
ADD COLUMN IF NOT EXISTS made_cut BOOLEAN DEFAULT true;

-- Ensure RLS allows inserts for authenticated users (needed for seeding)
-- If you haven't already, you may need this policy:
CREATE POLICY "Authenticated users can insert stats" ON public.golfer_round_stats
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete stats" ON public.golfer_round_stats
FOR DELETE USING (auth.uid() IS NOT NULL);
