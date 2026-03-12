import { useEffect, useState } from 'react'
import { leagueService } from '../../services/leagueService'

interface LeagueActivityProps {
  leagueId: string;
}

export default function LeagueActivity({ leagueId }: LeagueActivityProps) {
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadActivity() {
      try {
        const data = await leagueService.getLeagueActivity(leagueId)
        setActivities(data)
      } catch (err) {
        console.error('Failed to load activity:', err)
      } finally {
        setLoading(false)
      }
    }
    loadActivity()
  }, [leagueId])

  if (loading) return <div className="p-8 text-center text-surface-500 text-xs">Loading activity...</div>

  return (
    <div className="bg-surface-800/40 border border-surface-700/50 rounded-xl overflow-hidden shadow-lg h-full flex flex-col">
      <div className="p-4 border-b border-surface-700/50 bg-surface-900/20 flex items-center justify-between">
        <h3 className="text-xs font-black text-surface-300 uppercase tracking-widest">Recent Activity</h3>
        <span className="text-[10px] text-surface-500 font-bold uppercase tracking-tighter">Transactions</span>
      </div>
      
      <div className="divide-y divide-surface-700/50 overflow-y-auto flex-1 no-scrollbar">
        {activities.length === 0 ? (
          <div className="p-12 text-center text-surface-600 italic text-sm">No recent league activity.</div>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="p-4 hover:bg-surface-800/30 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  {activity.type === 'pickup' ? (
                    <div className="text-sm">
                      <span className="font-bold text-primary-400">{activity.team_name}</span>
                      <span className="text-surface-400 mx-1.5">picked up</span>
                      <span className="font-bold text-surface-100">{activity.golfer_name}</span>
                    </div>
                  ) : activity.type === 'trade' ? (
                    <div className="text-sm">
                      <span className="font-bold text-primary-400">{activity.offering_team}</span>
                      <span className="text-surface-400 mx-1.5">and</span>
                      <span className="font-bold text-primary-400">{activity.receiving_team}</span>
                      <span className="text-surface-400 mx-1.5">completed a trade</span>
                    </div>
                  ) : (
                    <div className="text-sm">
                      <span className="font-bold text-primary-400">{activity.team_name}</span>
                      <span className="text-surface-400 mx-1.5">added</span>
                      <span className="font-bold text-surface-100">{activity.golfer_name}</span>
                      <span className="text-surface-400 mx-1.5">to the trade block</span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-tighter border ${
                      activity.type === 'pickup' 
                        ? 'bg-green-500/5 border-green-500/10 text-green-500' 
                        : activity.type === 'trade'
                          ? 'bg-primary-500/5 border-primary-500/10 text-primary-400'
                          : 'bg-orange-500/5 border-orange-500/10 text-orange-400'
                    }`}>
                      {activity.type === 'pickup' ? activity.method : activity.type === 'trade' ? 'Trade' : 'Block'}
                    </span>
                    <span className="text-[10px] text-surface-600 font-medium">
                      {new Date(activity.date).toLocaleDateString()}
                    </span>
                  </div>

                  {activity.type === 'trade' && (
                    <div className="mt-2 text-[10px] text-surface-500 bg-surface-900/30 p-2 rounded border border-surface-700/20">
                      <div className="flex gap-2">
                         <span className="text-surface-600">Swap:</span>
                         <span>{activity.offered.join(', ')} ↔ {activity.requested.join(', ')}</span>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="text-xl opacity-20 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
                  {activity.type === 'pickup' ? '➕' : activity.type === 'trade' ? '↔️' : '📦'}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
