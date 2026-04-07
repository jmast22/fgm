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
  
  const [foundLeague, setFoundLeague] = useState<any>(null)
  const [joinMode, setJoinMode] = useState<'claim' | 'create' | null>(null)
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')

  async function handleFindLeague() {
    if (!inviteCode.trim()) return
    setLoading(true)
    setError(null)
    try {
      const league = await leagueService.getLeagueByInviteCode(inviteCode.trim())
      setFoundLeague(league)
      
      const orphanedTeams = league.teams.filter((t: any) => !t.user_id)
      const hasSpace = league.teams.length < (league.max_teams || 12)
      
      if (orphanedTeams.length > 0) {
        setJoinMode('claim')
        setSelectedTeamId(orphanedTeams[0].id)
      } else if (hasSpace) {
        setJoinMode('create')
      } else {
        setError('This league is full and has no orphaned teams to claim.')
      }
    } catch (err: any) {
      setError(err.message || 'League not found')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !foundLeague) return

    setLoading(true)
    setError(null)
    try {
      let leagueId = foundLeague.id
      if (joinMode === 'claim') {
        leagueId = await leagueService.claimTeam(user.id, selectedTeamId)
      } else {
        leagueId = await leagueService.joinLeague(user.id, inviteCode.trim().toUpperCase(), teamName)
      }
      navigate(`/leagues/${leagueId}`)
    } catch (err: any) {
      setError(err.message || 'Failed to join league')
    } finally {
      setLoading(false)
    }
  }

  const orphanedTeams = foundLeague?.teams.filter((t: any) => !t.user_id) || []
  const hasSpace = foundLeague ? foundLeague.teams.length < (foundLeague.max_teams || 12) : false

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

      {!foundLeague ? (
        <div className="space-y-4">
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
          <button
            onClick={handleFindLeague}
            disabled={loading || !inviteCode.trim()}
            className="w-full bg-primary-600 hover:bg-primary-500 text-surface-900 font-bold py-3 rounded-lg mt-2 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Finding...' : 'Find League'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in">
          <div className="bg-surface-800/50 border border-surface-700/50 rounded-xl p-4">
            <h2 className="text-primary-400 font-bold text-lg">{foundLeague.name}</h2>
            <p className="text-surface-400 text-xs">Season {foundLeague.season_year}</p>
          </div>

          <div className="space-y-4">
            <div className="flex gap-2">
              {orphanedTeams.length > 0 && (
                <button
                  type="button"
                  onClick={() => setJoinMode('claim')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                    joinMode === 'claim' ? 'bg-primary-600 text-surface-900' : 'bg-surface-800 text-surface-400 border border-surface-700'
                  }`}
                >
                  Claim Existing Team
                </button>
              )}
              {hasSpace && (
                <button
                  type="button"
                  onClick={() => setJoinMode('create')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                    joinMode === 'create' ? 'bg-primary-600 text-surface-900' : 'bg-surface-800 text-surface-400 border border-surface-700'
                  }`}
                >
                  Create New Team
                </button>
              )}
            </div>

            {joinMode === 'claim' && (
              <div>
                <label className="block text-sm font-medium text-surface-200 mb-2">
                  Select a Team to Claim
                </label>
                <div className="space-y-2">
                  {orphanedTeams.map((t: any) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setSelectedTeamId(t.id)
                        setTeamName('') // Reset team name if was typing in create mode
                      }}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        selectedTeamId === t.id 
                          ? 'bg-primary-600/10 border-primary-500 text-primary-400' 
                          : 'bg-surface-900/50 border-surface-700 text-surface-400 hover:border-surface-600'
                      }`}
                    >
                      <div className="font-bold">{t.team_name}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {joinMode === 'create' && (
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
            )}
          </div>

          <div className="flex gap-3">
             <button
              type="button"
              onClick={() => {
                setFoundLeague(null)
                setJoinMode(null)
                setSelectedTeamId('')
                setTeamName('')
              }}
              className="flex-1 bg-surface-800 hover:bg-surface-700 text-surface-200 font-bold py-3 rounded-lg transition-colors border border-surface-700"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading || (joinMode === 'claim' && !selectedTeamId) || (joinMode === 'create' && !teamName.trim())}
              className="flex-[2] bg-primary-600 hover:bg-primary-500 text-surface-900 font-bold py-3 rounded-lg disabled:opacity-50 transition-colors"
            >
              {loading ? 'Joining...' : joinMode === 'claim' ? 'Claim Team' : 'Create Team'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
