/**
 * Seed script for The Players Championship mock round scores.
 * 
 * Run this in the browser console or via a dedicated admin page.
 * It will:
 *   1. Find The Players Championship tournament
 *   2. Find golfers in the tournament field
 *   3. Generate realistic round scores (strokes to par)
 *   4. Simulate a realistic cut (top ~65 make it)
 *   5. Insert into golfer_round_stats
 *
 * USAGE: Import and call seedPlayersChampionship() from a component or console.
 */

import { supabase } from '../lib/supabase'

// Realistic score distributions for PGA Tour pros at TPC Sawgrass
function generateRoundScore(skill: number): number {
  // skill: 0 = elite, 1 = good, 2 = average, 3 = below avg
  const bases = [-4, -2, 0, 1]
  const base = bases[skill] ?? 0
  // Add random variance: -4 to +4
  const variance = Math.floor(Math.random() * 9) - 4
  return base + variance
}

export async function seedPlayersChampionship() {
  console.log('🌱 Starting seed: The Players Championship...')

  // 1. Find the tournament
  const { data: tournament, error: tError } = await supabase
    .from('tournaments')
    .select('id, name')
    .ilike('name', '%Players%')
    .maybeSingle()

  if (tError || !tournament) {
    console.error('❌ Could not find The Players Championship tournament:', tError)
    return { success: false, error: 'Tournament not found' }
  }

  console.log(`✅ Found tournament: ${tournament.name} (${tournament.id})`)

  // 2. Get tournament field (golfers entered)
  const { data: field, error: fError } = await supabase
    .from('tournament_golfers')
    .select('golfer_id, golfer:golfers(name), owg_rank')
    .eq('tournament_id', tournament.id)
    .order('owg_rank', { ascending: true })

  if (fError || !field || field.length === 0) {
    console.error('❌ No golfers in tournament field:', fError)
    return { success: false, error: 'No golfers in field' }
  }

  console.log(`✅ Found ${field.length} golfers in the field`)

  // 3. Delete existing round stats for this tournament (idempotent re-run)
  const { error: delError } = await supabase
    .from('golfer_round_stats')
    .delete()
    .eq('tournament_id', tournament.id)

  if (delError) {
    console.error('⚠️ Could not clear existing stats:', delError)
  }

  // 4. Generate scores
  const cutLine = Math.ceil(field.length * 0.52) // ~52% make the cut (realistic for TPC)
  const records: any[] = []

  // Assign skill tiers based on OWGR
  const golferScores: { golfer_id: string; name: string; r1: number; r2: number; twoRoundTotal: number; skill: number }[] = []

  field.forEach((f: any, idx: number) => {
    // Skill tier based on ranking position in field
    let skill = 2 // average
    if (idx < field.length * 0.1) skill = 0        // Top 10%: elite
    else if (idx < field.length * 0.3) skill = 1    // Next 20%: good
    else if (idx >= field.length * 0.75) skill = 3  // Bottom 25%: below avg

    const r1 = generateRoundScore(skill)
    const r2 = generateRoundScore(skill)

    golferScores.push({
      golfer_id: f.golfer_id,
      name: (f.golfer as any)?.name || 'Unknown',
      r1,
      r2,
      twoRoundTotal: r1 + r2,
      skill
    })
  })

  // Sort by 2-round total to determine cut
  golferScores.sort((a, b) => a.twoRoundTotal - b.twoRoundTotal)

  // The cut line score
  const cutScore = golferScores[cutLine - 1]?.twoRoundTotal ?? 0

  golferScores.forEach((gs, idx) => {
    const madeCut = idx < cutLine || gs.twoRoundTotal <= cutScore

    // R1
    records.push({
      tournament_id: tournament.id,
      golfer_id: gs.golfer_id,
      round: 1,
      score: gs.r1,
      made_cut: madeCut
    })

    // R2
    records.push({
      tournament_id: tournament.id,
      golfer_id: gs.golfer_id,
      round: 2,
      score: gs.r2,
      made_cut: madeCut
    })

    // R3 and R4 — only played if made cut
    if (madeCut) {
      const r3 = generateRoundScore(gs.skill)
      const r4 = generateRoundScore(gs.skill)

      records.push({
        tournament_id: tournament.id,
        golfer_id: gs.golfer_id,
        round: 3,
        score: r3,
        made_cut: true
      })

      records.push({
        tournament_id: tournament.id,
        golfer_id: gs.golfer_id,
        round: 4,
        score: r4,
        made_cut: true
      })
    }
  })

  // 5. Insert in batches
  const batchSize = 100
  let inserted = 0

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    const { error: insertError } = await supabase
      .from('golfer_round_stats')
      .insert(batch)

    if (insertError) {
      console.error(`❌ Insert batch error at ${i}:`, insertError)
      return { success: false, error: insertError.message }
    }
    inserted += batch.length
  }

  const madeCutCount = golferScores.filter((_, idx) => idx < cutLine).length
  const missedCutCount = golferScores.length - madeCutCount

  console.log(`✅ Seed complete!`)
  console.log(`   📊 ${inserted} round stat records inserted`)
  console.log(`   ✂️ ${madeCutCount} made cut, ${missedCutCount} missed cut`)
  console.log(`   🏌️ Cut line: ${formatScoreDisplay(cutScore)} (2-round total)`)

  return { 
    success: true, 
    inserted, 
    madeCut: madeCutCount, 
    missedCut: missedCutCount,
    cutLine: cutScore
  }
}

function formatScoreDisplay(score: number): string {
  if (score === 0) return 'E'
  return score > 0 ? `+${score}` : `${score}`
}
