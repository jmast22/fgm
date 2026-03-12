import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { leagueService } from '../services/leagueService'
import { draftService } from '../services/draftService'
import type { League, Team } from '../services/leagueService'
import { useNavigate } from 'react-router-dom'

export default function LeagueDashboard() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  
  const [league, setLeague] = useState<League | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startingDraft, setStartingDraft] = useState(false)
  const [isEditingSettings, setIsEditingSettings] = useState(false)
  const [editSettings, setEditSettings] = useState({
    roster_size: 10,
    weekly_starters: 6,
    max_teams: 12
  })
  const navigate = useNavigate()

  useEffect(() => {
    if (!id) return

    async function fetchData() {
      try {
        const [l, t, m] = await Promise.all([
          leagueService.getLeagueById(id!),
          leagueService.getLeagueTeams(id!),
          leagueService.getLeagueMembers(id!)
        ])
        setLeague(l)
        setEditSettings({
          roster_size: l.roster_size,
          weekly_starters: l.weekly_starters,
          max_teams: l.max_teams || 12
        })
        setTeams(t)
        setMembers(m)
      } catch (err: any) {
        setError(err.message || 'Failed to load league data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

  if (loading) return <div className="text-surface-400">Loading league...</div>
  if (error || !league) return <div className="text-red-500">{error || 'League not found'}</div>

  const isCommish = user?.id === league.commissioner_id

  const handleSaveSettings = async () => {
    try {
      setLoading(true)
      const updated = await leagueService.updateLeague(league!.id, editSettings)
      setLeague(updated)
      setIsEditingSettings(false)
    } catch (err: any) {
      alert('Failed to save settings: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-surface-50">
            {league.name}
          </h1>
          <p className="text-surface-400 text-sm mt-1">
            Season {league.season_year} • {teams.length}/{league.max_teams || 12} Teams
          </p>
        </div>
        
        {isCommish && (
          <div className="bg-surface-800 border border-surface-700 rounded-lg p-3 flex items-center gap-3">
            <div className="text-xs text-surface-400 uppercase tracking-wider font-semibold">Invite Code</div>
            <div className="font-mono text-lg font-bold text-primary-400 bg-surface-900 px-3 py-1 rounded">
              {league.invite_code}
            </div>
            <button 
              className="text-surface-400 hover:text-surface-100 transition-colors"
              onClick={() => navigator.clipboard.writeText(league.invite_code)}
              title="Copy to clipboard"
            >
              📋
            </button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Standings / Teams */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-surface-700/50 flex items-center justify-between">
              <h2 className="font-display font-semibold text-lg text-surface-100 flex items-center gap-2">
                <span>📊</span> Standings
              </h2>
            </div>
            
            <div className="divide-y divide-surface-700/50">
              {teams.map((team, index) => {
                const member = members.find(m => m.user_id === team.user_id)
                return (
                  <div key={team.id} className="p-4 flex items-center justify-between hover:bg-surface-800/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-8 text-center text-surface-400 font-display font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-bold text-surface-100">{team.team_name}</div>
                        <div className="text-sm text-surface-400">
                          {member?.profiles.display_name || 'Unknown User'}
                          {team.user_id === league.commissioner_id && (
                            <span className="ml-2 text-primary-500 text-xs">Commish</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-surface-50">0</div>
                      <div className="text-xs text-surface-400 uppercase">Pts</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Draft Status */}
          <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl p-5">
            <h2 className="font-display font-semibold text-lg text-surface-100 mb-3 flex items-center gap-2">
              <span>🎯</span> Draft Status
            </h2>
            
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-800 border-2 border-surface-700 mb-3 text-2xl">
                {league.draft_status === 'pending' ? '⏳' : league.draft_status === 'active' ? '🔥' : '✅'}
              </div>
              <h3 className="font-bold text-surface-100 mb-1 capitalize">
                {league.draft_status}
              </h3>
              <p className="text-sm text-surface-400 mb-4">
                {league.draft_status === 'pending' 
                  ? 'Waiting for commissioner to start the draft.' 
                  : league.draft_status === 'active' 
                  ? 'Draft is currently active!' 
                  : 'Draft has been completed.'}
              </p>
              
              {isCommish && league.draft_status === 'pending' && (
                <button 
                  onClick={async () => {
                    setStartingDraft(true)
                    try {
                       await draftService.startDraft(league.id)
                       navigate(`/drafts/${league.id}`)
                    } catch(err: any) {
                       alert('Error starting draft: ' + err.message)
                    } finally {
                       setStartingDraft(false)
                    }
                  }}
                  disabled={startingDraft}
                  className="w-full bg-primary-600 hover:bg-primary-500 text-surface-900 font-bold py-2 rounded transition-colors text-sm disabled:opacity-50"
                >
                  {startingDraft ? 'Starting...' : 'Start Draft'}
                </button>
              )}
              {league.draft_status !== 'pending' && (
                <button
                  onClick={() => navigate(`/drafts/${league.id}`)}
                  className="w-full bg-primary-600 hover:bg-primary-500 text-surface-900 font-bold py-2 rounded transition-colors text-sm"
                >
                  Enter Draft Room
                </button>
              )}
            </div>
          </div>
          
          {/* Settings / Rules */}
          <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl p-5">
             <div className="flex items-center justify-between mb-3">
               <h2 className="font-display font-semibold text-lg text-surface-100 flex items-center gap-2">
                 <span>⚙️</span> Rules & Settings
               </h2>
               {isCommish && league.draft_status === 'pending' && !isEditingSettings && (
                 <button onClick={() => setIsEditingSettings(true)} className="text-sm text-primary-400 hover:text-primary-300">
                   Edit
                 </button>
               )}
             </div>

             {!isEditingSettings ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-surface-400">Max Teams</span>
                  <span className="text-surface-100 font-medium">{league.max_teams || 12}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-surface-400">Roster Size</span>
                  <span className="text-surface-100 font-medium">{league.roster_size} Golfers</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-surface-400">Weekly Starters</span>
                  <span className="text-surface-100 font-medium">{league.weekly_starters} Golfers</span>
                </div>
              </div>
             ) : (
               <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-surface-400 text-xs mb-1">Max Teams</label>
                  <input 
                    type="number" 
                    value={editSettings.max_teams}
                    onChange={e => setEditSettings({...editSettings, max_teams: parseInt(e.target.value) || 12})}
                    className="w-full bg-surface-900 border border-surface-700 rounded px-2 py-1 text-surface-100"
                  />
                </div>
                <div>
                  <label className="block text-surface-400 text-xs mb-1">Roster Size</label>
                  <input 
                    type="number" 
                    value={editSettings.roster_size}
                    onChange={e => setEditSettings({...editSettings, roster_size: parseInt(e.target.value) || 10})}
                    className="w-full bg-surface-900 border border-surface-700 rounded px-2 py-1 text-surface-100"
                  />
                </div>
                <div>
                  <label className="block text-surface-400 text-xs mb-1">Weekly Starters</label>
                  <input 
                    type="number" 
                    value={editSettings.weekly_starters}
                    onChange={e => setEditSettings({...editSettings, weekly_starters: parseInt(e.target.value) || 6})}
                    className="w-full bg-surface-900 border border-surface-700 rounded px-2 py-1 text-surface-100"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={handleSaveSettings} className="flex-1 bg-primary-600 hover:bg-primary-500 text-surface-900 font-bold py-1.5 rounded transition-colors">
                    Save
                  </button>
                  <button onClick={() => setIsEditingSettings(false)} className="flex-1 bg-surface-700 hover:bg-surface-600 text-surface-100 font-bold py-1.5 rounded transition-colors">
                    Cancel
                  </button>
                </div>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  )
}
