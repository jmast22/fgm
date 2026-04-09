/**
 * Scraper Service — Phase 11
 * 
 * Fetches live PGA Tour round scores from ESPN's public API
 * and upserts them into the golfer_round_stats table.
 * 
 * Data source: ESPN Scoreboard API
 * Endpoint: https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard
 * 
 * This scraper handles ROUND SCORING only (strokes to par per round).
 * Hole-by-hole scoring will be added in Phase 14.
 */

import { supabase } from '../lib/supabase'

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

export interface FieldScrapeResult {
  success: boolean
  tournamentName: string
  tournamentId: string
  golfersMatched: number
  golfersUnmatched: number
  fieldUpserted: number
  unmatchedNames: string[]
  errors: string[]
  timestamp: string
  durationMs: number
}

export interface OddsScrapeResult {
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

interface ESPNCompetitor {
  id: string
  athlete: {
    fullName: string
    displayName: string
    shortName: string
  }
  score: string  // e.g. "-12", "+3", "E"
  status?: {
    type?: {
      name?: string  // "STATUS_ACTIVE", "STATUS_CUT", etc.
    }
  }
  linescores: ESPNLinescore[]
}

interface ESPNLinescore {
  value: number       // stroke total for the round (e.g. 69)
  displayValue: string // score to par (e.g. "-3", "+1", "E", "-")
  period: number       // round number (1, 2, 3, 4)
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


// ── Configuration ─────────────────────────────────────────────────────
// NOTE: ODDS_API_KEY and TOURNAMENT_SPORT_KEY_MAP have been moved to the
// server-side Edge Function (supabase/functions/scrape-odds/index.ts).
// API keys are no longer shipped to the client browser.

// ── Main Scraper ───────────────────────────────────────────────────────

export const scraperService = {

  /**
   * Fetch the ESPN scoreboard data for the current/active tournament.
   */
  async fetchESPNScoreboard(): Promise<ESPNScoreboard> {
    const url = 'https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard'
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`ESPN API returned ${response.status}: ${response.statusText}`)
    }
    return response.json()
  },

  /**
   * Fetch ESPN scoreboard for a specific event ID.
   * If no eventId is provided, returns the current/active event.
   */
  async fetchESPNEvent(eventId?: string): Promise<ESPNEvent | null> {
    const scoreboard = await this.fetchESPNScoreboard()
    
    if (!scoreboard.events || scoreboard.events.length === 0) {
      return null
    }

    if (eventId) {
      return scoreboard.events.find(e => e.id === eventId) || null
    }

    // Return the first (current) event
    return scoreboard.events[0]
  },


  /**
   * Build a lookup map: normalized name → golfer_id
   * Uses both the golfers table and golfer_aliases table.
   */
  async buildGolferLookup(): Promise<Map<string, string>> {
    const lookup = new Map<string, string>()

    // Get all golfers
    const { data: golfers, error: gError } = await supabase
      .from('golfers')
      .select('id, name')

    if (gError) throw new Error(`Failed to fetch golfers: ${gError.message}`)

    // Add canonical names
    golfers?.forEach(g => {
      lookup.set(normalizeName(g.name), g.id)
      // Also add the original name in case normalization differs
      lookup.set(g.name.trim().toLowerCase(), g.id)
    })

    // Get all aliases
    const { data: aliases, error: aError } = await supabase
      .from('golfer_aliases')
      .select('golfer_id, alias_name')

    if (aError) throw new Error(`Failed to fetch aliases: ${aError.message}`)

    aliases?.forEach(a => {
      lookup.set(normalizeName(a.alias_name), a.golfer_id)
      lookup.set(a.alias_name.trim().toLowerCase(), a.golfer_id)
    })

    return lookup
  },

