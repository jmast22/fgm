import { useEffect, useState } from 'react'
import { draftService } from '../../services/draftService'
import type { Draft, DraftPick } from '../../services/draftService'
import type { League, Team } from '../../services/leagueService'

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

  useEffect(() => {
    async function loadResults() {
      try {
        const d = await draftService.getDraftByLeague(league.id)
        if (d) {
          setDraft(d)
          const p = await draftService.getDraftPicks(d.id)
          setPicks(p)
        }
      } catch (err) {
        console.error('Failed to load draft results:', err)
      } finally {
        setLoading(false)
      }
    }
    loadResults()
  }, [league.id])

  if (loading) return <div className="p-12 text-center text-surface-400">Loading results...</div>
  if (!draft) return <div className="p-12 text-center text-surface-400">No draft data found.</div>

  const renderBoard = () => {
    const rounds = league.roster_size;
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
                        <div>
                          <div className="text-[11px] font-bold text-primary-400 leading-tight uppercase line-clamp-2">
                             {(pick as any).golfer?.name}
                          </div>
                        </div>
                      ) : (
                        <div className="h-4 bg-surface-700/20 rounded animate-pulse w-3/4"></div>
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
            <div key={pick.id} className="p-4 flex items-center justify-between hover:bg-surface-800/30 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 text-center text-surface-500 font-mono text-xs">
                  {pick.round}.{pick.pick_number}
                </div>
                <div>
                  <div className="font-bold text-surface-100">{team?.team_name}</div>
                  <div className="text-primary-400 text-sm font-medium">{(pick as any).golfer?.name}</div>
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
    </div>
  )
}
