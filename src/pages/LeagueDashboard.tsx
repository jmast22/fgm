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
import LeaderboardTab from '../components/league/LeaderboardTab'
import { scoringService, formatScore, scoreColor } from '../services/scoringService'
import { tournamentService, type Tournament } from '../services/tournamentService'
import SpinningWheel from '../components/league/SpinningWheel'

type TabId = 'roster' | 'leaderboard' | 'league' | 'draft' | 'settings' | 'schedule' | 'golfers' | 'trades';

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
  const [editSettings, setEditSettings] = useState<{
    name: string,
    roster_size: number,
    weekly_starters: number,
    max_teams: number,
    waiver_rule: string,
    draft_cycle: 'season' | 'tournament'
  }>({
    name: '',
    roster_size: 10,
    weekly_starters: 6,
    max_teams: 12,
    waiver_rule: 'Free Agency',
    draft_cycle: 'season'
  })
  const [editTeamNames, setEditTeamNames] = useState<Record<string, string>>({})
  const [editDraftOrder, setEditDraftOrder] = useState<string[]>([])
  const [settingsTab, setSettingsTab] = useState<'core' | 'scoring' | 'draft' | 'teams'>('core')
  const [seasonStandings, setSeasonStandings] = useState<Record<string, { total: number; tournaments_played: number }>>({})
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('')
  const [isRandomizing, setIsRandomizing] = useState(false)
  const [randomizedOrder, setRandomizedOrder] = useState<string[]>([])
  const [remainingTeams, setRemainingTeams] = useState<string[]>([])
  const [wheelSpinning, setWheelSpinning] = useState(false)
  const [wheelItems, setWheelItems] = useState<string[]>([])
  const [isDraftLocked, setIsDraftLocked] = useState(false)
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)


  useEffect(() => {
    if (!id) return

    async function loadData() {
      try {
        const [l, t, m, tourneys] = await Promise.all([
          leagueService.getLeagueById(id!),
          leagueService.getLeagueTeams(id!),
          leagueService.getLeagueMembers(id!),
          tournamentService.getTournaments()
        ])
        
        setLeague(l)
        setTeams(t)
        setMembers(m)
        setTournaments(tourneys)

        setEditSettings({
          name: l.name,
          roster_size: l.roster_size,
          weekly_starters: l.weekly_starters,
          max_teams: l.max_teams || 12,
          waiver_rule: l.waiver_rule || 'Free Agency',
          draft_cycle: l.draft_cycle || 'season'
        })

        // Default to the first upcoming or active tournament that is NOT excluded
        const excludedIds = l.excluded_tournaments || []
        const activeOrUpcoming = tourneys.find(tourney => tourney.status !== 'completed' && !excludedIds.includes(tourney.id))
        
        if (activeOrUpcoming) setSelectedTournamentId(activeOrUpcoming.id)
        else if (tourneys.length > 0) {
          const firstNonExcluded = tourneys.find(tourney => !excludedIds.includes(tourney.id))
          setSelectedTournamentId(firstNonExcluded ? firstNonExcluded.id : tourneys[0].id)
        }

        // Fetch standings in parallel (it's non-blocking for setting initial state but good to trigger now)
        scoringService.getSeasonStandings(l.id, l.excluded_tournaments || [])
          .then(standings => {
            const standingsMap: Record<string, { total: number; tournaments_played: number }> = {}
            standings.forEach(s => { standingsMap[s.team_id] = { total: s.total, tournaments_played: s.tournaments_played } })
            setSeasonStandings(standingsMap)
          })
          .catch(e => console.error('Failed to load standings:', e))

      } catch (err: any) {
        setError(err.message || 'Failed to load league data')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [id])

  const isCommish = league ? user?.id === league.commissioner_id : false

  // Load draft order and settings when opening the settings tab
  useEffect(() => {
    if (activeTab === 'settings' && league && selectedTournamentId) {
      async function prepareSettings() {
        try {
          let currentTeams = teams;
          if (isCommish && currentTeams.length < (league?.max_teams || 12)) {
            currentTeams = await leagueService.ensurePlaceholders(league!.id, league!.max_teams || 12)
            setTeams(currentTeams)
          }

          const names: Record<string, string> = {}
          currentTeams.forEach(t => names[t.id] = t.team_name)
          setEditTeamNames(names)
          
          const draft = await draftService.getDraftByTournament(league!.id, selectedTournamentId)
          if (draft && draft.draft_order && draft.draft_order.length > 0) {
            setCurrentDraftId(draft.id)
            setIsDraftLocked(!!draft.is_locked)
            const teamIds = currentTeams.map(t => t.id)
            const filteredOrder = draft.draft_order.filter((tid: string) => teamIds.includes(tid))
            const missingIds = teamIds.filter(tid => !filteredOrder.includes(tid))
            setEditDraftOrder([...filteredOrder, ...missingIds])
          } else {
            setCurrentDraftId(null)
            setIsDraftLocked(false)
            setEditDraftOrder(currentTeams.map(t => t.id))
          }
        } catch (err) {
          console.error('Failed to prepare settings', err)
        }
      }
      prepareSettings()
    }
  }, [activeTab, league, isCommish, teams, selectedTournamentId])

  if (loading) return <div className="text-surface-400">Loading league...</div>
  if (error || !league) return <div className="text-red-500">{error || 'League not found'}</div>

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...editDraftOrder]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= newOrder.length) return
    
    const [removed] = newOrder.splice(index, 1)
    newOrder.splice(newIndex, 0, removed)
    setEditDraftOrder(newOrder)
  }

  const handleSaveCoreSettings = async () => {
    try {
      setSaveLoading(true)
      const updated = await leagueService.updateLeague(league!.id, editSettings)
      
      const currentTeams = await leagueService.getLeagueTeams(league!.id);
      if (currentTeams.length > editSettings.max_teams) {
         let toRemove = currentTeams.length - editSettings.max_teams;
         const placeholders = [...currentTeams]
           .filter(t => !t.user_id)
           .reverse();
         
         for (const p of placeholders) {
           if (toRemove <= 0) break;
           await leagueService.deleteTeam(p.id);
           toRemove--;
         }
      }

      const [t, m] = await Promise.all([
        leagueService.getLeagueTeams(id!),
        leagueService.getLeagueMembers(id!)
      ])

      setLeague(updated)
      setTeams(t)
      setMembers(m)
      alert('Core settings saved successfully!')
    } catch (err: any) {
      alert('Failed to save core settings: ' + err.message)
    } finally {
      setSaveLoading(false)
    }
  }

  const handleSaveTeamNames = async () => {
    try {
      setSaveLoading(true)
      const currentTeams = await leagueService.getLeagueTeams(league!.id);
      const validTeamIds = currentTeams.map(t => t.id);

      const namePromises = Object.entries(editTeamNames).map(([teamId, name]) => {
         if (!validTeamIds.includes(teamId)) return null;
         const original = currentTeams.find(t => t.id === teamId)
         if (original && original.team_name !== name) {
           return leagueService.updateTeamName(teamId, name)
         }
         return null
      }).filter(Boolean)
      
      await Promise.all(namePromises)
      
      const t = await leagueService.getLeagueTeams(id!)
      setTeams(t)
      alert('Team names updated successfully!')
    } catch (err: any) {
      alert('Failed to save team names: ' + err.message)
    } finally {
      setSaveLoading(false)
    }
  }

  const handleSaveDraftOrder = async () => {
    try {
      setSaveLoading(true)
      const currentTeams = await leagueService.getLeagueTeams(league!.id);
      const validTeamIds = currentTeams.map(t => t.id);
      
      const finalOrder = editDraftOrder.filter(tid => validTeamIds.includes(tid));
      const missingIds = validTeamIds.filter(tid => !finalOrder.includes(tid));
      
      await draftService.updateDraftOrder(league!.id, [...finalOrder, ...missingIds], selectedTournamentId)
      
      // Refresh draft state
      const draft = await draftService.getDraftByTournament(league!.id, selectedTournamentId)
      if (draft) {
        setCurrentDraftId(draft.id)
        setIsDraftLocked(!!draft.is_locked)
      }
      
      alert('Draft order saved successfully!')
    } catch (err: any) {
      alert('Failed to save draft order: ' + err.message)
    } finally {
      setSaveLoading(false)
    }
  }

  const handleSaveSettings = async () => {
     // Legacy wrapper or remove if not needed. Let's keep it for "Save All" if we want, 
     // but the user wants independent. I'll remove it from the UI.
  }

  const handleDeleteTeam = async (teamId: string) => {
    const team = teams.find(t => t.id === teamId)
    if (!team) return

    if (team.user_id === user?.id) {
       alert("You cannot delete the commissioner's team (your own team).")
       return
    }

    if (!confirm(`Are you sure you want to delete ${team.team_name}? This action cannot be undone.`)) return

    try {
      setLoading(true)
      await leagueService.deleteTeam(teamId)
      
      // Update max_teams locally
      setEditSettings(prev => ({ ...prev, max_teams: Math.max(2, prev.max_teams - 1) }))
      
      // Filter out of draft order
      setEditDraftOrder(prev => prev.filter(t => t !== teamId))
      
      // Update our lists
      const [t, m] = await Promise.all([
        leagueService.getLeagueTeams(league!.id),
        leagueService.getLeagueMembers(league!.id)
      ])
      setTeams(t)
      setMembers(m)

      const names: Record<string, string> = {}
      t.forEach(teamData => names[teamData.id] = editTeamNames[teamData.id] || teamData.team_name)
      setEditTeamNames(names)
    } catch (err: any) {
      alert("Failed to delete team: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteLeague = async () => {
    if (!league) return
    
    const confirmName = prompt(`⚠️ WARNING: This will permanently delete the league "${league.name}", all teams, rosters, and draft data. This action CANNOT be undone.\n\nPlease type the league name to confirm:`)
    
    if (confirmName !== league.name) {
      if (confirmName !== null) alert("Confirmation failed. League name did not match.")
      return
    }

    try {
      setLoading(true)
      await leagueService.deleteLeague(league.id)
      navigate('/')
    } catch (err: any) {
      alert("Failed to delete league: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  const startRandomizing = () => {
    setIsRandomizing(true);
    setRandomizedOrder([]);
    setRemainingTeams(teams.map(t => t.id));
    setWheelItems(teams.map(t => editTeamNames[t.id] || t.team_name));
  };

  const spinWheel = () => {
    if (wheelSpinning || remainingTeams.length === 0) return;
    setWheelSpinning(true);
  };

  const onWheelPick = (pickedTeamName: string) => {
    setWheelSpinning(false);
    
    // Find the team ID by name
    const pickedTeamId = teams.find(t => (editTeamNames[t.id] || t.team_name) === pickedTeamName)?.id;
    if (!pickedTeamId) return;

    const newRandomizedOrder = [...randomizedOrder, pickedTeamId];
    setRandomizedOrder(newRandomizedOrder);
    
    const newRemaining = remainingTeams.filter(id => id !== pickedTeamId);
    setRemainingTeams(newRemaining);
    
    // Update wheel items for next spin
    setWheelItems(newRemaining.map(id => editTeamNames[id] || teams.find(t => t.id === id)?.team_name || ''));
  };

  const handleSetRandomizedOrder = () => {
    if (randomizedOrder.length !== teams.length) return;
    setEditDraftOrder(randomizedOrder);
    setIsRandomizing(false);
  };

  const handleToggleDraftLock = async () => {
    if (!currentDraftId) return;
    try {
      const newLocked = !isDraftLocked;
      await draftService.lockDraftOrder(currentDraftId, newLocked);
      setIsDraftLocked(newLocked);
    } catch (err: any) {
      alert('Failed to update draft lock: ' + err.message);
    }
  };

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'league', label: 'League', icon: '🏆' },
    { id: 'roster', label: 'Roster', icon: '👤' },
    { id: 'leaderboard', label: 'Leaderboard', icon: '📊' },
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
        </div>

        {/* Sub-Navigation Bar */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 p-2 bg-surface-900/50 border border-surface-700/50 rounded-xl">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 whitespace-nowrap
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

                    // Sort by score (lowest is best in round scoring)
                    const sorted = displayTeams.sort((a: any, b: any) => {
                      const aScore = seasonStandings[a.id]?.total ?? 9999;
                      const bScore = seasonStandings[b.id]?.total ?? 9999;
                      return aScore - bScore;
                    });

                    return sorted.map((team: any, index) => {
                      const member = members.find(m => m.user_id === team.user_id)
                      const isPlaceholder = !team.user_id;
                      const standing = seasonStandings[team.id];
                      const hasScore = standing && (standing.total !== 0 || standing.tournaments_played > 0);

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
                              <div className="text-[10px] text-surface-500 flex items-center gap-1.5">
                                {isPlaceholder ? 'Waiting...' : (
                                  <>
                                    <span>{member?.profiles?.display_name || 'Owner'}</span>
                                    {standing && standing.tournaments_played > 0 && (
                                      <>
                                        <span className="w-1 h-1 rounded-full bg-surface-700" />
                                        <span>{standing.tournaments_played} {standing.tournaments_played === 1 ? 'tourney' : 'tourneys'}</span>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-lg font-black font-display leading-none ${hasScore ? scoreColor(standing.total) : 'text-surface-600'}`}>
                              {hasScore ? formatScore(standing.total) : 'E'}
                            </div>
                            <div className="text-[8px] text-surface-500 uppercase tracking-widest font-bold">Total</div>
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
                          ? 'Wait for the commissioner to open the draft room.' 
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
                        {startingDraft ? 'Initializing...' : 'Enter Draft'}
                      </button>
                    )}
                    {league.draft_status === 'active' && (
                      <button
                        onClick={() => navigate(`/drafts/${league.id}`)}
                        className="w-full md:w-64 bg-primary-600 hover:bg-primary-500 text-surface-900 font-black py-3 rounded-xl transition-all shadow-glow/20 text-base uppercase tracking-wider"
                      >
                        Enter Draft
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

        {activeTab === 'leaderboard' && (
          <LeaderboardTab 
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
             </div>

             <div className="space-y-6 animate-fade-in">
                 <div className="flex border-b border-surface-700/50 gap-4 overflow-x-auto no-scrollbar">
                   {(['core', 'scoring', 'draft', 'teams'] as const).map(tab => (
                     <button
                       key={tab}
                       onClick={(e) => { e.preventDefault(); setSettingsTab(tab); }}
                       className={`pb-2 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${
                         settingsTab === tab ? 'border-primary-500 text-primary-400' : 'border-transparent text-surface-500 hover:text-surface-300'
                       }`}
                     >
                       {tab === 'core' ? 'Core Info' : tab === 'scoring' ? 'Scoring' : tab === 'draft' ? 'Draft Order' : 'Teams'}
                     </button>
                   ))}
                 </div>
                 
                 <div className="min-h-[300px]">
                   {settingsTab === 'core' && (
                     <div className="space-y-6 max-w-xl">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black text-surface-500 uppercase tracking-widest">Core Info</h3>
                        
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
                                alert('Invite code copied to clipboard!')
                              }}
                              title="Copy to clipboard"
                            >
                              📋
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div>
                        <label className="block text-surface-400 text-xs font-bold uppercase tracking-wider mb-2">League Name</label>
                        <input 
                          type="text" 
                          value={editSettings.name}
                          onChange={e => setEditSettings({...editSettings, name: e.target.value})}
                          disabled={!isCommish}
                          className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-surface-100 focus:ring-2 focus:ring-primary-500/50 outline-none transition-all disabled:opacity-50"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-surface-400 text-[10px] font-bold uppercase tracking-wider mb-2">Max Teams</label>
                          <input 
                            type="number" 
                            value={editSettings.max_teams}
                            onChange={e => setEditSettings({...editSettings, max_teams: parseInt(e.target.value) || 12})}
                            disabled={!isCommish}
                            className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-surface-100 disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-surface-400 text-[10px] font-bold uppercase tracking-wider mb-2">Roster Size</label>
                          <input 
                            type="number" 
                            value={editSettings.roster_size}
                            onChange={e => setEditSettings({...editSettings, roster_size: parseInt(e.target.value) || 10})}
                            disabled={!isCommish}
                            className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-surface-100 disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-surface-400 text-[10px] font-bold uppercase tracking-wider mb-2">Starters</label>
                          <input 
                            type="number" 
                            value={editSettings.weekly_starters}
                            onChange={e => setEditSettings({...editSettings, weekly_starters: parseInt(e.target.value) || 6})}
                            disabled={!isCommish}
                            className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-surface-100 disabled:opacity-50"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-surface-400 text-xs font-bold uppercase tracking-wider mb-2">Waiver Rule</label>
                        <select 
                          value={editSettings.waiver_rule}
                          onChange={e => setEditSettings({...editSettings, waiver_rule: e.target.value})}
                          disabled={!isCommish}
                          className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-surface-100 focus:ring-2 focus:ring-primary-500/50 outline-none transition-all disabled:opacity-50"
                        >
                          <option value="Free Agency">Free Agency (Immediate)</option>
                          <option value="Weekly Waivers">Weekly Waivers</option>
                          <option value="Waiver Wire">Waiver Wire (Rolling)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-surface-400 text-xs font-bold uppercase tracking-wider mb-2">Draft Cycle</label>
                        <select 
                          value={editSettings.draft_cycle}
                          onChange={e => setEditSettings({...editSettings, draft_cycle: (e.target.value as 'season'|'tournament')})}
                          disabled={!isCommish}
                          className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-surface-100 focus:ring-2 focus:ring-primary-500/50 outline-none transition-all disabled:opacity-50"
                        >
                          <option value="season">Season Long</option>
                          <option value="tournament">Per Tournament</option>
                        </select>
                      </div>

                      {isCommish && (
                        <div className="pt-4">
                          <button 
                            onClick={handleSaveCoreSettings}
                            disabled={saveLoading}
                            className="w-full bg-primary-600 hover:bg-primary-500 text-surface-900 font-black py-3 rounded-xl transition-all shadow-glow/20 disabled:opacity-50 uppercase tracking-widest text-sm"
                          >
                            {saveLoading ? 'Saving...' : 'Save Core Info'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                   )}

                   {settingsTab === 'scoring' && (
                     <div className="space-y-6 max-w-2xl">
                       <h3 className="text-sm font-black text-surface-500 uppercase tracking-widest mb-4">Scoring Options</h3>

                       {/* Option 1: Round Scoring (Active) */}
                       <div className="bg-surface-900/50 rounded-xl border-2 border-primary-500/30 overflow-hidden">
                         <div className="p-4 bg-primary-900/20 border-b border-primary-500/20 flex items-center justify-between">
                           <div className="flex items-center gap-3">
                             <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-surface-900 font-black text-sm">1</div>
                             <div>
                               <h4 className="font-bold text-surface-100">Round Scoring</h4>
                               <p className="text-[10px] text-surface-400 uppercase tracking-wider">Total strokes +/- par per round</p>
                             </div>
                           </div>
                           <span className="px-3 py-1 bg-primary-600 text-surface-900 text-[9px] font-black uppercase tracking-widest rounded-lg shadow-glow/10">Active</span>
                         </div>
                         <div className="p-5 space-y-4">
                           <div>
                             <div className="text-xs font-black text-surface-400 uppercase tracking-widest mb-2">Example Scoring</div>
                             <div className="grid grid-cols-5 gap-2 text-center">
                               {[
                                 { label: 'R1', value: '-3', color: 'text-green-400' },
                                 { label: 'R2', value: '-4', color: 'text-green-400' },
                                 { label: 'R3', value: '-3', color: 'text-green-400' },
                                 { label: 'R4', value: '-1', color: 'text-green-400' },
                                 { label: 'TOT', value: '-11', color: 'text-green-400 font-display' }
                               ].map(r => (
                                 <div key={r.label} className="bg-surface-800/50 border border-surface-700/30 rounded-lg py-2">
                                   <div className="text-[9px] text-surface-600 uppercase font-black">{r.label}</div>
                                   <div className={`text-sm font-bold ${r.color}`}>{r.value}</div>
                                 </div>
                               ))}
                             </div>
                           </div>

                           <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-4">
                             <div className="text-xs font-black text-red-400 uppercase tracking-widest mb-2">⚠️ Missed Cut Penalty</div>
                             <ol className="text-xs text-surface-400 space-y-1 list-decimal list-inside">
                               <li>Identify the <span className="text-surface-200 font-bold">10 worst players who made the cut</span></li>
                               <li>Calculate their <span className="text-surface-200 font-bold">average score to par</span> for R3 & R4 (rounded)</li>
                               <li>Compare to a <span className="text-surface-200 font-bold">minimum penalty of +4</span></li>
                               <li>Use whichever value is <span className="text-surface-200 font-bold">greater</span></li>
                             </ol>
                           </div>
                         </div>
                       </div>

                       {/* Option 2: Hole Scoring (Coming Soon) */}
                       <div className="bg-surface-900/50 rounded-xl border border-surface-700/50 overflow-hidden opacity-60">
                         <div className="p-4 bg-surface-900/40 border-b border-surface-700/50 flex items-center justify-between">
                           <div className="flex items-center gap-3">
                             <div className="w-8 h-8 rounded-lg bg-surface-700 flex items-center justify-center text-surface-400 font-black text-sm">2</div>
                             <div>
                               <h4 className="font-bold text-surface-300">Hole Scoring</h4>
                               <p className="text-[10px] text-surface-500 uppercase tracking-wider">Points per hole result + add-ons</p>
                             </div>
                           </div>
                           <span className="px-3 py-1 bg-surface-700 text-surface-400 text-[9px] font-black uppercase tracking-widest rounded-lg">Coming Soon</span>
                         </div>
                         <div className="p-5 space-y-4">
                           <div>
                             <div className="text-xs font-black text-surface-500 uppercase tracking-widest mb-2">Points Per Hole</div>
                             <div className="grid grid-cols-5 gap-2 text-center">
                               {[
                                 { label: 'Eagle+', value: '+7', color: 'text-green-400' },
                                 { label: 'Birdie', value: '+3', color: 'text-green-400' },
                                 { label: 'Par', value: '+0.5', color: 'text-surface-300' },
                                 { label: 'Bogey', value: '-1', color: 'text-red-400' },
                                 { label: 'Dbl+', value: '-3', color: 'text-red-400' }
                               ].map(r => (
                                 <div key={r.label} className="bg-surface-800/50 border border-surface-700/30 rounded-lg py-2">
                                   <div className="text-[9px] text-surface-600 uppercase font-black">{r.label}</div>
                                   <div className={`text-sm font-bold ${r.color}`}>{r.value}</div>
                                 </div>
                               ))}
                             </div>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                             <div className="bg-surface-800/30 border border-surface-700/30 rounded-lg p-3">
                               <div className="text-[9px] font-black text-surface-500 uppercase tracking-widest mb-2">🏅 Overall Finish Bonus</div>
                               <div className="text-[10px] text-surface-500 space-y-0.5">
                                 <div>1st: +30 • 2nd: +20 • 3rd: +18</div>
                                 <div>4th: +16 • 5th: +14 • 6-7th: +10-12</div>
                                 <div>8-10th: +6-8 • 11-40th: +1-5</div>
                               </div>
                             </div>
                             <div className="bg-surface-800/30 border border-surface-700/30 rounded-lg p-3">
                               <div className="text-[9px] font-black text-surface-500 uppercase tracking-widest mb-2">⭐ Round Bonuses</div>
                               <div className="text-[10px] text-surface-500 space-y-0.5">
                                 <div>5+ Birdies in a Round: +5pts</div>
                                 <div>No Bogeys or Worse: +5pts</div>
                               </div>
                             </div>
                           </div>
                         </div>
                       </div>
                     </div>
                   )}

                   {settingsTab === 'draft' && (
                    <div className="space-y-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-surface-900/40 border border-surface-700/50 rounded-2xl">
                        <div className="flex-1">
                          <label className="block text-surface-400 text-[10px] font-bold uppercase tracking-widest mb-1.5">Selected Tournament</label>
                          <select 
                            value={selectedTournamentId}
                            onChange={(e) => setSelectedTournamentId(e.target.value)}
                            className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-2.5 text-sm text-surface-100 font-bold outline-none cursor-pointer focus:ring-2 focus:ring-primary-500/30 transition-all"
                          >
                            {tournaments
                              .filter(t => !(league?.excluded_tournaments || []).includes(t.id))
                              .map(t => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({new Date(t.start_date).getFullYear()})
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-3">
                          {isCommish && currentDraftId && (
                            <button
                              onClick={handleToggleDraftLock}
                              className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${
                                isDraftLocked
                                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500 hover:text-surface-900'
                                  : 'bg-green-500/10 text-green-500 border-green-500/30 hover:bg-green-500 hover:text-surface-900'
                              }`}
                            >
                              {isDraftLocked ? '🔓 Unlock Draft Order' : '🔒 Lock Draft Order'}
                            </button>
                          )}
                          {isCommish && !isRandomizing && !isDraftLocked && (
                            <button 
                              onClick={startRandomizing}
                              className="bg-primary-600/10 hover:bg-primary-600 text-primary-400 hover:text-surface-900 border border-primary-500/30 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                            >
                              🎡 Randomize via Wheel
                            </button>
                          )}
                        </div>
                      </div>

                      {isRandomizing ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
                          <div className="flex flex-col items-center justify-center p-8 bg-surface-900/20 border-2 border-dashed border-surface-700/50 rounded-3xl h-full min-h-[450px]">
                            <SpinningWheel 
                              items={wheelItems} 
                              onPick={onWheelPick} 
                              isSpinning={wheelSpinning} 
                            />
                            <div className="mt-8 text-center">
                              <button
                                onClick={spinWheel}
                                disabled={wheelSpinning || remainingTeams.length === 0}
                                className="bg-primary-600 hover:bg-primary-500 text-surface-900 font-black px-10 py-4 rounded-2xl transition-all shadow-glow/20 uppercase tracking-widest disabled:opacity-50 disabled:scale-95"
                              >
                                {wheelSpinning ? 'SPINNING...' : remainingTeams.length === 0 ? 'DRAFT ORDER COMPLETE' : 'SPIN THE WHEEL!'}
                              </button>
                              <p className="mt-4 text-xs font-bold text-surface-500 uppercase tracking-widest">
                                {remainingTeams.length} Teams remaining in wheel
                              </p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-black text-surface-400 uppercase tracking-widest">Randomized Order</h4>
                              {randomizedOrder.length === teams.length && (
                                 <button 
                                  onClick={handleSetRandomizedOrder}
                                  className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/30 px-3 py-1.5 rounded-lg font-black uppercase tracking-widest hover:bg-green-500 hover:text-white transition-all shadow-glow/10"
                                 >
                                   ✓ Set Draft Order
                                 </button>
                              )}
                            </div>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto no-scrollbar pr-2">
                              {randomizedOrder.map((teamId, index) => (
                                <div key={`random-${teamId}`} className="flex items-center gap-3 p-3 bg-primary-600/5 border border-primary-500/20 rounded-xl animate-scale-in">
                                  <div className="w-8 h-8 rounded-lg bg-primary-600 text-surface-900 flex items-center justify-center text-xs font-black">
                                    {index + 1}
                                  </div>
                                  <div className="font-bold text-sm text-surface-100">
                                    {editTeamNames[teamId] || teams.find(t => t.id === teamId)?.team_name}
                                  </div>
                                </div>
                              ))}
                              {Array.from({ length: teams.length - randomizedOrder.length }).map((_, i) => (
                                <div key={`empty-${i}`} className="flex items-center gap-3 p-3 bg-surface-900/50 border border-surface-700/20 rounded-xl opacity-30">
                                  <div className="w-8 h-8 rounded-lg bg-surface-800 text-surface-500 flex items-center justify-center text-xs font-black">
                                    {randomizedOrder.length + i + 1}
                                  </div>
                                  <div className="font-bold text-sm text-surface-600 italic">Waiting for spin...</div>
                                </div>
                              ))}
                            </div>
                            <button 
                              onClick={() => { setIsRandomizing(false); setEditDraftOrder([...editDraftOrder]); }}
                              className="w-full text-[10px] text-surface-500 hover:text-red-400 font-black uppercase tracking-widest transition-colors py-2"
                            >
                              ✕ Cancel Randomization
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4 max-w-xl">
                          <h3 className="text-[10px] font-black text-surface-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <span>📋</span> Current Draft Order for {tournaments.find(tourney => tourney.id === selectedTournamentId)?.name}
                          </h3>
                          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
                            {editDraftOrder.map((teamId, index) => {
                              const team = teams.find(t => t.id === teamId)
                              if (!team) return null
                              return (
                                <div key={`draft-${teamId}`} className="flex items-center gap-3 p-3 bg-surface-900/50 border border-surface-700/50 rounded-xl group transition-all hover:border-primary-500/30">
                                    <div className="w-8 h-8 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center text-xs font-black text-surface-500 group-hover:text-primary-400 transition-colors">
                                      {index + 1}
                                    </div>
                                    <div className="flex-1">
                                      <div className={`text-sm font-bold ${team.user_id ? 'text-surface-100' : 'text-surface-400 italic'}`}>
                                        {editTeamNames[teamId] || team.team_name}
                                      </div>
                                    </div>
                                    {isCommish && (
                                      <div className="flex items-center gap-2">
                                        <div className="flex flex-col gap-1">
                                          <button 
                                            onClick={() => moveItem(index, 'up')}
                                            disabled={index === 0 || isDraftLocked}
                                            className="w-8 h-6 bg-surface-800 rounded border border-surface-700 flex items-center justify-center text-xs hover:text-primary-400 disabled:opacity-20"
                                          >
                                            ▲
                                          </button>
                                          <button 
                                            onClick={() => moveItem(index, 'down')}
                                            disabled={index === editDraftOrder.length - 1 || isDraftLocked}
                                            className="w-8 h-6 bg-surface-800 rounded border border-surface-700 flex items-center justify-center text-xs hover:text-primary-400 disabled:opacity-20"
                                          >
                                            ▼
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                </div>
                              )
                            })}
                          </div>
                          
                          {isCommish && !isDraftLocked && (
                            <div className="pt-4">
                              <button 
                                onClick={handleSaveDraftOrder}
                                disabled={saveLoading}
                                className="w-full bg-primary-600 hover:bg-primary-500 text-surface-900 font-black py-3 rounded-xl transition-all shadow-glow/20 disabled:opacity-50 uppercase tracking-widest text-sm"
                              >
                                {saveLoading ? 'Saving...' : 'Save Draft Order'}
                              </button>
                            </div>
                          )}
                    </div>
                      )}
                    </div>
                   )}

                   {settingsTab === 'teams' && (
                    <div className="space-y-4 max-w-xl">
                      <h3 className="text-sm font-black text-surface-500 uppercase tracking-widest mb-4">Teams & Owners</h3>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
                         {editDraftOrder.map((teamId, index) => {
                           const team = teams.find(t => t.id === teamId)
                           if (!team) return null
                           return (
                             <div key={`team-${teamId}`} className="flex items-center gap-3 p-3 bg-surface-900/50 border border-surface-700/50 rounded-xl group transition-all hover:border-primary-500/30">
                              <div className="w-8 h-8 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center text-xs font-black text-surface-500 group-hover:text-primary-400 transition-colors">
                                {index + 1}
                              </div>
                              <div className="flex-1 space-y-1">
                                <input 
                                  type="text" 
                                  value={editTeamNames[teamId] || ''}
                                  onChange={e => setEditTeamNames({...editTeamNames, [teamId]: e.target.value})}
                                  disabled={!isCommish}
                                  placeholder={isCommish ? "Enter Team Name..." : "Team Name"}
                                  className="w-full bg-transparent border-none p-0 text-sm font-bold text-surface-100 placeholder:text-surface-700 focus:ring-0 disabled:opacity-75 disabled:cursor-default"
                                />
                                <div className="text-[10px] flex items-center gap-2 mt-1">
                                   <span className={`uppercase font-bold tracking-tighter ${team.user_id ? 'text-green-500' : 'text-orange-500'}`}>
                                     {team.user_id ? '✓ Real Member' : '⚡ Orphan/Placeholder'}
                                   </span>
                                   {isCommish && team.user_id && team.user_id !== user?.id && (
                                     <button
                                       onClick={async (e) => {
                                         e.preventDefault();
                                         if (confirm(`Remove the owner from this team? It will become an orphaned team.`)) {
                                           await leagueService.removeTeamOwner(teamId);
                                           // Refresh local teams
                                           const updatedTeams = await leagueService.getLeagueTeams(league!.id);
                                           setTeams(updatedTeams);
                                         }
                                       }}
                                       className="text-[9px] uppercase tracking-widest bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded hover:bg-orange-500 hover:text-white transition-colors"
                                     >
                                       Remove Owner
                                     </button>
                                   )}
                                   {isCommish && !team.user_id && (
                                     <div className="flex items-center gap-2">
                                       <select 
                                         className="bg-surface-800 border border-surface-700 text-[10px] text-surface-200 rounded px-1 py-0.5 outline-none focus:border-primary-500"
                                         onChange={async (e) => {
                                           const userId = e.target.value;
                                           if (!userId) return;
                                           try {
                                             await leagueService.assignTeamOwner(teamId, userId);
                                             const updatedTeams = await leagueService.getLeagueTeams(league!.id);
                                             setTeams(updatedTeams);
                                           } catch (err: any) {
                                             alert('Failed to assign owner: ' + err.message);
                                           }
                                         }}
                                         value=""
                                       >
                                         <option value="">Assign Member...</option>
                                         {members
                                           .filter(m => !teams.some(t => t.user_id === m.user_id))
                                           .map(m => (
                                             <option key={m.user_id} value={m.user_id}>
                                               {m.profiles?.display_name || 'Unknown User'}
                                             </option>
                                           ))
                                         }
                                       </select>
                                     </div>
                                   )}
                                </div>
                              </div>
                              {isCommish && (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => { e.preventDefault(); handleDeleteTeam(teamId); }}
                                    className="w-10 h-10 bg-red-500/10 rounded border border-red-500/20 flex items-center justify-center text-sm text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                                    title="Delete Team"
                                  >
                                    ✖
                                  </button>
                                </div>
                              )}
                           </div>
                         )
                       })}
                      </div>
                    </div>
                   )}
                 </div>

                 {isCommish && (
                   <div className="flex flex-col md:flex-row gap-4 pt-8 border-t border-surface-700/50">
                     <button 
                      onClick={handleSaveSettings} 
                      className="flex-[2] bg-primary-600 hover:bg-primary-500 text-surface-900 font-black py-4 rounded-xl transition-all shadow-glow/20 uppercase tracking-wider"
                     >
                       🚀 Save All Changes
                     </button>
                     <button 
                      onClick={handleDeleteLeague} 
                      className="flex-1 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 font-bold py-4 rounded-xl transition-all uppercase tracking-wider"
                     >
                       🗑️ Delete League
                     </button>
                   </div>
                 )}
               </div>
          </div>
        )}
      </div>
    </div>
  )
}
