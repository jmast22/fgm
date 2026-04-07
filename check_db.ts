import { supabase } from './src/lib/supabase'

async function checkTable() {
  const { error } = await supabase.from('league_tournaments').select('*').limit(1)
  if (error) {
    console.log('Error fetching league_tournaments:', error.message)
  } else {
    console.log('league_tournaments table exists!')
  }
}
checkTable()
