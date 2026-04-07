import { supabase } from '../lib/supabase'

export interface Trade {
  id: string
  league_id: string
  offering_team_id: string
  receiving_team_id: string
  offered_golfers: string[]
  requested_golfers: string[]
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed'
  created_at: string
  updated_at: string
  // Joined fields
  offering_team?: { team_name: string }
  receiving_team?: { team_name: string }
}

export const tradeService = {
  async getLeagueTrades(leagueId: string) {
    const { data, error } = await supabase
      .from('trades')
      .select(`
        *,
        offering_team:teams!offering_team_id(team_name),
        receiving_team:teams!receiving_team_id(team_name)
      `)
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as Trade[]
  },

  async proposeTrade(trade: Partial<Trade>) {
    const { data, error } = await supabase
      .from('trades')
      .insert(trade)
      .select()
      .single()

    if (error) throw error
    return data as Trade
  },

  async respondToTrade(tradeId: string, status: 'accepted' | 'rejected' | 'cancelled') {
    const { data, error } = await supabase
      .from('trades')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', tradeId)
      .select()
      .single()

    if (error) throw error
    
    if (status === 'accepted') {
      await this.executeTrade(data as Trade)
    }

    return data as Trade
  },

  async executeTrade(trade: Trade) {
    // Determine tournament_id to apply the trade to
    const { data: league } = await supabase.from('leagues').select('draft_cycle').eq('id', trade.league_id).single()
    let activeTournamentId: string | undefined = undefined

    if (league?.draft_cycle === 'tournament') {
      const { data: tourneys } = await supabase.from('tournaments')
        .select('id')
        .in('status', ['active', 'upcoming'])
        .order('start_date', { ascending: true })
        .limit(1)
      if (tourneys && tourneys.length > 0) activeTournamentId = tourneys[0].id
    }

    // 1. Remove offered golfers from offering team
    let drop1 = supabase.from('team_rosters').delete().eq('team_id', trade.offering_team_id).in('golfer_id', trade.offered_golfers)
    if (activeTournamentId) drop1 = drop1.eq('tournament_id', activeTournamentId)
    const { error: err1 } = await drop1
    if (err1) throw err1

    // 2. Remove requested golfers from receiving team
    let drop2 = supabase.from('team_rosters').delete().eq('team_id', trade.receiving_team_id).in('golfer_id', trade.requested_golfers)
    if (activeTournamentId) drop2 = drop2.eq('tournament_id', activeTournamentId)
    const { error: err2 } = await drop2
    if (err2) throw err2

    // 3. Add offered golfers to receiving team
    const add1 = trade.offered_golfers.map(gid => {
      const entry: any = { team_id: trade.receiving_team_id, golfer_id: gid, acquired_via: 'trade' }
      if (activeTournamentId) entry.tournament_id = activeTournamentId
      return entry
    })
    const { error: insert1 } = await supabase.from('team_rosters').insert(add1)
    if (insert1) throw insert1

    // 4. Add requested golfers to offering team
    const add2 = trade.requested_golfers.map(gid => {
      const entry: any = { team_id: trade.offering_team_id, golfer_id: gid, acquired_via: 'trade' }
      if (activeTournamentId) entry.tournament_id = activeTournamentId
      return entry
    })
    const { error: insert2 } = await supabase.from('team_rosters').insert(add2)
    if (insert2) throw insert2

    // 5. Mark trade as completed
    await supabase.from('trades').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', trade.id)
  }
}
