import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vncclxchvaqieetqkhjj.supabase.co'
const supabaseKey = 'sb_publishable_qd4CwXqZ4k6gbgQ0WB3qhg_UsjWewQo'
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase.from('golfer_round_stats').select('golfer_id, tournament_id, round, score').limit(1)
  console.log('Error:', error)
  console.log('Data:', data)
}
test()
