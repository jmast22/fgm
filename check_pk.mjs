import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vncclxchvaqieetqkhjj.supabase.co'
const supabaseKey = 'sb_publishable_qd4CwXqZ4k6gbgQ0WB3qhg_UsjWewQo'
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase.rpc('get_primary_keys', { table_name: 'golfer_round_stats' })
  console.log('Error:', error)
  console.log('PK:', data)
}
test()
