import { useEffect, useState, useRef } from 'react'
import { rosterService } from '../../services/rosterService'
import { tournamentService } from '../../services/tournamentService'
import type { LineupGolfer } from '../../services/rosterService'
import type { Tournament } from '../../services/tournamentService'
import type { League, Team } from '../../services/leagueService'
import { useAuth } from '../../context/AuthContext'

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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const initialLoadRef = useRef(true)

  // Set selected team to user's team
  useEffect(() => {
    const userTeam = teams.find(t => t.user_id === user?.id)
    if (userTeam) {
      setSelectedTeamId(userTeam.id)
    } else {
      setLoading(false)
    }
  }, [teams, user])

  // Reset initialLoadRef when team or tournament changes
  useEffect(() => {
    initialLoadRef.current = true
  }, [selectedTeamId, selectedTournamentId])

  // Load tournaments
  useEffect(() => {
    async function loadTournaments() {
      try {
        const data = await tournamentService.getTournaments()
        setTournaments(data)
        
        // Default to the first active or upcoming tournament
        const activeOrUpcoming = data.find(t => t.status === 'active' || t.status === 'upcoming')
        if (activeOrUpcoming) {
          setSelectedTournamentId(activeOrUpcoming.id)
        } else if (data.length > 0) {
          setSelectedTournamentId(data[0].id)
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
        const [r, l] = await Promise.all([
          rosterService.getTeamRoster(selectedTeamId),
          rosterService.getWeeklyLineup(selectedTeamId, selectedTournamentId)
        ])
        
        // Merge roster with lineup info
        const mergedLineup = r.map(golfer => {
          const lineupItem = l?.find(li => li.id === golfer.id)
          return {
            ...golfer,
            is_starter: lineupItem ? lineupItem.is_starter : false
          }
        })
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
    if (team?.user_id !== user?.id) return
    
    const selectedTournament = tournaments.find(t => t.id === selectedTournamentId)
    const isLocked = selectedTournament?.status === 'completed' || selectedTournament?.status === 'active'
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

  const toggleStarter = (golferId: string) => {
    const team = teams.find(t => t.id === selectedTeamId)
    if (team?.user_id !== user?.id) return // Can only edit own team

    const currentStarters = lineup.filter(g => g.is_starter).length
    const isCurrentlyStarter = lineup.find(g => g.id === golferId)?.is_starter

    if (!isCurrentlyStarter && currentStarters >= league.weekly_starters) {
      alert(`You can only have ${league.weekly_starters} starters.`)
      return
    }

    setLineup(prev => prev.map(g => 
      g.id === golferId ? { ...g, is_starter: !g.is_starter } : g
    ))
  }

  const toggleTradeBlock = async (golferId: string) => {
    if (!selectedTeamId) return
    const team = teams.find(t => t.id === selectedTeamId)
    if (team?.user_id !== user?.id) return

    const golfer = lineup.find(g => g.id === golferId)
    if (!golfer) return

    const newStatus = !golfer.is_on_trade_block
    
    // Optimistic UI update
    setLineup(prev => prev.map(g => 
      g.id === golferId ? { ...g, is_on_trade_block: newStatus } : g
    ))

    try {
      await rosterService.toggleTradeBlock(selectedTeamId, golferId, newStatus)
    } catch (err) {
      console.error('Failed to toggle trade block:', err)
      // Revert on error
      setLineup(prev => prev.map(g => 
        g.id === golferId ? { ...g, is_on_trade_block: !newStatus } : g
      ))
    }
  }



  const myTeam = teams.find(t => t.user_id === user?.id)
  const isEditingOwnTeam = selectedTeamId === myTeam?.id
  const selectedTournament = tournaments.find(t => t.id === selectedTournamentId)
  const isLocked = selectedTournament?.status === 'completed' || selectedTournament?.status === 'active'

  const starters = lineup.filter(g => g.is_starter)
  const bench = lineup.filter(g => !g.is_starter)

  if (!selectedTeamId && !loading) return (
    <div className="p-12 text-center">
      <div className="text-surface-400 mb-2">You don't have a team in this league yet.</div>
      <div className="text-xs text-surface-600">Please join the league or contact the commissioner.</div>
    </div>
  )

  if (loading && !lineup.length) return <div className="p-12 text-center text-surface-400">Loading roster...</div>

  return (
    <div className="space-y-4">
      {/* Compact Header with Filters and Save Indicator */}
      <div className="bg-surface-900/80 border border-surface-700/50 rounded-2xl p-2 md:p-3 sticky top-0 z-20 backdrop-blur-xl shadow-2xl flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
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

      {isLocked && (
        <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 text-center text-amber-500/80 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
          <span>🔒 Lineup locked for {selectedTournament?.name}</span>
        </div>
      )}

      {/* Unified Roster Container */}
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
            starters.map(golfer => (
              <GolferRow 
                key={golfer.id} 
                golfer={golfer} 
                canEdit={isEditingOwnTeam && !isLocked} 
                onToggle={toggleStarter} 
                onToggleTradeBlock={toggleTradeBlock}
              />
            ))
          )}
        </div>

        {/* Bench Section */}
        <div className="px-3 py-1.5 border-y border-surface-700/50 bg-surface-900/40 flex items-center justify-between">
           <h3 className="text-[10px] font-black text-surface-400 uppercase tracking-widest">Bench</h3>
           <span className="text-[9px] text-surface-500 font-bold uppercase tracking-tighter">Reserved</span>
        </div>
        <div className="divide-y divide-surface-700/50">
          {bench.length === 0 ? (
            <div className="p-8 text-center text-surface-600 italic text-xs">No golfers on bench</div>
          ) : (
            bench.map(golfer => (
              <GolferRow 
                key={golfer.id} 
                golfer={golfer} 
                canEdit={isEditingOwnTeam && !isLocked} 
                onToggle={toggleStarter} 
                onToggleTradeBlock={toggleTradeBlock}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function GolferRow({ 
  golfer, 
  canEdit, 
  onToggle, 
  onToggleTradeBlock 
}: { 
  golfer: LineupGolfer, 
  canEdit: boolean, 
  onToggle: (id: string) => void,
  onToggleTradeBlock: (id: string) => void
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
  )
}
