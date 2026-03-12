import { useEffect, useState } from 'react'
import { rosterService, type RosterGolfer } from '../../services/rosterService'
import type { League, Team } from '../../services/leagueService'
import { useAuth } from '../../context/AuthContext'

interface GolfersTabProps {
  league: League
  teams: Team[]
}

export default function GolfersTab({ league, teams }: GolfersTabProps) {
  const { user } = useAuth()
  const [golfers, setGolfers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [myRoster, setMyRoster] = useState<RosterGolfer[]>([])
  const [showDropModal, setShowDropModal] = useState<string | null>(null) // golferId to add after drop
  const [isDropping, setIsDropping] = useState(false)

  const myTeam = teams.find(t => t.user_id === user?.id)

  const loadData = async () => {
    try {
      const data = await rosterService.getAvailableGolfers(league.id)
      setGolfers(data)
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

  const filteredGolfers = golfers.filter(g => 
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => (a.owg_rank || 9999) - (b.owg_rank || 9999))

  if (loading) return <div className="p-8 text-center text-surface-400">Loading available golfers...</div>

  return (
    <div className="space-y-6">
      <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl p-6 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display font-bold text-2xl text-surface-100 flex items-center gap-3">
              <span className="text-primary-400">⛳</span> Available Golfers
            </h2>
            <p className="text-surface-400 text-sm mt-1">
              Golfers not currently on any team roster. 
              <span className="ml-2 px-2 py-0.5 bg-primary-500/10 text-primary-400 rounded text-xs font-bold border border-primary-500/20">
                Rule: {league.waiver_rule || 'Free Agency'}
              </span>
            </p>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search golfers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:w-64 bg-surface-900 border border-surface-700 rounded-xl px-4 py-2.5 text-sm text-surface-100 focus:ring-2 focus:ring-primary-500/50 outline-none transition-all pl-10"
            />
            <span className="absolute left-3 top-3 text-surface-500">🔍</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left border-b border-surface-700/50">
                <th className="pb-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4">Golfer</th>
                <th className="pb-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-center">Age</th>
                <th className="pb-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-center">OWGR</th>
                <th className="pb-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-center">Birdies</th>
                <th className="pb-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-center">Eagles</th>
                <th className="pb-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-right">Points</th>
                <th className="pb-4 font-black text-xs text-surface-500 uppercase tracking-widest px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-700/50">
              {filteredGolfers.length > 0 ? filteredGolfers.map(golfer => (
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
                  <td className="py-4 px-4 text-center text-surface-100 font-medium">
                    {golfer.stats?.birdies || 0}
                  </td>
                  <td className="py-4 px-4 text-center text-surface-100 font-medium">
                    {golfer.stats?.eagles || 0}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span className="text-lg font-black text-primary-400 font-display">
                      {golfer.stats?.points || 0}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    {myTeam && (
                      <button 
                        className="px-4 py-1.5 rounded-lg bg-primary-600 text-surface-900 text-xs font-black shadow-glow/10 hover:bg-primary-500 active:scale-95 transition-all uppercase tracking-wider"
                        onClick={() => handleAdd(golfer.id)}
                      >
                        {league.waiver_rule === 'Free Agency' ? 'Add' : 'Claim'}
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
