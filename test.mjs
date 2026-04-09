import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vncclxchvaqieetqkhjj.supabase.co'
const supabaseKey = 'sb_publishable_qd4CwXqZ4k6gbgQ0WB3qhg_UsjWewQo'
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase.from('golfer_round_stats').select('created_at, updated_at').limit(1)
  console.log('Error:', error)
  console.log('Columns:', data && data.length > 0 ? Object.keys(data[0]) : 'no data')
}
test()
