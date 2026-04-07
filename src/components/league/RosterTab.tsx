import { useEffect, useState, useRef } from 'react'
import { rosterService } from '../../services/rosterService'
import { tournamentService } from '../../services/tournamentService'
import { scoringService, formatScore, scoreColor, type GolferTournamentScore } from '../../services/scoringService'
import type { LineupGolfer } from '../../services/rosterService'
import type { Tournament } from '../../services/tournamentService'
import type { League, Team } from '../../services/leagueService'
import { useAuth } from '../../context/AuthContext'
import { draftService, type Draft } from '../../services/draftService'

interface RosterTabProps {
  league: League;
  teams: Team[];
}

export default function RosterTab({ league, teams }: RosterTabProps) {
  const { user } = useAuth()
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('')
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [lineup, setLineup] = useState<LineupGolfer[]>([])
  const [golferScores, setGolferScores] = useState<Record<string, GolferTournamentScore>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isCommishUnlocked, setIsCommishUnlocked] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [availableGolfers, setAvailableGolfers] = useState<any[]>([])
  const [loadingAvailable, setLoadingAvailable] = useState(false)
  const [addingGolfer, setAddingGolfer] = useState<string | null>(null)
  const [modalSearchTerm, setModalSearchTerm] = useState('')
  const [currentDraft, setCurrentDraft] = useState<Draft | null>(null)
  const initialLoadRef = useRef(true)

  // Default selected team to user's team, but fallback to first team
  useEffect(() => {
    if (teams.length > 0 && !selectedTeamId) {
      const userTeam = teams.find(t => t.user_id === user?.id)
      setSelectedTeamId(userTeam ? userTeam.id : teams[0].id)
    } else if (teams.length === 0) {
      setLoading(false)
    }
  }, [teams, user, selectedTeamId])

  // Reset initialLoadRef when team or tournament changes
  useEffect(() => {
    initialLoadRef.current = true
  }, [selectedTeamId, selectedTournamentId])

  // Load tournaments
  useEffect(() => {
    async function loadTournaments() {
      try {
        const data = await tournamentService.getTournaments()
        const excludedIds = league.excluded_tournaments || []
        const filtered = data.filter(t => !excludedIds.includes(t.id))
        setTournaments(filtered)
        
        // Default to the first active or upcoming tournament
        const activeOrUpcoming = filtered.find(t => t.status === 'active' || t.status === 'upcoming')
        if (activeOrUpcoming) {
          setSelectedTournamentId(activeOrUpcoming.id)
        } else if (filtered.length > 0) {
          setSelectedTournamentId(filtered[0].id)
        }
      } catch (err) {
        console.error('Failed to load tournaments:', err)
      }
    }
    loadTournaments()
  }, [])

  // Load roster and lineup
  useEffect(() => {
    if (!selectedTeamId || !selectedTournamentId) return

    async function loadData() {
      setLoading(true)
      try {
        // For per-tournament leagues, scope roster to selected tournament
        const rosterTournamentId = league.draft_cycle === 'tournament' ? selectedTournamentId : undefined

        const [r, l, rawStats, draft] = await Promise.all([
          rosterService.getTeamRoster(selectedTeamId, rosterTournamentId),
          rosterService.getWeeklyLineup(selectedTeamId, selectedTournamentId),
          scoringService.getTournamentRoundStats(selectedTournamentId),
          draftService.getDraftByTournament(league.id, selectedTournamentId)
        ])
        
        setCurrentDraft(draft)
        
        // Process stats
        const scoreMap: Record<string, GolferTournamentScore> = {}
        if (rawStats && rawStats.length > 0) {
           const board = scoringService.buildGolferLeaderboard(rawStats)
           board.forEach(gs => {
             scoreMap[gs.golfer_id] = gs
           })
        }
        setGolferScores(scoreMap)

        // Merge roster with lineup info
        const selectedTournament = tournaments.find(t => t.id === selectedTournamentId)

        let mergedLineup: LineupGolfer[] = []
        
        const hasLineup = l && l.length > 0
        const hasDraft = currentDraft && (currentDraft.status === 'active' || currentDraft.status === 'completed')

        if (hasLineup) {
          // 1. If we have a saved lineup for this specific tournament, that is always truth #1
          mergedLineup = l.map(lg => ({
            ...lg,
            acquired_via: lg.acquired_via || 'draft'
          }))
        } else if (league.draft_cycle === 'season') {
          // 2. In seasoned leagues, current roster is the fallback for all tournaments
          mergedLineup = r.map(golfer => {
            const lineupItem = l?.find(li => li.id === golfer.id)
            return {
              ...golfer,
              is_starter: lineupItem ? lineupItem.is_starter : false
            }
          })
        } else if (hasDraft && (selectedTournament?.status === 'upcoming' || selectedTournament?.status === 'active')) {
          // 3. In tournament redraft leagues, only use current roster if this tournament 
          // is either currently being drafted (active) or is the upcoming one.
          mergedLineup = r.map(golfer => {
            const lineupItem = l?.find(li => li.id === golfer.id)
            return {
              ...golfer,
              is_starter: lineupItem ? lineupItem.is_starter : false
            }
          })
        }

        setLineup(mergedLineup)
        // Mark initial load as complete AFTER setting the lineup
        setTimeout(() => {
          initialLoadRef.current = false
        }, 100)
      } catch (err) {
        console.error('Failed to load roster data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [selectedTeamId, selectedTournamentId])

  // Auto-save lineup
  useEffect(() => {
    if (initialLoadRef.current || !selectedTeamId || !selectedTournamentId || !lineup.length) return
    const team = teams.find(t => t.id === selectedTeamId)
    const isOwner = team?.user_id === user?.id
    if (!isOwner && !isCommish) return
    
    const selectedTournament = tournaments.find(t => t.id === selectedTournamentId)
    const isLocked = (selectedTournament?.status === 'completed' || selectedTournament?.status === 'active') && !isCommishUnlocked
    if (isLocked) return

    const timer = setTimeout(async () => {
      setSaving(true)
      try {
        await rosterService.saveLineup(
          selectedTeamId, 
          selectedTournamentId, 
          lineup.map(g => ({ golfer_id: g.id, is_starter: g.is_starter }))
        )
      } catch (err) {
        console.error('Auto-save failed:', err)
      } finally {
        setTimeout(() => setSaving(false), 800) // Keep "Saved" visible for a bit
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [lineup, selectedTeamId, selectedTournamentId, user?.id, teams, tournaments])

  const isCommish = league.commissioner_id === user?.id

  const toggleStarter = (golferId: string) => {
    const team = teams.find(t => t.id === selectedTeamId)
    const isOwner = team?.user_id === user?.id
    if (!isOwner && !isCommish) return // Can only edit own team or commish

    const currentStarters = lineup.filter(g => g.is_starter).length
    const isCurrentlyStarter = lineup.find(g => g.id === golferId)?.is_starter

    if (!isCurrentlyStarter && currentStarters >= league.weekly_starters) {
      alert(`You can only have ${league.weekly_starters} starters.`)
      return
    }

    setLineup(prev => prev.map((g: LineupGolfer) => 
      g.id === golferId ? { ...g, is_starter: !g.is_starter } : g
    ))
  }

  const toggleTradeBlock = async (golferId: string) => {
    if (!selectedTeamId) return
    const team = teams.find(t => t.id === selectedTeamId)
    const isOwner = team?.user_id === user?.id
    if (!isOwner && !isCommish) return

    const golfer = lineup.find(g => g.id === golferId)
    if (!golfer) return

    const newStatus = !golfer.is_on_trade_block
    
    // Optimistic UI update
    setLineup(prev => prev.map((g: LineupGolfer) => 
      g.id === golferId ? { ...g, is_on_trade_block: newStatus } : g
    ))

    try {
      await rosterService.toggleTradeBlock(selectedTeamId, golferId, newStatus)
    } catch (err) {
      console.error('Failed to toggle trade block:', err)
      // Revert on error
      setLineup(prev => prev.map((g: LineupGolfer) => 
        g.id === golferId ? { ...g, is_on_trade_block: !newStatus } : g
      ))
    }
  }

  const handleOpenAddModal = async () => {
    setShowAddModal(true)
    setLoadingAvailable(true)
    try {
      const available = await rosterService.getAvailableGolfers(league.id)
      setAvailableGolfers(available)
    } catch (err) {
      console.error('Failed to load available golfers:', err)
    } finally {
      setLoadingAvailable(false)
    }
  }

  const handleAddAvailableGolfer = async (golferId: string) => {
    if (!selectedTeamId) return
    setAddingGolfer(golferId)
    try {
      await rosterService.addGolfer(selectedTeamId, golferId, 'waiver', 
        league.draft_cycle === 'tournament' ? selectedTournamentId : undefined)
      
      // Refresh lineup
      const [r, l] = await Promise.all([
        rosterService.getTeamRoster(selectedTeamId),
        rosterService.getWeeklyLineup(selectedTeamId, selectedTournamentId)
      ])
      
      const mergedLineup = r.map(golfer => {
        const lineupItem = l?.find(li => li.id === golfer.id)
        return {
          ...golfer,
          is_starter: lineupItem ? lineupItem.is_starter : false
        }
      })
      setLineup(mergedLineup)
      setShowAddModal(false)
    } catch (err: any) {
      alert('Error adding golfer: ' + err.message)
    } finally {
      setAddingGolfer(null)
    }
  }

  const handleDropGolfer = async (golferId: string) => {
    if (!selectedTeamId) return
    if (!confirm('Are you sure you want to drop this golfer?')) return
    
    try {
      await rosterService.dropGolfer(selectedTeamId, golferId)
      setLineup(prev => prev.filter((g: LineupGolfer) => g.id !== golferId))
    } catch (err: any) {
      alert('Error dropping golfer: ' + err.message)
    }
  }



  const myTeam = teams.find(t => t.user_id === user?.id)
  const isEditingOwnTeam = selectedTeamId === myTeam?.id || isCommish
  const selectedTournament = tournaments.find(t => t.id === selectedTournamentId)
  
  let isActuallyLocked = false
  if (league.draft_cycle === 'tournament') {
    isActuallyLocked = selectedTournament?.status === 'completed'
  } else {
    isActuallyLocked = selectedTournament?.status === 'completed' || selectedTournament?.status === 'active'
  }
  
  const isLocked = isActuallyLocked && !isCommishUnlocked

  const starters = lineup.filter(g => g.is_starter)
  const bench = lineup.filter(g => !g.is_starter)

  if (!selectedTeamId && !loading) return (
    <div className="p-12 text-center">
      <div className="text-surface-400 mb-2">No teams found in this league.</div>
    </div>
  )

  if (loading && !lineup.length) return <div className="p-12 text-center text-surface-400">Loading roster...</div>

  const showDraftNotSet = league.draft_cycle === 'tournament' && 
                          !loading && 
                          (!currentDraft || currentDraft.status === 'pending') &&
                          !lineup.length

  return (
    <div className="space-y-4">
      {/* Compact Header with Filters and Save Indicator */}
      <div className="bg-surface-900/80 border border-surface-700/50 rounded-2xl p-2 md:p-3 sticky top-0 z-20 backdrop-blur-xl shadow-2xl flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Team Select */}
          <div className="bg-surface-800/50 border border-surface-700/30 rounded-xl px-3 py-1.5 flex flex-col min-w-[140px] transition-all hover:border-primary-500/30">
            <label className="text-[9px] text-surface-500 uppercase font-black tracking-widest leading-none mb-1">Team</label>
            <select 
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="bg-transparent text-sm text-surface-100 font-bold outline-none cursor-pointer w-full"
            >
              {teams.map(t => (
                <option key={t.id} value={t.id} className="bg-surface-800 text-sm">
                  {t.team_name}
                </option>
              ))}
            </select>
          </div>

          {/* Tournament Select */}
          <div className="bg-surface-800/50 border border-surface-700/30 rounded-xl px-3 py-1.5 flex flex-col min-w-[140px] transition-all hover:border-primary-500/30">
            <label className="text-[9px] text-surface-500 uppercase font-black tracking-widest leading-none mb-1">Tournament</label>
            <select 
              value={selectedTournamentId}
              onChange={(e) => setSelectedTournamentId(e.target.value)}
              className="bg-transparent text-sm text-surface-100 font-bold outline-none cursor-pointer w-full"
            >
              {tournaments.map(t => (
                <option key={t.id} value={t.id} className="bg-surface-800 text-sm">
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto px-2 md:px-0">
          <div className="flex items-center gap-2.5">
             <div className="w-8 h-8 rounded-full bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-sm">
               ⛳
             </div>
             <div className="flex flex-col">
               <span className="text-xs font-black text-surface-100 leading-none">
                 {starters.length} / {league.weekly_starters}
               </span>
               <span className="text-[9px] text-surface-500 uppercase font-bold tracking-tighter leading-none mt-1">Starters Active</span>
             </div>
          </div>

          {isEditingOwnTeam && !isLocked && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-300 ${
              saving 
                ? 'bg-primary-500/5 border-primary-500/20 text-primary-400' 
                : 'bg-green-500/5 border-green-500/20 text-green-400'
            }`}>
              {saving ? (
                <>
                  <div className="w-3 h-3 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Saving...</span>
                </>
              ) : (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                  <span className="text-[10px] font-black uppercase tracking-widest">All Saved</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {isActuallyLocked && (
        <div className={`border rounded-xl p-3 text-center text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-4 transition-all ${
          isCommishUnlocked 
            ? 'bg-primary-500/10 border-primary-500/20 text-primary-400' 
            : 'bg-amber-500/5 border border-amber-500/10 text-amber-500/80'
        }`}>
          <div className="flex items-center gap-2">
            <span>{isCommishUnlocked ? '🔓' : '🔒'} Lineup {isCommishUnlocked ? 'Unlocked (Commish)' : 'locked'} for {selectedTournament?.name}</span>
          </div>
          {isCommish && (
            <button 
              onClick={() => setIsCommishUnlocked(!isCommishUnlocked)}
              className={`px-3 py-1 rounded-lg border transition-all hover:scale-105 active:scale-95 ${
                isCommishUnlocked
                  ? 'bg-amber-500/20 border-amber-500/30 text-amber-500'
                  : 'bg-primary-500/20 border-primary-500/30 text-primary-400'
              }`}
            >
              {isCommishUnlocked ? 'Relock Roster' : 'Unlock Roster'}
            </button>
          )}
        </div>
      )}

      {/* Unified Roster Container */}
      {showDraftNotSet ? (
        <div className="bg-surface-900/40 border border-surface-700/50 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-xl">
          <div className="w-20 h-20 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center text-4xl shadow-inner animate-pulse">🗓️</div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-surface-100">Draft Order Not Set</h3>
            <p className="text-surface-500 max-w-xs mx-auto text-sm">The commissioner hasn't finalized the draft order for {selectedTournament?.name} yet.</p>
          </div>
          {isCommish && (
             <div className="mt-4 p-4 bg-primary-500/5 border border-primary-500/10 rounded-xl max-w-sm">
                <p className="text-primary-400 text-xs font-medium">Commissioners can set the order in <span className="font-bold">Settings &gt; Draft Order</span> randomize for this tournament.</p>
             </div>
          )}
        </div>
      ) : (
      <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl overflow-hidden shadow-lg">
        {/* Starters Section */}
        <div className="px-3 py-1.5 border-b border-surface-700/50 bg-primary-900/10 flex items-center justify-between">
           <h3 className="text-[10px] font-black text-primary-400 uppercase tracking-widest">Active Lineup</h3>
           <span className="text-[9px] text-surface-500 font-bold uppercase tracking-tighter">{starters.length} / {league.weekly_starters}</span>
        </div>
        <div className="divide-y divide-surface-700/50">
          {starters.length === 0 ? (
            <div className="p-8 text-center text-surface-600 italic text-xs">No starters selected</div>
          ) : (
            starters.map((golfer: LineupGolfer) => (
              <GolferRow 
                key={golfer.id} 
                golfer={golfer} 
                score={golferScores[golfer.id]}
                canEdit={isEditingOwnTeam && !isLocked} 
                canDrop={isCommish && isCommishUnlocked}
                onToggle={toggleStarter} 
                onToggleTradeBlock={toggleTradeBlock}
                onDrop={handleDropGolfer}
              />
            ))
          )}
        </div>

        {/* Bench Section */}
        <div className="px-3 py-1.5 border-y border-surface-700/50 bg-surface-900/40 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <h3 className="text-[10px] font-black text-surface-400 uppercase tracking-widest">Bench</h3>
             {isCommish && isCommishUnlocked && (
               <button 
                 onClick={handleOpenAddModal}
                 className="px-2 py-0.5 bg-primary-500/10 border border-primary-500/20 rounded text-[9px] font-black text-primary-400 uppercase tracking-tighter hover:bg-primary-500 hover:text-surface-900 transition-all"
               >
                 + Add from Waiver
               </button>
             )}
           </div>
           <span className="text-[9px] text-surface-500 font-bold uppercase tracking-tighter">Reserved</span>
        </div>
        <div className="divide-y divide-surface-700/50">
          {bench.length === 0 ? (
            <div className="p-8 text-center text-surface-600 italic text-xs">No golfers on bench</div>
          ) : (
            bench.map((golfer: LineupGolfer) => (
              <GolferRow 
                key={golfer.id} 
                golfer={golfer} 
                score={golferScores[golfer.id]}
                canEdit={isEditingOwnTeam && !isLocked} 
                canDrop={isCommish && isCommishUnlocked}
                onToggle={toggleStarter} 
                onToggleTradeBlock={toggleTradeBlock}
                onDrop={handleDropGolfer}
              />
            ))
          )}
        </div>
      </div>
      )}

      {/* Add Golfer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface-950/90 backdrop-blur-md">
          <div className="bg-surface-800 border border-surface-700 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-surface-700 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-surface-50">Add Player from Waiver</h2>
                <p className="text-surface-400 text-xs mt-1">Select an available golfer to add to this team.</p>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="w-10 h-10 rounded-xl bg-surface-900 border border-surface-700 flex items-center justify-center text-surface-400 hover:text-surface-100 transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="p-4 border-b border-surface-700/50 bg-surface-900/30">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search available golfers..."
                  value={modalSearchTerm}
                  onChange={(e) => setModalSearchTerm(e.target.value)}
                  className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-2 text-sm text-surface-100 focus:ring-2 focus:ring-primary-500/50 outline-none transition-all pl-10"
                />
                <span className="absolute left-3 top-2 text-surface-500">🔍</span>
              </div>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {loadingAvailable ? (
                <div className="p-12 text-center text-surface-500">Loading available golfers...</div>
              ) : availableGolfers.length === 0 ? (
                <div className="p-12 text-center text-surface-500 text-sm">No available golfers found.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {availableGolfers
                    .filter(g => g.name.toLowerCase().includes(modalSearchTerm.toLowerCase()))
                    .map(g => (
                      <div 
                        key={g.id} 
                        className="p-3 bg-surface-900 border border-surface-700/50 rounded-xl flex items-center justify-between hover:border-primary-500/30 transition-all"
                      >
                        <div>
                          <div className="font-bold text-surface-100 text-sm">{g.name}</div>
                          <div className="text-[10px] text-surface-500 flex items-center gap-2">
                            <span>OWGR: #{g.owg_rank || 'N/A'}</span>
                            <span className="w-0.5 h-0.5 rounded-full bg-surface-700" />
                            <span>Age: {g.age || 'N/A'}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddAvailableGolfer(g.id)}
                          disabled={addingGolfer === g.id}
                          className="px-3 py-1.5 bg-primary-600 text-surface-900 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-primary-500 transition-all disabled:opacity-50"
                        >
                          {addingGolfer === g.id ? 'Adding...' : 'Add'}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
            
            <div className="p-6 bg-surface-800/50 border-t border-surface-700">
              <button 
                onClick={() => setShowAddModal(false)}
                className="w-full py-3 bg-surface-700 text-surface-100 rounded-xl font-bold hover:bg-surface-600 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function GolferRow({ 
  golfer, 
  score,
  canEdit, 
  canDrop,
  onToggle, 
  onToggleTradeBlock,
  onDrop
}: { 
  golfer: LineupGolfer, 
  score?: GolferTournamentScore,
  canEdit: boolean, 
  canDrop?: boolean,
  onToggle: (id: string) => void,
  onToggleTradeBlock: (id: string) => void,
  onDrop?: (id: string) => void
}) {
  return (
    <div className="p-2.5 md:p-3 flex items-center justify-between hover:bg-surface-800/50 transition-colors group">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-surface-900 border border-surface-700 flex items-center justify-center text-base shadow-inner group-hover:border-primary-500/20 transition-colors">
          🏌️
        </div>
        <div>
          <div className="flex items-center gap-2">
            <div className="font-bold text-surface-100 group-hover:text-primary-400 transition-colors text-sm">{golfer.name}</div>
            {golfer.is_on_trade_block && (
              <span className="text-[8px] bg-orange-500/10 text-orange-500 border border-orange-500/20 px-1.5 py-0.5 rounded font-black uppercase tracking-widest">On Block</span>
            )}
          </div>
          <div className="text-[10px] text-surface-500 flex items-center gap-2">
            <span>Age: {golfer.age || 'N/A'}</span>
            <span className="w-0.5 h-0.5 rounded-full bg-surface-700" />
            <span className="capitalize">{golfer.acquired_via}</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        {score && (
          <div className="flex items-center gap-3 bg-surface-900/50 px-3 py-1.5 rounded-xl border border-surface-700/50 shrink-0">
             <div className="flex flex-col items-center min-w-[20px]">
                <span className="text-[8px] font-black tracking-widest text-surface-600 uppercase">R1</span>
                <span className={`text-[10px] font-bold ${scoreColor(score.r1)}`}>{formatScore(score.r1)}</span>
             </div>
             <div className="flex flex-col items-center min-w-[20px]">
                <span className="text-[8px] font-black tracking-widest text-surface-600 uppercase">R2</span>
                <span className={`text-[10px] font-bold ${scoreColor(score.r2)}`}>{formatScore(score.r2)}</span>
             </div>
             <div className="flex flex-col items-center min-w-[20px]">
                <span className="text-[8px] font-black tracking-widest text-surface-600 uppercase">R3</span>
                <span className={`text-[10px] font-bold ${score.is_penalty ? 'text-red-400/60 italic' : scoreColor(score.r3)}`}>
                  {formatScore(score.r3)}{score.is_penalty ? '*' : ''}
                </span>
             </div>
             <div className="flex flex-col items-center min-w-[20px]">
                <span className="text-[8px] font-black tracking-widest text-surface-600 uppercase">R4</span>
                <span className={`text-[10px] font-bold ${score.is_penalty ? 'text-red-400/60 italic' : scoreColor(score.r4)}`}>
                  {formatScore(score.r4)}{score.is_penalty ? '*' : ''}
                </span>
             </div>
             <div className="w-px h-6 bg-surface-700 mx-1"></div>
             <div className="flex flex-col items-center min-w-[30px]">
                <span className="text-[8px] font-black tracking-widest text-surface-600 uppercase">TOT</span>
                <span className={`text-sm font-black font-display leading-none mt-0.5 ${scoreColor(score.total)}`}>
                  {formatScore(score.total)}
                </span>
             </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {canEdit && (
          <>
            <button
              onClick={() => onToggleTradeBlock(golfer.id)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                golfer.is_on_trade_block 
                  ? 'bg-orange-500 text-surface-900 shadow-glow/20' 
                  : 'bg-surface-900 text-surface-500 hover:text-orange-400 border border-surface-700'
              }`}
              title={golfer.is_on_trade_block ? 'Remove from Trade Block' : 'Add to Trade Block'}
            >
              <span className="text-sm">↔️</span>
            </button>
            {canDrop && (
              <button
                onClick={() => onDrop?.(golfer.id)}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                title="Drop Golfer"
              >
                <span className="text-sm">🗑️</span>
              </button>
            )}
            <button 
              onClick={() => onToggle(golfer.id)}
              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all
                ${golfer.is_starter 
                  ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500 hover:text-surface-900' 
                  : 'bg-primary-500/10 border-primary-500/30 text-primary-400 hover:bg-primary-500 hover:text-surface-900'}
              `}
            >
              {golfer.is_starter ? 'Bench' : 'Start'}
            </button>
          </>
          )}
        </div>
      </div>
    </div>
  )
}
