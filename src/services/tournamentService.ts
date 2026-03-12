import { supabase } from '../lib/supabase'

export interface Tournament {
  id: string
  name: string
  start_date: string
  end_date: string
  course_name: string
  city: string
  state: string
  country: string
  status: 'upcoming' | 'active' | 'completed'
}

export const tournamentService = {
  async getTournaments() {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .order('start_date', { ascending: true })

    if (error) throw error
    return data as Tournament[]
  },

  async getUpcomingTournaments() {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .neq('status', 'completed')
      .order('start_date', { ascending: true })

    if (error) throw error
    return data as Tournament[]
  },

  async getTournamentById(id: string) {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data as Tournament
  },

  async getTournamentField(tournamentId: string) {
    const { data, error } = await supabase
      .from('tournament_golfers')
      .select(`
        *,
        golfer:golfers (*)
      `)
      .eq('tournament_id', tournamentId)

    if (error) throw error
    return data
  }
}
