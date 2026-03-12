import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vncclxchvaqieetqkhjj.supabase.co';
const supabaseAnonKey = 'sb_publishable_qd4CwXqZ4k6gbgQ0WB3qhg_UsjWewQo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function debug() {
  const { data: tournamentsWithField, error } = await supabase
    .from('tournaments')
    .select('id, name, start_date, tournament_golfers!inner(tournament_id)')
    .order('start_date', { ascending: false })
    .limit(5);

  console.log('--- Step 2 Debug ---');
  if (error) console.error(error);
  else console.log(JSON.stringify(tournamentsWithField, null, 2));
}

debug();
