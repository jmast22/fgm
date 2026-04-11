// Supabase Edge Function: scrape-scores
// Fetches live PGA Tour round scores from ESPN's public API
// and upserts them into the golfer_round_stats table.
// Runs SERVER-SIDE — securely fetches and processes data on a cron schedule or via manual trigger.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── Types ──────────────────────────────────────────────────────────────

export interface ScrapeResult {
  success: boolean
  tournamentName: string
  tournamentId?: string
  golfersMatched: number
  golfersUnmatched: number
  roundStatsUpserted: number
  unmatchedNames: string[]
  errors: string[]
  timestamp: string
  durationMs: number
}

interface ESPNCompetitor {
  id: string
  athlete: {
    fullName: string
    displayName: string
    shortName: string
  }
  score: string
  status?: {
    type?: {
      name?: string
    }
  }
  linescores: ESPNLinescore[]
}

interface ESPNLinescore {
  value: number
  displayValue: string
  period: number
}

interface ESPNEvent {
  id: string
  name: string
  shortName: string
  date: string
  endDate: string
  competitions: {
    id: string
    competitors: ESPNCompetitor[]
    status?: {
      period: number
      type: {
        name: string
        state: string
        description: string
      }
    }
  }[]
}

interface ESPNScoreboard {
  events: ESPNEvent[]
  leagues: {
    calendar: {
      id: string
      label: string
      startDate: string
      endDate: string
    }[]
  }[]
}

// ── Helpers ────────────────────────────────────────────────────────────

function normalizeName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .replace(/\u00f8/ig, 'o')
    .replace(/\u00e6/ig, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '')
    .trim()
    .toLowerCase()
}

function parseScoreToPar(displayValue: string): number | null {
  if (!displayValue || displayValue === '-' || displayValue === '--') return null
  if (displayValue === 'E') return 0
  const num = parseInt(displayValue, 10)
  return isNaN(num) ? null : num
}

function determineCutStatus(
  competitor: ESPNCompetitor,
  tournamentRound: number
): boolean {
  const statusName = competitor.status?.type?.name?.toLowerCase() || ''
  if (statusName.includes('cut')) return false

  if (tournamentRound >= 3) {
    const hasPostCutEntry = (competitor.linescores?.length || 0) >= 3 || 
                             competitor.linescores?.some(ls => ls.period > 2)
    
    if (!hasPostCutEntry) return false
  }

  return true
}

// ── API Fetchers ───────────────────────────────────────────────────────

async function fetchESPNScoreboard(): Promise<ESPNScoreboard> {
  const url = 'https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard'
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`ESPN API returned ${response.status}: ${response.statusText}`)
  }
  return response.json()
}

async function fetchESPNEvent(): Promise<ESPNEvent | null> {
  const scoreboard = await fetchESPNScoreboard()
  
  if (!scoreboard.events || scoreboard.events.length === 0) {
    return null
  }
  
  // To make this fully autonomous and ignore old events, check if event has concluded long ago.
  // ESPN's "first" event is usually the active/upcoming one.
  return scoreboard.events[0]
}

// ── Database Operations ────────────────────────────────────────────────

async function buildGolferLookup(supabase: ReturnType<typeof createClient>): Promise<Map<string, string>> {
  const lookup = new Map<string, string>()

  const { data: golfers, error: gError } = await supabase
    .from('golfers')
    .select('id, name')

  if (gError) throw new Error(`Failed to fetch golfers: ${gError.message}`)

  golfers?.forEach((g: { id: string; name: string }) => {
    lookup.set(normalizeName(g.name), g.id)
    lookup.set(g.name.trim().toLowerCase(), g.id)
  })

  // Aliases logic
  const { data: aliases, error: aError } = await supabase
    .from('golfer_aliases')
    .select('golfer_id, alias_name')

  if (aError) throw new Error(`Failed to fetch aliases: ${aError.message}`)

  aliases?.forEach((a: { golfer_id: string; alias_name: string }) => {
    lookup.set(normalizeName(a.alias_name), a.golfer_id)
    lookup.set(a.alias_name.trim().toLowerCase(), a.golfer_id)
  })

  return lookup
}

async function matchTournament(supabase: ReturnType<typeof createClient>, espnName: string): Promise<{ id: string; name: string } | null> {
  const { data: exact } = await supabase
    .from('tournaments')
    .select('id, name')
    .ilike('name', espnName)
    .maybeSingle()

  if (exact) return exact

  const cleanName = espnName
    .replace(/^THE\s+/i, '')
    .replace(/\s+pres\.\s+by\s+.*/i, '')
    .replace(/\s+presented\s+by\s+.*/i, '')
    .trim()

  const { data: partial } = await supabase
    .from('tournaments')
    .select('id, name')
    .ilike('name', `%${cleanName}%`)
    .maybeSingle()

  if (partial) return partial

  const keyWords = cleanName.split(/\s+/).filter(w => w.length > 3)
  for (const word of keyWords) {
    const { data: wordMatch } = await supabase
      .from('tournaments')
      .select('id, name')
      .ilike('name', `%${word}%`)
      .maybeSingle()

    if (wordMatch) return wordMatch
  }

  return null
}

