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

## Phase 12 — Polish & Optimization ✅

> **Goal:** Enhance PWA mobile experience and overall application feel.

### Tasks
- [x] **Main Dashboard**: Replace simple lists with a "Cockpit" view:
  - [x] High-level "My Leagues" widget (points/rank summary).
  - [x] "Upcoming Tournament" card with course info & quick links.
  - [x] Team summary (active golfers status).
- [x] **Micro-animations**: Integrate `framer-motion` for smoother user experience:
  - [x] Page transitions (Exit/Enter fades).
  - [x] Interactive hover effects on cards.
  - [x] Loading skeletons for data-heavy views.
- [x] **Dark mode toggle**: Implement global theme management and persistence.
- [x] **Error Boundaries & Empty States**: Replace white screens/empty lists with user-friendly feedback.
- [x] **Responsive Navigation**: (Already implemented in Phase 11/18 updates)
- [x] **Performance Optimization**: (Already implemented with React.lazy)

---

## Phase 13 — Expanded Commissioner Powers & Team Governance ✅

- [x] Un-lock League Settings page completely post-draft for commissioners (allowing post-draft edits to max_teams, roster_size, etc).
- [x] Add Sub-Tab Navigation in League Settings: Break settings into "Core Info", "Scoring", "Draft Order", and "Teams" (to manage names and owners).
- [x] Team Claiming logic: When a user joins via invite code, prompt them to pick which orphaned/placeholder team they want to claim from a list.
- [x] Orphan a Team (Remove Owner): Allow commissioners (via Teams settings tab) to detach a user from a team.
- [x] Commissioner Roster Manipulation: Allow the commissioner to view any team's Roster tab and manipulate it as if they were the owner.
- [x] Post-Draft Pick Editing (Optional): Allow commissioners to manually swap picks or adjust draft boards retroactively if errors occurred without resetting the whole draft.
- [x] Transfer Team Ownership: Allow commissioners to manually assign an "orphaned" team to a specific new user.
- [x] **Bug Fix**: Resolved RLS policy violation on `league_members` that prevented commissioners from assigning owners to orphaned teams.

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
- [x] Modify Waivers logic: If `draft_cycle` is 'tournament', waiver rule automatically behaves as "free agency" (unrestricted add/drops) until the tournament locks.
- [x] Update "Roster" tab to display player scores mirroring the individual golfers panel in the Leaderboard, refreshing after each scrape.
- [x] Ensure the "Roster" tab tournament filter accurately displays historical (locked) rosters for previous tournaments.
- [x] Verify that cumulative scoring correctly groups points by team across multiple tournaments regardless of roster turnover.
---

## Phase 16 — Advanced Draft Order Management & Randomizer ✅

- [x] **Tournament-Based Draft Order Filter**:
    - [x] Add a tournament filter (from `Schedule`) to the "Draft Order" sub-tab in League Settings.
    - [x] Allow viewing historical draft orders for each tournament.
    - [x] If `draft_cycle` is 'tournament', ensure only upcoming tournaments can have their order randomized/set.
- [x] **Draft Order Randomizer (Spinning Wheel)**:
    - [x] Implement a "Randomize Order" mode for commissioners.
    - [x] Build a spinning wheel UI component that lists all teams in the league.
    - [x] Randomization Logic:
        - [x] Click button → Wheel spins → Selects a team.
        - [x] Selected team is assigned to the next available draft slot (1, 2, 3...).
        - [x] Selected team is removed from the wheel for subsequent spins.
        - [x] Repeat until all teams are assigned a slot.
- [x] **Draft Initialization & "Set Order" Logic**:
    - [x] Add a "Confirm & Set Draft Order" button once the wheel has finished all picks.
    - [x] Implement `setDraftOrder` logic:
        - [x] Update `drafts` table with the new order and associated `tournament_id`.
        - [x] Initialize the draft for that tournament (status: 'pending' or 'active').
        - [x] Update the League Settings filter to include the newly targeted tournament.
- [x] **UI Polish**:
    - [x] Sound effects and visual flair for the spinning wheel.
    - [x] "Draft Order Set" success state and redirection options.

---

## Phase 17 — Automated Tournament Field Scraper

- [x] **Next Tournament Discovery**: Add `fetchUpcomingTournament()` to find the first tournament in the database with a `start_date` on or after the current local date.
- [x] **Field Scraping Logic**: Implement `scrapeTournamentField(tournamentId: string)`:
    - Fetch the ESPN scoreboard/event data.
    - Match the ESPN competitors to the master `golfers` list using the existing fuzzy matching and alias system.
    - Sync the matched golfers into the `tournament_golfers` table for the specified tournament.
- [x] **New Golfer Detection**: Add logic to flag golfers who exist in the ESPN field but are missing from the master `golfers` table, allowing for manual addition.
- [x] Add Admin UI to trigger this for the upcoming tournament.
- [x] **Awaiting Draft Status**: If `draft_cycle` is 'tournament' and the draft for the selected tournament is not completed, golfers show as 'Awaiting Draft' and adding is disabled.
- [x] **Live Refresh on Scrape**: Implement Supabase Realtime subscription in `GolfersTab` to automatically refresh the list when the tournament field is updated via scraper.

---

## Phase 18 — Tournament-Scoped Rosters & Bug Fixes ✅

> **Goal:** Fix per-tournament roster management so rosters don't bleed across tournaments, historical rosters are preserved, and the Golfers tab filter works correctly.

