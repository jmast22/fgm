-- Fantasy Golf League Supabase Schema

-- ENUMS
CREATE TYPE tournament_status AS ENUM ('upcoming', 'active', 'completed');
CREATE TYPE draft_status AS ENUM ('pending', 'active', 'completed');
CREATE TYPE acquire_method AS ENUM ('draft', 'trade', 'waiver');

-- TABLES

-- 1. PROFILES
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. GOLFERS
CREATE TABLE public.golfers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    age INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. GOLFER ALIASES
CREATE TABLE public.golfer_aliases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    golfer_id UUID REFERENCES public.golfers(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TOURNAMENTS
CREATE TABLE public.tournaments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    course_name TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    status tournament_status DEFAULT 'upcoming',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TOURNAMENT GOLFERS
CREATE TABLE public.tournament_golfers (
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    golfer_id UUID REFERENCES public.golfers(id) ON DELETE CASCADE,
    dg_rank INT,
    owg_rank INT,
    tour_rank INT,
    PRIMARY KEY (tournament_id, golfer_id)
);

-- 6. LEAGUES
CREATE TABLE public.leagues (
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
CREATE TABLE public.league_members (
    league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (league_id, user_id)
);

-- 8. TEAMS
CREATE TABLE public.teams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (league_id, user_id)
);

-- 9. DRAFTS
CREATE TABLE public.drafts (
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
CREATE TABLE public.draft_picks (
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
CREATE TABLE public.team_rosters (
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    golfer_id UUID REFERENCES public.golfers(id) ON DELETE CASCADE,
    acquired_via acquire_method DEFAULT 'draft',
    acquired_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (team_id, golfer_id)
);

-- 12. WEEKLY LINEUPS
CREATE TABLE public.weekly_lineups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    locked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (team_id, tournament_id)
);

-- 13. LINEUP GOLFERS
CREATE TABLE public.lineup_golfers (
    lineup_id UUID REFERENCES public.weekly_lineups(id) ON DELETE CASCADE,
    golfer_id UUID REFERENCES public.golfers(id) ON DELETE CASCADE,
    is_starter BOOLEAN DEFAULT false,
    PRIMARY KEY (lineup_id, golfer_id)
);

-- 14. GOLFER ROUND STATS
CREATE TABLE public.golfer_round_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    golfer_id UUID REFERENCES public.golfers(id) ON DELETE CASCADE,
    round INT NOT NULL,
    score INT,
    birdies INT DEFAULT 0,
    eagles INT DEFAULT 0,
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
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_golfers_updated_at BEFORE UPDATE ON public.golfers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_tournaments_updated_at BEFORE UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_leagues_updated_at BEFORE UPDATE ON public.leagues FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_drafts_updated_at BEFORE UPDATE ON public.drafts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_weekly_lineups_updated_at BEFORE UPDATE ON public.weekly_lineups FOR EACH ROW EXECUTE FUNCTION set_updated_at();
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
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Golfers/Tournaments/Stats: Viewable by everyone, insert/update restricted to admin in production (open for now or handled by service role)
CREATE POLICY "Golfers are viewable by everyone" ON public.golfers FOR SELECT USING (true);
CREATE POLICY "Golfer aliases are viewable by everyone" ON public.golfer_aliases FOR SELECT USING (true);
CREATE POLICY "Tournaments are viewable by everyone" ON public.tournaments FOR SELECT USING (true);
CREATE POLICY "Tournament golfers are viewable by everyone" ON public.tournament_golfers FOR SELECT USING (true);
CREATE POLICY "Golfer round stats are viewable by everyone" ON public.golfer_round_stats FOR SELECT USING (true);

-- Leagues: Anyone can read leagues. Authenticated users can create. Commissioners can update.
CREATE POLICY "Leagues are viewable by everyone" ON public.leagues FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create leagues" ON public.leagues FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Commissioners can update their leagues" ON public.leagues FOR UPDATE USING (auth.uid() = commissioner_id);

-- League Members: Viewable by everyone. Authenticated users can insert (join).
CREATE POLICY "League members viewable by everyone" ON public.league_members FOR SELECT USING (true);
CREATE POLICY "Users can join leagues" ON public.league_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave leagues" ON public.league_members FOR DELETE USING (auth.uid() = user_id);

-- Teams: Viewable by everyone. Users manage their own team.
CREATE POLICY "Teams viewable by everyone" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Users can create their own team" ON public.teams FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own team" ON public.teams FOR UPDATE USING (auth.uid() = user_id);

-- Drafts: Viewable by everyone. Commissioners can update.
CREATE POLICY "Drafts viewable by everyone" ON public.drafts FOR SELECT USING (true);
CREATE POLICY "Commissioners can manage drafts" ON public.drafts FOR ALL USING (
    EXISTS (SELECT 1 FROM public.leagues WHERE leagues.id = drafts.league_id AND leagues.commissioner_id = auth.uid())
);

-- Draft Picks: Viewable by everyone. Authenticated users can insert picks during draft.
CREATE POLICY "Draft picks viewable by everyone" ON public.draft_picks FOR SELECT USING (true);
CREATE POLICY "Users can make picks for their team" ON public.draft_picks FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.teams WHERE teams.id = draft_picks.team_id AND teams.user_id = auth.uid())
);

-- Team Rosters: Viewable by everyone. System/users can manage based on actions.
CREATE POLICY "Team rosters viewable by everyone" ON public.team_rosters FOR SELECT USING (true);
CREATE POLICY "Users can manage their rosters" ON public.team_rosters FOR ALL USING (
    EXISTS (SELECT 1 FROM public.teams WHERE teams.id = team_rosters.team_id AND teams.user_id = auth.uid())
);

-- Weekly Lineups: Viewable by everyone. Users manage their own.
CREATE POLICY "Weekly lineups viewable by everyone" ON public.weekly_lineups FOR SELECT USING (true);
CREATE POLICY "Users can manage their lineups" ON public.weekly_lineups FOR ALL USING (
    EXISTS (SELECT 1 FROM public.teams WHERE teams.id = weekly_lineups.team_id AND teams.user_id = auth.uid())
);

-- Lineup Golfers: Viewable by everyone. Users manage their own.
CREATE POLICY "Lineup golfers viewable by everyone" ON public.lineup_golfers FOR SELECT USING (true);
CREATE POLICY "Users can manage lineup golfers" ON public.lineup_golfers FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.weekly_lineups 
        JOIN public.teams ON teams.id = weekly_lineups.team_id 
        WHERE weekly_lineups.id = lineup_golfers.lineup_id AND teams.user_id = auth.uid()
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

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
