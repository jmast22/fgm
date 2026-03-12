import { useEffect, useState } from 'react'
import { tournamentService } from '../../services/tournamentService'
import { rosterService } from '../../services/rosterService'
import type { Tournament } from '../../services/tournamentService'
import type { League } from '../../services/leagueService'

interface ScheduleTabProps {
  league: League;
}

export default function ScheduleTab({ league }: ScheduleTabProps) {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [tournamentWinners, setTournamentWinners] = useState<Record<string, string>>({})

  useEffect(() => {
    async function loadSchedule() {
      try {
        const data = await tournamentService.getTournaments()
        setTournaments(data)
        
        // Parallel fetch winners for completed/active tournaments
        const winnerMap: Record<string, string> = {}
        const winnerPromises = data.map(async (t) => {
          if (t.status === 'completed' || t.status === 'active') {
            const points = await rosterService.getTournamentPoints(league.id, t.id)
            if (points.length > 0 && points[0].points > 0) {
              winnerMap[t.id] = points[0].team_name
            }
          }
        })
        
        await Promise.all(winnerPromises)
        setTournamentWinners(winnerMap)
      } catch (err) {
        console.error('Failed to load schedule:', err)
      } finally {
        setLoading(false)
      }
    }
    loadSchedule()
  }, [league.id])

  if (loading) return <div className="p-12 text-center text-surface-400">Loading schedule...</div>

  return (
    <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl overflow-hidden shadow-lg">
      <div className="p-5 border-b border-surface-700/50 flex items-center justify-between bg-surface-800/20">
        <h2 className="font-display font-bold text-xl text-surface-100 flex items-center gap-3">
          <span className="text-primary-400">📅</span> Tournament Schedule
        </h2>
      </div>

      <div className="divide-y divide-surface-700/50">
        {tournaments.map((t) => {
          const winner = tournamentWinners[t.id]
          
          return (
            <div key={t.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between hover:bg-surface-800/50 transition-colors group gap-4">
              <div className="flex items-center gap-5">
                <div className={`w-12 h-12 rounded-xl border flex flex-col items-center justify-center font-display leading-none transition-all
                  ${t.status === 'active' 
                    ? 'bg-primary-600/20 border-primary-500/30 text-primary-400' 
                    : t.status === 'completed'
                    ? 'bg-surface-900 border-surface-700 text-surface-500'
                    : 'bg-surface-900 border-surface-700 text-surface-300'}
                `}>
                  <span className="text-[10px] uppercase font-black tracking-widest mb-1">
                    {new Date(t.start_date).toLocaleString('default', { month: 'short' })}
                  </span>
                  <span className="text-lg font-bold">
                    {new Date(t.start_date).getDate()}
                  </span>
                </div>
                <div>
                  <div className="font-bold text-lg text-surface-100 group-hover:text-primary-400 transition-colors">
                    {t.name}
                  </div>
                  <div className="text-sm text-surface-500 flex items-center gap-2 mt-0.5">
                    <span>{t.course_name}</span>
                    <span className="w-1 h-1 rounded-full bg-surface-700" />
                    <span>{t.city}, {t.state}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8 md:text-right">
                <div className="hidden sm:block">
                  <div className="text-[10px] text-surface-500 uppercase tracking-widest font-bold mb-1">Status</div>
                  <div className={`text-xs font-black uppercase tracking-tighter px-2 py-1 rounded border
                    ${t.status === 'active' ? 'bg-primary-500/10 border-primary-500/20 text-primary-400' : 
                      t.status === 'completed' ? 'bg-surface-900 border-surface-700 text-surface-500' :
                      'bg-surface-700/30 border-surface-700 text-surface-400'}
                  `}>
                    {t.status === 'active' ? 'In Progress' : t.status === 'completed' ? 'Finished' : 'Upcoming'}
                  </div>
                </div>
                
                <div className="min-w-[120px]">
                  <div className="text-[10px] text-surface-500 uppercase tracking-widest font-bold mb-1">Weekly Winner</div>
                  <div className="font-display font-bold text-surface-50">
                    {winner ? (
                      <span className="text-primary-400">🏆 {winner}</span>
                    ) : (
                      <span className="text-surface-600 italic">
                        {t.status === 'upcoming' ? 'Upcoming' : 'In Progress'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
