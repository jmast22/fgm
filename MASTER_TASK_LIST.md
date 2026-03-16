# Fantasy Golf League — Master Task List

> Season-long fantasy golf PWA: draft PGA golfers, set weekly lineups, compete for fantasy points.  
> **Stack:** React + TailwindCSS v4 + Supabase + Vercel

---

## Phase 1 — Project Scaffolding & Infrastructure ✅

- [x] Initialize React + Vite + TypeScript project
- [x] Install deps: Supabase JS, React Router, TailwindCSS v4, PWA plugin
- [x] Configure TailwindCSS with golf-inspired theme (green/gold palette, dark mode)
- [x] Configure `.env` with Supabase credentials
- [x] Set up folder structure (`components`, `pages`, `services`, `workers`, `types`, `hooks`, `context`, `lib`, `data`)
- [x] Configure PWA manifest & service worker
- [x] Create app layout shell (responsive header + mobile bottom nav)
- [x] Create Dashboard page placeholder
- [x] Supabase client (`src/lib/supabase.ts`)

---

## Phase 2 — Supabase Database Schema

- [x] Design full ERD (all tables + relationships)
- [x] `golfers` table (id, name, age)
- [x] `golfer_aliases` table (id, golfer_id, alias_name)
- [x] `tournaments` table (id, name, start_date, end_date, course, city, state, country, status)
- [x] `tournament_golfers` table (tournament_id, golfer_id, dg_rank, owg_rank, tour_rank)
- [x] `profiles` table (extends auth.users — display_name, avatar_url)
- [x] `leagues` table (id, name, commissioner_id, roster_size, weekly_starters, season_year, draft_status, invite_code)
- [x] `league_members` table (league_id, user_id)
- [x] `teams` table (id, league_id, user_id, team_name)
- [x] `drafts` table (id, league_id, status, current_round, current_pick, draft_order)
- [x] `draft_picks` table (id, draft_id, team_id, golfer_id, round, pick_number)
- [x] `team_rosters` table (team_id, golfer_id, acquired_via)
- [x] `weekly_lineups` table (id, team_id, tournament_id, locked_at)
- [x] `lineup_golfers` table (lineup_id, golfer_id, is_starter)
- [x] `golfer_round_stats` table (id, tournament_id, golfer_id, round, score, birdies, eagles, updated_at)
- [x] RLS policies for all tables
- [x] SQL migration script

---

## Phase 3 — Authentication & User Profiles ✅

- [x] Supabase Auth client + helper functions
- [x] Sign Up page (email/password)
- [x] Login page (email/password)
- [x] Auth context/provider + protected routes
- [x] User profile page (display name, avatar)
- [x] App layout shell with auth integration

---

## Phase 4 — CSV Data Import System ✅

- [x] CSV parser utility (handles special characters: Åberg, Højgaard, etc.)
- [x] Master golfer import (`2026_complete_player_list.csv` → `golfers` + auto-generate aliases)
- [x] Schedule import (`schedule.csv` → `tournaments`)
- [x] Tournament field import (`players_field_<name>.csv` → `tournament_golfers` with rankings)
- [x] Admin import UI page (file upload, preview, error reporting)
- [x] Seed initial data (188 golfers, 8 tournaments, The Players field) (can be done via Admin UI)

---

## Phase 5 — League System ✅

- [x] Create League page (name, roster size 6–10, weekly starters 4–6)
- [x] League invite system (unique code, share link, join via code)
- [x] League Dashboard page (standings, members, rosters)
- [x] My Leagues list on dashboard
- [x] Commissioner settings (edit league, manage members, start draft)

---

## Phase 6 — Snake Draft System ✅

