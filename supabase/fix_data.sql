-- Data fixes and manual overrides

-- 1. Add plain aliases for players with accents
INSERT INTO public.golfer_aliases (golfer_id, alias_name)
SELECT id, 'Ludvig Aberg' FROM public.golfers WHERE name = 'Ludvig Åberg'
  AND NOT EXISTS (SELECT 1 FROM public.golfer_aliases WHERE alias_name = 'Ludvig Aberg');

INSERT INTO public.golfer_aliases (golfer_id, alias_name)
SELECT id, 'Nicolai Hojgaard' FROM public.golfers WHERE name = 'Nicolai Højgaard'
  AND NOT EXISTS (SELECT 1 FROM public.golfer_aliases WHERE alias_name = 'Nicolai Hojgaard');

-- 2. Ensure players are in The Players Championship field
-- Add Ludvig Åberg
INSERT INTO public.tournament_golfers (tournament_id, golfer_id, owg_rank)
SELECT 
    (SELECT id FROM public.tournaments WHERE name = 'The Players Championship' LIMIT 1),
    (SELECT id FROM public.golfers WHERE name = 'Ludvig Åberg' LIMIT 1),
    4
ON CONFLICT (tournament_id, golfer_id) DO NOTHING;

-- Add Nicolai Højgaard
INSERT INTO public.tournament_golfers (tournament_id, golfer_id, owg_rank)
SELECT 
    (SELECT id FROM public.tournaments WHERE name = 'The Players Championship' LIMIT 1),
    (SELECT id FROM public.golfers WHERE name = 'Nicolai Højgaard' LIMIT 1),
    40 -- Roughly his rank
ON CONFLICT (tournament_id, golfer_id) DO NOTHING;
