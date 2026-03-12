import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { leagueService } from '../services/leagueService'

export default function JoinLeague() {
  const { user } = useAuth()
  const navigate = useNavigate()
  
  const [inviteCode, setInviteCode] = useState('')
  const [teamName, setTeamName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return

    setLoading(true)
    setError(null)
    try {
      const leagueId = await leagueService.joinLeague(user.id, inviteCode.trim().toUpperCase(), teamName)
      navigate(`/leagues/${leagueId}`)
    } catch (err: any) {
      setError(err.message || 'Failed to join league')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-display font-bold text-surface-50 mb-6 flex items-center gap-2">
        <span>🤝</span> Join a League
      </h1>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded mb-6 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-200 mb-1">
            Invite Code
          </label>
          <input
            type="text"
            required
            className="w-full bg-surface-800 border border-surface-700 rounded p-2 text-surface-50 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none uppercase"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="e.g. A1B2C3"
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
            placeholder="e.g. Putt Pirates"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary-600 hover:bg-primary-500 text-surface-900 font-bold py-3 rounded-lg mt-6 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Joining...' : 'Join League'}
        </button>
      </form>
    </div>
  )
}