- [x] Snake draft engine (1-2-3...3-2-1 order, turn management)
- [x] Draft lobby (pre-draft order view, available golfers)
- [x] Live draft board UI (pick history, search/filter, current pick indicator)
- [x] Golfer card component (name, age, rankings)
- [x] Draft pick logic (select → validate → save → advance)
- [x] Supabase Realtime for live draft updates
- [ ] Auto-pick / timer (optional: auto-pick best available on timeout)
- [x] Post-draft summary (all teams + rosters)
- [x] Commissioner UI for editing roster size, weekly starters, numbers of teams

---

## Phase 7 — UI & Navigation Overhaul ✅

- [x] Refactor `AppLayout` to remove global navigation from header (minimal header)
- [x] Hide/Remove Admin button from main navigation
- [x] Add "Back to Dashboard" button on all league-specific pages
- [x] Implement nested navigation on League Page (Roster, League, Draft, Settings, Schedule)
- [x] Style league navigation as a premium internal tab system
- [x] Transition `LeagueDashboard` to a component-based layout for tabs

---

## Phase 8 — Weekly Lineup Management

- [x] Set Lineup page (toggle starters vs bench)
- [x] Lineup validation (enforce weekly starter count)
- [x] Lineup lock logic (lock at tournament start, prevent edits)
- [x] Auto-set lineup (default to previous week's starters)
- [x] Lineup status indicators (playing in tournament field vs not entered)

---

## Phase 9 — Trades & Waivers ✅
- [x] Add `trades` table and `waiver_rule` to `leagues`
- [x] "Golfers" tab (undrafted players list with stats)
- [x] "Trades" tab (Trade Block, Active Offers, History)
- [x] Implement trade proposal logic (Propose Trade modal)
- [x] Implement trade acceptance/rejection execution
- [x] Implement golfer add/drop logic (Waivers)
- [x] Trade history log details

---

## Phase 10 — Fantasy Scoring & Leaderboard

- [x] Scoring service: Round Scoring engine (strokes +/- par per round)
- [x] Missed cut penalty logic (avg of 10 worst cut-makers, min +4)
- [x] Leaderboard tab (between Roster and Golfers) with tournament filter
- [x] Team standings panel (R1, R2, R3, R4, Total)
- [x] Individual golfer scores panel (round-by-round + expandable placeholder for hole-by-hole)
- [x] Golfers tab: show all golfers with season stats, OWGR, tournaments played
- [x] Golfers tab: "On Roster" toggle filter + sort options (OWGR, Score, Name)
- [x] Scoring Settings sub-tab: display both scoring options (Round Scoring active, Hole Scoring coming soon)
- [x] Add `made_cut` column to `golfer_round_stats` schema
- [x] Seed script for The Players Championship mock data
- [x] Admin UI seed button for The Players Championship
- [x] Season Standings (cumulative scores, league rankings, tournaments played count)
- [x] Live leaderboard updates (Supabase Realtime on `golfer_round_stats` with LIVE badge)
- [x] Weekly matchup results (roto style — expandable Schedule rows with all team positions)

---

## Phase 11 — Scraper & Live Stats ✅

- [x] Research PGATour.com leaderboard data format (Using ESPN API)
- [x] Build scraper worker (`scraperService.ts`)
- [x] Research & Test ESPN API (Round Scoring only)
- [x] Create Scraper Service logic
- [x] Match Scraped Names to DB Golfers (Exact + Normalized + Aliases)
- [x] Implement error handling & unmatched name reporting
- [x] Add Admin UI for manual scrape trigger
- [x] **Bug Fix**: Refined cut status detection logic to handle players who made the cut but haven't teed off for the current round.
- [x] **Schema**: Standardized RLS policies for admin data management.
- [x] Manual trigger UI (Admin dashboard section)

---

## Phase 12 — Polish & Optimization

- [ ] Main Dashboard (active leagues, upcoming tournaments, team summary)
- [ ] Tournament page (details, field with rankings, leaderboard, golfer stats)
- [ ] Responsive navigation (bottom tabs mobile, sidebar desktop, breadcrumbs)
- [ ] Micro-animations (page transitions, hover effects, loading skeletons)
- [ ] Dark mode toggle
- [ ] Error boundaries & empty states
- [ ] Performance optimization (code splitting, lazy loading)

---

## Phase 13 — Expanded Commissioner Powers & Team Governance

- [x] Un-lock League Settings page completely post-draft for commissioners (allowing post-draft edits to max_teams, roster_size, etc).
- [x] Add Sub-Tab Navigation in League Settings: Break settings into "Core Info", "Scoring", "Draft Order", and "Teams" (to manage names and owners).
- [ ] Team Claiming logic: When a user joins via invite code, prompt them to pick which orphaned/placeholder team they want to claim from a list.
- [x] Orphan a Team (Remove Owner): Allow commissioners (via Teams settings tab) to detach a user from a team.
- [x] Commissioner Roster Manipulation: Allow the commissioner to view any team's Roster tab and manipulate it as if they were the owner.
- [x] Post-Draft Pick Editing (Optional): Allow commissioners to manually swap picks or adjust draft boards retroactively if errors occurred without resetting the whole draft.
- [ ] Transfer Team Ownership: Allow commissioners to manually assign an "orphaned" team to a specific new user.

---

## Data Files

| File | Purpose | Records |
|------|---------|---------|
| `data/2026_complete_player_list.csv` | Master golfer list (Name, Age) | 188 |
| `data/schedule.csv` | Season tournament schedule | 8 |
| `data/players_field_the_players.csv` | The Players Championship field + rankings | 124 |

## Key Decisions

| Decision | Approach |
|----------|----------|
| Golfer IDs | Auto-generated UUIDs |
| Name matching | Canonical name + aliases table |
| Tournament fields | `players_field_<name>.csv` with per-tournament rankings |
| Fantasy scoring | Round Scoring: strokes +/- par per round (with missed cut penalty) |
| Scraper source | PGATour.com, manual trigger after each round |
| Scoring Option 2 | Hole Scoring: per-hole points + add-ons (Phase 14, API-based) |

---

## Phase 14 — Hole Scoring Engine & API Integration

- [ ] Research and integrate golf scores API (hole-by-hole data)
- [ ] Hole Scoring engine: Eagle+ +7, Birdie +3, Par +0.5, Bogey -1, Double+ -3
- [ ] Overall Finish add-on (1st: +30, 2nd: +20, ... 41st+: 0)
- [ ] Round Bonus add-ons (5+ birdies: +5, no bogeys: +5)
- [ ] Commissioner toggle between Round Scoring and Hole Scoring
- [ ] Hole-by-hole golfer detail view (expandable in Leaderboard)
- [ ] Store hole-by-hole data in new `golfer_hole_stats` table

---

## Phase 15 — Tournament Redrafting & Roster History

- [x] Add `draft_cycle` column to `leagues` table (options: 'season', 'tournament' - default: 'season').
- [x] Update League Settings (Core Info) UI to include a "Draft Cycle" dropdown selection.
- [x] Update League Settings (Draft Order) to allow saving a new draft order per tournament when `draft_cycle` is 'tournament'.
- [x] Update drafting engine to support initiating a fresh, new draft (no keepers) for each tournament if `draft_cycle` is 'tournament'.
- [x] Associate drafts in the `drafts` table with a specific `tournament_id` to preserve historical draft boards.
- [x] Add a tournament filter dropdown on the "Draft" tab to view past tournament draft boards.
- [ ] Modify Waivers logic: If `draft_cycle` is 'tournament', waiver rule automatically behaves as "free agency" (unrestricted add/drops) until the tournament locks.
- [ ] Update "Roster" tab to display player scores mirroring the individual golfers panel in the Leaderboard, refreshing after each scrape.
- [ ] Ensure the "Roster" tab tournament filter accurately displays historical (locked) rosters for previous tournaments.
- [ ] Verify that cumulative scoring correctly groups points by team across multiple tournaments regardless of roster turnover.

