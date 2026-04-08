-- Migration: Add odds column to tournament_golfers
ALTER TABLE public.tournament_golfers ADD COLUMN IF NOT EXISTS odds INT;

-- Update RLS policies if necessary (though current policies use ALL for authenticated users)
-- Based on supabase-schema.sql, the policies already cover 'tournament_golfers' for authenticated users.
