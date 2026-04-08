import { supabase } from '../lib/supabase'

export interface Draft {
  id: string
  league_id: string
  status: 'pending' | 'active' | 'completed' | 'paused'
  current_round: number
  current_pick: number
  draft_order: string[] // Array of team_ids
  tournament_id?: string
  is_locked?: boolean
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
  // Helper to find the most recent/upcoming tournament that has a field defined
  async getUpcomingTournamentId(): Promise<string | undefined> {
    const { data } = await supabase
      .from('tournament_golfers')
      .select('tournament_id, tournaments!inner(start_date)')
      .order('tournaments(start_date)', { ascending: false })
      .limit(1)
      .maybeSingle()
    
    return data?.tournament_id
  },

  // Start the draft for a league
  async startDraft(leagueId: string): Promise<string> {
    // 1. Get league settings
    const { data: league, error: leagueError } = await supabase
      .from('leagues')
      .select('max_teams, draft_cycle')
      .eq('id', leagueId)
      .single()

    if (leagueError) throw leagueError

    // 2. Ensure all placeholder teams exist in DB
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id')
      .eq('league_id', leagueId)

    if (teamsError) throw teamsError
    
    let finalTeamIds = teams.map(t => t.id)
    if (finalTeamIds.length < league.max_teams) {
       // We need to create placeholders if they weren't created yet
       const needed = league.max_teams - finalTeamIds.length
       const placeholders = []
       for (let i = 0; i < needed; i++) {
         placeholders.push({
           league_id: leagueId,
           team_name: `Team ${finalTeamIds.length + i + 1}`,
           user_id: null
         })
       }
       const { data: created, error: createError } = await supabase
         .from('teams')
         .insert(placeholders)
         .select('id')
       
       if (createError) throw createError
       finalTeamIds = [...finalTeamIds, ...(created?.map(c => c.id) || [])]
    }

    // 3. Check for existing draft
    const { data: existingDraft } = await supabase
      .from('drafts')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingDraft && existingDraft.status !== 'completed') {
      // If we have an existing draft, use its order if ready, otherwise shuffle
      const order = (existingDraft.draft_order && existingDraft.draft_order.length === league.max_teams)
        ? existingDraft.draft_order
        : [...finalTeamIds].sort(() => Math.random() - 0.5)

      const { data: draft, error: updateError } = await supabase
        .from('drafts')
        .update({
          status: 'active',
          draft_order: order,
          current_round: 1,
          current_pick: 1
        })
        .eq('id', existingDraft.id)
        .select('id')
        .single()

      if (updateError) throw updateError

      // 4. Update league status
      await supabase.from('leagues').update({ draft_status: 'active' }).eq('id', leagueId)
      
      return draft.id
    } else {
      // Create new draft
      const tournamentId = await this.getUpcomingTournamentId()

      // Per-tournament rosters are now scoped by tournament_id in team_rosters.
      // The draft trigger (advance_draft_pick_fn) inserts roster entries with the
      // draft's tournament_id, so historical rosters from previous tournaments
      // are preserved automatically. No need to delete old rosters.

      const shuffledIds = [...finalTeamIds].sort(() => Math.random() - 0.5)

      const { data: draft, error: draftError } = await supabase
        .from('drafts')
        .insert({
          league_id: leagueId,
          status: 'active',
          current_round: 1,
          current_pick: 1,
          draft_order: existingDraft && existingDraft.status === 'completed' && league.draft_cycle === 'tournament' 
             ? existingDraft.draft_order : shuffledIds,
          tournament_id: tournamentId
        })
        .select('id')
        .single()

      if (draftError) throw draftError

      // 4. Update league status
      await supabase.from('leagues').update({ draft_status: 'active' }).eq('id', leagueId)

      return draft.id
    }
  },

  async getDraftByLeague(leagueId: string): Promise<Draft | null> {
    const { data, error } = await supabase
      .from('drafts')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data
  },

  async getDraftByTournament(leagueId: string, tournamentId: string): Promise<Draft | null> {
    const { data, error } = await supabase
      .from('drafts')
      .select('*')
      .eq('league_id', leagueId)
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data
  },

  async getAllDraftsByLeague(leagueId: string): Promise<Draft[]> {
    const { data, error } = await supabase
      .from('drafts')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  async getDraftPicks(draftId: string): Promise<any[]> {
    // 1. Get the draft to know the tournament_id
    const { data: draft } = await supabase.from('drafts').select('tournament_id').eq('id', draftId).single()

    const { data, error } = await supabase
      .from('draft_picks')
      .select(`
        *,
        golfer:golfers(name)
      `)
      .eq('draft_id', draftId)
      .order('pick_number', { ascending: true })

    if (error) throw error
    if (!data || !draft?.tournament_id) return data || []

    // 2. Fetch odds for these golfers in this tournament
    const golferIds = data.map(p => p.golfer_id)
    const { data: oddsData } = await supabase
      .from('tournament_golfers')
      .select('golfer_id, odds')
      .eq('tournament_id', draft.tournament_id)
      .in('golfer_id', golferIds)
    
    const oddsMap: Record<string, number> = {}
    oddsData?.forEach(o => {
      oddsMap[o.golfer_id] = o.odds
    })

    // 3. Attach odds to picks
    return data.map(p => ({
      ...p,
      odds: oddsMap[p.golfer_id]
    }))
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

  async editDraftPick(
    pickId: string,
    teamId: string,
    oldGolferId: string,
    newGolferId: string
  ): Promise<void> {
    // 1. Update the draft pick
    const { error: pickError } = await supabase
      .from('draft_picks')
      .update({ golfer_id: newGolferId })
      .eq('id', pickId)

    if (pickError) throw pickError

    // 2. Update the team's roster to swap the generic acquired via draft golfer
    const { error: rosterError } = await supabase
      .from('team_rosters')
      .update({ golfer_id: newGolferId })
      .eq('team_id', teamId)
      .eq('golfer_id', oldGolferId)

    if (rosterError) throw rosterError
  },

  async getAvailableGolfers(draftId: string) {
    // 1. Get drafted golfers
    const { data: picks } = await supabase
      .from('draft_picks')
      .select('golfer_id')
      .eq('draft_id', draftId)
    
    const pickedIds = picks?.map(p => p.golfer_id) || []

    // 2. Find the most recent tournament that has a field defined
    const tournamentId = await this.getUpcomingTournamentId()

    // 3. Fetch golfers in the field for this tournament, excluding picked ones
    let query = supabase
      .from('tournament_golfers')
      .select(`
        owg_rank,
        odds,
        golfer:golfers!inner(*)
      `)
      .eq('tournament_id', tournamentId)
      .order('odds', { ascending: true, nullsFirst: false })
      .order('owg_rank', { ascending: true })

    if (pickedIds.length > 0) {
      query = query.not('golfer_id', 'in', `(${pickedIds.join(',')})`)
    }

    const { data: field, error } = await query
    if (error) throw error

    // 4. Transform and return
    return field?.map(f => ({
      ...(f.golfer as any),
      owg_rank: f.owg_rank || 9999,
      odds: f.odds // Ensure this property is explicitly set and returned
    })) || []
  },

  async resetDraft(leagueId: string): Promise<void> {
    // 1. Get the draft ID and tournament_id
    const { data: draft } = await supabase
      .from('drafts')
      .select('id, tournament_id')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!draft) return

    // 2. Delete all picks
    await supabase.from('draft_picks').delete().eq('draft_id', draft.id)
    
    // Clean up rosters too for this league
    const { data: teams } = await supabase.from('teams').select('id').eq('league_id', leagueId)
    if (teams && teams.length > 0) {
      if (draft.tournament_id) {
        // Per-tournament: only wipe rosters for the draft being reset
        await supabase.from('team_rosters').delete()
          .in('team_id', teams.map(t => t.id))
          .eq('tournament_id', draft.tournament_id)
      } else {
        // Season-long: wipe all rosters
        await supabase.from('team_rosters').delete().in('team_id', teams.map(t => t.id))
      }
    }

    // 3. Delete placeholder teams (teams with no user_id)
    await supabase.from('teams').delete().eq('league_id', leagueId).is('user_id', null)

    // 4. Delete the draft record
    await supabase.from('drafts').delete().eq('id', draft.id)

    // 5. Reset league status
    await supabase.from('leagues').update({ draft_status: 'pending' }).eq('id', leagueId)
  },

  async clearDraftPicks(draftId: string): Promise<void> {
    // 1. Delete all picks for this draft
    await supabase.from('draft_picks').delete().eq('draft_id', draftId)
    
    // 2. Reset draft progress and status
    const { error } = await supabase
      .from('drafts')
      .update({
        current_round: 1,
        current_pick: 1,
        status: 'pending'
      })
      .eq('id', draftId)
    
    if (error) throw error
  },

  async jumpToPick(draftId: string, round: number, pickNumber: number): Promise<void> {
    const { error } = await supabase
      .from('drafts')
      .update({
        current_round: round,
        current_pick: pickNumber,
        status: 'pending' // Workaround for missing 'paused' enum value
      })
      .eq('id', draftId)
    
    if (error) throw error
  },

  async pauseDraft(draftId: string): Promise<void> {
    const { error } = await supabase
      .from('drafts')
      .update({ status: 'pending' }) // Workaround for missing 'paused' enum value
      .eq('id', draftId)
    if (error) throw error
  },

  async resumeDraft(draftId: string): Promise<void> {
    const { error } = await supabase
      .from('drafts')
      .update({ status: 'active' })
      .eq('id', draftId)
    if (error) throw error
  },

  async undoLastPick(draftId: string): Promise<void> {
    // 1. Get the latest pick
    const { data: latestPick, error: fetchError } = await supabase
      .from('draft_picks')
      .select('*')
      .eq('draft_id', draftId)
      .order('pick_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!latestPick) return

    // 2. Delete the pick. The trigger (if any) might not handle UNDO. 
    // We need to manually revert draft state too.
    const { error: deleteError } = await supabase
      .from('draft_picks')
      .delete()
      .eq('id', latestPick.id)

    if (deleteError) throw deleteError

    // 3. Revert draft round/pick
    const { data: draft } = await supabase.from('drafts').select('*').eq('id', draftId).single()
    if (draft) {
      // Logic to decrement pick number
      let prevPick = draft.current_pick - 1
      let prevRound = draft.current_round
      
      if (prevPick < 1) {
        prevPick = 1
      }
      // Need to handle round decrement if pick was 1... but advance_draft_pick_fn handles ADVANCE.
      // For UNDO to be reliable, we'd need a robust backend function.
      // For now, we'll try to just update the draft table.
      
      const { data: allTeams } = await supabase.from('teams').select('id').eq('league_id', draft.league_id)
      const numTeams = allTeams?.length || 1
      
      prevRound = Math.ceil(prevPick / numTeams)
      if (prevPick === 0) {
          prevPick = 1
          prevRound = 1
      }

      await supabase.from('drafts').update({
        current_pick: prevPick,
        current_round: prevRound,
        status: 'active' // Ensure it's not 'completed' anymore
      }).eq('id', draftId)
      
      // Also remove from roster
      await supabase.from('team_rosters')
        .delete()
        .eq('team_id', latestPick.team_id)
        .eq('golfer_id', latestPick.golfer_id)
    }
  },

  async updateDraftOrder(leagueId: string, teamIds: string[], tournamentId?: string): Promise<void> {
    // If tournamentId is provided, we look for that specific draft
    const query = supabase
      .from('drafts')
      .select('id, status, is_locked')
      .eq('league_id', leagueId)
    
    if (tournamentId) {
      query.eq('tournament_id', tournamentId)
    }

    const { data: existingDraft } = await query
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingDraft && existingDraft.is_locked) {
      throw new Error('This draft order is locked and cannot be modified.')
    }

    if (existingDraft && existingDraft.status !== 'completed') {
      const { error } = await supabase
        .from('drafts')
        .update({ draft_order: teamIds })
        .eq('id', existingDraft.id)
      if (error) throw error
    } else {
      const { data: league } = await supabase.from('leagues').select('draft_cycle').eq('id', leagueId).single()
      
      if (!existingDraft || league?.draft_cycle === 'tournament') {
        const targetTournamentId = tournamentId || await this.getUpcomingTournamentId()
        const { error } = await supabase
          .from('drafts')
          .insert({
            league_id: leagueId,
            draft_order: teamIds,
            status: 'pending',
            current_round: 1,
            current_pick: 1,
            tournament_id: targetTournamentId
          })
        if (error) throw error
      }
    }
  },

  async lockDraftOrder(draftId: string, locked: boolean): Promise<void> {
    const { error } = await supabase
      .from('drafts')
      .update({ is_locked: locked })
      .eq('id', draftId)
    if (error) throw error
  }
}
