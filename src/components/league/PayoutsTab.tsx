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
        const sorted = [...board].sort((a, b) => (a.total ?? 999) - (b.total ?? 999))
        
        // Settings / Rules
        const cost = league.tournament_cost || 0
        const pot = activeTeams.length * cost
        
        const p2 = league.payout_2nd_money_back ? cost : (league.payout_2nd || 0)
        const p3 = league.payout_3rd_money_back ? cost : (league.payout_3rd || 0)
        
        // 1st place calculation
        let p1 = league.payout_1st || 0
        if (league.payout_1st_remaining_pot) {
          p1 = Math.max(0, pot - (p2 + p3))
        }

        const winners = {
          first: sorted[0] || null,
          second: sorted[1] || null,
          third: ((league.payout_3rd && league.payout_3rd > 0) || league.payout_3rd_money_back) ? (sorted[2] || null) : null,
          p1_amount: p1,
          p2_amount: p2,
          p3_amount: p3
        }

        const nets: { name: string; net: number }[] = activeTeams.map(team => {
          let received = 0
          if (winners.first?.team_id === team.id) received = p1
          else if (winners.second?.team_id === team.id) received = p2
          else if (winners.third?.team_id === team.id) received = p3
          
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
                                    <div className="font-bold text-surface-50">{data.winners.first.team_name}</div>
                                    <div className="text-[10px] text-primary-400 font-black uppercase">1st Place</div>
                                  </div>
                                </div>
                                <div className="text-lg font-black text-primary-400">
                                  ${data.winners.p1_amount}
                                </div>
                              </div>
                            )}
                            {data.winners.second && (
                              <div className="flex items-center justify-between p-3 bg-surface-800/50 border border-surface-700/50 rounded-xl">
                                <div className="flex items-center gap-3">
                                  <span className="text-xl">🥈</span>
                                  <div>
                                    <div className="font-bold text-surface-200">{data.winners.second.team_name}</div>
                                    <div className="text-[10px] text-surface-500 font-black uppercase">2nd Place</div>
                                  </div>
                                </div>
                                <div className="text-lg font-black text-surface-200">
                                  ${data.winners.p2_amount}
                                </div>
                              </div>
                            )}
                            {data.winners.third && (
                              <div className="flex items-center justify-between p-3 bg-surface-800/50 border border-surface-700/50 rounded-xl">
                                <div className="flex items-center gap-3">
                                  <span className="text-xl">🥉</span>
                                  <div>
                                    <div className="font-bold text-surface-300">{data.winners.third.team_name}</div>
                                    <div className="text-[10px] text-surface-500 font-black uppercase">3rd Place</div>
                                  </div>
                                </div>
                                <div className="text-lg font-black text-surface-300">
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
