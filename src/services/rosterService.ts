import { supabase } from '../lib/supabase'

export interface RosterGolfer {
  id: string
  name: string
  age: number
  acquired_via: string
  is_on_trade_block?: boolean
}

export interface LineupGolfer extends RosterGolfer {
  is_starter: boolean
}

export const rosterService = {
  /**
   * Get team roster, optionally scoped to a specific tournament.
   * For per-tournament leagues, pass tournamentId to see that tournament's roster.
   * For season-long leagues, omit tournamentId to see the full roster.
   */
  async getTeamRoster(teamId: string, tournamentId?: string) {
    let query = supabase
      .from('team_rosters')
      .select(`
        acquired_via,
        is_on_trade_block,
        tournament_id,
        golfer:golfers (*)
      `)
      .eq('team_id', teamId)

    if (tournamentId) {
      query = query.eq('tournament_id', tournamentId)
    }

    const { data, error } = await query

    if (error) throw error
    
    return data.map(item => ({
      ...(item.golfer as any),
      acquired_via: item.acquired_via,
      is_on_trade_block: item.is_on_trade_block
    })) as RosterGolfer[]
  },

  async getWeeklyLineup(teamId: string, tournamentId: string) {
    // 1. Get the lineup record
    const { data: lineup, error: lineupError } = await supabase
      .from('weekly_lineups')
      .select('id')
      .eq('team_id', teamId)
      .eq('tournament_id', tournamentId)
      .maybeSingle()

    if (lineupError) throw lineupError
    if (!lineup) return null

    // 2. Get the golfers in that lineup
    const { data: golfers, error: golfersError } = await supabase
      .from('lineup_golfers')
      .select(`
        is_starter,
        golfer:golfers (*)
      `)
      .eq('lineup_id', lineup.id)

    if (golfersError) throw golfersError

    return golfers.map(item => ({
      ...(item.golfer as any),
      is_starter: item.is_starter
    })) as LineupGolfer[]
  },

  async saveLineup(teamId: string, tournamentId: string, golfers: { golfer_id: string, is_starter: boolean }[]) {
    // 1. Ensure lineup record exists
    let { data: lineup, error: lineupError } = await supabase
      .from('weekly_lineups')
      .select('id')
      .eq('team_id', teamId)
      .eq('tournament_id', tournamentId)
      .maybeSingle()

    if (lineupError) throw lineupError

    if (!lineup) {
      const { data: newLineup, error: createError } = await supabase
        .from('weekly_lineups')
        .insert({
          team_id: teamId,
          tournament_id: tournamentId,
        })
        .select('id')
        .single()
      
      if (createError) throw createError
      lineup = newLineup
    }

    // 2. Delete existing lineup golfers
    const { error: deleteError } = await supabase
      .from('lineup_golfers')
      .delete()
      .eq('lineup_id', lineup!.id)

    if (deleteError) throw deleteError

    // 3. Insert new lineup golfers
    const { error: insertError } = await supabase
      .from('lineup_golfers')
      .insert(
        golfers.map(g => ({
          lineup_id: lineup!.id,
          golfer_id: g.golfer_id,
          is_starter: g.is_starter
        }))
      )

    if (insertError) throw insertError
  },

  async getAvailableGolfers(leagueId: string, tournamentId?: string) {
    // 1. Get all drafted golfer IDs in this league
    const { data: teams } = await supabase
      .from('teams')
      .select('id')
      .eq('league_id', leagueId)
    
    const teamIds = teams?.map(t => t.id) || []
    
    let rosterQuery = supabase
      .from('team_rosters')
      .select('golfer_id')
      .in('team_id', teamIds)
    
    // For per-tournament leagues, only exclude golfers rostered for THIS tournament
    if (tournamentId) {
      rosterQuery = rosterQuery.eq('tournament_id', tournamentId)
    }

    const { data: rosters } = await rosterQuery
    
    const draftedIds = rosters?.map(r => r.golfer_id) || []

    // 2. Get golfers NOT in draftedIds
    let query = supabase.from('golfers').select('*')
    
    if (draftedIds.length > 0) {
      query = query.not('id', 'in', `(${draftedIds.join(',')})`)
    }

    const { data: golfers, error: golfersError } = await query

    if (golfersError) throw golfersError
    if (!golfers) return []

    // 3. Get latest OWGR for available golfers (using the draft board approach)
    // First, find the latest tournament that has a field defined
    const { data: latestTourney } = await supabase
      .from('tournament_golfers')
      .select('tournament_id, tournaments!inner(start_date)')
      .order('tournaments(start_date)', { ascending: false })
      .limit(1)
      .maybeSingle()

    const rankingTournamentId = latestTourney?.tournament_id

    const golferRanks: Record<string, number> = {}
    if (rankingTournamentId) {
      const { data: rankingData } = await supabase
        .from('tournament_golfers')
        .select('golfer_id, owg_rank')
        .eq('tournament_id', rankingTournamentId)

      rankingData?.forEach(r => {
        golferRanks[r.golfer_id] = r.owg_rank
      })
    }

    // 4. Get stats for these golfers
    const { data: stats } = await supabase
      .from('golfer_round_stats')
      .select('*')
      .in('golfer_id', golfers.map(g => g.id))

    // Aggregate stats per golfer
    const golferStats: Record<string, any> = {}
    stats?.forEach(s => {
      if (!golferStats[s.golfer_id]) {
        golferStats[s.golfer_id] = { points: 0, birdies: 0, eagles: 0 }
      }
      golferStats[s.golfer_id].birdies += (s.birdies || 0)
      golferStats[s.golfer_id].eagles += (s.eagles || 0)
      golferStats[s.golfer_id].points += (s.birdies || 0) * 3 + (s.eagles || 0) * 8
    })

    return golfers.map(g => ({
      ...g,
      owg_rank: golferRanks[g.id] ?? 9999, // Fallback for sorting
      stats: golferStats[g.id] || { points: 0, birdies: 0, eagles: 0 }
    }))
  },

  // Helper to calculate points (mostly for the "winner" part of Schedule)
  async getTournamentPoints(leagueId: string, tournamentId: string) {
    // ... (existing implementation)
    // 1. Get all teams in league
    const { data: teams } = await supabase
      .from('teams')
      .select('id, team_name')
      .eq('league_id', leagueId)

    if (!teams) return []

    const results = []

    for (const team of teams) {
      // 2. Get lineup
      const lineup = await this.getWeeklyLineup(team.id, tournamentId)
      if (!lineup) {
        results.push({ team_id: team.id, team_name: team.team_name, points: 0 })
        continue
      }

      const starterIds = lineup.filter(g => g.is_starter).map(g => g.id)
      
      if (starterIds.length === 0) {
        results.push({ team_id: team.id, team_name: team.team_name, points: 0 })
        continue
      }

      // 3. Get stats for starters
      const { data: stats } = await supabase
        .from('golfer_round_stats')
        .select('*')
        .eq('tournament_id', tournamentId)
        .in('golfer_id', starterIds)

      if (!stats) {
        results.push({ team_id: team.id, team_name: team.team_name, points: 0 })
        continue
      }

      // 4. Calculate points
      let points = 0
      stats.forEach(s => {
        points += (s.birdies || 0) * 3
        points += (s.eagles || 0) * 8
      })

      results.push({ team_id: team.id, team_name: team.team_name, points })
    }

    return results.sort((a, b) => b.points - a.points)
  },

  async addGolfer(teamId: string, golferId: string, method: 'draft' | 'trade' | 'waiver' = 'waiver', tournamentId?: string) {
    const insertData: any = {
      team_id: teamId,
      golfer_id: golferId,
      acquired_via: method
    }
    if (tournamentId) {
      insertData.tournament_id = tournamentId
    }

    const { data, error } = await supabase
      .from('team_rosters')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async dropGolfer(teamId: string, golferId: string) {
    const { error } = await supabase
      .from('team_rosters')
      .delete()
      .match({ team_id: teamId, golfer_id: golferId })

    if (error) throw error
  },

  /**
   * Returns a mapping of golfer_id -> team_name for all golfers rostered in a specific tournament league.
   * Prioritizes the most recently acquired roster entry to handle any stale data.
   */
  async getLeagueLineupMapping(leagueId: string, tournamentId?: string) {
    const { data: teams } = await supabase
      .from('teams')
      .select('id, team_name')
      .eq('league_id', leagueId)

    if (!teams || teams.length === 0) return {}

    const teamIds = teams.map(t => t.id)
    
    // Query team_rosters which is the master list of ownership
    let query = supabase
      .from('team_rosters')
      .select('team_id, golfer_id, acquired_at')
      .in('team_id', teamIds)
      .order('acquired_at', { ascending: false })

    if (tournamentId && tournamentId !== 'all') {
      // In tournament-scoped leagues, find players rostered for this specific tournament
      // Or if it's a season league, we still want the roster as it stood
      query = query.or(`tournament_id.eq.${tournamentId},tournament_id.is.null`)
    }

    const { data: rosters, error } = await query
    if (error) throw error

    const mapping: Record<string, string> = {}
    rosters?.forEach(r => {
      // Since we ordered by acquired_at DESC, the FIRST time we see a golfer_id, 
      // it's their most recent (and presumably current) owner.
      if (!mapping[r.golfer_id]) {
        const team = teams.find(t => t.id === r.team_id)
        if (team) {
          mapping[r.golfer_id] = team.team_name
        }
      }
    })
    return mapping
  }
}
