import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vncclxchvaqieetqkhjj.supabase.co';
const supabaseAnonKey = 'sb_publishable_qd4CwXqZ4k6gbgQ0WB3qhg_UsjWewQo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function debug() {
  const { data: tourneys } = await supabase.from('tournaments').select('*').order('start_date', { ascending: false });
  console.log('Total Tournaments:', tourneys?.length);
  
  const { data: field } = await supabase.from('tournament_golfers').select('tournament_id, owg_rank').limit(10);
  console.log('Field Sample size:', field?.length);
  if (field && field.length > 0) {
      console.log('Example Tournament ID from field:', field[0].tournament_id);
  }

  // Test the specific query that is failing
  const { data: latestTourney, error: lError } = await supabase
    .from('tournaments')
    .select('id, name, start_date')
    .order('start_date', { ascending: false });

  if (latestTourney) {
      for (const t of latestTourney) {
          const { count } = await supabase
            .from('tournament_golfers')
            .select('*', { count: 'exact', head: true })
            .eq('tournament_id', t.id);
          if (count > 0) {
              console.log(`Tournament ${t.name} (${t.id}) has ${count} golfers in field.`);
              break;
          }
      }
  }
}

debug();