### Step 1: Database Migration
- [x] Add `tournament_id` column (nullable FK → `tournaments`) to `team_rosters`.
- [x] Update the `team_rosters` primary key to `(team_id, golfer_id, tournament_id)` so per-tournament uniqueness is enforced.
- [x] Add `espn_event_id` column to `tournaments` table for reliable ESPN linking.
- [x] Update RLS policies for modified tables.

### Step 2: Fix Roster Scoping
- [x] **`draftService.ts`**: Stop destructively deleting all rosters in `startDraft()`. Instead, create new roster entries with the new `tournament_id`.
- [x] **`rosterService.ts`**: Update `getTeamRoster()` to accept optional `tournamentId`. When `draft_cycle === 'tournament'`, filter by tournament.
- [x] **`rosterService.ts`**: Update `addGolfer()` to include `tournament_id` when applicable.
- [x] **`GolfersTab.tsx`**: Filter roster status by selected tournament for per-tournament leagues (fix "On Roster" bleeding from previous tournaments).
- [x] **`RosterTab.tsx`**: Pass tournament context to roster queries. Historical roster viewing preserved for free.
- [x] **Supabase trigger** (`advance_draft_pick_fn`): If it exists, update to include `tournament_id` in roster inserts.
- [x] **Roster history**: Show roster as it was at tournament end. Optionally annotate any mid-tournament transactions.

### Step 3: Fix "All Golfers" Filter Reset
- [x] **`GolfersTab.tsx`**: Add `isInitialLoad` ref so auto-selection of the upcoming tournament only happens on first mount, not on every `loadData()` re-run.
- [x] Ensure selecting "All Golfers (No Filter)" stays selected and doesn't snap back.

---

## Phase 19 — Scraper Infrastructure & Golfer Profiles

> **Goal:** Replace all CSV imports with automated ESPN scrapers. Add golfer profile data and player card UI.

### Scraper 1: Season Schedule Scraper
- [ ] Implement `scrapeSeasonSchedule()` in `scraperService.ts`.
    - Source: ESPN Calendar endpoint (`leagues[0].calendar[]`).
    - Upsert into `tournaments` table with `espn_event_id`, name, and dates.
    - Commissioner selects which tournaments the league will play from the full schedule.
- [ ] Add Admin UI button ("Sync Schedule").

### Scraper 2: PGA Tour Player Roster Scraper
- [ ] Implement `scrapePGAPlayers()` in `scraperService.ts`.
    - Source: ESPN Athletes endpoint (`/athletes?limit=500`).
    - Upsert into `golfers` table (match by name/alias, create new entries for unknowns).
    - Optionally seed basic `golfer_profiles` data (country, photo).
- [ ] Add Admin UI button ("Sync Players").

### Scraper 3: Golfer Profiles & Rankings Scraper
- [ ] Create `golfer_profiles` table in Supabase:
    - `golfer_id` (PK, FK → golfers), `country`, `country_flag`, `photo_url`, `birth_date`, `turned_pro_year`, `college`, `owgr_rank`, `fedex_rank`, `wins`, `top_10s`, `cuts_made`, `events_played`, `scoring_avg`, `season_year`, `updated_at`.
- [ ] Implement `scrapeGolferProfiles()` in `scraperService.ts`.
    - Source: Individual ESPN athlete pages.
    - Current-season stats + career highlights.
    - Rate-limited batching (~50ms between calls).
- [ ] Add Admin UI button ("Refresh Profiles").
- [ ] Add RLS policies for `golfer_profiles`.

### Scraper 4: Golfer Odds Scraper
- [x] **Database Migration**: Add `odds` column (INT) to `tournament_golfers` table in Supabase.
- [x] **Odds API Integration**: Implement `scrapeGolferOdds(tournamentId: string, eventName: string)` in `scraperService.ts`.
    - Source: `the-odds-api.com` v4 API (Market: `outrights`, Format: `american`).
    - Map Odds API sport keys to upcoming tournaments.
    - Match golfer names and upsert odds into `tournament_golfers`.
- [x] **Admin UI Integration**: Add "Sync Odds" button to `AdminImport.tsx` targeting the upcoming tournament.
- [x] **Golfers Tab UI**: Add "Odds" column to `GolfersTab.tsx`, support sorting by odds, and format values with "+" prefix.

### Golfer Card UI
- [ ] Create `GolferCard` component (modal or expandable card).
    - Photo, country flag, rankings (OWGR, FedEx).
    - Season stats: events played, wins, top-10s, cuts made, scoring avg.
    - Career highlights summary.
- [ ] Make golfer names clickable throughout the app (Golfers tab, Roster tab, Leaderboard, Draft).
- [ ] Opens `GolferCard` on click.

### Unified Scraper Dashboard
- [ ] Reorganize `AdminImport.tsx` into a clean, ordered scraper panel:
    1. Sync Schedule → `tournaments`
    2. Sync Players → `golfers`
    3. Fetch Field → `tournament_golfers`
    4. Scrape Scores → `golfer_round_stats`
    5. Refresh Profiles → `golfer_profiles`

### Future: Automation Path
- [ ] Design scrapers to be callable via Supabase Edge Functions / cron:
    - Schedule sync: weekly
    - Player sync: monthly
    - Field scrape: 3 days before each tournament
    - Score scrape: every 15 min during active tournaments
    - Profile refresh: weekly

---

## Phase 20 — Tournament Information

- [ ] **Tournament Hub Page**: Details, field with rankings, leaderboard, and golfer stats specific to the event.
- [ ] **Course Intelligence**: Research and integrate course metadata (par, distance, course records, historical winners).
- [ ] **Historical Context**: Display previous years' results for the same event where available.
- [ ] **Tournament Media**: Add support for course maps or high-quality tournament-specific imagery.
