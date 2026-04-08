-- Fantasy Golf League Supabase Schema

-- ENUMS
-- ENUMS
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tournament_status') THEN
        CREATE TYPE tournament_status AS ENUM ('upcoming', 'active', 'completed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'draft_status') THEN
        CREATE TYPE draft_status AS ENUM ('pending', 'active', 'completed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'acquire_method') THEN
        CREATE TYPE acquire_method AS ENUM ('draft', 'trade', 'waiver');
    END IF;
END $$;

-- TABLES

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. GOLFERS
CREATE TABLE IF NOT EXISTS public.golfers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    age INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. GOLFER ALIASES
CREATE TABLE IF NOT EXISTS public.golfer_aliases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    golfer_id UUID REFERENCES public.golfers(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TOURNAMENTS
CREATE TABLE IF NOT EXISTS public.tournaments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    course_name TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    status tournament_status DEFAULT 'upcoming',
    espn_event_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4a. GOLFER PROFILES
CREATE TABLE IF NOT EXISTS public.golfer_profiles (
    golfer_id UUID REFERENCES public.golfers(id) ON DELETE CASCADE PRIMARY KEY,
    country TEXT,
    country_flag TEXT,
    photo_url TEXT,
    birth_date DATE,
    turned_pro_year INT,
    college TEXT,
    owgr_rank INT,
    fedex_rank INT,
    wins INT DEFAULT 0,
    top_10s INT DEFAULT 0,
    cuts_made INT DEFAULT 0,
    events_played INT DEFAULT 0,
    scoring_avg DECIMAL(4,2),
    season_year INT DEFAULT 2026,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TOURNAMENT GOLFERS
CREATE TABLE IF NOT EXISTS public.tournament_golfers (
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    golfer_id UUID REFERENCES public.golfers(id) ON DELETE CASCADE,
    dg_rank INT,
    owg_rank INT,
    tour_rank INT,
    PRIMARY KEY (tournament_id, golfer_id)
);

-- 6. LEAGUES
CREATE TABLE IF NOT EXISTS public.leagues (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    commissioner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    roster_size INT DEFAULT 10,
    weekly_starters INT DEFAULT 6,
    season_year INT DEFAULT 2026,
    draft_status draft_status DEFAULT 'pending',
    invite_code TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. LEAGUE MEMBERS
CREATE TABLE IF NOT EXISTS public.league_members (
    league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (league_id, user_id)
);

-- 8. TEAMS
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (league_id, user_id)
);

-- 9. DRAFTS
CREATE TABLE IF NOT EXISTS public.drafts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE UNIQUE,
    status draft_status DEFAULT 'pending',
    current_round INT DEFAULT 1,
    current_pick INT DEFAULT 1,
    draft_order JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. DRAFT PICKS
CREATE TABLE IF NOT EXISTS public.draft_picks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    draft_id UUID REFERENCES public.drafts(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    golfer_id UUID REFERENCES public.golfers(id) ON DELETE CASCADE,
    round INT NOT NULL,
    pick_number INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (draft_id, pick_number),
    UNIQUE (draft_id, golfer_id)
);

-- 11. TEAM ROSTERS
CREATE TABLE IF NOT EXISTS public.team_rosters (
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    golfer_id UUID REFERENCES public.golfers(id) ON DELETE CASCADE,
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
    acquired_via acquire_method DEFAULT 'draft',
    is_on_trade_block BOOLEAN DEFAULT false,
    acquired_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (team_id, golfer_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_rosters_tournament 
  ON public.team_rosters (team_id, golfer_id, tournament_id) 
  WHERE tournament_id IS NOT NULL;

-- 12. WEEKLY LINEUPS
CREATE TABLE IF NOT EXISTS public.weekly_lineups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    locked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (team_id, tournament_id)
);

-- 13. LINEUP GOLFERS
CREATE TABLE IF NOT EXISTS public.lineup_golfers (
    lineup_id UUID REFERENCES public.weekly_lineups(id) ON DELETE CASCADE,
    golfer_id UUID REFERENCES public.golfers(id) ON DELETE CASCADE,
    is_starter BOOLEAN DEFAULT false,
    PRIMARY KEY (lineup_id, golfer_id)
);

-- 14. GOLFER ROUND STATS
CREATE TABLE IF NOT EXISTS public.golfer_round_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    golfer_id UUID REFERENCES public.golfers(id) ON DELETE CASCADE,
    round INT NOT NULL,
    score INT,
    birdies INT DEFAULT 0,
    eagles INT DEFAULT 0,
    made_cut BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tournament_id, golfer_id, round)
);

-- FUNCTION: SET UPDATED AT
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGERS FOR UPDATED AT
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_golfers_updated_at ON public.golfers;
CREATE TRIGGER set_golfers_updated_at BEFORE UPDATE ON public.golfers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_tournaments_updated_at ON public.tournaments;
CREATE TRIGGER set_tournaments_updated_at BEFORE UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_leagues_updated_at ON public.leagues;
CREATE TRIGGER set_leagues_updated_at BEFORE UPDATE ON public.leagues FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_teams_updated_at ON public.teams;
CREATE TRIGGER set_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_drafts_updated_at ON public.drafts;
CREATE TRIGGER set_drafts_updated_at BEFORE UPDATE ON public.drafts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_weekly_lineups_updated_at ON public.weekly_lineups;
CREATE TRIGGER set_weekly_lineups_updated_at BEFORE UPDATE ON public.weekly_lineups FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_golfer_round_stats_updated_at ON public.golfer_round_stats;
CREATE TRIGGER set_golfer_round_stats_updated_at BEFORE UPDATE ON public.golfer_round_stats FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golfer_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_golfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineup_golfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golfer_round_stats ENABLE ROW LEVEL SECURITY;

-- Profiles: Anyone can read, but users can only update their own profile
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Golfers/Tournaments/Stats: Viewable by everyone
DROP POLICY IF EXISTS "Golfer round stats are viewable by everyone" ON public.golfer_round_stats;
CREATE POLICY "Golfer round stats are viewable by everyone" ON public.golfer_round_stats FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage round stats" ON public.golfer_round_stats;
CREATE POLICY "Authenticated users can manage round stats" ON public.golfer_round_stats FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Golfer profiles are viewable by everyone" ON public.golfer_profiles;
CREATE POLICY "Golfer profiles are viewable by everyone" ON public.golfer_profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage golfer profiles" ON public.golfer_profiles;
CREATE POLICY "Authenticated users can manage golfer profiles" ON public.golfer_profiles FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Golfer aliases are viewable by everyone" ON public.golfer_aliases;
CREATE POLICY "Golfer aliases are viewable by everyone" ON public.golfer_aliases FOR SELECT USING (true);
DROP POLICY IF EXISTS "Tournaments are viewable by everyone" ON public.tournaments;
CREATE POLICY "Tournaments are viewable by everyone" ON public.tournaments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Golfers are viewable by everyone" ON public.golfers;
CREATE POLICY "Golfers are viewable by everyone" ON public.golfers FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage golfers" ON public.golfers;
CREATE POLICY "Authenticated users can manage golfers" ON public.golfers FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Tournament golfers are viewable by everyone" ON public.tournament_golfers;
CREATE POLICY "Tournament golfers are viewable by everyone" ON public.tournament_golfers FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage tournament golfers" ON public.tournament_golfers;
CREATE POLICY "Authenticated users can manage tournament golfers" ON public.tournament_golfers FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Golfer round stats are viewable by everyone" ON public.golfer_round_stats;
CREATE POLICY "Golfer round stats are viewable by everyone" ON public.golfer_round_stats FOR SELECT USING (true);

-- Allow authenticated users (Admins/Commissioners) to manage data
DROP POLICY IF EXISTS "Authenticated users can manage golfer aliases" ON public.golfer_aliases;
CREATE POLICY "Authenticated users can manage golfer aliases" ON public.golfer_aliases FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can manage golfer round stats" ON public.golfer_round_stats;
CREATE POLICY "Authenticated users can manage golfer round stats" ON public.golfer_round_stats FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can manage tournaments" ON public.tournaments;
CREATE POLICY "Authenticated users can manage tournaments" ON public.tournaments FOR ALL USING (auth.uid() IS NOT NULL);

-- Leagues: Anyone can read leagues. Authenticated users can create. Commissioners can update.
DROP POLICY IF EXISTS "Leagues are viewable by everyone" ON public.leagues;
CREATE POLICY "Leagues are viewable by everyone" ON public.leagues FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can create leagues" ON public.leagues;
CREATE POLICY "Authenticated users can create leagues" ON public.leagues FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Commissioners can update their leagues" ON public.leagues;
CREATE POLICY "Commissioners can update their leagues" ON public.leagues FOR UPDATE USING (auth.uid() = commissioner_id);

-- League Members: Viewable by everyone. Authenticated users can insert (join).
DROP POLICY IF EXISTS "League members viewable by everyone" ON public.league_members;
CREATE POLICY "League members viewable by everyone" ON public.league_members FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can join leagues" ON public.league_members;
CREATE POLICY "Users can join leagues" ON public.league_members FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can leave leagues" ON public.league_members;
CREATE POLICY "Users can leave leagues" ON public.league_members FOR DELETE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Commissioners can add members" ON public.league_members;
CREATE POLICY "Commissioners can add members" ON public.league_members FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.leagues WHERE leagues.id = league_members.league_id AND leagues.commissioner_id = auth.uid())
);
DROP POLICY IF EXISTS "Commissioners can remove members" ON public.league_members;
CREATE POLICY "Commissioners can remove members" ON public.league_members FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.leagues WHERE leagues.id = league_members.league_id AND leagues.commissioner_id = auth.uid())
);

