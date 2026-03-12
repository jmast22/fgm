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
  }
}
