import { useEffect, useState, useRef } from 'react'
import { rosterService, type RosterGolfer } from '../../services/rosterService'
import { scoringService, formatScore, scoreColor } from '../../services/scoringService'
import { supabase } from '../../lib/supabase'
import type { League, Team } from '../../services/leagueService'
import { useAuth } from '../../context/AuthContext'
import { tournamentService } from '../../services/tournamentService'
import LiveIndicator from '../ui/LiveIndicator'
interface GolfersTabProps {
  league: League
  teams: Team[]
}

interface GolferWithStats {
  id: string
  name: string
  age: number
  owg_rank: number
  total_score: number
  tournaments_played: number
  is_rostered: boolean
  rostered_team?: string
  odds?: number
}

export default function GolfersTab({ league, teams }: GolfersTabProps) {
  const { user } = useAuth()
  const [allGolfers, setAllGolfers] = useState<GolferWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showRosteredOnly, setShowRosteredOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'rank' | 'score' | 'name' | 'odds'>('score')
  const [sortDesc, setSortDesc] = useState(false)
  const [myRoster, setMyRoster] = useState<RosterGolfer[]>([])
  const [tournamentFields, setTournamentFields] = useState<Record<string, Set<string>>>({})
  const [availableTournaments, setAvailableTournaments] = useState<{id: string, name: string, status: string}[]>([])
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('all')
  const [showDropModal, setShowDropModal] = useState<string | null>(null)
  const [isDropping, setIsDropping] = useState(false)

  const [isLocked, setIsLocked] = useState(false)
  const [lockedReason, setLockedReason] = useState<string | null>(null)
  const [isAwaitingDraft, setIsAwaitingDraft] = useState(false)
  const [activeUpcomingId, setActiveUpcomingId] = useState<string | null>(null)
  const isInitialLoad = useRef(true)

  const myTeam = teams.find(t => t.user_id === user?.id)
  const isCommish = league.commissioner_id === user?.id

  const loadData = async () => {
    try {
      // 1. Get all golfers
      const { data: golfers } = await supabase
        .from('golfers')
        .select('*')
        .order('name', { ascending: true })

      if (!golfers) return

      const tData = await tournamentService.getTournaments()

      const activeOrUpcoming = tData.find(t => t.status === 'active' || t.status === 'upcoming')
      setActiveUpcomingId(activeOrUpcoming?.id || null)

      let effectiveTournamentId = selectedTournamentId
      if (league.draft_cycle === 'tournament' && selectedTournamentId === 'all' && activeOrUpcoming) {
        effectiveTournamentId = activeOrUpcoming.id
      }
      
      let locked = false
      let reason = null

      if (league.draft_cycle === 'tournament') {
        const isCompleted = tData.find(t => t.id === effectiveTournamentId)?.status === 'completed'
        if (isCompleted) {
          locked = true
          reason = "Transactions are locked for concluded tournaments."
        }
      } else {
        if (activeOrUpcoming?.status === 'active') {
          locked = true
          reason = "Transactions are locked while a tournament is active."
        }
      }

      setIsLocked(locked)
      setLockedReason(reason)

      // 1.5 Get all tournament golfers to build field filters
      const { data: allFields } = await supabase
        .from('tournament_golfers')
        .select('tournament_id, golfer_id, odds')
      
      const fieldMap: Record<string, Set<string>> = {} 
      const golferOdds: Record<string, number> = {}

      allFields?.forEach(f => {
        if (!fieldMap[f.tournament_id]) fieldMap[f.tournament_id] = new Set()
        fieldMap[f.tournament_id].add(f.golfer_id)
        
        // Show odds for the selected tournament or the active/upcoming one
        if (f.tournament_id === effectiveTournamentId && f.odds) {
          golferOdds[f.golfer_id] = f.odds
        }
      })
      setTournamentFields(fieldMap)
      
      const scrapedIds = Object.keys(fieldMap)
      const available = tData.filter(t => scrapedIds.includes(t.id)).map(t => ({ id: t.id, name: t.name, status: t.status }))
      setAvailableTournaments(available)

      // Only auto-select on initial load, not on every loadData re-run
      if (isInitialLoad.current) {
        if (selectedTournamentId === 'all' && activeOrUpcoming && scrapedIds.includes(activeOrUpcoming.id)) {
          setSelectedTournamentId(activeOrUpcoming.id)
        } else if (selectedTournamentId === 'all' && available.length > 0) {
          setSelectedTournamentId(available[0].id)
        }
        isInitialLoad.current = false
      }

      // 2. Get OWGR rankings from latest tournament
      const { data: latestTourney } = await supabase
        .from('tournament_golfers')
        .select('tournament_id, tournaments!inner(start_date)')
        .order('tournaments(start_date)', { ascending: false })
        .limit(1)
        .maybeSingle()

      const golferRanks: Record<string, number> = {}
      if (latestTourney?.tournament_id) {
        const { data: rankingData } = await supabase
          .from('tournament_golfers')
          .select('golfer_id, owg_rank')
          .eq('tournament_id', latestTourney.tournament_id)

        rankingData?.forEach(r => {
          golferRanks[r.golfer_id] = r.owg_rank
        })
      }

      // 3. Get team rosters — tournament-scoped for per-tournament leagues
      const teamIds = teams.map(t => t.id)
      let rosterQuery = supabase
        .from('team_rosters')
        .select('team_id, golfer_id')
        .in('team_id', teamIds)

      // For per-tournament leagues, only show rosters for the effective tournament
      if (league.draft_cycle === 'tournament' && effectiveTournamentId !== 'all') {
        rosterQuery = rosterQuery.eq('tournament_id', effectiveTournamentId)
      }

      const { data: rosters } = await rosterQuery

      const rosterMap: Record<string, string> = {} // golfer_id -> team_id
      rosters?.forEach(r => {
        rosterMap[r.golfer_id] = r.team_id
      })

      // 4. Get season stats
      const { data: stats } = await supabase
        .from('golfer_round_stats')
        .select('golfer_id, tournament_id, round, score, made_cut')
        .order('round', { ascending: true })

      // Aggregate stats per golfer across all tournaments  
      const golferStats: Record<string, { totalScore: number; tournaments: Set<string> }> = {}

      if (stats && stats.length > 0) {
        // Group by tournament for proper penalty calculation
        const byTournament: Record<string, typeof stats> = {}
        stats.forEach(s => {
          if (!byTournament[s.tournament_id]) byTournament[s.tournament_id] = []
          byTournament[s.tournament_id].push(s)
        })

        Object.values(byTournament).forEach(tourneyScores => {
          // Build per-golfer scores for this tournament
          const byGolfer: Record<string, { rounds: Record<number, number | null>; made_cut: boolean }> = {}

          tourneyScores.forEach(s => {
            if (!byGolfer[s.golfer_id]) byGolfer[s.golfer_id] = { rounds: {}, made_cut: false }
            byGolfer[s.golfer_id].rounds[s.round] = s.score
            if (s.made_cut) byGolfer[s.golfer_id].made_cut = true
          })

          // Calculate penalty for this tournament
          const penalty = scoringService.calculateMissedCutPenalty(
            tourneyScores.map(s => ({
              golfer_id: s.golfer_id,
              round: s.round,
              score: s.score,
              made_cut: s.made_cut ?? true
            }))
          )

          Object.entries(byGolfer).forEach(([gid, data]) => {
            if (!golferStats[gid]) golferStats[gid] = { totalScore: 0, tournaments: new Set() }

            const r1 = data.rounds[1] ?? 0
            const r2 = data.rounds[2] ?? 0
            let r3 = data.rounds[3] ?? 0
            let r4 = data.rounds[4] ?? 0

            if (!data.made_cut) {
              r3 = penalty.r3Penalty
              r4 = penalty.r4Penalty
            }

            golferStats[gid].totalScore += r1 + r2 + r3 + r4
            golferStats[gid].tournaments.add(tourneyScores[0].tournament_id)
          })
        })
      }

      // 5. Build final golfer list
      const result: GolferWithStats[] = golfers.map(g => {
        const stats = golferStats[g.id]
        const teamId = rosterMap[g.id]
        const team = teamId ? teams.find(t => t.id === teamId) : undefined

        return {
          id: g.id,
          name: g.name,
          age: g.age,
          owg_rank: golferRanks[g.id] ?? 9999,
          total_score: stats?.totalScore ?? 0,
          tournaments_played: stats?.tournaments.size ?? 0,
          is_rostered: !!teamId,
          rostered_team: team?.team_name,
          odds: golferOdds[g.id]
        }
      })

      setAllGolfers(result)

      // 6. Get my roster for add/drop — tournament-scoped for per-tournament leagues
      if (myTeam) {
        const tournamentForRoster = league.draft_cycle === 'tournament' && effectiveTournamentId !== 'all' 
          ? effectiveTournamentId : undefined
        const roster = await rosterService.getTeamRoster(myTeam.id, tournamentForRoster)
        setMyRoster(roster)
      }

      // 7. Check Draft Status
      if (league.draft_cycle === 'tournament' && effectiveTournamentId !== 'all') {
        const { data: draft } = await supabase
          .from('drafts')
          .select('status')
          .eq('league_id', league.id)
          .eq('tournament_id', effectiveTournamentId)
          .maybeSingle()
        setIsAwaitingDraft(!draft || draft.status !== 'completed')
      } else {
        setIsAwaitingDraft(false)
      }
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    // Subscribe to tournament field changes for automatic refresh on scrape
    const fieldSubscription = supabase
      .channel('tournament_golfers_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_golfers' }, () => {
        loadData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(fieldSubscription)
    }
  }, [league.id, myTeam?.id, selectedTournamentId])

  // Update sort default when tournament selection changes
  useEffect(() => {
    if (selectedTournamentId === 'all') {
      setSortBy('score')
      setSortDesc(false)
    } else {
      setSortBy('odds')
      setSortDesc(false)
    }
  }, [selectedTournamentId])

  // (Removed redundant draft check effect, it's now handled in loadData)

  const handleAdd = async (golferId: string) => {
    if (!myTeam) return
    if (isLocked && !isCommish) {
      alert("Transactions are locked while a tournament is active.")
      return
    }

    if (myRoster.length >= league.roster_size) {
      setShowDropModal(golferId)
      return
    }

    try {
      const tournamentForAdd = league.draft_cycle === 'tournament' 
        ? (selectedTournamentId !== 'all' ? selectedTournamentId : activeUpcomingId) || undefined 
        : undefined
      await rosterService.addGolfer(myTeam.id, golferId, 'waiver', tournamentForAdd)
      alert('Golfer added to your roster!')
      loadData()
    } catch (err: any) {
      alert('Error adding golfer: ' + err.message)
    }
  }

  const handleDropAndAdd = async (dropGolferId: string) => {
    if (!myTeam || !showDropModal) return
    if (isLocked && !isCommish) {
      alert("Transactions are locked while a tournament is active.")
      return
    }
    setIsDropping(true)
    try {
      await rosterService.dropGolfer(myTeam.id, dropGolferId)
      const tournamentForAdd = league.draft_cycle === 'tournament' 
        ? (selectedTournamentId !== 'all' ? selectedTournamentId : activeUpcomingId) || undefined 
        : undefined
      await rosterService.addGolfer(myTeam.id, showDropModal, 'waiver', tournamentForAdd)
      alert('Transaction complete!')
      setShowDropModal(null)
      loadData()
    } catch (err: any) {
      alert('Error completing transaction: ' + err.message)
    } finally {
      setIsDropping(false)
    }
  }

  // Filter and sort
  let displayGolfers = allGolfers.filter(g => 
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (showRosteredOnly) {
    displayGolfers = displayGolfers.filter(g => g.is_rostered)
  }

  if (selectedTournamentId !== 'all') {
    displayGolfers = displayGolfers.filter(g => tournamentFields[selectedTournamentId]?.has(g.id))
  }

  displayGolfers.sort((a, b) => {
    let result = 0;
    if (sortBy === 'rank') result = (a.owg_rank || 9999) - (b.owg_rank || 9999)
    else if (sortBy === 'score') result = a.total_score - b.total_score // lower is better
    else if (sortBy === 'odds') result = (a.odds || 99999) - (b.odds || 99999)
    else result = a.name.localeCompare(b.name)

    return sortDesc ? -result : result
  })

  // Handle Sort
  const handleSort = (key: 'rank' | 'score' | 'name' | 'odds') => {
    if (sortBy === key) {
      setSortDesc(!sortDesc)
    } else {
      setSortBy(key)
      setSortDesc(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-surface-400">Loading golfers...</div>

  const selectedTStatus = selectedTournamentId !== 'all' ? availableTournaments.find(t => t.id === selectedTournamentId)?.status : null

  return (
    <div className="space-y-6">
      <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl p-6 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display font-bold text-2xl text-surface-100 flex items-center gap-3">
              <span className="text-primary-400">⛳</span> All Golfers
              {selectedTournamentId !== 'all' && selectedTStatus && (
                <LiveIndicator tournamentId={selectedTournamentId} status={selectedTStatus} />
              )}
            </h2>
            <p className="text-surface-400 text-sm mt-1">
              Season stats across all tournaments.
              <span className="ml-2 px-2 py-0.5 bg-primary-500/10 text-primary-400 rounded text-xs font-bold border border-primary-500/20">
                {allGolfers.length} Total
              </span>
            </p>
            {isLocked && lockedReason && (
              <p className="text-amber-500 text-xs mt-2 font-bold flex items-center gap-1">
                🔒 {lockedReason}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Tournament Filter */}
            <select
              value={selectedTournamentId}
              onChange={(e) => setSelectedTournamentId(e.target.value)}
              className="bg-surface-900 border border-surface-700 rounded-xl px-3 py-2 text-xs text-surface-100 font-bold outline-none cursor-pointer max-w-[200px] truncate"
            >
              <option value="all">All Golfers (No Filter)</option>
              {availableTournaments.map(t => (
                <option key={t.id} value={t.id}>{t.name} (Field)</option>
              ))}
            </select>

            {/* On Roster Toggle */}
            <button
              onClick={() => setShowRosteredOnly(!showRosteredOnly)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                showRosteredOnly
                  ? 'bg-primary-600 text-surface-900 border-primary-500 shadow-glow/10'
                  : 'bg-surface-900 text-surface-400 border-surface-700 hover:border-primary-500/30 hover:text-surface-200'
              }`}
            >
              <span>{showRosteredOnly ? '✓' : '○'}</span>
              On Roster
            </button>

            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search golfers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full md:w-56 bg-surface-900 border border-surface-700 rounded-xl px-4 py-2 text-sm text-surface-100 focus:ring-2 focus:ring-primary-500/50 outline-none transition-all pl-10"
              />
              <span className="absolute left-3 top-2.5 text-surface-500">🔍</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto max-h-[800px] rounded-lg border border-surface-700/50">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface-800 z-10 shadow-md">
              <tr className="text-left border-b border-surface-700/50">
                <th className="py-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 cursor-pointer hover:text-surface-300 transition-colors" onClick={() => handleSort('name')}>
                  Golfer {sortBy === 'name' && <span className="text-primary-400">{sortDesc ? '↑' : '↓'}</span>}
                </th>
                {selectedTournamentId !== 'all' && (
                  <th className="py-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-center cursor-pointer hover:text-surface-300 transition-colors" onClick={() => handleSort('odds')}>
                    Odds {sortBy === 'odds' && <span className="text-primary-400">{sortDesc ? '↑' : '↓'}</span>}
                  </th>
                )}
                <th className="py-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-center">Tourn.</th>
                <th className="py-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-right cursor-pointer hover:text-surface-300 transition-colors" onClick={() => handleSort('score')}>
                   Season Score {sortBy === 'score' && <span className="text-primary-400">{sortDesc ? '↑' : '↓'}</span>}
                </th>
                <th className="py-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-center">Status</th>
                <th className="py-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-700/50">
              {displayGolfers.length > 0 ? displayGolfers.map(golfer => (
                <tr key={golfer.id} className="group hover:bg-surface-800/40 transition-colors">
                  <td className="py-4 px-4">
                    <div className="font-bold text-surface-100 group-hover:text-primary-400 transition-colors">
                      {golfer.name}
                    </div>
                  </td>
                  {selectedTournamentId !== 'all' && (
                    <td className="py-4 px-4 text-center">
                      <span className={`text-xs font-black ${golfer.odds ? 'text-purple-400' : 'text-surface-600'}`}>
                        {golfer.odds ? `+${golfer.odds}` : '—'}
                      </span>
                    </td>
                  )}
                  <td className="py-4 px-4 text-center text-surface-400 text-sm">
                    {golfer.tournaments_played}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span className={`text-lg font-black font-display ${scoreColor(golfer.total_score)}`}>
                      {golfer.tournaments_played > 0 ? formatScore(golfer.total_score) : '—'}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-center">
                    {golfer.is_rostered ? (
                      <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded-lg font-black uppercase tracking-widest whitespace-nowrap">
                        {golfer.rostered_team || 'Rostered'}
                      </span>
                    ) : (isAwaitingDraft || isLocked) ? (
                      <span className="text-[9px] bg-surface-700/50 text-surface-400 border border-surface-700/50 px-2 py-1 rounded-lg font-black uppercase tracking-widest whitespace-nowrap">
                        {isAwaitingDraft ? 'Awaiting Draft' : 'Locked'}
                      </span>
                    ) : (
                      <span className="text-[9px] bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-1 rounded-lg font-black uppercase tracking-widest">
                        Available
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-right">
                    {myTeam && !golfer.is_rostered && (
                      <button 
                        className={`px-4 py-1.5 rounded-lg text-xs font-black shadow-glow/10 transition-all uppercase tracking-wider ${
                          isLocked || isAwaitingDraft
                            ? 'bg-surface-700 text-surface-500 cursor-not-allowed border border-surface-600/50' 
                            : 'bg-primary-600 text-surface-900 hover:bg-primary-500 active:scale-95'
                        }`}
                        onClick={() => !(isLocked || isAwaitingDraft) && handleAdd(golfer.id)}
                        disabled={isLocked || isAwaitingDraft}
                      >
                        {(isLocked || isAwaitingDraft) ? 'Locked' : (league.waiver_rule === 'Free Agency' || league.draft_cycle === 'tournament' ? 'Add' : 'Claim')}
                      </button>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={selectedTournamentId === 'all' ? 5 : 6} className="py-12 text-center text-surface-500 italic">
                    No golfers found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showDropModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-sm">
          <div className="bg-surface-800 border border-surface-700 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-surface-700">
              <h2 className="text-xl font-bold text-surface-50">Roster Capacity Reached</h2>
              <p className="text-surface-400 text-sm mt-1">You must drop a golfer to add this one.</p>
            </div>
            <div className="p-6 space-y-2 relative">
              {isDropping && (
                <div className="absolute inset-0 bg-surface-800/50 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-2xl">
                  <div className="flex items-center gap-3 text-red-400 font-bold">
                    <span className="animate-spin text-2xl">⏳</span> Processing...
                  </div>
                </div>
              )}
              <h3 className="text-xs font-black text-surface-500 uppercase tracking-widest mb-4">Select Golfer to Drop</h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                {myRoster.map(g => (
                  <button
                    key={g.id}
                    onClick={() => handleDropAndAdd(g.id)}
                    className="w-full flex items-center justify-between p-4 bg-surface-900 border border-surface-700/50 rounded-xl hover:border-red-500/50 hover:bg-red-500/5 transition-all group"
                    disabled={isDropping}
                  >
                    <span className="font-bold text-surface-100 group-hover:text-red-400">{g.name}</span>
                    <span className="text-xs text-red-500 font-black uppercase opacity-0 group-hover:opacity-100 transition-opacity">Drop</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6 bg-surface-800/50 border-t border-surface-700">
              <button 
                onClick={() => setShowDropModal(null)}
                className="w-full py-3 bg-surface-700 text-surface-100 rounded-xl font-bold hover:bg-surface-600 transition-all"
                disabled={isDropping}
              >
                Cancel Transaction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
