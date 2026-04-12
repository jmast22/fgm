import { supabase } from '../lib/supabase'

// ----- Types -----

export interface GolferRoundScore {
  golfer_id: string
  golfer_name: string
  round: number
  score: number | null  // strokes relative to par (e.g., -3, +2)
  made_cut: boolean | null
}

export interface GolferTournamentScore {
  golfer_id: string
  golfer_name: string
  r1: number | null
  r2: number | null
  r3: number | null
  r4: number | null
  total: number | null
  made_cut: boolean | null
  is_penalty: boolean
  rank?: number
  displayRank?: string
}

export interface TeamTournamentScore {
  team_id: string
  team_name: string
  r1: number | null
  r2: number | null
  r3: number | null
  r4: number | null
  total: number | null
  golfer_scores: GolferTournamentScore[]
  rank?: number
  displayRank?: string
}

// ----- Scoring Service -----

export const scoringService = {

  /**
   * Get all round stats for a tournament from the database.
   */
  async getTournamentRoundStats(tournamentId: string) {
    const { data, error } = await supabase
      .from('golfer_round_stats')
      .select(`
        golfer_id,
        round,
        score,
        made_cut,
        golfer:golfers (name)
      `)
      .eq('tournament_id', tournamentId)
      .order('round', { ascending: true })

    if (error) throw error
    return data
  },

  /**
   * Calculate the missed-cut penalty for a given tournament.
   *
   * Algorithm:
   * 1. Identify the 10 worst players who MADE the cut (highest 2-round total).
   * 2. For each round (R3, R4), calculate their average score-to-par, rounded.
   * 3. The penalty per round = max(that average, +4).
   */
  calculateMissedCutPenalty(
    allScores: { golfer_id: string; round: number; score: number | null; made_cut: boolean }[]
  ): { r3Penalty: number; r4Penalty: number | null } {
    // Get golfers who made the cut (explicitly marked true AND not marked false in any other record)
    const possibleCutMakers = new Set<string>()
    const confirmedMissedCuts = new Set<string>()

    allScores.forEach(s => {
      if (s.made_cut === true) possibleCutMakers.add(s.golfer_id)
      if (s.made_cut === false) confirmedMissedCuts.add(s.golfer_id)
      // Heuristic for penalty calc: if R3 has scores but this golfer doesn't, they are a missed cut.
      // We'll calculate current max round here too.
    })

    const maxRound = Math.max(...allScores.filter(s => s.score !== null).map(s => s.round), 0)
    
    // Finalize cut makers list
    const cutMakerIds = new Set<string>()
    const golfersWithR3 = new Set(allScores.filter(s => s.round === 3 && s.score !== null).map(s => s.golfer_id))

    possibleCutMakers.forEach(gid => {
      if (confirmedMissedCuts.has(gid)) return
      if (maxRound >= 3 && !golfersWithR3.has(gid)) return // Heuristic
      cutMakerIds.add(gid)
    })

    // Calculate average for Round 3
    const r3Scores = allScores
      .filter(s => s.round === 3 && s.score !== null && cutMakerIds.has(s.golfer_id))
      .map(s => s.score as number)
      .sort((a, b) => b - a)
    
    const worstTenR3 = r3Scores.slice(0, 10)
    const r3Sum = worstTenR3.reduce((a, b) => a + b, 0)
    const r3Avg = worstTenR3.length > 0 ? Math.round(r3Sum / worstTenR3.length) : 4

    return {
      r3Penalty: Math.max(r3Avg, 4),
      r4Penalty: null // Round 4 penalty is deferred until the round is fully completed
    }
  },

  /**
   * Build the full tournament leaderboard for individual golfers.
   */
  buildGolferLeaderboard(
    rawScores: { golfer_id: string; round: number; score: number | null; made_cut: boolean; golfer: any }[]
  ): GolferTournamentScore[] {
    // Group by golfer
    const byGolfer: Record<string, {
      golfer_name: string
      made_cut: boolean
      rounds: Record<number, number | null>
    }> = {}

    // 1. Determine current tournament progress (max round seen with a score)
    let maxRoundWithScores = 0
    rawScores.forEach(s => {
      if (s.score !== null && s.round > maxRoundWithScores) {
        maxRoundWithScores = s.round
      }
    })

    rawScores.forEach(s => {
      if (!byGolfer[s.golfer_id]) {
        byGolfer[s.golfer_id] = {
          golfer_name: s.golfer?.name || 'Unknown',
          made_cut: s.made_cut,
          rounds: {}
        }
      }
      if (s.score !== null) {
        byGolfer[s.golfer_id].rounds[s.round] = s.score
      }
      
      // If any round record says they missed the cut, we mark it false globally for the golfer.
      // We prioritize the false status (confirmed missed cut).
      if (s.made_cut === false) byGolfer[s.golfer_id].made_cut = false;
      // If we haven't seen a false yet, and this one is true, we can set it to true.
      else if (byGolfer[s.golfer_id].made_cut !== false && s.made_cut === true) {
        byGolfer[s.golfer_id].made_cut = true;
      }
    })

    // 2. Apply Heuristic Missed Cut Detection
    // If the tournament has progressed to Round 3 or 4, but a golfer only has scores for R1/R2,
    // and they aren't already marked as having missed the cut, we mark them now.
    if (maxRoundWithScores >= 3) {
      Object.entries(byGolfer).forEach(([_id, data]) => {
        // If they have R1 & R2 but no R3 (and tournament is at or past R3)
        const hasR1 = data.rounds[1] !== undefined && data.rounds[1] !== null
        const hasR2 = data.rounds[2] !== undefined && data.rounds[2] !== null
        const hasR3 = data.rounds[3] !== undefined && data.rounds[3] !== null
        
        if (hasR1 && hasR2 && !hasR3 && data.made_cut !== false) {
           // HEURISTIC: No R3 score while others have one = Missed Cut
           data.made_cut = false
        }
      })
    }

    // Calculate penalties
    const penalty = this.calculateMissedCutPenalty(rawScores)

    const results: GolferTournamentScore[] = Object.entries(byGolfer).map(([golferId, data]) => {
      const r1 = data.rounds[1] ?? null
      const r2 = data.rounds[2] ?? null
      let r3 = data.rounds[3] ?? null
      let r4 = data.rounds[4] ?? null
      let isPenalty = false

      // If this golfer missed the cut, apply penalty scores for R3 and R4
      // We only apply this if made_cut is EXPLICITLY false.
      if (data.made_cut === false) {
        r3 = penalty.r3Penalty
        r4 = null // Do not apply R4 penalty yet per user instructions
        isPenalty = true
      }

      const total = (r1 !== null || r2 !== null || r3 !== null || r4 !== null)
        ? (r1 ?? 0) + (r2 ?? 0) + (r3 ?? 0) + (r4 ?? 0)
        : null

      return {
        golfer_id: golferId,
        golfer_name: data.golfer_name,
        r1,
        r2,
        r3,
        r4,
        total,
        made_cut: (data.made_cut === false) ? false : (data.made_cut === true ? true : null),
        is_penalty: isPenalty
      }
    })

    // Sort by total (lowest = best)
    results.sort((a, b) => {
      if (a.total === null) return 1
      if (b.total === null) return -1
      return a.total - b.total
    })

    return applyRanking(results)
  },

  /**
   * Build team leaderboard for a tournament in a league.
   * Only starters' scores count.
   */
  async getTeamLeaderboard(leagueId: string, tournamentId: string): Promise<TeamTournamentScore[]> {
    // 1. Get all teams in the league
    const { data: teams } = await supabase
      .from('teams')
      .select('id, team_name')
      .eq('league_id', leagueId)

    if (!teams || teams.length === 0) return []

    // 2. Get all round stats for this tournament
    const rawScores = await this.getTournamentRoundStats(tournamentId)
    if (!rawScores || rawScores.length === 0) {
      return teams.map(t => ({
        team_id: t.id,
        team_name: t.team_name,
        r1: null, r2: null, r3: null, r4: null, total: null,
        golfer_scores: []
      }))
    }

    // 3. Build the golfer leaderboard (with penalties applied)
    const golferBoard = this.buildGolferLeaderboard(rawScores)
    const golferMap = new Map(golferBoard.map(g => [g.golfer_id, g]))

    // 4. Get all lineups and starters for this tournament in TWO queries instead of N loops
    const teamIds = teams.map(t => t.id)
    const { data: allLineups } = await supabase
      .from('weekly_lineups')
      .select('id, team_id')
      .in('team_id', teamIds)
      .eq('tournament_id', tournamentId)

    const lineupIds = allLineups?.map(l => l.id) || []
    const teamToLineupMap = new Map(allLineups?.map(l => [l.team_id, l.id]))

    let lineupGolfersMap: Record<string, string[]> = {}
    if (lineupIds.length > 0) {
      const { data: starters } = await supabase
        .from('lineup_golfers')
        .select('lineup_id, golfer_id')
        .in('lineup_id', lineupIds)
        .eq('is_starter', true)
      
      starters?.forEach(s => {
        if (!lineupGolfersMap[s.lineup_id]) lineupGolfersMap[s.lineup_id] = []
        lineupGolfersMap[s.lineup_id].push(s.golfer_id)
      })
    }

    const teamResults: TeamTournamentScore[] = teams.map(team => {
      const lineupId = teamToLineupMap.get(team.id)
      const starterIds = lineupId ? (lineupGolfersMap[lineupId] || []) : []

      const starterScores: GolferTournamentScore[] = []
      let r1: number | null = null
      let r2: number | null = null
      let r3: number | null = null
      let r4: number | null = null

      starterIds.forEach(sid => {
        const gs = golferMap.get(sid)
        if (gs) {
          starterScores.push(gs)
          if (gs.r1 !== null) r1 = (r1 ?? 0) + gs.r1
          if (gs.r2 !== null) r2 = (r2 ?? 0) + gs.r2
          if (gs.r3 !== null) r3 = (r3 ?? 0) + gs.r3
          if (gs.r4 !== null) r4 = (r4 ?? 0) + gs.r4
        }
      })

      const total = (r1 !== null || r2 !== null || r3 !== null || r4 !== null)
        ? (r1 ?? 0) + (r2 ?? 0) + (r3 ?? 0) + (r4 ?? 0)
        : null

      return {
        team_id: team.id,
        team_name: team.team_name,
        r1, r2, r3, r4,
        total,
        golfer_scores: starterScores
      }
    })

    // Sort by total (lowest = best, most negative under par)
    teamResults.sort((a, b) => {
      if (a.total === null) return 1
      if (b.total === null) return -1
      return a.total - b.total
    })

    return applyRanking(teamResults)
  },

  /**
   * Get season-long standings for a league.
   * Aggregates team totals across all non-excluded completed tournaments.
   */
  async getSeasonStandings(leagueId: string, excludedTournaments: string[] = []): Promise<{ 
    team_id: string; 
    team_name: string; 
    total: number; 
    tournaments_played: number;
    rank: number;
    displayRank: string;
  }[]> {
    // Get all tournaments that have actual score data (regardless of status)
    const { data: scoredTournaments } = await supabase
      .from('golfer_round_stats')
      .select('tournament_id')

    if (!scoredTournaments || scoredTournaments.length === 0) {
      const { data: teams } = await supabase
        .from('teams')
        .select('id, team_name')
        .eq('league_id', leagueId)

      return applyRanking((teams || []).map(t => ({ team_id: t.id, team_name: t.team_name, total: 0, tournaments_played: 0 }))) as any
    }

    // Deduplicate tournament IDs and filter out excluded ones
    const tournamentIds = [...new Set(scoredTournaments.map(s => s.tournament_id))]
      .filter(tid => !excludedTournaments.includes(tid))
    
    if (tournamentIds.length === 0) {
      const { data: teams } = await supabase
        .from('teams')
        .select('id, team_name')
        .eq('league_id', leagueId)
      return applyRanking((teams || []).map(t => ({ team_id: t.id, team_name: t.team_name, total: 0, tournaments_played: 0 }))) as any
    }

    // 1. Get all teams in the league
    const { data: teams } = await supabase
      .from('teams')
      .select('id, team_name')
      .eq('league_id', leagueId)
    
    if (!teams || teams.length === 0) return []
    const teamIds = teams.map(t => t.id)

    // 2. Fetch ALL lineups for these tournaments in one query
    const { data: allLineups } = await supabase
      .from('weekly_lineups')
      .select('id, team_id, tournament_id')
      .in('team_id', teamIds)
      .in('tournament_id', tournamentIds)
    
    const lineupIds = allLineups?.map(l => l.id) || []
    
    // 3. Fetch ALL starters for these lineups in one query
    let startersMap: Record<string, string[]> = {}
    if (lineupIds.length > 0) {
      const { data: starters } = await supabase
        .from('lineup_golfers')
        .select('lineup_id, golfer_id')
        .in('lineup_id', lineupIds)
        .eq('is_starter', true)
      
      starters?.forEach(s => {
        if (!startersMap[s.lineup_id]) startersMap[s.lineup_id] = []
        startersMap[s.lineup_id].push(s.golfer_id)
      })
    }

    // 4. Fetch ALL round stats for all relevant tournaments in one query
    const { data: allStats, error: statsError } = await supabase
      .from('golfer_round_stats')
      .select(`
        golfer_id,
        tournament_id,
        round,
        score,
        made_cut,
        golfer:golfers (name)
      `)
      .in('tournament_id', tournamentIds)

    if (statsError) throw statsError
    
    // Group stats by tournament for penalty calculation
    const statsByTournament: Record<string, any[]> = {}
    allStats?.forEach(s => {
      if (!statsByTournament[s.tournament_id]) statsByTournament[s.tournament_id] = []
      statsByTournament[s.tournament_id].push(s)
    })

    // 5. Pre-calculate golfer leaderboards for each tournament
    const boardsByTournament: Record<string, Map<string, GolferTournamentScore>> = {}
    tournamentIds.forEach(tid => {
       const tourneyStats = statsByTournament[tid] || []
       const board = this.buildGolferLeaderboard(tourneyStats)
       boardsByTournament[tid] = new Map(board.map(g => [g.golfer_id, g]))
    })

    // 6. Aggregate season totals
    const teamTotals: Record<string, { team_name: string; total: number; tournaments_played: number }> = {}
    teams.forEach(t => {
      teamTotals[t.id] = { team_name: t.team_name, total: 0, tournaments_played: 0 }
    })

    // Group lineups by team/tournament for easy lookup
    const lineupLookup: Record<string, string> = {} // "teamId-tournamentId" -> lineupId
    allLineups?.forEach(l => {
      lineupLookup[`${l.team_id}-${l.tournament_id}`] = l.id
    })

    tournamentIds.forEach(tid => {
      const tourneyBoard = boardsByTournament[tid]
      if (!tourneyBoard) return

      teams.forEach(team => {
        const lid = lineupLookup[`${team.id}-${tid}`]
        const starterIds = lid ? (startersMap[lid] || []) : []
        
        let tourneyTotal = 0
        let hasStarter = false
        
        starterIds.forEach(sid => {
          const gs = tourneyBoard.get(sid)
          if (gs) {
            tourneyTotal += (gs.total ?? 0)
            hasStarter = true
          }
        })
        
        if (hasStarter || starterIds.length > 0) {
          teamTotals[team.id].total += tourneyTotal
          teamTotals[team.id].tournaments_played++
        }
      })
    })

    const standings = Object.entries(teamTotals)
      .map(([team_id, data]) => ({ team_id, ...data }))
      .sort((a, b) => a.total - b.total) // Most under par = best

    return applyRanking(standings)
  },

  /**
   * Get all golfer stats across the season for the Golfers tab.
   */
  async getAllGolferSeasonStats(): Promise<GolferTournamentScore[]> {
    const { data, error } = await supabase
      .from('golfer_round_stats')
      .select(`
        golfer_id,
        tournament_id,
        round,
        score,
        made_cut,
        golfer:golfers (name)
      `)
      .order('round', { ascending: true })

    if (error) throw error
    if (!data || data.length === 0) return []

    // Group by tournament first to calculate penalties per tournament
    const byTournament: Record<string, typeof data> = {}
    data.forEach(s => {
      if (!byTournament[s.tournament_id]) byTournament[s.tournament_id] = []
      byTournament[s.tournament_id].push(s)
    })

    // Build per-golfer aggregated stats
    const golferAgg: Record<string, {
      golfer_name: string
      totalScore: number
      rounds: number
      tournaments: number
    }> = {}

    Object.values(byTournament).forEach(tourneyScores => {
      const board = this.buildGolferLeaderboard(tourneyScores)
      board.forEach(gs => {
        if (!golferAgg[gs.golfer_id]) {
          golferAgg[gs.golfer_id] = {
            golfer_name: gs.golfer_name,
            totalScore: 0,
            rounds: 0,
            tournaments: 0
          }
        }
        golferAgg[gs.golfer_id].totalScore += (gs.total ?? 0)
        golferAgg[gs.golfer_id].rounds += [gs.r1, gs.r2, gs.r3, gs.r4].filter(r => r !== null).length
        golferAgg[gs.golfer_id].tournaments++
      })
    })

    const sortedGolfers = Object.entries(golferAgg).map(([gid, agg]) => ({
      golfer_id: gid,
      golfer_name: agg.golfer_name,
      r1: null,
      r2: null,
      r3: null,
      r4: null,
      total: agg.totalScore,
      made_cut: true,
      is_penalty: false
    })).sort((a, b) => (a.total ?? 999) - (b.total ?? 999))

    return applyRanking(sortedGolfers)
  }
}

