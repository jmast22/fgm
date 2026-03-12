import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vncclxchvaqieetqkhjj.supabase.co';
const supabaseAnonKey = 'sb_publishable_qd4CwXqZ4k6gbgQ0WB3qhg_UsjWewQo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function debug() {
  const tournamentId = 'deb22cde-1b52-4677-9ee4-20e097af40d2'; // THE PLAYERS

  const { data: golfers, error } = await supabase
    .from('golfers')
    .select(`
      name,
      tournament_golfers (
        owg_rank,
        tournament_id
      )
    `)
    .eq('tournament_golfers.tournament_id', tournamentId)
    .limit(3);

  console.log('--- Golfer Response Structure ---');
  if (error) console.error(error);
  else console.log(JSON.stringify(golfers, null, 2));
}

debug();
