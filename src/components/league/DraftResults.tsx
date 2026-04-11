import { useEffect, useState } from 'react'
import { draftService } from '../../services/draftService'
import type { Draft, DraftPick } from '../../services/draftService'
import type { League, Team } from '../../services/leagueService'
import { useAuth } from '../../context/AuthContext'
import { tournamentService, type Tournament } from '../../services/tournamentService'
import { supabase } from '../../lib/supabase'

interface DraftResultsProps {
  league: League;
  teams: Team[];
  onBack?: () => void;
}

export default function DraftResults({ league, teams, onBack }: DraftResultsProps) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [picks, setPicks] = useState<DraftPick[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [selectedTournament, setSelectedTournament] = useState<string>('latest')
  const [tournaments, setTournaments] = useState<Tournament[]>([])

  const { user } = useAuth()
  const isCommish = user?.id === league.commissioner_id

  const [editingPick, setEditingPick] = useState<{ id?: string, team_id: string, round: number, pick_number: number, golfer_id?: string } | null>(null)
  const [availableGolfers, setAvailableGolfers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())

  const handleEditClick = async (pickInfo: { id?: string, team_id: string, round: number, pick_number: number, golfer_id?: string }) => {
    if (!isCommish) return
    setEditingPick(pickInfo)
    try {
      if (draft) {
        const golfers = await draftService.getAvailableGolfers(draft.id)
        setAvailableGolfers(golfers)
      }
    } catch (err: any) {
      alert('Failed to load available golfers: ' + err.message)
    }
  }

  const handleSaveEdit = async (newGolferId: string) => {
    if (!editingPick || !draft) return
    setSavingEdit(true)
    try {
      if (editingPick.id) {
        await draftService.editDraftPick(editingPick.id, editingPick.team_id, editingPick.golfer_id || '', newGolferId)
      } else {
        await draftService.makePick(draft.id, editingPick.team_id, newGolferId, editingPick.round, editingPick.pick_number)
      }
      const p = await draftService.getDraftPicks(draft.id)
      setPicks(p)
      
      const updatedDraft = await draftService.getDraftByTournament(league.id, draft.tournament_id!);
      if (updatedDraft) setDraft(updatedDraft);

      setEditingPick(null)
      setSearch('')
    } catch (err: any) {
      alert('Failed to save pick edit: ' + err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const handleClearPick = async () => {
    if (!editingPick || !draft || !editingPick.id) return
    if (!confirm('Are you sure you want to clear this pick selection?')) return
    setSavingEdit(true)
    try {
      await draftService.editDraftPick(editingPick.id, editingPick.team_id, editingPick.golfer_id || '', '');
      const p = await draftService.getDraftPicks(draft.id)
      setPicks(p)
      setEditingPick(null)
      setSearch('')
    } catch (err: any) {
      alert('Failed to clear pick: ' + err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const handleJumpToPick = async (pick: any) => {
    if (!confirm(`Are you sure you want to jump the draft progress to Pick #${pick.pick_number}?`)) return;
    try {
      if (!draft) return;
      await draftService.jumpToPick(draft.id, pick.round, pick.pick_number);
      setDraft({ ...draft, current_round: pick.round, current_pick: pick.pick_number, status: 'paused' });
      setEditingPick(null);
    } catch (err: any) {
      alert('Failed to jump to pick: ' + err.message);
    }
  };

  useEffect(() => {
    async function loadResults() {
      try {
        const allTournaments = await tournamentService.getTournaments()
        setTournaments(allTournaments)

        const d = await draftService.getAllDraftsByLeague(league.id)

        let activeTournamentId = selectedTournament
        if (activeTournamentId === 'latest') {
          const activeOrUpcoming = allTournaments.find(t => t.status !== 'completed')
          activeTournamentId = activeOrUpcoming?.id || allTournaments[allTournaments.length - 1]?.id || ''
          setSelectedTournament(activeTournamentId)
        }

        const activeDraft = d.find(draft => draft.tournament_id === activeTournamentId)
        
        if (activeDraft) {
          setDraft(activeDraft)
          const p = await draftService.getDraftPicks(activeDraft.id)
          setPicks(p)
        } else {
          setDraft(null)
          setPicks([])
        }
      } catch (err) {
        console.error('Failed to load draft results:', err)
      } finally {
        setLoading(false)
      }
    }
    loadResults()
  }, [league.id, selectedTournament])

  useEffect(() => {
    if (!draft) return;

    const channel = supabase.channel(`draft_presence:${draft.id}`, {
      config: {
        presence: {
          key: user?.id || 'anonymous',
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const connectedIds = new Set<string>();
        Object.keys(state).forEach((key) => {
          if (key !== 'anonymous') connectedIds.add(key);
        });
        setOnlineUserIds(connectedIds);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [draft?.id, user?.id]);


  if (loading) return <div className="p-12 text-center text-surface-400">Loading results...</div>

  const renderBoard = () => {
    if (!draft) return null;
    const actualRounds = picks.length > 0 ? Math.max(...picks.map(p => p.round)) : 0;
    const rounds = Math.max(league.roster_size, actualRounds);
    const numTeams = teams.length;
    const teamOrder = draft.draft_order;

    return (
      <div className="overflow-x-auto pb-6 custom-scrollbar">
        <div className="inline-block min-w-full">
          <div className="flex border-b border-surface-700 bg-surface-900/50 sticky top-0 z-10 w-full">
            {teamOrder.map((teamId, index) => {
              const team = teams.find(t => t.id === teamId);
              const isOnline = team?.user_id && onlineUserIds.has(team.user_id);
              
              return (
                <div key={teamId} className={`flex-1 min-w-[110px] px-2 py-4 text-center border-r border-surface-700 last:border-r-0 transition-all ${isOnline ? 'bg-primary-500/10' : 'opacity-40 grayscale'}`}>
                  <div className={`text-[10px] font-black uppercase tracking-tight truncate mb-1 ${isOnline ? 'text-primary-400' : 'text-surface-400'}`}>
                    {team?.team_name || 'Team'}
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-primary-500 animate-pulse' : 'bg-surface-700'}`}></div>
                    <div className="text-[9px] text-surface-500 uppercase tracking-tighter font-mono">{isOnline ? 'Joined' : 'Slot ' + (index + 1)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {Array.from({ length: rounds }).map((_, roundIdx) => {
            const roundNum = roundIdx + 1;
            const isEvenRound = roundNum % 2 === 0;

            return (
              <div key={roundNum} className="flex border-b border-surface-700 w-full">
                {teamOrder.map((teamId, teamIdx) => {
                  const displayIndex = isEvenRound ? numTeams - 1 - teamIdx : teamIdx;
                  const pickNumber = (roundIdx * numTeams) + displayIndex + 1;
                  const pick = picks.find(p => p.pick_number === pickNumber);

                  return (
                    <div 
                      key={`${roundNum}-${teamId}`} 
                      className="flex-1 min-w-[110px] p-2 border-r border-surface-700 last:border-r-0 bg-surface-800/10"
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <span className="text-[10px] font-mono font-bold text-surface-600">{roundNum}.{displayIndex + 1}</span>
                        <span className="text-[9px] px-1 bg-surface-700/50 rounded text-surface-500">#{pickNumber}</span>
                      </div>
                      
                      {pick ? (
                        <div 
                          className={isCommish && !draft.is_locked ? "cursor-pointer group relative bg-surface-800/50 p-1.5 -m-1.5 rounded" : ""}
                          onClick={() => isCommish && !draft.is_locked && handleEditClick(pick)}
                        >
                          <div className={`text-[10px] font-black leading-none uppercase ${isCommish && !draft.is_locked ? 'text-surface-100 group-hover:text-primary-400 transition-colors' : 'text-primary-400'}`}>
                             {(() => {
                               const fullName = (pick as any).golfer?.name;
                               if (!fullName) return <span className="text-orange-400/50">WAITING</span>;
                               const parts = fullName.split(' ');
                               return (
                                 <div className="space-y-0.5">
                                   <div className="opacity-60 font-medium text-[9px]">{parts[0]}</div>
                                   <div className="truncate">{parts.slice(1).join(' ')}</div>
                                 </div>
                               );
                             })()}
                          </div>
                          {isCommish && !draft.is_locked && (
                            <div className="absolute -top-3 -right-2 hidden group-hover:flex items-center justify-center w-5 h-5 bg-primary-600 rounded-full text-surface-900 text-[10px] shadow-lg">
                              ✎
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="h-4 rounded w-full bg-surface-700/20 animate-pulse w-3/4"></div>
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

  const renderList = () => {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-surface-800/50 border-b border-surface-700 sticky top-0 z-10">
            <tr>
              <th className="p-4 text-[10px] font-black text-surface-500 uppercase tracking-widest w-20">Pick</th>
              <th className="p-4 text-[10px] font-black text-surface-500 uppercase tracking-widest">Team</th>
              <th className="p-4 text-[10px] font-black text-surface-500 uppercase tracking-widest">Golfer</th>
              <th className="p-4 text-[10px] font-black text-surface-500 uppercase tracking-widest text-center">Odds</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-700/50">
            {picks.map(pick => {
              const team = teams.find(t => t.id === pick.team_id)
              return (
                <tr 
                  key={pick.id} 
                  onClick={() => isCommish && handleEditClick(pick)}
                  className={`group transition-colors ${isCommish ? 'cursor-pointer hover:bg-surface-800/50' : 'hover:bg-surface-800/30'}`}
                >
                  <td className="p-4">
                    <div className="text-surface-500 font-mono text-xs">#{pick.pick_number}</div>
                    <div className="text-[9px] text-surface-600 uppercase font-black">{pick.round}.{pick.pick_number}</div>
                  </td>
                  <td className="p-4">
                    <div className="font-bold text-surface-100">{team?.team_name}</div>
                  </td>
                  <td className="p-4">
                    <div className={`font-bold ${isCommish ? 'text-surface-100 group-hover:text-primary-400' : 'text-primary-400'}`}>
                      {(pick as any).golfer?.name || <span className="text-orange-400">⚠️ Blank Slot</span>}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="text-xs text-purple-400 font-black">
                      {(pick as any).odds != null ? `+${(pick as any).odds}` : '—'}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {onBack && (
            <button 
              onClick={onBack}
              className="p-2 bg-surface-800 border border-surface-700 rounded-lg text-surface-400 hover:text-surface-100 transition-colors"
            >
              ←
            </button>
          )}
          <div>
            <h3 className="text-xl font-display font-bold text-surface-50">Draft Results</h3>
            <p className="text-surface-400 text-sm">
              {league.name} • <span className="capitalize">{league.draft_status === 'pending' && picks.length > 0 ? 'Paused' : league.draft_status}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {tournaments.length > 0 && (
             <div className="bg-surface-800/50 border border-surface-700/30 rounded-xl px-3 py-1.5 flex flex-col min-w-[200px] transition-all hover:border-primary-500/30">
               <label className="text-[9px] text-surface-500 uppercase font-black tracking-widest leading-none mb-1">Draft Schedule</label>
               <select 
                 value={selectedTournament}
                 onChange={e => setSelectedTournament(e.target.value)}
                 className="bg-transparent text-sm text-surface-100 font-bold outline-none cursor-pointer w-full text-left"
               >
                 {tournaments.map(t => (
                   <option key={t.id} value={t.id} className="bg-surface-800 text-sm">
                     {t.name} ({new Date(t.start_date).getFullYear()})
                   </option>
                 ))}
               </select>
             </div>
          )}
          <div className="flex items-center gap-1 bg-surface-900/50 p-1 rounded-lg border border-surface-700/50 h-fit self-center">
            <button 
              onClick={() => setView('board')}
              className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${view === 'board' ? 'bg-primary-600 text-surface-900 shadow-glow/10' : 'text-surface-400 hover:text-surface-100'}`}
            >
              Board
            </button>
            <button 
              onClick={() => setView('list')}
              className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${view === 'list' ? 'bg-primary-600 text-surface-900 shadow-glow/10' : 'text-surface-400 hover:text-surface-100'}`}
            >
              Golfers
            </button>
          </div>
        </div>
      </div>

      <div className={`bg-surface-900/40 border border-surface-700/50 rounded-2xl overflow-hidden min-h-[400px] flex flex-col ${!draft ? 'items-center justify-center' : ''}`}>
        {draft ? (
           <div className="w-full h-full overflow-hidden">
             {view === 'board' ? renderBoard() : renderList()}
           </div>
        ) : (
          <div className="text-center p-12">
            <div className="w-16 h-16 bg-surface-800 border border-surface-700 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4 opacity-50">
              📅
            </div>
            <h4 className="text-surface-100 font-bold">Draft Order Not Set</h4>
            <p className="text-surface-500 text-sm mt-1 max-w-xs mx-auto">
              The commissioner has not yet finalized the draft order for the {tournaments.find(t => t.id === selectedTournament)?.name}.
            </p>
            {isCommish && (
               <p className="mt-4 text-[10px] text-primary-400 font-black uppercase tracking-widest bg-primary-500/10 px-3 py-1 rounded inline-block">
                 Commish: Set order in League Settings
               </p>
            )}
          </div>
        )}
      </div>

      {editingPick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface-900 border border-surface-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-surface-700 bg-surface-800/50 flex justify-between items-center">
              <div>
                <h3 className="font-black text-lg text-surface-100 uppercase tracking-wide">Edit Draft Pick</h3>
                <p className="text-xs text-primary-400 font-bold uppercase tracking-widest mt-0.5">
                  Round {editingPick.round} • Pick {editingPick.pick_number}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isCommish && editingPick?.id && (
                  <button
                    onClick={handleClearPick}
                    className="px-3 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                    title="Remove golfer from this slot"
                  >
                    Clear Selection
                  </button>
                )}
                {isCommish && draft?.status === 'paused' && (
                  <button
                    onClick={() => handleJumpToPick(editingPick)}
                    className="px-3 py-1.5 bg-primary-600/10 text-primary-400 border border-primary-500/30 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 hover:text-surface-900 transition-all"
                    title="Restart the draft progress from this pick slot"
                  >
                    Set as Current Pick
                  </button>
                )}
                <button 
                  onClick={() => { setEditingPick(null); setSearch(''); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-800 text-surface-400 hover:text-white hover:bg-surface-700 transition-colors"
                >
                  ✖
                </button>
              </div>
            </div>
            
            <div className="p-4 border-b border-surface-700">
              <input
                type="text"
                placeholder="Search golfers..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-surface-800 border-none rounded-xl px-4 py-3 text-surface-100 focus:ring-2 focus:ring-primary-500/50 outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
              {savingEdit ? (
                <div className="p-8 text-center text-primary-400 font-bold animate-pulse">
                  Saving replacement...
                </div>
              ) : availableGolfers.length === 0 ? (
                <div className="p-8 text-center text-surface-500 font-bold">
                  Loading available golfers...
                </div>
              ) : (
                availableGolfers
                  .filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
                  .slice(0, 50)
                  .map(g => (
                    <button
                      key={g.id}
                      onClick={() => handleSaveEdit(g.id)}
                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-primary-500/20 border border-transparent hover:border-primary-500/30 transition-all text-left group"
                    >
                      <div>
                        <div className="font-bold text-surface-100 group-hover:text-primary-400 transition-colors">{g.name}</div>
                        <div className="text-xs text-surface-500 mt-0.5">Odds: {g.odds != null ? `+${g.odds}` : 'N/A'}</div>
                      </div>
                      <div className="px-3 py-1 bg-surface-800 rounded font-bold text-xs text-surface-400 group-hover:bg-primary-600 group-hover:text-surface-900 transition-colors">
                        Select
                      </div>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
