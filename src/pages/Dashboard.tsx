import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { leagueService } from '../services/leagueService'
import type { League } from '../services/leagueService'

export default function Dashboard() {
  const { user } = useAuth()
  const [leagues, setLeagues] = useState<League[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    leagueService.getUserLeagues(user.id)
      .then(setLeagues)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-surface-50">
          Dashboard
        </h1>
        <p className="text-surface-400 text-sm mt-1">
          Welcome to Fantasy Golf League
        </p>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Leagues', value: leagues.length.toString(), icon: '🏆' },
          { label: 'Upcoming', value: '—', icon: '📅' },
          { label: 'Team Rank', value: '—', icon: '📊' },
          { label: 'Fantasy Pts', value: '—', icon: '⭐' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-surface-800/60 border border-surface-700/50 rounded-xl p-4 hover:border-primary-500/30 transition-all duration-300 hover:shadow-glow/10"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{stat.icon}</span>
              <span className="text-xs text-surface-400 font-medium uppercase tracking-wider">
                {stat.label}
              </span>
            </div>
            <p className="text-2xl font-bold font-display text-surface-100">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Active Leagues */}
        <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl flex flex-col overflow-hidden">
          <div className="p-5 border-b border-surface-700/50 flex items-center justify-between">
            <h2 className="font-display font-semibold text-lg text-surface-100 flex items-center gap-2">
              <span>🏆</span> My Leagues
            </h2>
            <div className="flex gap-2">
              <Link to="/leagues/create" className="text-xs font-bold bg-primary-600/20 text-primary-400 hover:bg-primary-600 hover:text-surface-900 px-3 py-1.5 rounded transition-colors">
                + Create
              </Link>
              <Link to="/leagues/join" className="text-xs font-bold bg-surface-700 text-surface-200 hover:bg-surface-600 px-3 py-1.5 rounded transition-colors">
                Join
              </Link>
            </div>
          </div>
          
          <div className="p-5 flex-1 p-0">
            {loading ? (
              <div className="flex items-center justify-center p-8 text-surface-500 text-sm">
                Loading leagues...
              </div>
            ) : leagues.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-surface-500 text-sm text-center">
                <p className="mb-4">No leagues yet — create or join one to get started!</p>
              </div>
            ) : (
              <div className="divide-y divide-surface-700/50">
                {leagues.map((league) => (
                  <Link 
                    key={league.id} 
                    to={`/leagues/${league.id}`}
                    className="block p-4 hover:bg-surface-800/50 transition-colors"
                  >
                    <div className="flex justify-between items-center bg-surface-800/0">
                      <div>
                        <div className="font-bold text-surface-100">{league.name}</div>
                        <div className="text-xs text-surface-400">Status: <span className="capitalize">{league.draft_status}</span></div>
                      </div>
                      <div className="text-surface-400 text-sm">
                        Details →
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Tournaments */}
        <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl p-5">
          <h2 className="font-display font-semibold text-lg text-surface-100 mb-3 flex items-center gap-2">
            <span>⛳</span> Upcoming Tournaments
          </h2>
          <div className="flex items-center justify-center h-32 text-surface-500 text-sm bg-surface-800/30 rounded border border-dashed border-surface-700/50">
            Tournament schedule loading...
          </div>
        </div>
      </div>
    </div>
  )
}
