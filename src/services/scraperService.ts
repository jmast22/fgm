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

/**
 * Parse ESPN's displayValue score string to a numeric score-to-par.
 * "-3" → -3, "+2" → 2, "E" → 0, "-" → null (not yet played)
 */
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
  // 1. If status explicitly says cut
  const statusName = competitor.status?.type?.name?.toLowerCase() || ''
  if (statusName.includes('cut')) return false

  // 2. If the tournament has progressed past Round 2, check for Round 3 slots
  // ESPN adds Round 3 (period 3) once the golfer has officially made the cut,
  // even if they haven't teed off yet. If they only have 2 linescore entries,
  // they missed the cut.
  if (tournamentRound >= 3) {
    const hasPostCutEntry = (competitor.linescores?.length || 0) >= 3 || 
                             competitor.linescores?.some(ls => ls.period > 2)
    
    if (!hasPostCutEntry) return false
  }

  return true // made cut (or tournament not past cut yet)
}

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
   * Fetch ESPN scoreboard for a specific event ID using the leaderboard endpoint.
   */
  async fetchSpecificESPNEvent(eventId: string): Promise<ESPNEvent | null> {
    const url = `https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard?event=${eventId}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`ESPN API returned ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return data.events?.[0] || null
  },

  /**
   * Get the list of available ESPN events from the calendar.
   */
  async getESPNCalendar(): Promise<{ id: string; label: string; startDate: string; endDate: string }[]> {
    const scoreboard = await this.fetchESPNScoreboard()
    return scoreboard.leagues?.[0]?.calendar || []
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
   * Match our DB tournament name to an ESPN Event ID from the calendar.
   */
  async getESPNTournamentId(tournamentName: string): Promise<string | null> {
    const calendar = await this.getESPNCalendar()
    
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
    const errors: string[] = []
    const unmatchedNames: string[] = []
    let golfersMatched = 0
    let golfersUnmatched = 0
    let roundStatsUpserted = 0

    try {
      // 1. Fetch ESPN data
      console.log('🏌️ Fetching ESPN scoreboard...')
      const espnEvent = await this.fetchESPNEvent()
      
      if (!espnEvent) {
        return {
          success: false,
          tournamentName: 'Unknown',
          golfersMatched: 0,
          golfersUnmatched: 0,
          roundStatsUpserted: 0,
          unmatchedNames: [],
          errors: ['No active ESPN event found'],
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startTime
        }
      }

      console.log(`✅ Found event: ${espnEvent.name}`)

      // 2. Match tournament
      let tournamentId = specificTournamentId
      let tournamentName = espnEvent.name

      if (!tournamentId) {
        const matched = await this.matchTournament(espnEvent.name)
        if (!matched) {
          return {
            success: false,
            tournamentName: espnEvent.name,
            golfersMatched: 0,
            golfersUnmatched: 0,
            roundStatsUpserted: 0,
            unmatchedNames: [],
            errors: [`Could not match ESPN tournament "${espnEvent.name}" to any tournament in database`],
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - startTime
          }
        }
        tournamentId = matched.id
        tournamentName = matched.name
      }

      console.log(`✅ Matched to tournament: ${tournamentName} (${tournamentId})`)

      // 3. Build golfer lookup
      const lookup = await this.buildGolferLookup()
      console.log(`✅ Built golfer lookup with ${lookup.size} entries`)

      // 4. Get competitors from ESPN
      const competitors = espnEvent.competitions?.[0]?.competitors || []
      if (competitors.length === 0) {
        return {
          success: false,
          tournamentName,
          tournamentId,
          golfersMatched: 0,
          golfersUnmatched: 0,
          roundStatsUpserted: 0,
          unmatchedNames: [],
          errors: ['No competitors found in ESPN data'],
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startTime
        }
      }

      console.log(`📊 Processing ${competitors.length} competitors...`)

      // 5. Determine the current tournament round from metadata
      // ESPN provides this in the competition status
      const tournamentRound = espnEvent.competitions?.[0]?.status?.period || 1
      
      console.log(`⛳ Tournament is currently in: Round ${tournamentRound}`)

      // 6. Process each competitor
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

        // Match golfer
        const golferId = this.matchGolfer(espnName, lookup)
        if (!golferId) {
          golfersUnmatched++
          unmatchedNames.push(espnName)
          continue
        }

        golfersMatched++

        // Determine cut status
        const madeCut = determineCutStatus(competitor, tournamentRound)

        // Extract round scores
        if (!competitor.linescores) continue

        for (const linescore of competitor.linescores) {
          const roundNum = linescore.period
          if (roundNum < 1 || roundNum > 4) continue

          const scoreToPar = parseScoreToPar(linescore.displayValue)
          if (scoreToPar === null) continue // Round not yet played

          records.push({
            tournament_id: tournamentId!,
            golfer_id: golferId,
            round: roundNum,
            score: scoreToPar,
            made_cut: madeCut
          })
        }
      }

      console.log(`✅ Matched ${golfersMatched} golfers, ${golfersUnmatched} unmatched`)
      console.log(`📝 Upserting ${records.length} round stat records...`)

      // 7. Upsert records in batches
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

      // 8. Update tournament status if we have scores
      if (roundStatsUpserted > 0) {
        const newStatus = tournamentRound >= 4 ? 'completed' : 'active'
        await supabase
          .from('tournaments')
          .update({ status: newStatus })
          .eq('id', tournamentId!)
      }

      console.log(`✅ Scrape complete! ${roundStatsUpserted} records upserted.`)

      return {
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

    } catch (err: any) {
      console.error('❌ Scrape failed:', err)
      return {
        success: false,
        tournamentName: 'Unknown',
        golfersMatched,
        golfersUnmatched,
        roundStatsUpserted,
        unmatchedNames,
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

  /**
   * Fetch ESPN event by exact matching (or using the active one if omitted).
   * This logic is simple right now, but theoretically if the current active
   * event in ESPN is not the upcoming tournament we want, we'd need to search
   * the calendar. For Phase 17, we'll try matching the upcoming tournament name 
   * against the calendar / active event.
   */
  async scrapeTournamentField(tournamentId: string, tournamentName: string): Promise<FieldScrapeResult> {
    const startTime = Date.now()
    const errors: string[] = []
    const unmatchedNames: string[] = []
    let golfersMatched = 0
    let golfersUnmatched = 0
    let fieldUpserted = 0

    try {
      console.log(`🏌️ Fetching ESPN scoreboard for field scrape... Targeting: ${tournamentName}`)
      
      // 1. Find the ESPN Event ID from their calendar
      const espnEventId = await this.getESPNTournamentId(tournamentName)
      if (!espnEventId) {
        throw new Error(`Could not find an event named "${tournamentName}" in the ESPN calendar.`)
      }

      // 2. Fetch that specific event directly to get the field
      const espnEvent = await this.fetchSpecificESPNEvent(espnEventId)
      
      if (!espnEvent) {
        throw new Error('No ESPN event payload returned for this ID.')
      }

      console.log(`✅ Found event: ${espnEvent.name}`)

      const lookup = await this.buildGolferLookup()
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

        const golferId = this.matchGolfer(espnName, lookup)
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

      return {
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

    } catch (err: any) {
      console.error('❌ Field Scrape failed:', err)
      return {
        success: false,
        tournamentName,
        tournamentId,
        golfersMatched,
        golfersUnmatched,
        fieldUpserted,
        unmatchedNames,
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
  }
}
