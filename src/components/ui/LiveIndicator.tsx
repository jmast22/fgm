import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../../lib/supabase'

interface LiveIndicatorProps {
  tournamentId: string
  status: string
}

export default function LiveIndicator({ tournamentId, status }: LiveIndicatorProps) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isLive, setIsLive] = useState(false)
  const [, setNow] = useState(new Date())

  // Force re-render every 30 seconds so "updated 5 mins ago" text changes automatically
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!tournamentId) return

    // Initialize with the most recent timestamp in the DB
    async function fetchLastUpdate() {
      const { data } = await supabase
        .from('golfer_round_stats')
        .select('updated_at')
        .eq('tournament_id', tournamentId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      
      if (data?.updated_at) {
        setLastUpdated(new Date(data.updated_at))
      }
    }
    fetchLastUpdate()

    // Listen for any new scores pushed by the Edge Function
    const channelName = `live-indicator-${tournamentId}-${Math.random().toString(36).substring(7)}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'golfer_round_stats', filter: `tournament_id=eq.${tournamentId}` },
        (payload) => {
          if (payload.new && 'updated_at' in payload.new) {
             setLastUpdated(new Date(payload.new.updated_at))
          } else {
             setLastUpdated(new Date())
          }
        }
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tournamentId])

  if (status !== 'active') return null

  return (
    <div className="flex items-center gap-2">
      {isLive && (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-green-500/10 border border-green-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] text-green-400 font-black uppercase tracking-widest leading-none pt-0.5">Live</span>
        </span>
      )}
      {lastUpdated && (
        <div className="flex flex-col">
          <span className="text-[8px] text-surface-500 font-bold uppercase tracking-widest leading-none">
            Last Updated
          </span>
          <span className="text-[10px] text-surface-300 font-black uppercase tracking-widest leading-tight">
            {formatDistanceToNow(lastUpdated, { addSuffix: true })
              .toUpperCase()
              .replace('ABOUT ', '')
              .replace('LESS THAN A MINUTE AGO', 'JUST NOW')
              .replace(' MINUTES AGO', ' MINS AGO')
              .replace(' MINUTE AGO', ' MIN AGO')
              .replace(' SECONDS AGO', ' SECS AGO')}
          </span>
        </div>
      )}
    </div>
  )
}