-- Teams: Viewable by everyone. Users manage their own team.
DROP POLICY IF EXISTS "Teams viewable by everyone" ON public.teams;
CREATE POLICY "Teams viewable by everyone" ON public.teams FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can create their own team" ON public.teams;
CREATE POLICY "Users can create their own team" ON public.teams FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own team" ON public.teams;
CREATE POLICY "Users can update their own team" ON public.teams FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Commissioners can manage all teams in their leagues" ON public.teams;
CREATE POLICY "Commissioners can manage all teams in their leagues" ON public.teams FOR ALL USING (
    EXISTS (SELECT 1 FROM public.leagues WHERE leagues.id = teams.league_id AND leagues.commissioner_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.leagues WHERE leagues.id = teams.league_id AND leagues.commissioner_id = auth.uid())
);

-- Drafts: Viewable by everyone. Commissioners can update.
DROP POLICY IF EXISTS "Drafts viewable by everyone" ON public.drafts;
CREATE POLICY "Drafts viewable by everyone" ON public.drafts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Commissioners can manage drafts" ON public.drafts;
CREATE POLICY "Commissioners can manage drafts" ON public.drafts FOR ALL USING (
    EXISTS (SELECT 1 FROM public.leagues WHERE leagues.id = drafts.league_id AND leagues.commissioner_id = auth.uid())
);

