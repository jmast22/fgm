import { useEffect, useState } from 'react'
import { scoringService, formatScore, scoreColor } from '../../services/scoringService'
import type { TeamTournamentScore, GolferTournamentScore } from '../../services/scoringService'
import { tournamentService } from '../../services/tournamentService'
import { rosterService } from '../../services/rosterService'
import type { Tournament } from '../../services/tournamentService'
import type { League } from '../../services/leagueService'
import { supabase } from '../../lib/supabase'
import LiveIndicator from '../ui/LiveIndicator'

interface LeaderboardTabProps {
  league: League
}

export default function LeaderboardTab({ league }: LeaderboardTabProps) {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('')
  const [teamScores, setTeamScores] = useState<TeamTournamentScore[]>([])
  const [golferScores, setGolferScores] = useState<GolferTournamentScore[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGolfer, setExpandedGolfer] = useState<string | null>(null)
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string | null>(null)
  const [golferTeamMap, setGolferTeamMap] = useState<Record<string, string>>({}) // golfer_id -> team_name

  // Load tournaments
  useEffect(() => {
    async function loadTournaments() {
      try {
        const data = await tournamentService.getTournaments()
        const excludedIds = league.excluded_tournaments || []
        const filtered = data.filter(t => !excludedIds.includes(t.id))
        setTournaments(filtered)

        // Default to active or first upcoming tournament
        const activeOrUpcoming = filtered.find(t => t.status === 'active') || filtered.find(t => t.status === 'upcoming')
        if (activeOrUpcoming) {
          setSelectedTournamentId(activeOrUpcoming.id)
        } else if (filtered.length > 0) {
          // Fallback to the most recent completed tournament
          const completed = [...filtered].filter(t => t.status === 'completed').reverse()
          setSelectedTournamentId(completed[0]?.id || filtered[0].id)
        }
      } catch (err) {
        console.error('Failed to load tournaments:', err)
      }
    }
    loadTournaments()
  }, [])

  // Load golfer -> team mapping for this tournament
  useEffect(() => {
    if (!selectedTournamentId) return

    async function loadMapping() {
      try {
        const mapping = await rosterService.getLeagueLineupMapping(league.id, selectedTournamentId)
        setGolferTeamMap(mapping)
      } catch (err) {
        console.error('Failed to load golfer team mapping:', err)
      }
    }
    loadMapping()
  }, [selectedTournamentId, league.id])


  useEffect(() => {
    if (!selectedTournamentId) return

    async function loadScores() {
      setLoading(true)
      setSelectedTeamFilter(null) // Reset filter on tournament change
      try {
        const [teamData, rawStats] = await Promise.all([
          scoringService.getTeamLeaderboard(league.id, selectedTournamentId),
          scoringService.getTournamentRoundStats(selectedTournamentId)
        ])

        setTeamScores(teamData)

        if (rawStats && rawStats.length > 0) {
          const golferBoard = scoringService.buildGolferLeaderboard(rawStats)
          setGolferScores(golferBoard)
        } else {
          setGolferScores([])
        }
      } catch (err) {
        console.error('Failed to load leaderboard:', err)
      } finally {
        setLoading(false)
      }
    }
    loadScores()
  }, [selectedTournamentId, league.id])

  // Realtime subscription for live score updates
  useEffect(() => {
    if (!selectedTournamentId) return

    const channel = supabase
      .channel(`leaderboard-${selectedTournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'golfer_round_stats',
          filter: `tournament_id=eq.${selectedTournamentId}`
        },
        async () => {
          // Re-fetch scores and mapping when data changes
          try {
            const [teamData, rawStats, mapping] = await Promise.all([
              scoringService.getTeamLeaderboard(league.id, selectedTournamentId),
              scoringService.getTournamentRoundStats(selectedTournamentId),
              rosterService.getLeagueLineupMapping(league.id, selectedTournamentId)
            ])

            setTeamScores(teamData)
            setGolferTeamMap(mapping)
            
            if (rawStats && rawStats.length > 0) {
              const golferBoard = scoringService.buildGolferLeaderboard(rawStats)
              setGolferScores(golferBoard)
            }
          } catch (err) {
            console.error('Realtime refresh failed:', err)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedTournamentId, league.id])

  const selectedTournament = tournaments.find(t => t.id === selectedTournamentId)

  // Build the set of golfer IDs for the selected team filter
  const filteredTeam = selectedTeamFilter ? teamScores.find(t => t.team_id === selectedTeamFilter) : null
  const filteredGolferIds = filteredTeam ? new Set(filteredTeam.golfer_scores.map(g => g.golfer_id)) : null

  const displayGolfers = filteredGolferIds
    ? golferScores.filter(g => filteredGolferIds.has(g.golfer_id))
    : golferScores

  return (
    <div className="space-y-4">
      {/* Tournament Filter Bar */}
      <div className="bg-surface-900/80 border border-surface-700/50 rounded-2xl p-2 md:p-3 sticky top-0 z-20 backdrop-blur-xl shadow-2xl flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="bg-surface-800/50 border border-surface-700/30 rounded-xl px-3 py-1.5 flex flex-col min-w-[200px] transition-all hover:border-primary-500/30 flex-1 md:flex-none">
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

        {selectedTournament && (
          <div className="flex items-center gap-3 text-xs">

            <span className={`px-2 py-1 rounded-lg font-black uppercase tracking-widest text-[9px] border ${
              selectedTournament.status === 'active' 
                ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                : selectedTournament.status === 'completed'
                  ? 'bg-surface-700/50 text-surface-400 border-surface-600/50'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>
              {selectedTournament.status === 'active' ? '🔴 Live' : selectedTournament.status === 'completed' ? '✅ Final' : '🕐 Upcoming'}
            </span>
            <span className="text-surface-500 hidden md:inline">
              {selectedTournament.course_name} • {selectedTournament.city}, {selectedTournament.state}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-12 text-center text-surface-400">
          <div className="w-6 h-6 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-3" />
          Loading leaderboard...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left Panel: Team Standings */}
          <div className="lg:col-span-2">
            <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl overflow-hidden shadow-lg">
              <div className="p-4 border-b border-surface-700/50 bg-surface-900/20 flex items-center justify-between">
                <h3 className="text-xs font-black text-surface-300 uppercase tracking-widest flex items-center gap-2">
                  <span className="text-primary-400">🏆</span> Team Standings
                </h3>
                <div className="flex items-center gap-3">
                  {selectedTournament && (
                    <LiveIndicator tournamentId={selectedTournamentId} status={selectedTournament.status} />
                  )}
                  <span className="text-[10px] text-surface-500 font-bold uppercase tracking-tighter">Round Scoring</span>
                </div>
              </div>

              {/* Header Row */}
              <div className="grid grid-cols-[auto_1fr_48px] md:grid-cols-[auto_1fr_repeat(5,_minmax(36px,48px))] items-center px-4 py-2 border-b border-surface-700/50 bg-surface-900/30">
                <div className="w-7 text-[9px] font-black text-surface-600 uppercase tracking-widest">#</div>
                <div className="text-[9px] font-black text-surface-600 uppercase tracking-widest">Team</div>
                <div className="hidden md:block text-center text-[9px] font-black text-surface-600 uppercase tracking-widest">R1</div>
                <div className="hidden md:block text-center text-[9px] font-black text-surface-600 uppercase tracking-widest">R2</div>
                <div className="hidden md:block text-center text-[9px] font-black text-surface-600 uppercase tracking-widest">R3</div>
                <div className="hidden md:block text-center text-[9px] font-black text-surface-600 uppercase tracking-widest">R4</div>
                <div className="text-center text-[9px] font-black text-surface-600 uppercase tracking-widest">TOT</div>
              </div>

              <div className="divide-y divide-surface-700/50 max-h-[600px] overflow-y-auto no-scrollbar">
                {teamScores.length > 0 ? teamScores.map((team, idx) => {
                  const isSelected = selectedTeamFilter === team.team_id
                  return (
                    <div
                      key={team.team_id}
                      onClick={() => setSelectedTeamFilter(isSelected ? null : team.team_id)}
                      className={`transition-colors group cursor-pointer ${
                        isSelected 
                          ? 'bg-primary-500/10 border-l-2 border-l-primary-500' 
                          : 'hover:bg-surface-800/50'
                      }`}
                    >
                      <div className="grid grid-cols-[auto_1fr_48px] md:grid-cols-[auto_1fr_repeat(5,_minmax(36px,48px))] items-center px-4 pt-3 pb-1 md:py-3 gap-2">
                        <div className={`w-7 h-7 rounded-lg border flex items-center justify-center text-[10px] font-black transition-colors ${
                          isSelected 
                            ? 'bg-primary-600 border-primary-500 text-surface-900' 
                            : 'bg-surface-900 border-surface-700 text-surface-500 group-hover:border-primary-500/30 group-hover:text-primary-400'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="pl-2">
                          <div className={`font-bold text-sm transition-colors truncate ${
                            isSelected ? 'text-primary-400' : 'text-surface-100 group-hover:text-primary-400'
                          }`}>{team.team_name}</div>
                          <div className="text-[9px] text-surface-500">
                            {team.golfer_scores.length > 0 
                              ? `${team.golfer_scores.length} starters` 
                              : 'No lineup set'}
                          </div>
                        </div>
                        <div className={`hidden md:block text-center text-xs font-bold ${scoreColor(team.r1)}`}>{formatScore(team.r1)}</div>
                        <div className={`hidden md:block text-center text-xs font-bold ${scoreColor(team.r2)}`}>{formatScore(team.r2)}</div>
                        <div className={`hidden md:block text-center text-xs font-bold ${scoreColor(team.r3)}`}>{formatScore(team.r3)}</div>
                        <div className={`hidden md:block text-center text-xs font-bold ${scoreColor(team.r4)}`}>{formatScore(team.r4)}</div>
                        <div className={`text-center text-sm font-black font-display ${scoreColor(team.total)}`}>
                          {formatScore(team.total)}
                        </div>
                      </div>

                      {/* Mobile Round Breakdown for Teams */}
                      <div className="md:hidden flex justify-end px-4 pb-3 -mt-1 gap-3">
                        <div className="flex flex-col items-center">
                          <span className="text-[7px] text-surface-600 font-bold uppercase">R1</span>
                          <span className={`text-[10px] font-bold ${scoreColor(team.r1)}`}>{formatScore(team.r1)}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[7px] text-surface-600 font-bold uppercase">R2</span>
                          <span className={`text-[10px] font-bold ${scoreColor(team.r2)}`}>{formatScore(team.r2)}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[7px] text-surface-600 font-bold uppercase">R3</span>
                          <span className={`text-[10px] font-bold ${scoreColor(team.r3)}`}>{formatScore(team.r3)}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[7px] text-surface-600 font-bold uppercase">R4</span>
                          <span className={`text-[10px] font-bold ${scoreColor(team.r4)}`}>{formatScore(team.r4)}</span>
                        </div>
                      </div>
                    </div>
                  )
                }) : (
                  <div className="p-8 text-center text-surface-500 italic text-sm">
                    No scores available for this tournament.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Individual Golfer Scores */}
          <div className="lg:col-span-3">
            <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl overflow-hidden shadow-lg">
              <div className="p-4 border-b border-surface-700/50 bg-surface-900/20 flex items-center justify-between">
                <h3 className="text-xs font-black text-surface-300 uppercase tracking-widest flex items-center gap-2">
                  <span className="text-primary-400">⛳</span> 
                  {filteredTeam 
                    ? <>{filteredTeam.team_name} <span className="text-surface-500 font-normal normal-case">Golfers</span></>
                    : 'Individual Golfers'
                  }
                </h3>
                <div className="flex items-center gap-3">
                  {selectedTeamFilter && (
                    <button
                      onClick={() => setSelectedTeamFilter(null)}
                      className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-primary-500/10 text-primary-400 border border-primary-500/20 hover:bg-primary-500/20 transition-all"
                    >
                      ✕ Clear Filter
                    </button>
                  )}
                  {selectedTournament && (
                    <LiveIndicator tournamentId={selectedTournamentId} status={selectedTournament.status} />
                  )}
                  <span className="text-[10px] text-surface-500 font-bold uppercase tracking-tighter">{displayGolfers.length} golfers</span>
                </div>
              </div>

              {/* Header Row */}
              <div className="grid grid-cols-[auto_1fr_48px_24px] md:grid-cols-[auto_1fr_repeat(5,_minmax(40px,56px))_auto] items-center px-4 py-2 border-b border-surface-700/50 bg-surface-900/30">
                <div className="w-7 text-[9px] font-black text-surface-600 uppercase tracking-widest">#</div>
                <div className="text-[9px] font-black text-surface-600 uppercase tracking-widest">Golfer</div>
                <div className="hidden md:block text-center text-[9px] font-black text-surface-600 uppercase tracking-widest">R1</div>
                <div className="hidden md:block text-center text-[9px] font-black text-surface-600 uppercase tracking-widest">R2</div>
                <div className="hidden md:block text-center text-[9px] font-black text-surface-600 uppercase tracking-widest">R3</div>
                <div className="hidden md:block text-center text-[9px] font-black text-surface-600 uppercase tracking-widest">R4</div>
                <div className="text-center text-[9px] font-black text-surface-600 uppercase tracking-widest">TOT</div>
                <div className="w-6"></div>
              </div>

              <div className="divide-y divide-surface-700/50 max-h-[600px] overflow-y-auto no-scrollbar">
                {displayGolfers.length > 0 ? displayGolfers.map((golfer, idx) => {
                  const teamName = golferTeamMap[golfer.golfer_id]
                  return (
                    <div key={golfer.golfer_id} className="group">
                      <div
                        onClick={() => setExpandedGolfer(expandedGolfer === golfer.golfer_id ? null : golfer.golfer_id)}
                        className="hover:bg-surface-800/50 transition-colors cursor-pointer"
                      >
                        {/* Main Info Row */}
                        <div className="grid grid-cols-[auto_1fr_48px_24px] md:grid-cols-[auto_1fr_repeat(5,_minmax(40px,56px))_auto] items-center px-4 pt-3 pb-1 md:py-3">
                          <div className="w-7 h-7 rounded-lg bg-surface-900 border border-surface-700 flex items-center justify-center text-[10px] font-black text-surface-500 group-hover:border-primary-500/30 group-hover:text-primary-400 transition-colors">
                            {idx + 1}
                          </div>
                          <div className="pl-2 min-w-0">
                            <div className="font-bold text-sm text-surface-100 group-hover:text-primary-400 transition-colors truncate flex items-center gap-2">
                              {golfer.golfer_name}
                              {!golfer.made_cut && (
                                <span className="text-[8px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-black uppercase tracking-widest shrink-0">MC</span>
                              )}
                            </div>
                            {/* Team Name - Desktop only here */}
                            {teamName && (
                              <div className="hidden md:block text-[9px] text-surface-500 truncate mt-0.5">
                                <span className="text-amber-400/70">{teamName}</span>
                              </div>
                            )}
                          </div>

                          {/* Round Scores - Desktop only */}
                          <div className={`hidden md:block text-center text-xs font-bold ${scoreColor(golfer.r1)}`}>{formatScore(golfer.r1)}</div>
                          <div className={`hidden md:block text-center text-xs font-bold ${scoreColor(golfer.r2)}`}>{formatScore(golfer.r2)}</div>
                          <div className={`hidden md:block text-center text-xs font-bold ${golfer.is_penalty ? 'text-red-400/60 italic' : scoreColor(golfer.r3)}`}>
                            {formatScore(golfer.r3)}{golfer.is_penalty ? '*' : ''}
                          </div>
                          <div className={`hidden md:block text-center text-xs font-bold ${golfer.is_penalty ? 'text-red-400/60 italic' : scoreColor(golfer.r4)}`}>
                            {formatScore(golfer.r4)}{golfer.is_penalty ? '*' : ''}
                          </div>

                          {/* Total Score - Always visible */}
                          <div className={`text-center text-sm font-black font-display ${scoreColor(golfer.total)}`}>
                            {formatScore(golfer.total)}
                          </div>

                          {/* Expand Arrow */}
                          <div className="w-6 flex items-center justify-center text-surface-600 group-hover:text-surface-400 transition-colors">
                            <span className={`text-xs transition-transform duration-200 ${expandedGolfer === golfer.golfer_id ? 'rotate-180' : ''}`}>▼</span>
                          </div>
                        </div>

                        {/* Mobile Sub-Row: Rounds & Team */}
                        <div className="md:hidden flex items-center justify-between px-4 pb-3 -mt-1 ml-9 border-b border-surface-700/30 border-dashed mr-4">
                          <div className="min-w-0 flex-1">
                            {teamName && (
                              <div className="text-[10px] text-amber-400/80 font-medium truncate uppercase tracking-tight">
                                {teamName}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 pr-2">
                            <div className="flex flex-col items-center">
                              <span className="text-[7px] text-surface-600 font-bold uppercase tracking-tighter">R1</span>
                              <span className={`text-[10px] font-bold ${scoreColor(golfer.r1)}`}>{formatScore(golfer.r1)}</span>
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-[7px] text-surface-600 font-bold uppercase tracking-tighter">R2</span>
                              <span className={`text-[10px] font-bold ${scoreColor(golfer.r2)}`}>{formatScore(golfer.r2)}</span>
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-[7px] text-surface-600 font-bold uppercase tracking-tighter">R3</span>
                              <span className={`text-[10px] font-bold ${golfer.is_penalty ? 'text-red-400/60' : scoreColor(golfer.r3)}`}>
                                {formatScore(golfer.r3)}{golfer.is_penalty ? '*' : ''}
                              </span>
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-[7px] text-surface-600 font-bold uppercase tracking-tighter">R4</span>
                              <span className={`text-[10px] font-bold ${golfer.is_penalty ? 'text-red-400/60' : scoreColor(golfer.r4)}`}>
                                {formatScore(golfer.r4)}{golfer.is_penalty ? '*' : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expandable hole-by-hole section (placeholder for Phase 14) */}
                      {expandedGolfer === golfer.golfer_id && (
                        <div className="px-6 py-4 bg-surface-900/40 border-t border-surface-700/30">
                          <div className="flex items-center gap-3 p-4 bg-surface-800/50 border border-surface-700/30 rounded-xl">
                            <span className="text-surface-500">🔒</span>
                            <div>
                              <div className="text-sm font-bold text-surface-300">Hole-by-Hole Scores</div>
                              <div className="text-xs text-surface-500 mt-0.5">
                                Detailed hole-by-hole scoring breakdown will be available with the Hole Scoring engine (Phase 14).
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }) : (
                  <div className="p-8 text-center text-surface-500 italic text-sm">
                    {selectedTeamFilter 
                      ? 'No starters set for this team. Set lineups in the Roster tab.'
                      : 'No golfer scores available for this tournament.'
                    }
                  </div>
                )}
              </div>

              {/* Penalty Legend */}
              {displayGolfers.some(g => g.is_penalty) && (
                <div className="px-4 py-2 border-t border-surface-700/50 bg-surface-900/20">
                  <span className="text-[9px] text-red-400/60 italic font-bold">
                    * Missed Cut penalty applied — average of 10 worst cut-makers (min +4)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
