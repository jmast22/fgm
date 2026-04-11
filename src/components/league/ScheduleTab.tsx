import { useEffect, useState } from 'react'
import { tournamentService } from '../../services/tournamentService'
import { scoringService, formatScore, scoreColor } from '../../services/scoringService'
import { leagueService } from '../../services/leagueService'
import type { TeamTournamentScore } from '../../services/scoringService'
import type { Tournament } from '../../services/tournamentService'
import type { League } from '../../services/leagueService'
import { useAuth } from '../../context/AuthContext'

interface ScheduleTabProps {
  league: League;
}

interface TournamentResults {
  winner: { team_name: string; score: number | null } | null
  allTeams: TeamTournamentScore[]
}

export default function ScheduleTab({ league: initialLeague }: ScheduleTabProps) {
  const { user } = useAuth()
  const [league, setLeague] = useState<League>(initialLeague)
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [tournamentResults, setTournamentResults] = useState<Record<string, TournamentResults>>({})
  const [expandedTournament, setExpandedTournament] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const isCommish = user?.id === league.commissioner_id

  useEffect(() => {
    async function loadSchedule() {
      try {
        const data = await tournamentService.getTournaments()
        setTournaments(data)
        
        // Parallel fetch results for all tournaments with score data
        const resultsMap: Record<string, TournamentResults> = {}
        const promises = data.map(async (t) => {
          try {
            const teamBoard = await scoringService.getTeamLeaderboard(league.id, t.id)
            const teamsWithScores = teamBoard.filter(tb => tb.golfer_scores.length > 0)
            
            if (teamsWithScores.length > 0) {
              resultsMap[t.id] = {
                winner: { team_name: teamsWithScores[0].team_name, score: teamsWithScores[0].total },
                allTeams: teamBoard
              }
            }
          } catch (err) {
            // No scores for this tournament, skip
          }
        })
        
        await Promise.all(promises)
        setTournamentResults(resultsMap)
      } catch (err) {
        console.error('Failed to load schedule:', err)
      } finally {
        setLoading(false)
      }
    }
    loadSchedule()
  }, [league.id])

  const handleToggleTournament = async (tournamentId: string) => {
    if (!isCommish || updatingId) return
    setUpdatingId(tournamentId)
    
    try {
      const currentExcluded = league.excluded_tournaments || []
      let newExcluded: string[]
      
      if (currentExcluded.includes(tournamentId)) {
        newExcluded = currentExcluded.filter(id => id !== tournamentId)
      } else {
        newExcluded = [...currentExcluded, tournamentId]
      }
      
      const updated = await leagueService.updateLeague(league.id, { excluded_tournaments: newExcluded })
      setLeague(updated)
    } catch (err: any) {
      alert('Failed to update schedule: ' + err.message)
    } finally {
      setUpdatingId(null)
    }
  }

  if (loading) return <div className="p-12 text-center text-surface-400">Loading schedule...</div>

  const activeTournaments = tournaments.filter(t => !(league.excluded_tournaments || []).includes(t.id))

  return (
    <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl overflow-hidden shadow-lg">
      <div className="p-5 border-b border-surface-700/50 flex items-center justify-between bg-surface-800/20">
        <h2 className="font-display font-bold text-xl text-surface-100 flex items-center gap-3">
          <span className="text-primary-400">📅</span> Tournament Schedule
        </h2>
        <span className="text-[10px] text-surface-500 font-bold uppercase tracking-tighter">
          {activeTournaments.length} tournaments • Roto Style
        </span>
      </div>

      <div className="divide-y divide-surface-700/50">
        {tournaments.map((t) => {
          const results = tournamentResults[t.id]
          const hasResults = !!results
          const isExpanded = expandedTournament === t.id
          const isExcluded = (league.excluded_tournaments || []).includes(t.id)
          const isUpcoming = t.status === 'upcoming'
          
          return (
            <div key={t.id}>
              <div 
                onClick={() => hasResults ? setExpandedTournament(isExpanded ? null : t.id) : undefined}
                className={`p-5 flex flex-col md:flex-row md:items-center justify-between transition-colors group gap-4 ${
                  hasResults ? 'hover:bg-surface-800/50 cursor-pointer' : ''
                } ${isExpanded ? 'bg-surface-800/30' : ''}`}
              >
                <div className="flex items-center gap-5">
                  {isCommish && isUpcoming && (
                    <div className="flex items-center justify-center mr-1">
                      <input 
                        type="checkbox" 
                        checked={!isExcluded}
                        disabled={updatingId === t.id}
                        onChange={(e) => {
                          e.stopPropagation()
                          handleToggleTournament(t.id)
                        }}
                        className="w-5 h-5 rounded-md bg-surface-900 border-surface-700 text-primary-600 focus:ring-primary-500/50 transition-all cursor-pointer accent-primary-600"
                        onClick={(e) => e.stopPropagation()} // Prevent expansion
                      />
                    </div>
                  )}

                  <div className={`w-12 h-12 rounded-xl border flex flex-col items-center justify-center font-display leading-none transition-all
                    ${isExcluded ? 'bg-surface-900/40 border-surface-800 text-surface-600' : 
                      t.status === 'active' 
                        ? 'bg-primary-600/20 border-primary-500/30 text-primary-400' 
                        : t.status === 'completed'
                        ? 'bg-surface-900 border-surface-700 text-surface-500'
                        : 'bg-surface-900 border-surface-700 text-surface-300'}
                  `}>
                    <span className="text-[10px] uppercase font-black tracking-widest mb-1">
                      {new Date(t.start_date).toLocaleString('default', { month: 'short' })}
                    </span>
                    <span className="text-lg font-bold">
                      {new Date(t.start_date).getDate()}
                    </span>
                  </div>
                  <div>
                    <div className={`font-bold text-lg transition-colors ${
                      isExcluded ? 'text-surface-600' : 'text-surface-100 group-hover:text-primary-400'
                    }`}>
                      {t.name}
                    </div>
                    <div className={`text-sm flex items-center gap-2 mt-0.5 ${
                      isExcluded ? 'text-surface-700' : 'text-surface-500'
                    }`}>
                      <span>{t.course_name}</span>
                      <span className="w-1 h-1 rounded-full bg-surface-700" />
                      <span>{t.city}, {t.state}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8 md:text-right">
                  <div className="hidden sm:block">
                    <div className="text-[10px] text-surface-500 uppercase tracking-widest font-bold mb-1">Status</div>
                    <div className={`text-xs font-black uppercase tracking-tighter px-2 py-1 rounded border
                      ${isExcluded ? 'bg-surface-900/50 border-surface-800 text-surface-600' :
                        t.status === 'active' ? 'bg-primary-500/10 border-primary-500/20 text-primary-400' : 
                        t.status === 'completed' ? 'bg-surface-900 border-surface-700 text-surface-500' :
                        'bg-surface-700/30 border-surface-700 text-surface-400'}
                    `}>
                      {isExcluded ? 'Removed' : t.status === 'active' ? 'In Progress' : t.status === 'completed' ? 'Finished' : 'Upcoming'}
                    </div>
                  </div>
                  
                  <div className="min-w-[140px]">
                    <div className="text-[10px] text-surface-500 uppercase tracking-widest font-bold mb-1">Weekly Winner</div>
                    <div className="font-display font-bold text-surface-50">
                      {results?.winner ? (
                        <span className="flex items-center gap-2">
                          <span className="text-primary-400">🏆 {results.winner.team_name}</span>
                          <span className={`text-xs ${scoreColor(results.winner.score)}`}>({formatScore(results.winner.score)})</span>
                        </span>
                      ) : (
                        <span className="text-surface-600 italic">
                          {t.status === 'upcoming' ? 'Upcoming' : 'In Progress'}
                        </span>
                      )}
                    </div>
                  </div>

                  {hasResults && (
                    <div className="w-6 flex items-center justify-center text-surface-600 group-hover:text-surface-400 transition-colors">
                      <span className={`text-xs transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Expandable Results */}
              {isExpanded && results && (
                <div className="px-6 pb-5 bg-surface-900/30 border-t border-surface-700/30">
                  <div className="pt-4">
                    <div className="text-[9px] font-black text-surface-500 uppercase tracking-widest mb-3">All Team Results</div>
                    <div className="grid grid-cols-[auto_1fr_repeat(5,_minmax(40px,56px))] items-center px-3 py-2 border-b border-surface-700/30">
                      <div className="w-7 text-[9px] font-black text-surface-600 uppercase tracking-widest">#</div>
                      <div className="text-[9px] font-black text-surface-600 uppercase tracking-widest">Team</div>
                      <div className="text-center text-[9px] font-black text-surface-600 uppercase tracking-widest">R1</div>
                      <div className="text-center text-[9px] font-black text-surface-600 uppercase tracking-widest">R2</div>
                      <div className="text-center text-[9px] font-black text-surface-600 uppercase tracking-widest">R3</div>
                      <div className="text-center text-[9px] font-black text-surface-600 uppercase tracking-widest">R4</div>
                      <div className="text-center text-[9px] font-black text-surface-600 uppercase tracking-widest">TOT</div>
                    </div>
                    <div className="divide-y divide-surface-700/20">
                      {results.allTeams.map((team, idx) => (
                        <div 
                          key={team.team_id} 
                          className={`grid grid-cols-[auto_1fr_repeat(5,_minmax(40px,56px))] items-center px-3 py-2.5 ${
                            idx === 0 ? 'bg-primary-500/5' : ''
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-lg border flex items-center justify-center text-[10px] font-black ${
                            idx === 0 
                              ? 'bg-primary-600 border-primary-500 text-surface-900' 
                              : 'bg-surface-900 border-surface-700 text-surface-500'
                          }`}>
                            {idx + 1}
                          </div>
                          <div className="pl-2">
                            <div className={`font-bold text-sm ${idx === 0 ? 'text-primary-400' : 'text-surface-100'}`}>
                              {team.team_name}
                            </div>
                            <div className="text-[9px] text-surface-500">
                              {team.golfer_scores.length > 0 ? `${team.golfer_scores.length} starters` : 'No lineup'}
                            </div>
                          </div>
                          <div className={`text-center text-xs font-bold ${scoreColor(team.r1)}`}>{formatScore(team.r1)}</div>
                          <div className={`text-center text-xs font-bold ${scoreColor(team.r2)}`}>{formatScore(team.r2)}</div>
                          <div className={`text-center text-xs font-bold ${scoreColor(team.r3)}`}>{formatScore(team.r3)}</div>
                          <div className={`text-center text-xs font-bold ${scoreColor(team.r4)}`}>{formatScore(team.r4)}</div>
                          <div className={`text-center text-sm font-black font-display ${scoreColor(team.total)}`}>
                            {formatScore(team.total)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
