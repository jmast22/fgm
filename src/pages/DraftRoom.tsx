import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { draftService } from '../services/draftService'
import type { Draft, DraftPick } from '../services/draftService'
import { leagueService } from '../services/leagueService'
import type { League, Team } from '../services/leagueService'
import { supabase } from '../lib/supabase'

export default function DraftRoom() {
  const { leagueId } = useParams<{ leagueId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [league, setLeague] = useState<League | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [picks, setPicks] = useState<DraftPick[]>([])
  const [availableGolfers, setAvailableGolfers] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!leagueId) return

    async function loadDraftData() {
      try {
        const [lData, activeDraft, tData] = await Promise.all([
          leagueService.getLeagueById(leagueId!),
          draftService.getActiveDraft(leagueId!),
          leagueService.getLeagueTeams(leagueId!)
        ])
        
        setLeague(lData)
        setTeams(tData)

        if (activeDraft) {
          setDraft(activeDraft)
          const pData = await draftService.getDraftPicks(activeDraft.id)
          setPicks(pData)
          
          const gData = await draftService.getAvailableGolfers(activeDraft.id)
          setAvailableGolfers(gData)
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load draft data')
      } finally {
        setLoading(false)
      }
    }

    loadDraftData()

    // Realtime subscriptions
    const draftsChannel = supabase.channel(`drafts:${leagueId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drafts', filter: `league_id=eq.${leagueId}` }, (payload) => {
        setDraft(payload.new as Draft)
      })
      .subscribe()

    // Assuming we watch draft picks as well
    // for simplicity, we reload full or just listen to all picks for our draft
    
    return () => {
      supabase.removeChannel(draftsChannel)
    }
  }, [leagueId])
  
  // Re-fetch picks and available when draft state changes (could be optimized with more specific realtime)
  useEffect(() => {
    if (draft?.id) {
       const picksChannel = supabase.channel(`picks:${draft.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'draft_picks', filter: `draft_id=eq.${draft.id}` }, (payload) => {
           setPicks(prev => [...prev, payload.new as DraftPick])
           setAvailableGolfers(prev => prev.filter(g => g.id !== payload.new.golfer_id))
        })
        .subscribe()
       return () => {
         supabase.removeChannel(picksChannel)
       }
    }
  }, [draft?.id])

  if (loading) return <div className="p-6 text-surface-400">Loading draft room...</div>
  if (error || !league) return <div className="p-6 text-red-500">{error || 'Draft not found'}</div>

  if (!draft) {
    return (
      <div className="p-6 text-center space-y-4">
        <h2 className="text-2xl font-display font-bold text-surface-50">Draft Not Started</h2>
        <p className="text-surface-400">The commissioner has not started the draft yet.</p>
        <button 
          onClick={() => navigate(`/leagues/${leagueId}`)}
           className="px-6 py-2 bg-surface-700 hover:bg-surface-600 rounded text-surface-100 transition-colors"
        >
          Back to League
        </button>
      </div>
    )
  }

  // Calculate current turn
  const isDraftComplete = draft.status === 'completed'
  let currentTeamId = null
  
  if (!isDraftComplete) {
    const isEvenRound = draft.current_round % 2 === 0
    // Snake logic
    const pickIndexInRound = (draft.current_pick - 1) % teams.length
    
    // In odd rounds, order is normal (0,1,2...). In even rounds, reversed.
    const forwardIndex = isEvenRound ? teams.length - 1 - pickIndexInRound : pickIndexInRound
    currentTeamId = draft.draft_order[forwardIndex]
  }

  const currentTeam = teams.find(t => t.id === currentTeamId)
  const isMyTurn = currentTeam?.user_id === user?.id
  const myTeam = teams.find(t => t.user_id === user?.id)

  const handleDraftPlayer = async (golferId: string) => {
    if (!isMyTurn || !myTeam || isDraftComplete) return
    setActionError(null)
    try {
      await draftService.makePick(
        draft.id,
        myTeam.id,
        golferId,
        draft.current_round,
        draft.current_pick
      )
    } catch (err: any) {
      setActionError(err.message || 'Failed to make pick. Warning: Due to RLS, non-commissioner picking might fail unless backend bypasses RLS on "drafts".')
    }
  }

  const filteredGolfers = useMemo(() => {
    return availableGolfers.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [availableGolfers, searchQuery])

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-800 p-4 rounded-xl border border-surface-700">
        <div>
          <h1 className="text-2xl font-display font-bold text-surface-50">
            {league.name} Draft
          </h1>
          <p className="text-surface-400 text-sm mt-1">
            {isDraftComplete ? 'Draft Completed' : `Round ${draft.current_round} • Pick ${draft.current_pick}`}
          </p>
        </div>
        
        {!isDraftComplete && (
          <div className="bg-surface-900 border border-surface-700 rounded-lg p-3 flex items-center gap-4">
            <div>
              <div className="text-xs text-surface-400 uppercase tracking-wider font-semibold">On the Clock</div>
              <div className={`font-bold text-lg ${isMyTurn ? 'text-primary-400 animate-pulse' : 'text-surface-100'}`}>
                {currentTeam?.team_name || 'Loading...'}
              </div>
            </div>
          </div>
        )}
      </div>

      {actionError && (
        <div className="p-4 bg-red-900/50 border border-red-500/50 text-red-200 rounded-lg">
          {actionError}
        </div>
      )}

      {/* Draft Board */}
      <div className="grid lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Available Players */}
        <div className="lg:col-span-2 bg-surface-800/40 border border-surface-700/50 rounded-xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-surface-700/50">
            <h2 className="font-display font-semibold text-lg text-surface-100 mb-3 flex items-center gap-2">
              <span>🎯</span> Available Golfers
            </h2>
            <input 
              type="text" 
              placeholder="Search golfers..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-900 border border-surface-700 rounded-lg py-2 px-3 text-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filteredGolfers.slice(0, 100).map(golfer => (
              <div key={golfer.id} className="bg-surface-800 border border-surface-700 rounded-lg p-3 flex items-center justify-between hover:border-surface-600 transition-colors">
                 <div>
                    <div className="font-bold text-surface-50">{golfer.name}</div>
                    <div className="text-xs text-surface-400">Age: {golfer.age}</div>
                 </div>
                 <button 
                   disabled={!isMyTurn}
                   onClick={() => handleDraftPlayer(golfer.id)}
                   className={`px-4 py-1.5 rounded font-medium text-sm transition-colors ${
                     isMyTurn 
                      ? 'bg-primary-600 hover:bg-primary-500 text-surface-900' 
                      : 'bg-surface-700 text-surface-400 cursor-not-allowed'
                   }`}
                 >
                   Draft
                 </button>
              </div>
            ))}
            {filteredGolfers.length === 0 && (
              <div className="text-surface-400 text-center py-8">No golfers found.</div>
            )}
          </div>
        </div>

        {/* Draft History */}
        <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl overflow-hidden flex flex-col">
           <div className="p-4 border-b border-surface-700/50">
            <h2 className="font-display font-semibold text-lg text-surface-100 flex items-center gap-2">
              <span>📋</span> Pick History
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
             <div className="divide-y divide-surface-700/50">
               {[...picks].reverse().map(pick => {
                 const pTeam = teams.find(t => t.id === pick.team_id)
                 return (
                   <div key={pick.id} className="p-3 text-sm flex items-center gap-3">
                     <div className="w-12 text-center text-surface-400 font-mono text-xs">
                       {pick.round}.{pick.pick_number}
                     </div>
                     <div>
                       <div className="font-bold text-surface-100">{pTeam?.team_name}</div>
                       <div className="text-surface-400 text-xs">Picked Golfer</div>
                     </div>
                   </div>
                 )
               })}
               {picks.length === 0 && (
                 <div className="p-6 text-center text-surface-400 text-sm">
                   No picks made yet.
                 </div>
               )}
             </div>
          </div>
        </div>
      </div>
    </div>
  )
}