function matchGolfer(espnName: string, lookup: Map<string, string>): string | null {
  const normalized = normalizeName(espnName)
  if (lookup.has(normalized)) return lookup.get(normalized)!

  const lower = espnName.trim().toLowerCase()
  if (lookup.has(lower)) return lookup.get(lower)!

  const withoutSuffix = normalized.replace(/\s+(jr\.?|sr\.?|iii|ii|iv)$/i, '')
  if (withoutSuffix !== normalized && lookup.has(withoutSuffix)) {
    return lookup.get(withoutSuffix)!
  }

  if (normalized.includes(',')) {
    const parts = normalized.split(',').map(s => s.trim())
    const flipped = `${parts[1]} ${parts[0]}`
    if (lookup.has(flipped)) return lookup.get(flipped)!
  }

  return null
}

// ── CORS Headers ──────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Main Handler ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  const errors: string[] = []
  const unmatchedNames: string[] = []
  let golfersMatched = 0
  let golfersUnmatched = 0
  let roundStatsUpserted = 0

  let specificTournamentId: string | undefined = undefined

  try {
    // 1. Parse request body if available (allows manual override)
    let body: any = {}
    try {
      body = await req.json()
      specificTournamentId = body.specificTournamentId
    } catch {
      // Ignore — means it's likely a cron run
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing environment variables SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }
    
    console.log('🔗 Initializing Supabase client...')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('🏌️ Fetching ESPN scoreboard...')
    const espnEvent = await fetchESPNEvent()
    
    if (!espnEvent) {
      throw new Error('No active ESPN event found')
    }

    // Additional autonomous check: 
    // We only want to scrape if the tournament hasn't ended.
    // Let's rely on standard upserting regardless, but log it.
    console.log(`✅ Found event: ${espnEvent.name}`)

    let tournamentId = specificTournamentId
    let tournamentName = espnEvent.name

    if (!tournamentId) {
      const matched = await matchTournament(supabase, espnEvent.name)
      if (!matched) {
        throw new Error(`Could not match ESPN tournament "${espnEvent.name}" to any database tournament.`)
      }
      tournamentId = matched.id
      tournamentName = matched.name
    }

    console.log(`✅ Matched to database tournament: ${tournamentName} (${tournamentId})`)

    const lookup = await buildGolferLookup(supabase)
    console.log(`✅ Built golfer lookup with ${lookup.size} entries`)

    const competitors = espnEvent.competitions?.[0]?.competitors || []
    if (competitors.length === 0) {
      throw new Error('No competitors found in ESPN data')
    }

    console.log(`📊 Processing ${competitors.length} competitors...`)

    const tournamentRound = espnEvent.competitions?.[0]?.status?.period || 1
    console.log(`⛳ Tournament is currently in: Round ${tournamentRound}`)

    const records: {
      tournament_id: string
      golfer_id: string
      round: number
      score: number
      made_cut: boolean
    }[] = []

    for (const competitor of competitors) {
      const espnName = competitor.athlete?.fullName || competitor.athlete?.displayName
      if (!espnName) {
        errors.push(`Competitor ${competitor.id} has no name`)
        continue
      }

      const golferId = matchGolfer(espnName, lookup)
      if (!golferId) {
        golfersUnmatched++
        unmatchedNames.push(espnName)
        continue
      }

      golfersMatched++
      const madeCut = determineCutStatus(competitor, tournamentRound)

      if (!competitor.linescores) continue

      for (const linescore of competitor.linescores) {
        const roundNum = linescore.period
        if (roundNum < 1 || roundNum > 4) continue

        const scoreToPar = parseScoreToPar(linescore.displayValue)
        if (scoreToPar === null) continue

        records.push({
          tournament_id: tournamentId,
          golfer_id: golferId,
          round: roundNum,
          score: scoreToPar,
          made_cut: madeCut
        })
      }
    }

    console.log(`✅ Matched ${golfersMatched} golfers, ${golfersUnmatched} unmatched`)

    if (records.length > 0) {
      const batchSize = 50
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize)
        
        const { error: upsertError } = await supabase
          .from('golfer_round_stats')
          .upsert(batch, {
            onConflict: 'tournament_id,golfer_id,round',
            ignoreDuplicates: false
          })

        if (upsertError) {
          errors.push(`Upsert batch error at ${i}: ${upsertError.message}`)
          console.error(`❌ Upsert error:`, upsertError)
        } else {
          roundStatsUpserted += batch.length
        }
      }
    }

    if (roundStatsUpserted > 0) {
      const newStatus = tournamentRound >= 4 ? 'completed' : 'active'
      await supabase
        .from('tournaments')
        .update({ status: newStatus })
        .eq('id', tournamentId)
    }

    console.log(`✅ Scrape complete! ${roundStatsUpserted} records upserted.`)

    const result: ScrapeResult = {
      success: errors.length === 0,
      tournamentName,
      tournamentId,
      golfersMatched,
      golfersUnmatched,
      roundStatsUpserted,
      unmatchedNames,
      errors,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('❌ Scrape failed:', message)

    const result: ScrapeResult = {
      success: false,
      tournamentName: 'Unknown',
      golfersMatched,
      golfersUnmatched,
      roundStatsUpserted,
      unmatchedNames,
      errors: [message],
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime
    }

    return new Response(JSON.stringify(result), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