  /**
   * Match an ESPN tournament name to a tournament in our database.
   * Uses fuzzy matching on the tournament name.
   */
  async matchTournament(espnName: string): Promise<{ id: string; name: string } | null> {
    // Try exact match first
    const { data: exact } = await supabase
      .from('tournaments')
      .select('id, name')
      .ilike('name', espnName)
      .maybeSingle()

    if (exact) return exact

    // Try partial match — strip "THE" prefix and common differences
    const cleanName = espnName
      .replace(/^THE\s+/i, '')
      .replace(/\s+pres\.\s+by\s+.*/i, '')  // Remove "pres. by Sponsor"
      .replace(/\s+presented\s+by\s+.*/i, '')
      .trim()

    const { data: partial } = await supabase
      .from('tournaments')
      .select('id, name')
      .ilike('name', `%${cleanName}%`)
      .maybeSingle()

    if (partial) return partial

    // Try matching key words (e.g., "PLAYERS" for "THE PLAYERS Championship")
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
  },


  /**
   * Match an ESPN golfer name to a golfer_id using the lookup map.
   * Tries multiple strategies: exact, normalized, first-last swap, etc.
   */
  matchGolfer(espnName: string, lookup: Map<string, string>): string | null {
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

    // Strategy 4: Try "First Last" if ESPN sends "Last, First"
    if (normalized.includes(',')) {
      const parts = normalized.split(',').map(s => s.trim())
      const flipped = `${parts[1]} ${parts[0]}`
      if (lookup.has(flipped)) return lookup.get(flipped)!
    }

    return null
  },

  /**
   * Main scrape function.
   * Fetches ESPN data, matches golfers, and upserts round stats.
   * 
   * @param specificTournamentId - If provided, force-map to this tournament ID
   *                               instead of auto-matching by name.
   */
  async scrapeRoundScores(specificTournamentId?: string): Promise<ScrapeResult> {
    const startTime = Date.now()

    try {
      console.log('🏌️ Calling Edge Function for live scores...')

      const { data, error } = await supabase.functions.invoke('scrape-scores', {
        body: specificTournamentId ? { specificTournamentId } : {}
      })

      if (error) {
        throw new Error(error.message || 'Edge Function invocation failed')
      }

      const result = data as ScrapeResult
      result.durationMs = Date.now() - startTime

      console.log(`✅ Edge Function returned: ${result.roundStatsUpserted} records upserted`)
      return result

    } catch (err: any) {
      console.error('❌ Score Scrape (Edge Function) failed:', err)
      return {
        success: false,
        tournamentName: 'Unknown',
        golfersMatched: 0,
        golfersUnmatched: 0,
        roundStatsUpserted: 0,
        unmatchedNames: [],
        errors: [err.message || 'Unknown error'],
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime
      }
    }
  },

  /**
   * Add a new alias for a golfer.
   * Used to fix unmatched names from the scraper.
   */
  async addGolferAlias(golferId: string, aliasName: string): Promise<boolean> {
    const { error } = await supabase
      .from('golfer_aliases')
      .insert({ golfer_id: golferId, alias_name: aliasName })

    if (error) {
      console.error('Failed to add alias:', error)
      return false
    }
    return true
  },

  /**
   * Preview what the scraper would do without actually writing data.
   * Returns the ESPN data mapped to our golfers for review.
   */
  async previewScrape(): Promise<{
    espnEvent: string
    matchedTournament: string | null
    competitors: { espnName: string; matched: boolean; golferId: string | null }[]
    availableRounds: number[]
  }> {
    const espnEvent = await this.fetchESPNEvent()
    if (!espnEvent) {
      return {
        espnEvent: 'No active event',
        matchedTournament: null,
        competitors: [],
        availableRounds: []
      }
    }

    const tournament = await this.matchTournament(espnEvent.name)
    const lookup = await this.buildGolferLookup()
    const competitors = espnEvent.competitions?.[0]?.competitors || []

    // Find available rounds
    const rounds = new Set<number>()
    competitors.forEach(c => {
      c.linescores?.forEach(ls => {
        if (ls.displayValue && ls.displayValue !== '-') {
          rounds.add(ls.period)
        }
      })
    })

    return {
      espnEvent: espnEvent.name,
      matchedTournament: tournament?.name || null,
      competitors: competitors.map(c => {
        const name = c.athlete?.fullName || c.athlete?.displayName || 'Unknown'
        const golferId = this.matchGolfer(name, lookup)
        return {
          espnName: name,
          matched: !!golferId,
          golferId
        }
      }),
      availableRounds: [...rounds].sort()
    }
  },

