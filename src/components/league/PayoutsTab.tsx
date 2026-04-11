import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tournamentService, type Tournament } from '../../services/tournamentService'
import { scoringService, type TeamTournamentScore } from '../../services/scoringService'
import { leagueService, type League, type Team } from '../../services/leagueService'
import { motion, AnimatePresence } from 'framer-motion'

interface PayoutsTabProps {
  league: League
  teams: Team[]
  isCommish: boolean
}

interface TournamentPayout {
  tournament: Tournament
  winners: {
    first: TeamTournamentScore | null
    second: TeamTournamentScore | null
    third: TeamTournamentScore | null
    p1_amount?: number
    p2_amount?: number
    p3_amount?: number
    is_t1?: boolean
    is_t2?: boolean
    is_t3?: boolean
  }
  instructions: { payer: string; receiver: string; amount: number }[]
  isFromHistory?: boolean
}

export default function PayoutsTab({ league, teams, isCommish }: PayoutsTabProps) {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [payoutData, setPayoutData] = useState<Record<string, TournamentPayout>>({})
  const [loading, setLoading] = useState(true)
  const [finalizing, setFinalizing] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadPayouts = async () => {
    try {
      setLoading(true)
      const [tData, historyData] = await Promise.all([
        tournamentService.getTournaments(),
        leagueService.getPayoutHistory(league.id)
      ])

      const histMap: Record<string, any> = {}
      historyData?.forEach(h => { histMap[h.tournament_id] = h })

      const relevantTourneys = tData.filter(t => t.status !== 'upcoming' && !(league.excluded_tournaments || []).includes(t.id))
      setTournaments(relevantTourneys)

      const data: Record<string, TournamentPayout> = {}
      const promises = relevantTourneys.map(async (t) => {
        if (histMap[t.id]) {
          const h = histMap[t.id]
          data[t.id] = { 
            tournament: t, 
            winners: h.payout_data.winners, 
            instructions: h.payout_data.instructions,
            isFromHistory: true
          }
          return
        }

        // 1. Find who played in this tournament (Context-Aware Pot)
        const { data: activeRosters } = await supabase
          .from('team_rosters')
          .select('team_id')
          .eq('tournament_id', t.id)
        
        const activeTeamIds = new Set(activeRosters?.map(r => r.team_id) || [])
        let activeTeams = teams.filter(team => activeTeamIds.has(team.id))

        if (activeTeams.length === 0) {
           activeTeams = teams
        }

        const board = await scoringService.getTeamLeaderboard(league.id, t.id)
        
        // Settings / Rules
        const cost = league.tournament_cost || 0
        const pot = activeTeams.length * cost
        
        // Group teams by rank (board is already sorted and ranked)
        const byRank: Record<number, TeamTournamentScore[]> = {}
        board.forEach(ts => {
          if (!byRank[ts.rank!]) byRank[ts.rank!] = []
          byRank[ts.rank!].push(ts)
        })

        const sortedRanks = Object.keys(byRank).map(Number).sort((a, b) => a - b)
        
        // Payout assignment
        const payouts: Record<string, number> = {}
        
        // Determine 2nd and 3rd place prizes first if they aren't "remaining pot"
        let totalP2 = 0
        let totalP3 = 0

        // Handle 2nd Place
        const rank2Teams = byRank[sortedRanks.find(r => r === 2) || -1] || []
        const isT1 = byRank[sortedRanks[0]]?.length > 1
        
        if (!isT1 && rank2Teams.length > 0) {
          const p2Base = league.payout_2nd_money_back ? cost : (league.payout_2nd || 0)
          if (league.payout_2nd_money_back) {
            // Everyone tied for 2nd gets money back
            rank2Teams.forEach(team => { payouts[team.team_id] = p2Base })
            totalP2 = p2Base * rank2Teams.length
          } else {
            // Averaging rule for fixed 2nd place
            // How many spots do they occupy? (2, 3...)
            const spots = rank2Teams.length
            const p3Base = league.payout_3rd_money_back ? cost : (league.payout_3rd || 0)
            const combinedPrize = p2Base + (spots > 1 ? p3Base : 0)
            const avg = Math.round(combinedPrize / spots)
            rank2Teams.forEach(team => { payouts[team.team_id] = avg })
            totalP2 = avg * rank2Teams.length
            if (spots > 1) totalP3 = 0 // 3rd consumed
          }
        }

        // Handle 3rd Place (if not already consumed)
        const rank3Teams = byRank[sortedRanks.find(r => r === 3) || -1] || []
        const occupiedBy2 = !isT1 && rank2Teams.length > 1
        if (!isT1 && !occupiedBy2 && rank3Teams.length > 0) {
          const p3Base = league.payout_3rd_money_back ? cost : (league.payout_3rd || 0)
          rank3Teams.forEach(team => { payouts[team.team_id] = p3Base })
          totalP3 = p3Base * rank3Teams.length
        }

        // Handle 1st Place (The King)
        const rank1Teams = byRank[sortedRanks[0]] || []
        if (rank1Teams.length > 0) {
          if (rank1Teams.length > 1) {
            // T1 Tie: Always uses Averaging Rule across 1st, 2nd, and 3rd
            const p1Base = league.payout_1st_remaining_pot ? (pot - 0) : (league.payout_1st || 0) // Pot if remaining
            const p2Base = league.payout_2nd_money_back ? cost : (league.payout_2nd || 0)
            const p3Base = league.payout_3rd_money_back ? cost : (league.payout_3rd || 0)
            
            const count = rank1Teams.length
            let combined = p1Base
            if (count >= 2) combined += p2Base
            if (count >= 3) combined += p3Base
            
            const avg = Math.round(combined / count)
            rank1Teams.forEach(team => { payouts[team.team_id] = avg })
          } else {
            // Single 1st Place
            const team = rank1Teams[0]
            if (league.payout_1st_remaining_pot) {
              payouts[team.team_id] = Math.max(0, pot - (totalP2 + totalP3))
            } else {
              payouts[team.team_id] = league.payout_1st || 0
            }
          }
        }

        const winners = {
          first: rank1Teams[0] ? { ...rank1Teams[0], team_name: rank1Teams.map(t => t.team_name).join(', ') } : null,
          second: (!isT1 && rank2Teams.length > 0) ? { ...rank2Teams[0], team_name: rank2Teams.map(t => t.team_name).join(', ') } : null,
          third: (!isT1 && rank2Teams.length === 1 && rank3Teams.length > 0) ? { ...rank3Teams[0], team_name: rank3Teams.map(t => t.team_name).join(', ') } : null,
          p1_amount: payouts[rank1Teams[0]?.team_id] || 0,
          p2_amount: payouts[rank2Teams[0]?.team_id] || 0,
          p3_amount: payouts[rank3Teams[0]?.team_id] || 0,
          is_t1: rank1Teams.length > 1,
          is_t2: rank2Teams.length > 1,
          is_t3: rank3Teams.length > 1
        }

        const nets: { name: string; net: number }[] = activeTeams.map(team => {
          const received = payouts[team.id] || 0
          return { name: team.team_name, net: received - cost }
        })

        const payers = nets.filter(n => n.net < 0).map(n => ({ ...n, net: Math.abs(n.net) }))
        const receivers = nets.filter(n => n.net > 0)
        
        const instructions: { payer: string; receiver: string; amount: number }[] = []
        let pIdx = 0
        let rIdx = 0
        const payersWork = payers.map(p => ({ ...p }))
        const receiversWork = receivers.map(r => ({ ...r }))

        while (pIdx < payersWork.length && rIdx < receiversWork.length) {
          const payer = payersWork[pIdx]
          const receiver = receiversWork[rIdx]
          const amount = Math.min(payer.net, receiver.net)
          if (amount > 0) {
            instructions.push({ payer: payer.name, receiver: receiver.name, amount })
          }
          payer.net -= amount
          receiver.net -= amount
          if (payer.net <= 0) pIdx++
          if (receiver.net <= 0) rIdx++
        }

        data[t.id] = { tournament: t, winners, instructions, isFromHistory: false }
      })

      await Promise.all(promises)
      setPayoutData(data)
    } catch (err) {
      console.error('Failed to load payout data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPayouts()
  }, [league.id, teams, league.payout_1st_remaining_pot, league.payout_2nd_money_back, league.payout_3rd_money_back, league.tournament_cost])

  const handleFinalize = async (tid: string) => {
    const data = payoutData[tid]
    if (!data) return

    try {
      setFinalizing(tid)
      const potSize = data.instructions.reduce((acc, inst) => acc + inst.amount, 0)

      await leagueService.finalizePayouts(league.id, tid, potSize, {
        winners: data.winners,
        instructions: data.instructions
      })
      
      await loadPayouts()
    } catch (err) {
      alert('Failed to finalize payouts')
    } finally {
      setFinalizing(null)
    }
  }

  if (loading) return <div className="p-12 text-center text-surface-400">Calculating payouts...</div>

  if (tournaments.length === 0) {
    return (
      <div className="p-12 text-center bg-surface-800/20 border border-surface-700/50 rounded-2xl">
        <div className="text-4xl mb-4">💰</div>
        <h3 className="text-xl font-bold text-surface-100 mb-2">No Payouts Yet</h3>
        <p className="text-surface-500 max-w-sm mx-auto">Payouts will appear here once the first tournament of the season begins.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <div>
          <h2 className="text-xl font-display font-bold text-surface-5 flex items-center gap-3">
             <span className="text-primary-400">💰</span> League Payouts
          </h2>
          <p className="text-xs text-surface-500 mt-1 uppercase tracking-widest font-black">
            ${league.tournament_cost || 0} PER TOURNAMENT • WHO PAYS WHO
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {tournaments.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()).map((t) => {
          const data = payoutData[t.id]
          if (!data) return null
          const isExpanded = expandedId === t.id
          
          return (
            <motion.div 
              key={t.id}
              layout
              className={`bg-surface-800/40 border transition-all duration-300 rounded-2xl overflow-hidden ${
                isExpanded ? 'border-primary-500/50 shadow-glow/5 bg-surface-800/60' : 'border-surface-700/50 hover:border-surface-600'
              }`}
            >
              <div 
                onClick={() => setExpandedId(isExpanded ? null : t.id)}
                className="p-5 flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-5">
                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-display leading-none transition-all
                    ${t.status === 'active' 
                      ? 'bg-primary-600/20 border border-primary-500/30 text-primary-400' 
                      : 'bg-surface-900 border border-surface-700 text-surface-500'}
                  `}>
                    <span className="text-[9px] uppercase font-black tracking-widest mb-1">
                      {new Date(t.start_date).toLocaleString('default', { month: 'short' })}
                    </span>
                    <span className="text-lg font-bold">
                      {new Date(t.start_date).getDate()}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-lg text-surface-100 group-hover:text-primary-400 transition-colors">
                      {t.name}
                    </h4>
                    <div className="text-xs text-surface-500 flex items-center gap-2 mt-1">
                       <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter ${
                         t.status === 'active' ? 'bg-primary-500/10 text-primary-400' : 'bg-surface-700/50 text-surface-400'
                       }`}>
                         {t.status === 'active' ? 'Live' : 'Completed'}
                       </span>
                       {data.isFromHistory && (
                         <span className="bg-green-500/10 text-green-500 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter">
                           Locked
                         </span>
                       )}
                       <span>•</span>
                       <span>${league.tournament_cost || 0} Fee</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="hidden sm:block text-right">
                    <div className="text-[10px] text-surface-500 uppercase font-black tracking-widest mb-1">Winner</div>
                    <div className="font-bold text-primary-400">
                      {data.winners.first?.team_name || 'Calculating...'}
                    </div>
                  </div>
                  <div className={`transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                    <span className="text-surface-600">▼</span>
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden bg-surface-900/40 border-t border-surface-700/50"
                  >
                    <div className="p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-6">
                        {/* Left Side: Winners */}
                        <div className="space-y-4">
                          <h5 className="text-[10px] font-black text-surface-500 uppercase tracking-widest flex items-center gap-2">
                             🏆 Weekly Winners
                          </h5>
                          <div className="space-y-2">
                            {data.winners.first && (
                              <div className="flex items-center justify-between p-3 bg-primary-600/10 border border-primary-500/20 rounded-xl">
                                <div className="flex items-center gap-3">
                                  <span className="text-xl">🥇</span>
                                  <div>
                                    <div className="font-bold text-surface-50 break-words line-clamp-2">
                                      {data.winners.first.team_name}
                                    </div>
                                    <div className="text-[10px] text-primary-400 font-black uppercase flex items-center gap-1.5">
                                      {data.winners.is_t1 ? 'T1' : '1st'} Place
                                      {data.winners.is_t1 && <span className="text-[8px] opacity-70 italic tracking-normal">(Tie)</span>}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-lg font-black text-primary-400 shrink-0">
                                  ${data.winners.p1_amount}
                                </div>
                              </div>
                            )}
                            {data.winners.second && (
                              <div className="flex items-center justify-between p-3 bg-surface-800/50 border border-surface-700/50 rounded-xl">
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="text-xl shrink-0">🥈</span>
                                  <div className="min-w-0">
                                    <div className="font-bold text-surface-200 break-words line-clamp-2">
                                      {data.winners.second.team_name}
                                    </div>
                                    <div className="text-[10px] text-surface-500 font-black uppercase flex items-center gap-1.5">
                                      {data.winners.is_t2 ? 'T2' : '2nd'} Place
                                      {data.winners.is_t2 && <span className="text-[8px] opacity-70 italic tracking-normal">(Tie)</span>}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-lg font-black text-surface-200 shrink-0">
                                  ${data.winners.p2_amount}
                                </div>
                              </div>
                            )}
                            {data.winners.third && (
                              <div className="flex items-center justify-between p-3 bg-surface-800/50 border border-surface-700/50 rounded-xl">
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="text-xl shrink-0">🥉</span>
                                  <div className="min-w-0">
                                    <div className="font-bold text-surface-300 break-words line-clamp-2">
                                      {data.winners.third.team_name}
                                    </div>
                                    <div className="text-[10px] text-surface-500 font-black uppercase flex items-center gap-1.5">
                                      {data.winners.is_t3 ? 'T3' : '3rd'} Place
                                      {data.winners.is_t3 && <span className="text-[8px] opacity-70 italic tracking-normal">(Tie)</span>}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-lg font-black text-surface-300 shrink-0">
                                  ${data.winners.p3_amount}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right Side: Instructions */}
                        <div className="space-y-4">
                          <h5 className="text-[10px] font-black text-surface-500 uppercase tracking-widest flex items-center gap-2">
                             💸 Payment Instructions
                          </h5>
                          <div className="space-y-2 max-h-[220px] overflow-y-auto no-scrollbar pr-2">
                            {data.instructions.length > 0 ? data.instructions.map((inst, i) => (
                              <div key={i} className="flex items-center justify-between p-3 bg-surface-900/50 border border-surface-800 rounded-xl group hover:border-surface-600 transition-colors">
                                <div className="flex items-center gap-3">
                                  <div className="text-sm">
                                    <span className="font-bold text-surface-200">{inst.payer}</span>
                                    <span className="text-surface-500 mx-2">pays</span>
                                    <span className="font-bold text-primary-400">{inst.receiver}</span>
                                  </div>
                                </div>
                                <div className="font-mono font-black text-surface-50 group-hover:scale-110 transition-transform">
                                  ${inst.amount}
                                </div>
                              </div>
                            )) : (
                              <div className="p-8 text-center text-surface-600 italic text-sm border border-dashed border-surface-800 rounded-xl">
                                 No payments necessary.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {isCommish && !data.isFromHistory && t.status === 'completed' && (
                        <div className="pt-4 border-t border-surface-700/50">
                          <button 
                            onClick={() => handleFinalize(t.id)}
                            disabled={finalizing === t.id}
                            className="w-full bg-primary-600/20 hover:bg-primary-600 text-primary-400 hover:text-surface-900 border border-primary-500/30 font-black py-3 rounded-xl transition-all uppercase tracking-widest text-xs"
                          >
                            {finalizing === t.id ? 'Saving Snapshot...' : '💾 Finalize & Lock Payouts'}
                          </button>
                          <p className="text-[9px] text-surface-600 uppercase font-black text-center mt-2">
                            Snapshotting will preserve these results even if teams are added later.
                          </p>
                        </div>
                      )}
                      
                      {data.isFromHistory && (
                        <p className="text-[9px] text-green-500/50 uppercase font-black text-center pt-4 border-t border-surface-700/50">
                           ✓ This tournament has been finalized and locked.
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