/**
 * Formats a score for display.
 * Negative = under par (good), positive = over par (bad).
 */
export function formatScore(score: number | null): string {
  if (score === null) return '-'
  if (score === 0) return 'E'
  return score > 0 ? `+${score}` : `${score}`
}

/**
 * Returns the CSS color class for a score.
 */
export function scoreColor(score: number | null): string {
  if (score === null) return 'text-surface-500'
  if (score < 0) return 'text-green-400'
  if (score === 0) return 'text-surface-100'
  return 'text-red-400'
}

/**
 * Utility to apply Standard Competition Ranking (1224) to a sorted list of scores.
 */
function applyRanking<T extends { total: number | null }>(items: T[]): (T & { rank: number; displayRank: string })[] {
  if (items.length === 0) return []

  const result: any[] = []
  const rankCount: Record<number, number> = {}

  let currentRank = 1
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.total === null) {
      result.push({ ...item, rank: 999, displayRank: '—' })
      continue
    }

    if (i > 0 && items[i - 1].total !== null && item.total === items[i - 1].total) {
      // Same rank as previous
    } else {
      currentRank = i + 1
    }
    
    const itemWithRank = { ...item, rank: currentRank }
    result.push(itemWithRank)
    rankCount[currentRank] = (rankCount[currentRank] || 0) + 1
  }

  // Second pass: add displayRank
  for (const item of result) {
    if (item.total === null) continue
    item.displayRank = rankCount[item.rank] > 1 ? `T${item.rank}` : `${item.rank}`
  }

  return result
}

