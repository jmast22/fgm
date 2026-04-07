import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { leagueService, type League } from '../services/leagueService'
import { tournamentService, type Tournament } from '../services/tournamentService'
import { scoringService, formatScore, scoreColor } from '../services/scoringService'
import { supabase } from '../lib/supabase'
import { Skeleton } from '../components/common/Skeleton'

interface LeagueSummary extends League {
  myRank: number;
  myScore: number;
  totalTeams: number;
  myTeamName: string;
}

export default function Dashboard() {
  const { user } = useAuth()
  const [leagues, setLeagues] = useState<LeagueSummary[]>([])
  const [upcomingTournament, setUpcomingTournament] = useState<Tournament | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeGolfersCount, setActiveGolfersCount] = useState(0)

  useEffect(() => {
    if (!user) return

    async function loadDashboardData() {
      setLoading(true)
      try {
        // 1. Fetch User's Leagues
        const userLeagues = await leagueService.getUserLeagues(user!.id)
        
        // 2. Fetch Detailed Info for each League
        const summaries = await Promise.all(userLeagues.map(async (league) => {
          try {
            const [standings, teams] = await Promise.all([
              scoringService.getSeasonStandings(league.id, league.excluded_tournaments),
              leagueService.getLeagueTeams(league.id)
            ])

            const myTeam = teams.find(t => t.user_id === user!.id)
            const myStanding = standings.find(s => s.team_id === myTeam?.id)
            const myRank = standings.findIndex(s => s.team_id === myTeam?.id) + 1

            return {
              ...league,
              myRank: myRank || 0,
              myScore: myStanding?.total || 0,
              totalTeams: teams.length,
              myTeamName: myTeam?.team_name || 'My Team'
            }
          } catch (e) {
            console.error(`Error loading league ${league.id} summary:`, e)
            return {
              ...league,
              myRank: 0,
              myScore: 0,
              totalTeams: 0,
              myTeamName: 'My Team'
            }
          }
        }))
        setLeagues(summaries)

        // 3. Fetch Upcoming Tournament
        const upcoming = await tournamentService.getUpcomingTournaments()
        if (upcoming.length > 0) {
          setUpcomingTournament(upcoming[0])
        }

        // 4. Fetch Active Golfers across all user's teams for current tournament
        const activeTourney = upcoming.find(t => t.status === 'active') || upcoming[0]
        if (activeTourney) {
           const { data: teamIds } = await supabase
             .from('teams')
             .select('id')
             .eq('user_id', user!.id)
           
           if (teamIds && teamIds.length > 0) {
             const ids = teamIds.map(t => t.id)
             const { count } = await supabase
               .from('team_rosters')
               .select('*', { count: 'exact', head: true })
               .in('team_id', ids)
               .eq('tournament_id', activeTourney.id)
             
             setActiveGolfersCount(count || 0)
           }
        }
      } catch (error) {
        console.error('Error loading dashboard:', error)
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [user])

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    })
  }

  if (loading) {
    return (
      <div className="space-y-8 p-4 md:p-0">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <div className="grid lg:grid-cols-3 gap-8">
           <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-6 w-32" />
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
           </div>
           <div className="space-y-8">
              <div className="space-y-4">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-64 w-full" />
              </div>
           </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 p-4 md:p-0">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 text-surface-100">
        <div>
          <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-surface-50 to-surface-400 bg-clip-text text-transparent">
            Welcome back, {user?.email?.split('@')[0]}
          </h1>
          <p className="text-surface-400 text-sm mt-1">
            {leagues.length > 0 
              ? `You're competing in ${leagues.length} active league${leagues.length > 1 ? 's' : ''}`
              : 'Join a league to start your season'
            }
          </p>
        </div>
        <div className="md:flex gap-3 grid grid-cols-2">
          <Link to="/leagues/join" className="px-4 py-2 bg-surface-800 border border-surface-700 rounded-xl text-center text-sm font-bold text-surface-200 hover:bg-surface-700 transition-all">
            Join League
          </Link>
          <Link to="/leagues/create" className="px-4 py-2 bg-primary-600 text-surface-950 rounded-xl text-center text-sm font-black uppercase tracking-wider hover:bg-primary-500 shadow-glow/10 transition-all">
            Create League
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Active Leagues" 
          value={leagues.length} 
          icon="🏆" 
          trend={leagues.length > 0 ? "Season High" : undefined}
        />
        <StatCard 
          label="Total Score" 
          value={formatScore(leagues.reduce((acc, l) => acc + l.myScore, 0))} 
          icon="⭐" 
          color={leagues.reduce((acc, l) => acc + l.myScore, 0) <= 0 ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard 
          label="Lineups Set" 
          value={`${activeGolfersCount}`} 
          icon="⛳" 
          trend="Current Week"
        />
        <StatCard 
          label="Best Rank" 
          value={leagues.length > 0 ? `#${Math.min(...leagues.map(l => l.myRank > 0 ? l.myRank : 999))}` : '—'} 
          icon="📊" 
          color="text-primary-400"
        />
      </div>

      {/* Main Content Sections */}
      <div className="grid lg:grid-cols-3 gap-8">
        
        {/* Leagues Detail List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-xl text-surface-100">Your Leagues</h2>
            <Link to="/leagues" className="text-xs font-bold text-primary-400 hover:underline px-2">View All</Link>
          </div>
          
          <div className="grid gap-4">
            {leagues.length > 0 ? leagues.map((league) => (
              <Link 
                key={league.id} 
                to={`/leagues/${league.id}`}
                className="group relative bg-surface-800/40 border border-surface-700/50 rounded-2xl p-5 hover:border-primary-500/30 transition-all duration-300 hover:shadow-glow/5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-surface-900 border border-surface-700 flex items-center justify-center text-xl shadow-inner group-hover:border-primary-500/20 transition-colors">
                      🏌️
                    </div>
                    <div>
                      <h3 className="font-bold text-surface-100 text-lg group-hover:text-primary-400 transition-colors">{league.name}</h3>
                      <p className="text-surface-500 text-xs font-medium uppercase tracking-widest leading-none mt-1">{league.myTeamName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black font-display text-surface-50 leading-none">
                      <span className={scoreColor(league.myScore)}>{formatScore(league.myScore)}</span>
                    </div>
                    <div className="text-[10px] font-black text-surface-500 uppercase tracking-widest mt-2">
                      Rank {league.myRank > 0 ? `#${league.myRank}` : '—'} <span className="mx-1 opacity-20">/</span> {league.totalTeams}
                    </div>
                  </div>
                </div>
                
                {league.totalTeams > 0 && league.myRank > 0 && (
                  <div className="mt-4 h-1 w-full bg-surface-950 rounded-full overflow-hidden border border-surface-700/30">
                    <div 
                      className="h-full bg-primary-600 shadow-glow transition-all duration-1000" 
                      style={{ width: `${Math.max(5, 100 - (league.myRank - 1) * (100 / league.totalTeams))}%` }} 
                    />
                  </div>
                )}
              </Link>
            )) : (
              <div className="bg-surface-800/20 border border-dashed border-surface-700/50 rounded-2xl p-12 text-center text-surface-100">
                <p className="text-surface-500 mb-6 italic">No active leagues joined yet.</p>
                <Link to="/leagues/join" className="inline-block bg-primary-600/10 text-primary-400 px-6 py-2 rounded-xl text-sm font-bold border border-primary-500/20 hover:bg-primary-600 hover:text-surface-950 transition-all">
                  Join a League
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: Upcoming & Actions */}
        <div className="space-y-8">
          {/* Upcoming Tournament Card */}
          <div className="space-y-4">
            <h2 className="font-display font-bold text-xl text-surface-100">This Week</h2>
            {upcomingTournament ? (
              <div className="bg-gradient-to-br from-surface-800 to-surface-900 border border-primary-500/20 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-primary-500/10 transition-colors" />
                
                <div className="relative z-10 space-y-6">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest border ${
                      upcomingTournament.status === 'active' 
                        ? 'bg-red-500/10 border-red-500/20 text-red-400 animate-pulse' 
                        : 'bg-primary-500/10 border-primary-500/20 text-primary-400'
                    }`}>
                      {upcomingTournament.status === 'active' ? '● LIVE' : 'UPCOMING'}
                    </span>
                    <span className="text-surface-500 text-xs font-bold font-mono">
                      {formatDate(upcomingTournament.start_date)} — {formatDate(upcomingTournament.end_date)}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-surface-100 leading-tight group-hover:text-primary-400 transition-colors">
                      {upcomingTournament.name}
                    </h3>
                    <p className="text-surface-400 text-sm mt-1 font-medium">{upcomingTournament.course_name}</p>
                  </div>

                  <div className="flex gap-2">
                    <div className="bg-surface-700/30 px-3 py-1.5 rounded-xl border border-surface-700/30 text-[10px] font-bold text-surface-300">
                      📍 {upcomingTournament.city}, {upcomingTournament.state || upcomingTournament.country}
                    </div>
                  </div>

                </div>
              </div>
            ) : (
              <div className="bg-surface-800/40 border border-surface-700/50 rounded-2xl p-8 text-center text-surface-500 text-sm">
                No upcoming tournaments found.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

function StatCard({ label, value, icon, trend, color = 'text-surface-100' }: { label: string, value: string | number, icon: string, trend?: string, color?: string }) {
  return (
    <div className="bg-surface-800/40 border border-surface-700/40 rounded-2xl p-5 hover:border-primary-500/30 transition-all duration-300 hover:shadow-glow/10 group">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg opacity-80 group-hover:scale-110 transition-transform">{icon}</span>
        <span className="text-[10px] text-surface-500 font-black uppercase tracking-widest">
          {label}
        </span>
      </div>
      <div className="flex items-end justify-between">
        <p className={`text-3xl font-black font-display tracking-tight ${color} leading-none`}>
          {value}
        </p>
        {trend && (
          <span className="text-[9px] font-black text-primary-500/60 uppercase tracking-tighter mb-0.5">
            {trend}
          </span>
        )}
      </div>
    </div>
  )
}