-- Draft Picks: Viewable by everyone. Authenticated users can insert picks during draft.
DROP POLICY IF EXISTS "Draft picks viewable by everyone" ON public.draft_picks;
CREATE POLICY "Draft picks viewable by everyone" ON public.draft_picks FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can make picks for their team" ON public.draft_picks;
CREATE POLICY "Users can make picks for their team" ON public.draft_picks FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.teams WHERE teams.id = draft_picks.team_id AND teams.user_id = auth.uid())
);

-- Team Rosters: Viewable by everyone. System/users can manage based on actions.
DROP POLICY IF EXISTS "Team rosters viewable by everyone" ON public.team_rosters;
CREATE POLICY "Team rosters viewable by everyone" ON public.team_rosters FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage their rosters" ON public.team_rosters;
CREATE POLICY "Users can manage their rosters" ON public.team_rosters FOR ALL USING (
    EXISTS (SELECT 1 FROM public.teams WHERE teams.id = team_rosters.team_id AND teams.user_id = auth.uid())
);

-- Weekly Lineups: Viewable by everyone. Users manage their own.
DROP POLICY IF EXISTS "Weekly lineups viewable by everyone" ON public.weekly_lineups;
CREATE POLICY "Weekly lineups viewable by everyone" ON public.weekly_lineups FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage their lineups" ON public.weekly_lineups;
CREATE POLICY "Users can manage their lineups" ON public.weekly_lineups FOR ALL USING (
    EXISTS (SELECT 1 FROM public.teams WHERE teams.id = weekly_lineups.team_id AND teams.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Commissioners can manage league lineups" ON public.weekly_lineups;
CREATE POLICY "Commissioners can manage league lineups" ON public.weekly_lineups FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.teams 
        JOIN public.leagues ON leagues.id = teams.league_id
        WHERE teams.id = weekly_lineups.team_id 
        AND leagues.commissioner_id = auth.uid()
    )
);

-- Lineup Golfers: Viewable by everyone. Users manage their own.
DROP POLICY IF EXISTS "Lineup golfers viewable by everyone" ON public.lineup_golfers;
CREATE POLICY "Lineup golfers viewable by everyone" ON public.lineup_golfers FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage lineup golfers" ON public.lineup_golfers;
CREATE POLICY "Users can manage lineup golfers" ON public.lineup_golfers FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.weekly_lineups 
        JOIN public.teams ON teams.id = weekly_lineups.team_id 
        WHERE weekly_lineups.id = lineup_golfers.lineup_id AND teams.user_id = auth.uid()
    )
);
DROP POLICY IF EXISTS "Commissioners can manage league lineup golfers" ON public.lineup_golfers;
CREATE POLICY "Commissioners can manage league lineup golfers" ON public.lineup_golfers FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.weekly_lineups
        JOIN public.teams ON teams.id = weekly_lineups.team_id
        JOIN public.leagues ON leagues.id = teams.league_id
        WHERE weekly_lineups.id = lineup_golfers.lineup_id
        AND leagues.commissioner_id = auth.uid()
    )
);

-- Trigger to create profile when auth.user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, new.raw_user_meta_data->>'display_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
