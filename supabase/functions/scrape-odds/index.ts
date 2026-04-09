// Supabase Edge Function: scrape-odds
// Fetches golfer betting odds from The Odds API and upserts into tournament_golfers.
// Runs SERVER-SIDE — API keys are never exposed to the client.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

// ── Types ──────────────────────────────────────────────────────────────

interface OddsScrapeResult {
  success: boolean
  tournamentName: string
  tournamentId: string
  golfersMatched: number
  golfersUnmatched: number
  oddsUpserted: number
  unmatchedNames: string[]
  errors: string[]
  timestamp: string
  durationMs: number
}

// ── Configuration ─────────────────────────────────────────────────────

// Map our tournament names (or parts of them) to The Odds API sport keys
const TOURNAMENT_SPORT_KEY_MAP: Record<string, string> = {
  'masters': 'golf_masters_tournament_winner',
  'pga championship': 'golf_pga_championship_winner',
  'u.s. open': 'golf_us_open_winner',
  'the open': 'golf_the_open_championship_winner',
  'the players': 'golf_pga_tour_winner',
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Normalize a name for fuzzy matching.
 * Strips accents, extra spaces, and lowercases.
 */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * Match a golfer name to an ID using the lookup map.
 * Tries multiple strategies: exact, normalized, suffix removal, comma-flip.
 */
function matchGolfer(espnName: string, lookup: Map<string, string>): string | null {
  // Strategy 1: Direct normalized match
  const normalized = normalizeName(espnName)
  if (lookup.has(normalized)) return lookup.get(normalized)!

  // Strategy 2: Lowercase exact
  const lower = espnName.trim().toLowerCase()
  if (lookup.has(lower)) return lookup.get(lower)!

  // Strategy 3: Try removing Jr., III, etc.
  const withoutSuffix = normalized.replace(/\s+(jr\.?|sr\.?|iii|ii|iv)$/i, '')
  if (withoutSuffix !== normalized && lookup.has(withoutSuffix)) {
    return lookup.get(withoutSuffix)!
  }

  // Strategy 4: Try "First Last" if name is "Last, First"
  if (normalized.includes(',')) {
    const parts = normalized.split(',').map(s => s.trim())
    const flipped = `${parts[1]} ${parts[0]}`
    if (lookup.has(flipped)) return lookup.get(flipped)!
  }

  return null
}

/**
 * Build a lookup map: normalized name → golfer_id.
 * Pulls from both golfers and golfer_aliases tables.
 */
async function buildGolferLookup(supabase: ReturnType<typeof createClient>): Promise<Map<string, string>> {
  const lookup = new Map<string, string>()

  // Get all golfers
  const { data: golfers, error: gError } = await supabase
    .from('golfers')
    .select('id, name')

  if (gError) throw new Error(`Failed to fetch golfers: ${gError.message}`)

  golfers?.forEach((g: { id: string; name: string }) => {
    lookup.set(normalizeName(g.name), g.id)
    lookup.set(g.name.trim().toLowerCase(), g.id)
  })

  // Get all aliases
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

/**
 * Fetch the closest upcoming tournament from the database directly.
 */
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  const errors: string[] = []
  const unmatchedNames: string[] = []
  let golfersMatched = 0
  let golfersUnmatched = 0
  let oddsUpserted = 0
  let tournamentName = 'Unknown'
  let tournamentId = ''

  try {
    // 1. Parse request body (if provided)
    let body: any = {}
    try {
      body = await req.json()
    } catch {
      // Ignored if not JSON or body is empty (e.g. cron execution)
    }

    // 2. Get API key from environment (secure, server-side only)
    const oddsApiKey = Deno.env.get('ODDS_API_KEY')
    if (!oddsApiKey) {
      throw new Error('ODDS_API_KEY not configured in Edge Function secrets.')
    }

    // 3. Create Supabase client with SERVICE ROLE key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    tournamentId = body.tournamentId
    tournamentName = body.tournamentName

    // If missing from request, auto-detect upcoming tournament
    if (!tournamentId || !tournamentName) {
      console.log('No tournament specified in request, auto-detecting upcoming tournament...')
      const upcoming = await getUpcomingTournament(supabase)
      if (!upcoming) {
        throw new Error('Could not automatically determine the upcoming tournament.')
      }
      tournamentId = upcoming.id
      tournamentName = upcoming.name
      console.log(`🤖 Auto-detected upcoming tournament: ${tournamentName}`)
    }

    // 4. Determine the sport key from tournament name
    const nameLower = tournamentName.toLowerCase()
    let sportKey = ''

    for (const [key, value] of Object.entries(TOURNAMENT_SPORT_KEY_MAP)) {
      if (nameLower.includes(key)) {
        sportKey = value
        break
      }
    }

    if (!sportKey) {
      throw new Error(`Could not find a matching Odds API sport key for "${tournamentName}".`)
    }

    console.log(`🏌️ Fetching odds from The Odds API for: ${sportKey}...`)

    // 5. Fetch odds from the API (American outrights)
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${oddsApiKey}&regions=us&markets=outrights&oddsFormat=american`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`The Odds API returned ${response.status}: ${response.statusText}`)
    }

    const oddsData = await response.json()

    if (!Array.isArray(oddsData) || oddsData.length === 0) {
      throw new Error('No odds data found for this tournament.')
    }

    // 6. Find preferred bookmaker (BetRivers or first available)
    // deno-lint-ignore no-explicit-any
    const bookmaker = oddsData[0].bookmakers.find((b: any) => b.key === 'betrivers') || oddsData[0].bookmakers[0]
    if (!bookmaker) {
      throw new Error('No bookmaker data available for this market.')
    }

    // deno-lint-ignore no-explicit-any
    const outcomes = bookmaker.markets?.find((m: any) => m.key === 'outrights')?.outcomes || []

    if (outcomes.length === 0) {
      throw new Error('No outright outcomes found.')
    }

    console.log(`📊 Processing ${outcomes.length} odds from ${bookmaker.title}...`)

    // 7. Build golfer lookup and match names
    const lookup = await buildGolferLookup(supabase)
    const records: { tournament_id: string; golfer_id: string; odds: number }[] = []

    // deno-lint-ignore no-explicit-any
    for (const outcome of outcomes) {
      const golferId = matchGolfer(outcome.name, lookup)
      if (!golferId) {
        golfersUnmatched++
        unmatchedNames.push(outcome.name)
        continue
      }

      golfersMatched++
      records.push({
        tournament_id: tournamentId,
        golfer_id: golferId,
        odds: outcome.price,
      })
    }

    console.log(`✅ Matched ${golfersMatched} golfers to our DB. ${golfersUnmatched} unmatched.`)

    // 8. Upsert odds into tournament_golfers
    if (records.length > 0) {
      const { error: upsertError } = await supabase
        .from('tournament_golfers')
        .upsert(records, { onConflict: 'tournament_id,golfer_id' })

      if (upsertError) {
        throw upsertError
      }
      oddsUpserted = records.length
    }

    // 9. Return result
    const result: OddsScrapeResult = {
      success: errors.length === 0,
      tournamentName,
      tournamentId,
      golfersMatched,
      golfersUnmatched,
      oddsUpserted,
      unmatchedNames,
      errors,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('❌ Odds Scrape failed:', message)

    const result: OddsScrapeResult = {
      success: false,
      tournamentName,
      tournamentId,
      golfersMatched,
      golfersUnmatched,
      oddsUpserted,
      unmatchedNames,
      errors: [message],
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    }

    return new Response(JSON.stringify(result), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
