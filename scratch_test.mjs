import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vncclxchvaqieetqkhjj.supabase.co'
const supabaseKey = 'sb_publishable_qd4CwXqZ4k6gbgQ0WB3qhg_UsjWewQo'
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase.from('golfer_round_stats').select('created_at, updated_at').order('updated_at', { ascending: false }).limit(5)
  console.log('Data:', data)
}
test()
