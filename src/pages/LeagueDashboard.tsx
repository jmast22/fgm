import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { leagueService } from '../services/leagueService'
import { draftService } from '../services/draftService'
import type { League, Team } from '../services/leagueService'
import { useNavigate } from 'react-router-dom'
import DraftResults from '../components/league/DraftResults'
import RosterTab from '../components/league/RosterTab'
import ScheduleTab from '../components/league/ScheduleTab'
import GolfersTab from '../components/league/GolfersTab'
import TradesTab from '../components/league/TradesTab'
import LeagueActivity from '../components/league/LeagueActivity'

type TabId = 'roster' | 'league' | 'draft' | 'settings' | 'schedule' | 'golfers' | 'trades';

export default function LeagueDashboard() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  
  const [activeTab, setActiveTab] = useState<TabId>('league')
  const [league, setLeague] = useState<League | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startingDraft, setStartingDraft] = useState(false)
  const [isEditingSettings, setIsEditingSettings] = useState(false)
  const [editSettings, setEditSettings] = useState({
    name: '',
    roster_size: 10,
    weekly_starters: 6,
    max_teams: 12,
    waiver_rule: 'Free Agency'
  })
  const [editTeamNames, setEditTeamNames] = useState<Record<string, string>>({})
  const [editDraftOrder, setEditDraftOrder] = useState<string[]>([])


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
          name: l.name,
          roster_size: l.roster_size,
          weekly_starters: l.weekly_starters,
          max_teams: l.max_teams || 12,
          waiver_rule: l.waiver_rule || 'Free Agency'
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

  const startEditing = async () => {
    setLoading(true)
    try {
      const allTeams = await leagueService.ensurePlaceholders(id!, editSettings.max_teams)
      setTeams(allTeams)
      
      const names: Record<string, string> = {}
      allTeams.forEach(t => names[t.id] = t.team_name)
      setEditTeamNames(names)
      
      const draft = await draftService.getDraftByLeague(id!)
      if (draft && draft.draft_order && draft.draft_order.length > 0) {
        // Ensure the order only contains current team IDs
        const teamIds = allTeams.map(t => t.id)
        const filteredOrder = draft.draft_order.filter(tid => teamIds.includes(tid))
        const missingIds = teamIds.filter(tid => !filteredOrder.includes(tid))
        setEditDraftOrder([...filteredOrder, ...missingIds])
      } else {
        setEditDraftOrder(allTeams.map(t => t.id))
      }
      
      setIsEditingSettings(true)
    } catch (err: any) {
      alert('Failed to prepare settings: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...editDraftOrder]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= newOrder.length) return
    
    const [removed] = newOrder.splice(index, 1)
    newOrder.splice(newIndex, 0, removed)
    setEditDraftOrder(newOrder)
  }

  const handleSaveSettings = async () => {
    try {
      setLoading(true)
      
      // 1. Update League Settings
      const updated = await leagueService.updateLeague(league!.id, editSettings)
      
      // 2. Update Team Names that changed
      const namePromises = Object.entries(editTeamNames).map(([teamId, name]) => {
         const original = teams.find(t => t.id === teamId)
         if (original && original.team_name !== name) {
           return leagueService.updateTeamName(teamId, name)
         }
         return null
      }).filter(Boolean)
      
      await Promise.all(namePromises)

      // 3. Update Draft Order
      await draftService.updateDraftOrder(league!.id, editDraftOrder)

      // 4. Refresh data
      const [t, m] = await Promise.all([
        leagueService.getLeagueTeams(id!),
        leagueService.getLeagueMembers(id!)
      ])

      setLeague(updated)
      setTeams(t)
      setMembers(m)
      setIsEditingSettings(false)
    } catch (err: any) {
      alert('Failed to save settings: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'league', label: 'League', icon: '🏆' },
    { id: 'roster', label: 'Roster', icon: '👤' },
    { id: 'golfers', label: 'Golfers', icon: '⛳' },
    { id: 'trades', label: 'Trades', icon: '↔️' },
    { id: 'draft', label: 'Draft', icon: '🎯' },
    { id: 'schedule', label: 'Schedule', icon: '📅' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ]

  return (
    <div className="space-y-4">
      {/* Back Button & Breadcrumbs */}
      <div>
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-surface-400 hover:text-primary-400 transition-colors text-sm font-medium group"
        >
          <span className="group-hover:-translate-x-1 transition-transform">←</span> Back to Dashboard
        </button>
      </div>

      {/* League Header Panel */}
      <div className="bg-surface-800/60 border border-surface-700/50 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-600/20 border border-primary-500/20 flex items-center justify-center text-2xl">
              🏆
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-surface-50 tracking-tight">
                {league.name}
              </h1>
              <p className="text-surface-400 text-sm mt-1 flex items-center gap-2">
                <span>Season {league.season_year}</span>
                <span className="w-1 h-1 rounded-full bg-surface-600" />
                <span>{teams.length}/{league.max_teams || 12} Teams Joined</span>
              </p>
            </div>
          </div>
          
          {isCommish && (
            <div className="bg-surface-900/50 border border-surface-700/50 rounded-xl p-3 flex items-center gap-4">
              <div>
                <div className="text-[9px] text-surface-500 uppercase tracking-widest font-black mb-0.5">Invite Code</div>
                <div className="font-mono text-lg font-black text-primary-400">
                  {league.invite_code}
                </div>
              </div>
              <button 
                className="w-10 h-10 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center text-surface-400 hover:text-primary-400 hover:border-primary-500/50 transition-all active:scale-95"
                onClick={() => {
                  navigator.clipboard.writeText(league.invite_code)
                  // Could add a toast here
                }}
                title="Copy to clipboard"
              >
                📋
              </button>
            </div>
          )}
        </div>

        {/* Sub-Navigation Bar */}
        <div className="mt-4 flex items-center gap-1 p-1 bg-surface-900/50 border border-surface-700/50 rounded-xl overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 whitespace-nowrap
                  ${isActive 
                    ? 'bg-primary-600 text-surface-900 shadow-glow/10' 
                    : 'text-surface-400 hover:text-surface-100 hover:bg-surface-800'
                  }
                `}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content Area */}
      <div className="animate-fade-in">
        {activeTab === 'league' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Standings (1/3) */}
            <div className="lg:col-span-1">
              <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl overflow-hidden shadow-lg">
                <div className="p-4 border-b border-surface-700/50 bg-surface-900/20 flex items-center justify-between">
                  <h3 className="text-xs font-black text-surface-300 uppercase tracking-widest">League Standings</h3>
                  <span className="text-[10px] text-surface-500 font-bold uppercase tracking-tighter">Rankings</span>
                </div>
                
                <div className="divide-y divide-surface-700/50 max-h-[600px] overflow-y-auto no-scrollbar">
                  {(() => {
                    const maxTeams = league.max_teams || 12;
                    const displayTeams = [...teams];
                    
                    if (displayTeams.length < maxTeams) {
                      for (let i = displayTeams.length; i < maxTeams; i++) {
                        displayTeams.push({
                          id: `placeholder-${i}`,
                          team_name: `Empty Slot ${i + 1}`,
                          user_id: null,
                          league_id: league.id,
                          is_virtual: true
                        } as any);
                      }
                    }

                    return displayTeams.map((team: any, index) => {
                      const member = members.find(m => m.user_id === team.user_id)
                      const isPlaceholder = !team.user_id;

                      return (
                        <div key={team.id} className="p-4 flex items-center justify-between hover:bg-surface-800/50 transition-colors group">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-surface-900 border border-surface-700 flex items-center justify-center text-surface-500 font-display font-black text-[10px] group-hover:border-primary-500/30 group-hover:text-primary-400 transition-colors">
                              {index + 1}
                            </div>
                            <div>
                              <div className={`font-bold text-sm ${isPlaceholder ? 'text-surface-600 italic font-medium' : 'text-surface-100'}`}>
                                {team.team_name}
                              </div>
                              <div className="text-[10px] text-surface-500 flex items-center gap-1.5 ">
                                {isPlaceholder ? 'Waiting...' : (member?.profiles?.display_name || 'Owner')}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-black text-surface-50 font-display leading-none">0</div>
                            <div className="text-[8px] text-surface-500 uppercase tracking-widest font-bold">Pts</div>
                          </div>
                        </div>
                      )
                    });
                  })()}
                </div>
              </div>
            </div>

            {/* Right Column: Activity (2/3) */}
            <div className="lg:col-span-2">
              <LeagueActivity leagueId={league.id} />
            </div>
          </div>
        )}

        {activeTab === 'roster' && (
          <RosterTab 
            league={league} 
            teams={teams} 
          />
        )}

        {activeTab === 'draft' && (
          <div className="space-y-6">
            {league.draft_status !== 'completed' && (
              <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl p-6 shadow-lg">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-surface-900/40 border border-surface-700/50 rounded-2xl p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-surface-800 border-2 border-surface-700 flex items-center justify-center text-xl shadow-glow/5">
                      {league.draft_status === 'pending' ? '⏳' : '🔥'}
                    </div>
                    <div>
                      <h3 className="text-lg font-display font-bold text-surface-50 capitalize">
                         Draft {league.draft_status}
                      </h3>
                      <p className="text-surface-400 text-xs max-w-sm">
                        {league.draft_status === 'pending' 
                          ? 'Wait for the commissioner to launch the draft lobby.' 
                          : 'The draft is live! Head to the draft room to make your picks.'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="w-full md:w-auto">
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
                        className="w-full md:w-64 bg-primary-600 hover:bg-primary-500 text-surface-900 font-black py-3 rounded-xl transition-all shadow-glow/20 disabled:opacity-50 text-base uppercase tracking-wider"
                      >
                        {startingDraft ? 'Initializing...' : 'Launch Draft'}
                      </button>
                    )}
                    {league.draft_status === 'active' && (
                      <button
                        onClick={() => navigate(`/drafts/${league.id}`)}
                        className="w-full md:w-64 bg-primary-600 hover:bg-primary-500 text-surface-900 font-black py-3 rounded-xl transition-all shadow-glow/20 text-base uppercase tracking-wider"
                      >
                        Enter Draft Room
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl p-8 shadow-lg">
              <DraftResults 
                league={league} 
                teams={teams} 
              />
            </div>
          </div>
        )}

        {activeTab === 'schedule' && (
          <ScheduleTab 
            league={league} 
          />
        )}

        {activeTab === 'golfers' && (
          <GolfersTab 
            league={league} 
            teams={teams}
          />
        )}

        {activeTab === 'trades' && (
          <TradesTab 
            league={league} 
            teams={teams}
          />
        )}

        {activeTab === 'settings' && (
          <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl p-8 shadow-lg">
             <div className="flex items-center justify-between mb-8 pb-4 border-b border-surface-700/50">
               <div>
                <h2 className="font-display font-bold text-2xl text-surface-100">League Settings</h2>
                <p className="text-surface-400 text-sm mt-1">Manage rules, teams, and draft order.</p>
               </div>
               {isCommish && league.draft_status === 'pending' && !isEditingSettings && (
                 <button 
                  onClick={startEditing} 
                  className="bg-primary-600/10 text-primary-400 hover:bg-primary-600 hover:text-surface-900 px-6 py-2 rounded-lg font-bold transition-all border border-primary-500/20"
                 >
                   Edit All Settings
                 </button>
               )}
             </div>

             {!isEditingSettings ? (
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h3 className="text-sm font-black text-surface-500 uppercase tracking-widest">Roster & Rules</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-surface-900/50 p-4 rounded-xl border border-surface-700/50">
                      <div className="text-xs text-surface-500 uppercase font-bold mb-1">Max Teams</div>
                      <div className="text-xl font-bold text-surface-100">{league.max_teams || 12}</div>
                    </div>
                    <div className="bg-surface-900/50 p-4 rounded-xl border border-surface-700/50">
                      <div className="text-xs text-surface-500 uppercase font-bold mb-1">Roster Size</div>
                      <div className="text-xl font-bold text-surface-100">{league.roster_size} <span className="text-sm font-medium text-surface-400">Golfers</span></div>
                    </div>
                    <div className="bg-surface-900/50 p-4 rounded-xl border border-surface-700/50">
                      <div className="text-xs text-surface-500 uppercase font-bold mb-1">Waiver Rule</div>
                      <div className="text-xl font-bold text-primary-400">{league.waiver_rule || 'Free Agency'}</div>
                    </div>
                    <div className="bg-surface-900/50 p-4 rounded-xl border border-surface-700/50 col-span-2 text-center">
                      <div className="text-xs text-surface-500 uppercase font-bold mb-1">Weekly Starters</div>
                      <div className="text-2xl font-black text-primary-400">{league.weekly_starters} <span className="text-sm font-medium text-surface-400">Golfers</span></div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-black text-surface-500 uppercase tracking-widest">Commission Tools</h3>
                  <div className="p-4 bg-primary-500/5 border border-primary-500/10 rounded-xl">
                    <p className="text-sm text-surface-300 mb-2">
                       Settings are locked once the draft begins. Make sure to finalize team names and order before starting.
                    </p>
                    {isCommish ? (
                      <div className="text-xs font-bold text-primary-400 px-2 py-1 bg-primary-500/10 rounded inline-block">
                        ✓ You are Commissioner
                      </div>
                    ) : (
                      <div className="text-xs font-bold text-surface-500 px-2 py-1 bg-surface-800 rounded inline-block">
                        ⓘ View Only
                      </div>
                    )}
                  </div>
                </div>
              </div>
             ) : (
               <div className="space-y-8 animate-fade-in">
                 <div className="grid md:grid-cols-2 gap-8">
                   <div className="space-y-4">
                    <h3 className="text-sm font-black text-surface-500 uppercase tracking-widest mb-4">Core Info</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-surface-400 text-xs font-bold uppercase tracking-wider mb-2">League Name</label>
                        <input 
                          type="text" 
                          value={editSettings.name}
                          onChange={e => setEditSettings({...editSettings, name: e.target.value})}
                          className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-surface-100 focus:ring-2 focus:ring-primary-500/50 outline-none transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-surface-400 text-[10px] font-bold uppercase tracking-wider mb-2">Max Teams</label>
                          <input 
                            type="number" 
                            value={editSettings.max_teams}
                            onChange={e => setEditSettings({...editSettings, max_teams: parseInt(e.target.value) || 12})}
                            className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-surface-100"
                          />
                        </div>
                        <div>
                          <label className="block text-surface-400 text-[10px] font-bold uppercase tracking-wider mb-2">Roster Size</label>
                          <input 
                            type="number" 
                            value={editSettings.roster_size}
                            onChange={e => setEditSettings({...editSettings, roster_size: parseInt(e.target.value) || 10})}
                            className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-surface-100"
                          />
                        </div>
                        <div>
                          <label className="block text-surface-400 text-[10px] font-bold uppercase tracking-wider mb-2">Starters</label>
                          <input 
                            type="number" 
                            value={editSettings.weekly_starters}
                            onChange={e => setEditSettings({...editSettings, weekly_starters: parseInt(e.target.value) || 6})}
                            className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-surface-100"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-surface-400 text-xs font-bold uppercase tracking-wider mb-2">Waiver Rule</label>
                        <select 
                          value={editSettings.waiver_rule}
                          onChange={e => setEditSettings({...editSettings, waiver_rule: e.target.value})}
                          className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-surface-100 focus:ring-2 focus:ring-primary-500/50 outline-none transition-all"
                        >
                          <option value="Free Agency">Free Agency (Immediate)</option>
                          <option value="Weekly Waivers">Weekly Waivers</option>
                          <option value="Waiver Wire">Waiver Wire (Rolling)</option>
                        </select>
                      </div>
                    </div>
                   </div>

                   <div className="space-y-4">
                    <h3 className="text-sm font-black text-surface-500 uppercase tracking-widest mb-4">Draft Order & Team Names</h3>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
                       {editDraftOrder.map((teamId, index) => {
                         const team = teams.find(t => t.id === teamId)
                         if (!team) return null
                         return (
                           <div key={teamId} className="flex items-center gap-3 p-3 bg-surface-900/50 border border-surface-700/50 rounded-xl group transition-all hover:border-primary-500/30">
                              <div className="w-8 h-8 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center text-xs font-black text-surface-500 group-hover:text-primary-400 transition-colors">
                                {index + 1}
                              </div>
                              <div className="flex-1 space-y-1">
                                <input 
                                  type="text" 
                                  value={editTeamNames[teamId] || ''}
                                  onChange={e => setEditTeamNames({...editTeamNames, [teamId]: e.target.value})}
                                  placeholder="Enter Team Name..."
                                  className="w-full bg-transparent border-none p-0 text-sm font-bold text-surface-100 placeholder:text-surface-700 focus:ring-0"
                                />
                                <div className="text-[10px] text-surface-500 uppercase font-bold tracking-tighter">
                                   {team.user_id ? '✓ Real Member' : '⚡ Auto-Placeholder'}
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <button 
                                  onClick={() => moveItem(index, 'up')}
                                  disabled={index === 0}
                                  className="w-8 h-6 bg-surface-800 rounded border border-surface-700 flex items-center justify-center text-xs hover:text-primary-400 disabled:opacity-20"
                                >
                                  ▲
                                </button>
                                <button 
                                  onClick={() => moveItem(index, 'down')}
                                  disabled={index === editDraftOrder.length - 1}
                                  className="w-8 h-6 bg-surface-800 rounded border border-surface-700 flex items-center justify-center text-xs hover:text-primary-400 disabled:opacity-20"
                                >
                                  ▼
                                </button>
                              </div>
                           </div>
                         )
                       })}
                    </div>
                   </div>
                 </div>

                 <div className="flex gap-4 pt-8 border-t border-surface-700/50">
                   <button 
                    onClick={handleSaveSettings} 
                    className="flex-1 bg-primary-600 hover:bg-primary-500 text-surface-900 font-black py-4 rounded-xl transition-all shadow-glow/20 uppercase tracking-wider"
                   >
                     🚀 Save All Changes
                   </button>
                   <button 
                    onClick={() => setIsEditingSettings(false)} 
                    className="flex-1 bg-surface-700 hover:bg-surface-600 text-surface-100 font-bold py-4 rounded-xl transition-all shadow-lg uppercase tracking-wider"
                   >
                     Cancel
                   </button>
                 </div>
               </div>
             )}
          </div>
        )}
      </div>
    </div>
  )
}
