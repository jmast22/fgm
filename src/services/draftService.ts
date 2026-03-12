import { supabase } from '../lib/supabase'

export interface Draft {
  id: string
  league_id: string
  status: 'pending' | 'in_progress' | 'completed' | 'paused'
  current_round: number
  current_pick: number
  draft_order: string[] // Array of team_ids
  created_at: string
}

export interface DraftPick {
  id: string
  draft_id: string
  team_id: string
  golfer_id: string
  round: number
  pick_number: number
  created_at: string
}

export interface DraftTeam {
  id: string
  team_name: string
  user_id: string
  profile: {
    display_name: string
  }
}

export const draftService = {
  // Start the draft for a league
  async startDraft(leagueId: string): Promise<string> {
    // 1. Get all teams in the league
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id')
      .eq('league_id', leagueId)

    if (teamsError) throw teamsError
    if (!teams || teams.length === 0) throw new Error('No teams in league to draft')

    // 2. randomize draft order
    const teamIds = teams.map(t => t.id)
    const shuffledIds = [...teamIds].sort(() => Math.random() - 0.5)

    // 3. Create draft record
    const { data: draft, error: draftError } = await supabase
      .from('drafts')
      .insert({
        league_id: leagueId,
        status: 'in_progress',
        current_round: 1,
        current_pick: 1,
        draft_order: shuffledIds,
      })
      .select('id')
      .single()

    if (draftError) throw draftError

    // 4. Update league status
    const { error: leagueError } = await supabase
      .from('leagues')
      .update({ draft_status: 'active' })
      .eq('id', leagueId)

    if (leagueError) throw leagueError

    return draft.id
  },

  async getActiveDraft(leagueId: string): Promise<Draft | null> {
    const { data, error } = await supabase
      .from('drafts')
      .select('*')
      .eq('league_id', leagueId)
      .not('status', 'eq', 'completed')
      .maybeSingle()

    if (error) throw error
    return data
  },

  async getDraftPicks(draftId: string): Promise<DraftPick[]> {
    const { data, error } = await supabase
      .from('draft_picks')
      .select('*')
      .eq('draft_id', draftId)
      .order('pick_number', { ascending: true })

    if (error) throw error
    return data || []
  },

  async makePick(
    draftId: string,
    teamId: string,
    golferId: string,
    round: number,
    pickNumber: number
  ): Promise<void> {
    // 1. Insert draft pick. The trigger `advance_draft_pick_fn` will handle:
    //    - updating draft round/pick
    //    - finalizing draft
    //    - inserting into team_rosters
    const { error: pickError } = await supabase
      .from('draft_picks')
      .insert({
        draft_id: draftId,
        team_id: teamId,
        golfer_id: golferId,
        round,
        pick_number: pickNumber,
      })
    if (pickError) throw pickError
  },

  async getAvailableGolfers(draftId: string) {
    // Gets all golfers not yet picked in this draft
    // Using a simpler approach: get all golfers + rankings, and filter out picked ones
    
    // First get drafted
    const { data: picks, error: picksError } = await supabase
      .from('draft_picks')
      .select('golfer_id')
      .eq('draft_id', draftId)
      
    if (picksError) throw picksError
    const pickedIds = picks?.map(p => p.golfer_id) || []

    // Then get all golfers
    let query = supabase
      .from('golfers')
      .select('*')
      
    if (pickedIds.length > 0) {
      // Normally we'd use .not('id', 'in', pickedIds) but if it's too long it might fail
      // Since it's <200 max, .not in is fine.
      query = query.not('id', 'in', `(${pickedIds.join(',')})`)
    }

    const { data: available, error } = await query
    if (error) throw error

    // Fetch some basic ranking data if possible. The `tournament_golfers` table has rankings for specific tournaments.
    // For general availibility, we might just sort by name or some arbitrary ranking.
    // For now just sort by name.
    return available?.sort((a, b) => a.name.localeCompare(b.name)) || []
  }
}
