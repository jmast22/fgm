import { useEffect, useState } from 'react'
import { rosterService, type RosterGolfer } from '../../services/rosterService'
import { scoringService, formatScore, scoreColor } from '../../services/scoringService'
import { supabase } from '../../lib/supabase'
import type { League, Team } from '../../services/leagueService'
import { useAuth } from '../../context/AuthContext'
import { tournamentService } from '../../services/tournamentService'

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
}

export default function GolfersTab({ league, teams }: GolfersTabProps) {
  const { user } = useAuth()
  const [allGolfers, setAllGolfers] = useState<GolferWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showRosteredOnly, setShowRosteredOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'rank' | 'score' | 'name'>('rank')
  const [myRoster, setMyRoster] = useState<RosterGolfer[]>([])
  const [showDropModal, setShowDropModal] = useState<string | null>(null)
  const [isDropping, setIsDropping] = useState(false)

  const [isLocked, setIsLocked] = useState(false)

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
      setIsLocked(activeOrUpcoming?.status === 'active')

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

      // 3. Get all team rosters to determine which golfers are rostered
      const teamIds = teams.map(t => t.id)
      const { data: rosters } = await supabase
        .from('team_rosters')
        .select('team_id, golfer_id')
        .in('team_id', teamIds)

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
          rostered_team: team?.team_name
        }
      })

      setAllGolfers(result)

      // 6. Get my roster for add/drop
      if (myTeam) {
        const roster = await rosterService.getTeamRoster(myTeam.id)
        setMyRoster(roster)
      }
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [league.id, myTeam?.id])

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
      await rosterService.addGolfer(myTeam.id, golferId)
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
      await rosterService.addGolfer(myTeam.id, showDropModal)
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

  displayGolfers.sort((a, b) => {
    if (sortBy === 'rank') return (a.owg_rank || 9999) - (b.owg_rank || 9999)
    if (sortBy === 'score') return a.total_score - b.total_score // lower is better
    return a.name.localeCompare(b.name)
  })

  if (loading) return <div className="p-8 text-center text-surface-400">Loading golfers...</div>

  return (
    <div className="space-y-6">
      <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl p-6 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display font-bold text-2xl text-surface-100 flex items-center gap-3">
              <span className="text-primary-400">⛳</span> All Golfers
            </h2>
            <p className="text-surface-400 text-sm mt-1">
              Season stats across all tournaments.
              <span className="ml-2 px-2 py-0.5 bg-primary-500/10 text-primary-400 rounded text-xs font-bold border border-primary-500/20">
                {allGolfers.length} Total
              </span>
            </p>
            {isLocked && (
              <p className="text-amber-500 text-xs mt-2 font-bold flex items-center gap-1">
                🔒 Transactions are locked while the tournament is active.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
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

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-surface-900 border border-surface-700 rounded-xl px-3 py-2 text-xs text-surface-100 font-bold outline-none cursor-pointer"
            >
              <option value="rank">Sort: OWGR</option>
              <option value="score">Sort: Score</option>
              <option value="name">Sort: Name</option>
            </select>

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

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left border-b border-surface-700/50">
                <th className="pb-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4">Golfer</th>
                <th className="pb-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-center">Age</th>
                <th className="pb-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-center">OWGR</th>
                <th className="pb-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-center">Tourn.</th>
                <th className="pb-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-right">Season Score</th>
                <th className="pb-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-center">Status</th>
                <th className="pb-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-right">Action</th>
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
                  <td className="py-4 px-4 text-center text-surface-400 text-sm">
                    {golfer.age}
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className={`text-xs font-bold ${golfer.owg_rank && golfer.owg_rank !== 9999 ? 'text-primary-400' : 'text-surface-600'}`}>
                      {golfer.owg_rank && golfer.owg_rank !== 9999 ? `#${golfer.owg_rank}` : 'N/A'}
                    </span>
                  </td>
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
                    ) : (
                      <span className="text-[9px] bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-1 rounded-lg font-black uppercase tracking-widest">
                        Available
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-right">
                    {myTeam && !golfer.is_rostered && (
                      <button 
                        className={`px-4 py-1.5 rounded-lg text-xs font-black shadow-glow/10 transition-all uppercase tracking-wider ${isLocked && !isCommish ? 'bg-surface-700 text-surface-400 cursor-not-allowed' : 'bg-primary-600 text-surface-900 hover:bg-primary-500 active:scale-95'}`}
                        onClick={() => handleAdd(golfer.id)}
                        disabled={isLocked && !isCommish}
                      >
                        {league.waiver_rule === 'Free Agency' || league.draft_cycle === 'tournament' ? 'Add' : 'Claim'}
                      </button>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-surface-500 italic">
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
