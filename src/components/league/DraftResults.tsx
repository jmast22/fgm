import { useEffect, useState } from 'react'
import { draftService } from '../../services/draftService'
import type { Draft, DraftPick } from '../../services/draftService'
import type { League, Team } from '../../services/leagueService'
import { useAuth } from '../../context/AuthContext'

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
  const [tournaments, setTournaments] = useState<{id: string, name: string}[]>([])

  const { user } = useAuth()
  const isCommish = user?.id === league.commissioner_id

  const [editingPick, setEditingPick] = useState<{ id?: string, team_id: string, round: number, pick_number: number, golfer_id?: string } | null>(null)
  const [availableGolfers, setAvailableGolfers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

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
      setEditingPick(null)
      setSearch('')
    } catch (err: any) {
      alert('Failed to save pick edit: ' + err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  useEffect(() => {
    async function loadResults() {
      try {
        const d = await draftService.getAllDraftsByLeague(league.id)
        if (d && d.length > 0) {
          
          // Get tournament details for these drafts
          const tIds = d.map(draft => draft.tournament_id).filter(Boolean) as string[]
          if (tIds.length > 0) {
            const { supabase } = await import('../../lib/supabase')
            const { data: tData } = await supabase.from('tournaments')
              .select('id, name')
              .in('id', tIds)
            if (tData) setTournaments(tData)
          }

          // Select draft based on tournament, defaulting to latest
          let activeDraft = d[0];
          if (selectedTournament !== 'latest') {
            activeDraft = d.find(draft => draft.tournament_id === selectedTournament) || d[0]
          }
          
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

  if (loading) return <div className="p-12 text-center text-surface-400">Loading results...</div>
  if (!draft) return <div className="p-12 text-center text-surface-400">No draft data found.</div>

  const renderBoard = () => {
    const actualRounds = picks.length > 0 ? Math.max(...picks.map(p => p.round)) : 0;
    const rounds = Math.max(league.roster_size, actualRounds);
    const numTeams = teams.length;
    const teamOrder = draft.draft_order;

    return (
      <div className="overflow-x-auto pb-4 no-scrollbar">
        <div className="inline-block min-w-full">
          {/* Header row with teams */}
          <div className="flex border-b border-surface-700 bg-surface-900/50 sticky top-0 z-10 w-full">
            {teamOrder.map((teamId, index) => {
              const team = teams.find(t => t.id === teamId);
              return (
                <div key={teamId} className="flex-1 min-w-[140px] p-4 text-center border-r border-surface-700 last:border-r-0">
                  <div className="text-xs font-bold text-surface-100 truncate">{team?.team_name || 'Team'}</div>
                  <div className="text-[9px] text-surface-500 uppercase tracking-tighter mt-0.5 font-mono">Slot {index + 1}</div>
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

                  return (
                    <div 
                      key={`${roundNum}-${teamId}`} 
                      className={`flex-1 min-w-[140px] p-3 border-r border-surface-700 last:border-r-0 bg-surface-800/20`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-mono font-bold text-surface-600">{roundNum}.{displayIndex + 1}</span>
                        <span className="text-[9px] px-1 bg-surface-700/50 rounded text-surface-500">#{pickNumber}</span>
                      </div>
                      
                      {pick ? (
                        <div 
                          className={isCommish ? "cursor-pointer group relative bg-surface-800/50 p-1.5 -m-1.5 rounded" : ""}
                          onClick={() => handleEditClick(pick)}
                        >
                          <div className={`text-[11px] font-bold leading-tight uppercase line-clamp-2 ${isCommish ? 'text-surface-100 group-hover:text-primary-400 transition-colors' : 'text-primary-400'}`}>
                             {(pick as any).golfer?.name || '⚠️ BLANK SLOT'}
                          </div>
                          {isCommish && (
                            <div className="absolute -top-3 -right-2 hidden group-hover:flex items-center justify-center w-5 h-5 bg-primary-600 rounded-full text-surface-900 text-[10px] shadow-lg">
                              ✎
                            </div>
                          )}
                        </div>
                      ) : (
                        <div 
                          className={`h-4 rounded w-full ${isCommish ? 'bg-primary-500/10 border border-primary-500/20 text-[8px] flex items-center justify-center text-primary-500/50 uppercase font-bold cursor-pointer hover:bg-primary-500/20 hover:text-primary-400 transition-colors' : 'bg-surface-700/20 animate-pulse w-3/4'}`}
                          title={isCommish ? "Click to add a missing pick" : "Future Pick"}
                          onClick={() => {
                            if (isCommish) {
                              handleEditClick({
                                team_id: teamId,
                                round: roundNum,
                                pick_number: pickNumber
                              })
                            }
                          }}
                        >
                           {isCommish ? 'ADD PICK' : ''}
                        </div>
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
      <div className="divide-y divide-surface-700/50 max-h-[600px] overflow-y-auto no-scrollbar">
        {picks.map(pick => {
          const team = teams.find(t => t.id === pick.team_id)
          return (
            <div 
              key={pick.id} 
              onClick={() => isCommish && handleEditClick(pick)}
              className={`p-4 flex items-center justify-between transition-colors ${isCommish ? 'cursor-pointer hover:bg-surface-800/50' : 'hover:bg-surface-800/30'}`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 text-center text-surface-500 font-mono text-xs">
                  {pick.round}.{pick.pick_number}
                </div>
                <div>
                  <div className="font-bold text-surface-100">{team?.team_name}</div>
                  <div className={`text-sm font-medium ${isCommish ? 'text-surface-300' : 'text-primary-400'}`}>
                    {(pick as any).golfer?.name || <span className="text-orange-400">⚠️ Blank Slot</span>}
                    {isCommish && <span className="ml-2 text-[10px] bg-primary-500/20 text-primary-400 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">Edit</span>}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-surface-600 uppercase font-black tracking-widest">
                Pick #{pick.pick_number}
              </div>
            </div>
          )
        })}
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
            <p className="text-surface-400 text-sm capitalize">{league.name} • {league.draft_status}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-surface-900/50 p-1 rounded-lg border border-surface-700/50">
          {league.draft_cycle === 'tournament' && tournaments.length > 0 && (
             <select 
               value={selectedTournament}
               onChange={e => setSelectedTournament(e.target.value)}
               className="bg-transparent border-none text-xs font-bold text-surface-400 focus:ring-0 cursor-pointer hover:text-surface-100 transition-colors uppercase"
             >
               <option value="latest">Latest Draft</option>
               {tournaments.map(t => (
                 <option key={t.id} value={t.id}>{t.name}</option>
               ))}
             </select>
          )}
          <div className="w-px h-6 bg-surface-700 mx-1 hidden sm:block"></div>
          <button 
            onClick={() => setView('board')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${view === 'board' ? 'bg-primary-600 text-surface-900 shadow-glow/10' : 'text-surface-400 hover:text-surface-100'}`}
          >
            Board
          </button>
          <button 
            onClick={() => setView('list')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${view === 'list' ? 'bg-primary-600 text-surface-900 shadow-glow/10' : 'text-surface-400 hover:text-surface-100'}`}
          >
            List
          </button>
        </div>
      </div>

      <div className="bg-surface-900/40 border border-surface-700/50 rounded-2xl overflow-hidden">
        {view === 'board' ? renderBoard() : renderList()}
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
              <button 
                onClick={() => { setEditingPick(null); setSearch(''); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-800 text-surface-400 hover:text-white hover:bg-surface-700 transition-colors"
              >
                ✖
              </button>
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
                        <div className="text-xs text-surface-500 mt-0.5">OWGR: {g.owg_rank || 'N/A'}</div>
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
