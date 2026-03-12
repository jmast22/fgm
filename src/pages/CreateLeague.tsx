import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { leagueService } from '../services/leagueService'

export default function CreateLeague() {
  const { user } = useAuth()
  const navigate = useNavigate()
  
  const [name, setName] = useState('')
  const [teamName, setTeamName] = useState('')
  const [rosterSize, setRosterSize] = useState(10)
  const [weeklyStarters, setWeeklyStarters] = useState(6)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return

    setLoading(true)
    setError(null)
    try {
      const league = await leagueService.createLeague(user.id, {
        name,
        roster_size: rosterSize,
        weekly_starters: weeklyStarters,
      }, teamName)
      
      navigate(`/leagues/${league.id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to create league')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-display font-bold text-surface-50 mb-6 flex items-center gap-2">
        <span>🏆</span> Create a League
      </h1>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded mb-6 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-200 mb-1">
            League Name
          </label>
          <input
            type="text"
            required
            className="w-full bg-surface-800 border border-surface-700 rounded p-2 text-surface-50 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. The Masters of Disasters"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-200 mb-1">
            Your Team Name
          </label>
          <input
            type="text"
            required
            className="w-full bg-surface-800 border border-surface-700 rounded p-2 text-surface-50 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="e.g. Fairway to Heaven"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">
              Roster Size
            </label>
            <input
              type="number"
              required
              min={6}
              max={12}
              className="w-full bg-surface-800 border border-surface-700 rounded p-2 text-surface-50 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
              value={rosterSize}
              onChange={(e) => setRosterSize(parseInt(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">
              Weekly Starters
            </label>
            <input
              type="number"
              required
              min={4}
              max={8}
              className="w-full bg-surface-800 border border-surface-700 rounded p-2 text-surface-50 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
              value={weeklyStarters}
              onChange={(e) => setWeeklyStarters(parseInt(e.target.value))}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary-600 hover:bg-primary-500 text-surface-900 font-bold py-3 rounded-lg mt-6 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Creating...' : 'Create League'}
        </button>
      </form>
    </div>
  )
}