  /**
   * Fetch the closest upcoming tournament from the database directly.
   * Assumes local date if no date string is provided.
   */
  async getUpcomingTournament(fromDateStr?: string): Promise<{ id: string; name: string; start_date: string } | null> {
    const fromDate = fromDateStr || new Date().toISOString()
    const { data } = await supabase
      .from('tournaments')
      .select('id, name, start_date')
      .gte('start_date', fromDate)
      .order('start_date', { ascending: true })
      .limit(1)
      .maybeSingle()
    
    return data
  },

  async scrapeTournamentField(tournamentId: string, tournamentName: string): Promise<FieldScrapeResult> {
    const startTime = Date.now()

    try {
      console.log(`🏌️ Calling Edge Function for field scrape: ${tournamentName}...`)
      
      const { data, error } = await supabase.functions.invoke('scrape-field', {
        body: { tournamentId, tournamentName }
      })

      if (error) {
        throw new Error(error.message || 'Edge Function invocation failed')
      }

      const result = data as FieldScrapeResult
      result.durationMs = Date.now() - startTime

      console.log(`✅ Edge Function returned: ${result.fieldUpserted} golfers upserted to field`)
      return result

    } catch (err: any) {
      console.error('❌ Field Scrape (Edge Function) failed:', err)
      return {
        success: false,
        tournamentName,
        tournamentId,
        golfersMatched: 0,
        golfersUnmatched: 0,
        fieldUpserted: 0,
        unmatchedNames: [],
        errors: [err.message || 'Unknown error'],
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime
      }
    }
  },

  /**
   * Add a brand new golfer to the DB
   */
  async addMasterGolfer(name: string): Promise<{ success: boolean; id?: string; error?: string }> {
    const { data, error } = await supabase
      .from('golfers')
      .insert({ name, age: null })
      .select('id')
      .single()
    
    if (error) {
      console.error('Failed to add master golfer:', error)
      return { success: false, error: error.message }
    }
    
    // Auto-add an alias for their exact name as a base safety measure
    if (data?.id) {
      await this.addGolferAlias(data.id, name)
    }

    return { success: true, id: data.id }
  },

  /**
   * Scraper 4: Fetch golfer odds from The Odds API.
   * Now calls the server-side Supabase Edge Function instead of running client-side.
   * API key stays server-side and is never exposed to the browser.
   */
  async scrapeGolferOdds(tournamentId: string, tournamentName: string): Promise<OddsScrapeResult> {
    const startTime = Date.now()

    try {
      console.log(`🏌️ Calling Edge Function for odds: ${tournamentName}...`)

      const { data, error } = await supabase.functions.invoke('scrape-odds', {
        body: { tournamentId, tournamentName }
      })

      if (error) {
        throw new Error(error.message || 'Edge Function invocation failed')
      }

      // The Edge Function returns the same OddsScrapeResult shape
      const result = data as OddsScrapeResult
      // Override durationMs to include round-trip time from client perspective
      result.durationMs = Date.now() - startTime

      console.log(`✅ Edge Function returned: ${result.oddsUpserted} odds upserted`)
      return result

    } catch (err: any) {
      console.error('❌ Odds Scrape (Edge Function) failed:', err)
      return {
        success: false,
        tournamentName,
        tournamentId,
        golfersMatched: 0,
        golfersUnmatched: 0,
        oddsUpserted: 0,
        unmatchedNames: [],
        errors: [err.message || 'Unknown error'],
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime
      }
    }
  }
}
