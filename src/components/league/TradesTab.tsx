import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tradeService, type Trade } from '../../services/tradeService'
import type { League, Team } from '../../services/leagueService'
import { useAuth } from '../../context/AuthContext'
import ProposeTradeModal from './ProposeTradeModal'

interface TradesTabProps {
  league: League
  teams: Team[]
}

export default function TradesTab({ league, teams }: TradesTabProps) {
  const { user } = useAuth()
  const [trades, setTrades] = useState<Trade[]>([])
  const [tradeBlock, setTradeBlock] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSubTab, setActiveSubTab] = useState<'block' | 'offers' | 'history'>('block')
  const [showProposeModal, setShowProposeModal] = useState(false)

  const myTeam = teams.find(t => t.user_id === user?.id)

  const [golfers, setGolfers] = useState<Record<string, string>>({})

  const loadTrades = async () => {
    setLoading(true)
    try {
      const teamIds = teams.map(t => t.id)
      const [tradeData, golferData, blockData] = await Promise.all([
        tradeService.getLeagueTrades(league.id),
        supabase.from('golfers').select('id, name'),
        supabase.from('team_rosters')
          .select('team_id, golfer_id, is_on_trade_block, golfer:golfers(*)')
          .in('team_id', teamIds)
          .eq('is_on_trade_block', true)
      ])
      
      setTrades(tradeData)
      setTradeBlock(blockData.data || [])
      
      const golferMap: Record<string, string> = {}
      golferData.data?.forEach((g: any) => golferMap[g.id] = g.name)
      setGolfers(golferMap)
    } catch (err) {
      console.error('Error loading trades:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTrades()
  }, [league.id])

  const getGolferNames = (ids: string[]) => ids.map(id => golfers[id] || 'Unknown').join(', ')

  const handleAccept = async (tradeId: string) => {
    if (!confirm('Are you sure you want to accept this trade? Your rosters will be updated immediately.')) return
    try {
      await tradeService.respondToTrade(tradeId, 'accepted')
      alert('Trade accepted! Rosters updated.')
      loadTrades()
    } catch (err: any) {
      alert('Error accepting trade: ' + err.message)
    }
  }

  const handleReject = async (tradeId: string) => {
    try {
      await tradeService.respondToTrade(tradeId, 'rejected')
      loadTrades()
    } catch (err: any) {
      alert('Error rejecting trade: ' + err.message)
    }
  }

  const handleCancel = async (tradeId: string) => {
    try {
      await tradeService.respondToTrade(tradeId, 'cancelled')
      loadTrades()
    } catch (err: any) {
      alert('Error cancelling trade: ' + err.message)
    }
  }

  if (loading && trades.length === 0) return <div className="p-8 text-center text-surface-400">Loading trades...</div>

  const pendingOffers = trades.filter(t => t.status === 'pending' && (t.offering_team_id === myTeam?.id || t.receiving_team_id === myTeam?.id))
  const completedTrades = trades.filter(t => t.status === 'completed' || t.status === 'accepted')

  return (
    <div className="space-y-6">
      <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl overflow-hidden shadow-lg">
        {/* Sub-navigation */}
        <div className="flex border-b border-surface-700/50 bg-surface-800/20">
          <button 
            onClick={() => setActiveSubTab('block')}
            className={`px-6 py-4 text-sm font-bold transition-all border-b-2 ${activeSubTab === 'block' ? 'border-primary-500 text-primary-400' : 'border-transparent text-surface-400 hover:text-surface-100'}`}
          >
            Trade Block ({tradeBlock.length})
          </button>
          <button 
            onClick={() => setActiveSubTab('offers')}
            className={`px-6 py-4 text-sm font-bold transition-all border-b-2 ${activeSubTab === 'offers' ? 'border-primary-500 text-primary-400' : 'border-transparent text-surface-400 hover:text-surface-100'}`}
          >
            Active Offers ({pendingOffers.length})
          </button>
          <button 
            onClick={() => setActiveSubTab('history')}
            className={`px-6 py-4 text-sm font-bold transition-all border-b-2 ${activeSubTab === 'history' ? 'border-primary-500 text-primary-400' : 'border-transparent text-surface-400 hover:text-surface-100'}`}
          >
            History
          </button>
        </div>

        <div className="p-6">
          {activeSubTab === 'block' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-surface-50 uppercase tracking-wider">The Trade Block</h3>
                {myTeam && (
                  <button 
                    className="bg-primary-600 hover:bg-primary-500 text-surface-900 px-4 py-2 rounded-lg font-black text-xs uppercase transition-all shadow-glow/10"
                    onClick={() => setShowProposeModal(true)}
                  >
                    + Propose Trade
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tradeBlock.length > 0 ? tradeBlock.map((item, idx) => {
                  const team = teams.find(t => t.id === item.team_id)
                  return (
                    <div key={`${item.golfer_id}-${idx}`} className="bg-surface-900/50 border border-surface-700/50 p-4 rounded-xl flex items-center justify-between group hover:border-orange-500/30 transition-all">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center text-lg">🏌️</div>
                         <div>
                            <div className="font-bold text-surface-100 group-hover:text-primary-400 transition-colors">{item.golfer?.name}</div>
                            <div className="text-[10px] text-surface-500 font-bold uppercase tracking-widest">{team?.team_name}</div>
                         </div>
                      </div>
                      <div className="flex flex-col items-end">
                         <span className="text-[10px] text-orange-500 font-black uppercase tracking-tighter bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">SHOPPING</span>
                      </div>
                    </div>
                  )
                }) : (
                  <div className="bg-surface-900/50 border border-surface-700/50 p-4 rounded-xl col-span-full">
                      <p className="text-surface-500 text-sm italic text-center py-8">The trade block is currently empty. Add players from your Roster to list them here!</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSubTab === 'offers' && (
            <div className="space-y-4">
              {pendingOffers.length > 0 ? pendingOffers.map(trade => (
                <div key={trade.id} className="bg-surface-900/50 border border-surface-700/50 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex-1 flex items-center gap-8 justify-center md:justify-start w-full">
                        <div className="text-center md:text-left">
                            <div className="text-[10px] text-surface-500 uppercase font-black mb-1">From</div>
                            <div className="font-display font-bold text-surface-50">{trade.offering_team?.team_name}</div>
                            <div className="text-[10px] text-primary-400 mt-1 max-w-[150px] truncate" title={getGolferNames(trade.offered_golfers)}>
                              {getGolferNames(trade.offered_golfers)}
                            </div>
                        </div>
                        <div className="text-surface-600 text-2xl font-black">↔</div>
                        <div className="text-center md:text-left">
                            <div className="text-[10px] text-surface-500 uppercase font-black mb-1">To</div>
                            <div className="font-display font-bold text-surface-50">{trade.receiving_team?.team_name}</div>
                            <div className="text-[10px] text-primary-400 mt-1 max-w-[150px] truncate" title={getGolferNames(trade.requested_golfers)}>
                              {getGolferNames(trade.requested_golfers)}
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto mt-4 md:mt-0">
                        {trade.receiving_team_id === myTeam?.id ? (
                            <>
                                <button 
                                  className="flex-1 px-4 py-2 bg-primary-600 text-surface-900 rounded-lg font-black text-xs uppercase hover:bg-primary-500 transition-all shadow-glow/10"
                                  onClick={() => handleAccept(trade.id)}
                                >
                                  Accept
                                </button>
                                <button 
                                  className="flex-1 px-4 py-2 bg-surface-700 text-surface-100 rounded-lg font-bold text-xs uppercase hover:bg-surface-600 transition-all"
                                  onClick={() => handleReject(trade.id)}
                                >
                                  Reject
                                </button>
                            </>
                        ) : (
                            <button 
                              className="w-full px-4 py-2 bg-surface-700 text-surface-100 rounded-lg font-bold text-xs uppercase hover:bg-surface-600 transition-all"
                              onClick={() => handleCancel(trade.id)}
                            >
                              Cancel Proposal
                            </button>
                        )}
                    </div>
                </div>
              )) : (
                <p className="text-surface-500 text-sm italic text-center py-12">You have no active trade offers.</p>
              )}
            </div>
          )}

          {activeSubTab === 'history' && (
            <div className="space-y-2">
              {completedTrades.length > 0 ? completedTrades.map(trade => (
                <div key={trade.id} className="p-4 bg-surface-900/30 rounded-xl border border-surface-700/30 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-bold text-surface-100">{trade.offering_team?.team_name}</span> traded with <span className="font-bold text-surface-100">{trade.receiving_team?.team_name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-[10px] px-2 py-0.5 rounded bg-primary-500/10 text-primary-400 font-bold uppercase tracking-wider border border-primary-500/20">
                        {trade.status}
                      </div>
                      <div className="text-xs text-surface-500">
                        {new Date(trade.updated_at || trade.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-surface-500 bg-surface-900/50 p-2 rounded-lg border border-surface-700/10">
                    <div className="flex justify-between">
                      <span className="text-surface-600">Offered:</span>
                      <span>{getGolferNames(trade.offered_golfers)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-surface-600">Received:</span>
                      <span>{getGolferNames(trade.requested_golfers)}</span>
                    </div>
                  </div>
                </div>
              )) : (
                <p className="text-surface-500 text-sm italic text-center py-12">No trade history found for this league.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {showProposeModal && myTeam && (
        <ProposeTradeModal
          league={league}
          myTeam={myTeam}
          teams={teams}
          onClose={() => setShowProposeModal(false)}
          onSuccess={() => {
            setShowProposeModal(false)
            loadTrades()
          }}
        />
      )}
    </div>
  )
}
