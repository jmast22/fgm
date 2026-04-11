// Supabase Edge Function: scrape-field
// Fetches the tournament field from ESPN API and upserts into tournament_golfers.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

// ── Types ──────────────────────────────────────────────────────────────

export interface FieldScrapeResult {
  success: boolean
  tournamentName: string
  tournamentId?: string
  golfersMatched: number
  golfersUnmatched: number
  fieldUpserted: number
  unmatchedNames: string[]
  errors: string[]
  timestamp: string
  durationMs: number
}

// ── Helpers ────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .replace(/ø/ig, 'o')
    .replace(/æ/ig, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '')
    .trim()
    .toLowerCase()
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

// ── API Fetchers ───────────────────────────────────────────────────────

async function fetchESPNScoreboard(): Promise<any> {
  const url = 'https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard'
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`ESPN API returned ${response.status}: ${response.statusText}`)
  }
  return response.json()
}

async function getESPNCalendar(): Promise<{ id: string; label: string; startDate: string; endDate: string }[]> {
  const scoreboard = await fetchESPNScoreboard()
  return scoreboard.leagues?.[0]?.calendar || []
}

async function getESPNTournamentId(tournamentName: string): Promise<string | null> {
  const calendar = await getESPNCalendar()
  
  const cleanDbName = tournamentName
    .replace(/^THE\s+/i, '')
    .replace(/\s+pres\.\s+by\s+.*/i, '')
    .replace(/\s+presented\s+by\s+.*/i, '')
    .trim().toLowerCase()
  
  for (const c of calendar) {
    if (c.label.toLowerCase().includes(cleanDbName)) return c.id
    
    const keyWords = cleanDbName.split(/\s+/).filter(w => w.length > 3)
    for (const word of keyWords) {
      if (c.label.toLowerCase().includes(word)) return c.id
    }
  }
  return null
}

async function fetchSpecificESPNEvent(eventId: string): Promise<any | null> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard?event=${eventId}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`ESPN API returned ${response.status}: ${response.statusText}`)
  }
  const data = await response.json()
  return data.events?.[0] || null
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

async function getUpcomingTournament(supabase: ReturnType<typeof createClient>): Promise<{ id: string; name: string; start_date: string } | null> {
  const fromDate = new Date().toISOString()
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, name, start_date')
    .gte('start_date', fromDate)
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  
  if (error) {
    console.error('Error fetching upcoming tournament:', error.message)
    return null
  }
  return data
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
  let fieldUpserted = 0

  let tournamentId: string | undefined = undefined
  let tournamentName = 'Unknown'

  try {
    let body: any = {}
    try {
      body = await req.json()
      tournamentId = body.tournamentId
      tournamentName = body.tournamentName
    } catch {
      // Ignored
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    if (!tournamentId || !tournamentName || tournamentName === 'Unknown') {
      console.log('No specific tournament requested. Auto-detecting upcoming tournament...')
      const upcoming = await getUpcomingTournament(supabase)
      if (!upcoming) {
        throw new Error('Could not automatically determine the upcoming tournament.')
      }
      tournamentId = upcoming.id
      tournamentName = upcoming.name
      console.log(`🤖 Auto-detected upcoming tournament: ${tournamentName}`)
    }

    console.log(`🏌️ Fetching ESPN scoreboard for field scrape... Targeting: ${tournamentName}`)

    // 1. Find the ESPN Event ID from their calendar
    const espnEventId = await getESPNTournamentId(tournamentName)
    if (!espnEventId) {
      throw new Error(`Could not find an event named "${tournamentName}" in the ESPN calendar.`)
    }

    // 2. Fetch that specific event directly to get the field
    const espnEvent = await fetchSpecificESPNEvent(espnEventId)
    
    if (!espnEvent) {
      throw new Error('No ESPN event payload returned for this ID.')
    }

    console.log(`✅ Found event: ${espnEvent.name}`)

    const lookup = await buildGolferLookup(supabase)
    const competitors = espnEvent.competitions?.[0]?.competitors || []
    
    if (competitors.length === 0) {
      throw new Error('No competitors found in ESPN data. Event might not be populated yet.')
    }

    console.log(`📊 Processing ${competitors.length} competitors for field...`)

    const records: { tournament_id: string; golfer_id: string }[] = []

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
      records.push({
        tournament_id: tournamentId,
        golfer_id: golferId
      })
    }

    console.log(`✅ Matched ${golfersMatched} golfers to our DB. ${golfersUnmatched} unmatched.`)

    if (records.length > 0) {
      const batchSize = 100
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize)
        const { error: upsertError } = await supabase
          .from('tournament_golfers')
          .upsert(batch, { onConflict: 'tournament_id,golfer_id' })
        
        if (upsertError) {
           errors.push(`Upsert batch error at ${i}: ${upsertError.message}`)
        } else {
           fieldUpserted += batch.length
        }
      }
    }

    const result: FieldScrapeResult = {
      success: errors.length === 0,
      tournamentName,
      tournamentId,
      golfersMatched,
      golfersUnmatched,
      fieldUpserted,
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
    console.error('❌ Field Scrape failed:', message)

    const result: FieldScrapeResult = {
      success: false,
      tournamentName,
      tournamentId,
      golfersMatched,
      golfersUnmatched,
      fieldUpserted,
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
