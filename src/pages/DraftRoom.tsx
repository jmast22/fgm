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
  const [view, setView] = useState<'list' | 'board'>('list')
  const [isPickProcessing, setIsPickProcessing] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [countdown, setCountdown] = useState(10)
  const [isViewingHistory, setIsViewingHistory] = useState(false)

  useEffect(() => {
    if (!leagueId) return

    async function loadDraftData() {
      try {
        const [lData, activeDraft, tData] = await Promise.all([
          leagueService.getLeagueById(leagueId!),
          draftService.getDraftByLeague(leagueId!),
          leagueService.getLeagueTeams(leagueId!)
        ])
        
        setLeague(lData)
        setTeams(tData)

        if (activeDraft) {
          setDraft(activeDraft)
          if (activeDraft.status === 'completed') {
            setIsViewingHistory(true)
          }
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

    const draftsChannel = supabase.channel(`drafts:${leagueId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'drafts', 
        filter: `league_id=eq.${leagueId}` 
      }, (payload) => {
        setDraft(payload.new as Draft)
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'drafts',
        filter: `league_id=eq.${leagueId}`
      }, () => {
        setDraft(null)
      })
      .subscribe()

    // Assuming we watch draft picks as well
    // for simplicity, we reload full or just listen to all picks for our draft
    
    return () => {
      supabase.removeChannel(draftsChannel)
    }
  }, [leagueId])
  
  // Re-fetch picks and available when draft state changes
  useEffect(() => {
    if (!draft?.id) return;

    const refreshData = async () => {
      try {
        const [pData, gData, dData] = await Promise.all([
          draftService.getDraftPicks(draft.id),
          draftService.getAvailableGolfers(draft.id),
          draftService.getDraftByLeague(leagueId!)
        ]);
        setPicks(pData);
        setAvailableGolfers(gData);
        if (dData) setDraft(dData);
      } catch (err) {
        console.error('Error refreshing realtime data:', err);
      }
    };

    const picksChannel = supabase.channel(`picks:${draft.id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'draft_picks', 
        filter: `draft_id=eq.${draft.id}` 
      }, () => {
        refreshData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(picksChannel);
    };
  }, [draft?.id]);
  
  // Handle draft completion modal and redirect
  useEffect(() => {
    if (draft?.status === 'completed' && !loading && !isViewingHistory) {
      setShowSuccessModal(true)
    }
  }, [draft?.status, loading, isViewingHistory])

  useEffect(() => {
    let timer: any;
    if (showSuccessModal && countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    } else if (showSuccessModal && countdown === 0) {
      navigate(`/leagues/${leagueId}`)
    }
    return () => clearTimeout(timer)
  }, [showSuccessModal, countdown, navigate, leagueId])

  const filteredGolfers = useMemo(() => {
    const normalize = (str: string) => 
      str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
    
    const query = normalize(searchQuery);
    return availableGolfers.filter(g => normalize(g.name).includes(query))
  }, [availableGolfers, searchQuery])

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
  let currentTeamId: string | null = null
  
  if (!isDraftComplete) {
    const isEvenRound = draft.current_round % 2 === 0
    // Snake logic
    const pickIndexInRound = (draft.current_pick - 1) % teams.length
    
    // In odd rounds, order is normal (0,1,2...). In even rounds, reversed.
    const forwardIndex = isEvenRound ? teams.length - 1 - pickIndexInRound : pickIndexInRound
    currentTeamId = draft.draft_order[forwardIndex]
  }

  const currentTeam = teams.find(t => t.id === currentTeamId)
  const isCommish = league?.commissioner_id === user?.id
  const isMyTurn = currentTeam?.user_id === user?.id
  const canDraft = (isMyTurn || (isCommish && currentTeam)) && draft.status === 'active' && !isDraftComplete

  const handleDraftPlayer = async (golferId: string) => {
    if (!canDraft || !currentTeam || isDraftComplete || isPickProcessing) return
    setActionError(null)
    setIsPickProcessing(true)
    try {
      await draftService.makePick(
        draft.id,
        currentTeam.id,
        golferId,
        draft.current_round,
        draft.current_pick
      )
      // Immediate local refresh for best UX
      const [pData, gData, dData] = await Promise.all([
        draftService.getDraftPicks(draft.id),
        draftService.getAvailableGolfers(draft.id),
        draftService.getDraftByLeague(leagueId!)
      ])
      setPicks(pData)
      setAvailableGolfers(gData)
      if (dData) setDraft(dData)
    } catch (err: any) {
      setActionError(err.message || 'Failed to make pick.')
    } finally {
      setIsPickProcessing(false)
    }
  }

  const renderDraftBoard = () => {
    if (!draft || !league) return null;

    const rounds = league.roster_size;
    const numTeams = teams.length;
    const teamOrder = draft.draft_order;

    return (
      <div className="h-full overflow-auto pb-4 custom-scrollbar">
        <div className="inline-block min-w-full">
          {/* Header row with teams */}
          <div className="flex border-b border-surface-700 bg-surface-900/50 sticky top-0 z-10 w-full">
            {teamOrder.map((teamId, index) => {
              const team = teams.find(t => t.id === teamId);
              return (
                <div key={teamId} className="flex-1 min-w-[120px] p-4 text-center border-r border-surface-700 last:border-r-0">
                  <div className="w-10 h-10 bg-surface-700 rounded-full mx-auto mb-2 flex items-center justify-center text-lg font-bold text-surface-300 border-2 border-surface-600">
                    {team?.team_name?.charAt(0) || '?'}
                  </div>
                  <div className="text-xs font-bold text-surface-100 truncate px-1">{team?.team_name}</div>
                  <div className="text-[9px] text-surface-400 uppercase tracking-tighter mt-0.5 font-mono">Slot {index + 1}</div>
                </div>
              );
            })}
          </div>

          {/* Rounds */}
          {Array.from({ length: rounds }).map((_, roundIdx) => {
            const roundNum = roundIdx + 1;
            const isEvenRound = roundNum % 2 === 0;

            return (
              <div key={roundNum} className="flex border-b border-surface-700 w-full">
                {teamOrder.map((teamId, teamIdx) => {
                  const displayIndex = isEvenRound ? numTeams - 1 - teamIdx : teamIdx;
                  const pickNumber = (roundIdx * numTeams) + displayIndex + 1;
                  
                  const pick = picks.find(p => p.pick_number === pickNumber);
                  const isCurrent = draft.current_pick === pickNumber && !isDraftComplete;

                  return (
                    <div 
                      key={`${roundNum}-${teamId}`} 
                      className={`flex-1 min-w-[120px] h-28 p-2.5 border-r border-surface-700 last:border-r-0 flex flex-col justify-between transition-all duration-300 ${
                        isCurrent 
                          ? 'bg-primary-900/30 ring-2 ring-primary-500 ring-inset z-10 shadow-lg shadow-primary-900/20' 
                          : pick 
                            ? 'bg-surface-800/40' 
                            : 'bg-surface-900/10'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-[9px] font-mono font-bold text-surface-500">{roundNum}.{displayIndex + 1}</span>
                        {pick && (
                          <span className="text-[8px] px-1 bg-surface-700/50 rounded text-surface-400 font-medium">#{pickNumber}</span>
                        )}
                      </div>
                      
                      {pick ? (
                        <div className="mt-1">
                          <div className="text-[11px] font-bold text-primary-400 leading-tight uppercase line-clamp-2 drop-shadow-sm">
                             {(pick as any).golfer?.name}
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <div className="w-1 h-1 rounded-full bg-primary-500/30"></div>
                            <div className="text-[9px] text-surface-500 font-medium tracking-tight">GOLFER</div>
                          </div>
                        </div>
                      ) : isCurrent ? (
                        <div className="flex flex-col items-center justify-center flex-1 py-1">
                           <div className="text-[9px] text-primary-400 font-extrabold uppercase tracking-widest animate-pulse text-center leading-none">ON THE<br/>CLOCK</div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-surface-700/50 font-bold self-center mb-1">{pickNumber}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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
        
        <div className="flex items-center gap-2 bg-surface-900 p-1 rounded-lg border border-surface-700">
          <button 
            onClick={() => setView('list')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'list' ? 'bg-surface-700 text-surface-50 shadow-sm' : 'text-surface-400 hover:text-surface-200'}`}
          >
            List View
          </button>
          <button 
            onClick={() => setView('board')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'board' ? 'bg-surface-700 text-surface-50 shadow-sm' : 'text-surface-400 hover:text-surface-200'}`}
          >
            Draft Board
          </button>
        </div>

        {isCommish && (
          <div className="flex items-center gap-2 bg-surface-900 px-3 py-1.5 rounded-lg border border-surface-700">
             <span className="text-[10px] uppercase tracking-widest font-black text-primary-500/80 mr-1">Admin</span>
             <button 
               onClick={async () => {
                 if (confirm('Are you sure you want to reset the entire draft? This will delete ALL picks and placeholder teams.')) {
                   await draftService.resetDraft(leagueId!)
                   navigate(`/leagues/${leagueId}`)
                 }
               }}
               className="p-1.5 hover:bg-surface-800 rounded text-surface-400 hover:text-red-400 transition-colors"
               title="Reset Draft"
             >
                <span className="text-sm">🔄</span>
             </button>
             <button 
               onClick={async () => {
                 if (draft.status === 'paused') {
                    await draftService.resumeDraft(draft.id)
                 } else {
                    await draftService.pauseDraft(draft.id)
                 }
               }}
               className="p-1.5 hover:bg-surface-800 rounded text-surface-400 hover:text-primary-400 transition-colors"
               title={draft.status === 'paused' ? 'Resume Draft' : 'Pause Draft'}
             >
                <span className="text-sm">{draft.status === 'paused' ? '▶️' : '⏸️'}</span>
             </button>
             <button 
               onClick={async () => {
                 if (confirm('Undo the last pick?')) {
                    await draftService.undoLastPick(draft.id)
                    // Reload picks manually for immediate feedback
                    const updatedPicks = await draftService.getDraftPicks(draft.id)
                    setPicks(updatedPicks)
                 }
               }}
               className="p-1.5 hover:bg-surface-800 rounded text-surface-400 hover:text-orange-400 transition-colors"
               title="Undo Last Pick"
             >
                <span className="text-sm">↩️</span>
             </button>
          </div>
        )}

        {!isDraftComplete && (
          <div className="bg-surface-900 border border-surface-700 rounded-lg p-3 flex items-center gap-4">
            <div>
              <div className="text-xs text-surface-400 uppercase tracking-wider font-semibold">
                {draft.status === 'paused' ? 'DRAFT PAUSED' : 'On the Clock'}
              </div>
              <div className={`font-bold text-lg ${isMyTurn && draft.status === 'active' ? 'text-primary-400 animate-pulse' : 'text-surface-100'}`}>
                {draft.status === 'paused' ? '---' : (currentTeam?.team_name || 'Loading...')}
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

      {/* Draft Content */}
      {view === 'board' ? (
        <div className="flex-1 bg-surface-800/40 border border-surface-700/50 rounded-xl overflow-hidden focus:outline-none">
           {renderDraftBoard()}
        </div>
      ) : (
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
                      <div className="text-xs text-surface-400 flex items-center gap-2">
                        <span>Age: {golfer.age}</span>
                        <span className="w-1 h-1 rounded-full bg-surface-600"></span>
                        <span className="text-primary-400 font-semibold">
                          OWGR: {(golfer.owg_rank !== undefined && golfer.owg_rank !== null && golfer.owg_rank !== 9999) ? `#${golfer.owg_rank}` : 'N/A'}
                        </span>
                      </div>
                    </div>
                  <button 
                    disabled={!canDraft || isPickProcessing}
                    onClick={() => handleDraftPlayer(golfer.id)}
                    className={`px-4 py-1.5 rounded font-medium text-sm transition-colors ${
                      canDraft && !isPickProcessing
                        ? 'bg-primary-600 hover:bg-primary-500 text-surface-900' 
                        : 'bg-surface-700 text-surface-400 cursor-not-allowed text-xs'
                    }`}
                  >
                    {isPickProcessing ? '...' : 'Draft'}
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
                        <div className="text-surface-400 text-xs">{(pick as any).golfer?.name}</div>
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
      )}

      {/* Draft Completed Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/90 backdrop-blur-md">
          <div className="bg-surface-800 border border-primary-500/30 rounded-2xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(34,197,94,0.2)] text-center space-y-6 relative overflow-hidden">
            {/* Success Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-primary-500/20 blur-[60px] rounded-full -z-10"></div>
            
            <div className="w-20 h-20 bg-primary-500/10 rounded-full flex items-center justify-center mx-auto mb-2 text-4xl border border-primary-500/20 shadow-inner">
               <span className="animate-bounce">🏆</span>
            </div>
            
            <div>
              <h2 className="text-3xl font-display font-bold text-surface-50">Draft Complete!</h2>
              <p className="text-surface-400 mt-2 text-sm">
                The league draft has successfully finished. All rosters have been finalized.
              </p>
            </div>

            <div className="bg-surface-900/50 rounded-xl p-4 border border-surface-700/50">
               <div className="text-[10px] text-surface-500 uppercase tracking-widest font-black mb-1">Redirecting to Dashboard</div>
               <div className="text-2xl font-mono font-bold text-primary-400">{countdown}s</div>
            </div>

            <div className="pt-2">
              <button 
                onClick={() => navigate(`/leagues/${leagueId}`)}
                className="w-full py-3.5 bg-primary-600 hover:bg-primary-500 text-surface-900 font-bold rounded-xl transition-all shadow-lg shadow-primary-900/20 active:scale-[0.98] group flex items-center justify-center gap-2"
              >
                <span>Go to League Dashboard</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
