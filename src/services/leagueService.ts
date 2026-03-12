import { supabase } from '../lib/supabase'

export interface League {
  id: string
  name: string
  commissioner_id: string
  roster_size: number
  weekly_starters: number
  max_teams: number
  season_year: number
  draft_status: 'pending' | 'active' | 'completed'
  invite_code: string
  waiver_rule: string
  trade_deadline?: string
  created_at?: string
  updated_at?: string
}

export interface Team {
  id: string
  league_id: string
  user_id: string
  team_name: string
  created_at?: string
}

export const leagueService = {
  // Get all leagues a user is a member of
  async getUserLeagues(userId: string) {
    const { data, error } = await supabase
      .from('league_members')
      .select(`
        league_id,
        leagues (*)
      `)
      .eq('user_id', userId)

    if (error) throw error
    return (data?.map(d => d.leagues) as unknown) as League[]
  },

  // Get a specific league by ID
  async getLeagueById(leagueId: string) {
    const { data, error } = await supabase
      .from('leagues')
      .select('*')
      .eq('id', leagueId)
      .single()

    if (error) throw error
    return data as League
  },

  // Get members and their teams for a league
  async getLeagueMembers(leagueId: string) {
    const { data, error } = await supabase
      .from('league_members')
      .select(`
        user_id,
        joined_at,
        profiles (
          display_name,
          avatar_url
        )
      `)
      .eq('league_id', leagueId)

    if (error) throw error
    return data
  },

  async getLeagueTeams(leagueId: string) {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('league_id', leagueId)

    if (error) throw error
    return data as Team[]
  },

  // Create a new league + auto-join the commissioner
  async createLeague(userId: string, leagueParams: Partial<League>, teamName: string) {
    // 1. Generate unique invite code
    const invite_code = Math.random().toString(36).substring(2, 8).toUpperCase()

    // 2. Insert league
    const { data: league, error: leagueError } = await supabase
      .from('leagues')
      .insert({
        ...leagueParams,
        commissioner_id: userId,
        invite_code,
        draft_status: 'pending'
      })
      .select()
      .single()

    if (leagueError) throw leagueError

    // 3. Add commissioner to league_members
    const { error: memberError } = await supabase
      .from('league_members')
      .insert({
        league_id: league.id,
        user_id: userId
      })

    if (memberError) throw memberError

    // 4. Create commissioner's team
    const { error: teamError } = await supabase
      .from('teams')
      .insert({
        league_id: league.id,
        user_id: userId,
        team_name: teamName
      })

    if (teamError) throw teamError

    return league as League
  },

  // Join a league via invite code
  async joinLeague(userId: string, inviteCode: string, teamName: string) {
    // 1. Find league by invite code
    const { data: league, error: findError } = await supabase
      .from('leagues')
      .select('id, roster_size')
      .eq('invite_code', inviteCode)
      .single()

    if (findError || !league) throw new Error('Invalid invite code or league not found.')

    // 2. Add as member
    const { error: memberError } = await supabase
      .from('league_members')
      .insert({
        league_id: league.id,
        user_id: userId
      })

    if (memberError) {
      if (memberError.code === '23505') {
        throw new Error('You are already a member of this league.')
      }
      throw memberError
    }

    // 3. Create team
    const { error: teamError } = await supabase
      .from('teams')
      .insert({
        league_id: league.id,
        user_id: userId,
        team_name: teamName
      })

    if (teamError) {
      // Revert if team creation fails
      await supabase.from('league_members').delete().match({ league_id: league.id, user_id: userId })
      throw teamError
    }

    return league.id
  },

  // Update commissioner settings
  async updateLeague(leagueId: string, params: Partial<League>) {
    const { data, error } = await supabase
      .from('leagues')
      .update(params)
      .eq('id', leagueId)
      .select()
      .single()

    if (error) throw error
    return data as League
  },

  async updateTeamName(teamId: string, teamName: string) {
    const { data, error } = await supabase
      .from('teams')
      .update({ team_name: teamName })
      .eq('id', teamId)
      .select()
      .single()

    if (error) throw error
    return data as Team
  },

  async deleteTeam(teamId: string) {
    const { data: team, error: fetchError } = await supabase
      .from('teams')
      .select('user_id, league_id')
      .eq('id', teamId)
      .single()

    if (fetchError) throw fetchError

    // 1. Delete the team (rosters, picks, etc cascade)
    const { error: deleteError } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId)

    if (deleteError) throw deleteError

    // 2. Remove from league_members if there was a user attached
    if (team.user_id) {
       await supabase.from('league_members')
         .delete()
         .match({ league_id: team.league_id, user_id: team.user_id })
    }
  },

  async removeTeamOwner(teamId: string) {
    const { data: team, error: fetchError } = await supabase
      .from('teams')
      .select('user_id, league_id')
      .eq('id', teamId)
      .single()

    if (fetchError) throw fetchError
    if (!team.user_id) return // already orphaned

    // 1. Remove from league_members
    const { error: memberError } = await supabase.from('league_members')
      .delete()
      .match({ league_id: team.league_id, user_id: team.user_id })
    
    if (memberError) throw memberError

    // 2. Set user_id to null
    const { error: teamError } = await supabase.from('teams')
      .update({ user_id: null })
      .eq('id', teamId)

    if (teamError) throw teamError
  },

  async ensurePlaceholders(leagueId: string, maxTeams: number) {
    const { data: existingTeams } = await supabase
      .from('teams')
      .select('id, team_name, user_id')
      .eq('league_id', leagueId)
    
    const count = existingTeams?.length || 0
    const needed = maxTeams - count
    
    if (needed > 0) {
      const placeholders = []
      for (let i = 0; i < needed; i++) {
        placeholders.push({
          league_id: leagueId,
          team_name: `Team ${count + i + 1}`,
          user_id: null
        })
      }
      const { data, error } = await supabase
        .from('teams')
        .insert(placeholders)
        .select()
      
      if (error) throw error
      return [...(existingTeams || []), ...(data || [])] as Team[]
    }
    return (existingTeams || []) as Team[]
  },
  async getLeagueActivity(leagueId: string) {
    const { data: teams } = await supabase
      .from('teams')
      .select('id, team_name')
      .eq('league_id', leagueId)
    
    if (!teams) return []
    const teamIds = teams.map(t => t.id)

    // 1. Get recent roster additions
    const { data: pickups } = await supabase
      .from('team_rosters')
      .select(`
        team_id,
        acquired_via,
        created_at,
        golfer:golfers (name)
      `)
      .in('team_id', teamIds)
      .neq('acquired_via', 'draft') // Only show transactions, not initial draft
      .order('created_at', { ascending: false })
      .limit(20)

    // 2. Get completed trades
    const { data: trades } = await supabase
      .from('trades')
      .select(`
        id,
        offering_team:teams!offering_team_id(team_name),
        receiving_team:teams!receiving_team_id(team_name),
        offered_golfers,
        requested_golfers,
        updated_at,
        created_at,
        status
      `)
      .eq('league_id', leagueId)
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })
      .limit(10)

    // 3. Get trade block additions (using team_rosters)
    const { data: block } = await supabase
      .from('team_rosters')
      .select(`
        team_id,
        golfer_id,
        is_on_trade_block,
        golfer:golfers (name)
      `)
      .in('team_id', teamIds)
      .eq('is_on_trade_block', true)
      .limit(10)

    // Combine and resolve names...
    const allGolferIds = new Set<string>()
    trades?.forEach(t => {
      t.offered_golfers.forEach((id: string) => allGolferIds.add(id))
      t.requested_golfers.forEach((id: string) => allGolferIds.add(id))
    })

    let golferNames: Record<string, string> = {}
    if (allGolferIds.size > 0) {
      const { data: golfers } = await supabase
        .from('golfers')
        .select('id, name')
        .in('id', Array.from(allGolferIds))
      
      golfers?.forEach(g => golferNames[g.id] = g.name)
    }

    // Combine and format
    const activity = [
      ...(pickups || []).map(p => ({
        id: `pickup-${p.team_id}-${p.created_at}`,
        type: 'pickup' as const,
        team_name: teams.find(t => t.id === p.team_id)?.team_name,
        golfer_name: (p.golfer as any)?.name,
        method: p.acquired_via,
        date: p.created_at
      })),
      ...(trades || []).map(t => ({
        id: `trade-${t.id}`,
        type: 'trade' as const,
        offering_team: (t.offering_team as any)?.team_name,
        receiving_team: (t.receiving_team as any)?.team_name,
        offered: t.offered_golfers.map((id: string) => golferNames[id] || 'Unknown'),
        requested: t.requested_golfers.map((id: string) => golferNames[id] || 'Unknown'),
        date: t.updated_at || t.created_at
      })),
      ...(block || []).map(b => ({
        id: `block-${b.team_id}-${b.golfer_id}`,
        type: 'block' as const,
        team_name: teams.find(t => t.id === b.team_id)?.team_name,
        golfer_name: (b.golfer as any)?.name,
        date: new Date().toISOString() // No specialized timestamp yet
      }))
    ]

    return activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }
}
