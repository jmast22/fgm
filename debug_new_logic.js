import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vncclxchvaqieetqkhjj.supabase.co';
const supabaseAnonKey = 'sb_publishable_qd4CwXqZ4k6gbgQ0WB3qhg_UsjWewQo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function debug() {
  const { data: latest, error: e1 } = await supabase
      .from('tournament_golfers')
      .select('tournament_id, tournaments!inner(start_date)')
      .order('tournaments(start_date)', { ascending: false })
      .limit(1)
      .maybeSingle();

  if (e1) console.error('E1:', e1);
  console.log('Detected Tournament ID:', latest?.tournament_id);

  const tournamentId = latest?.tournament_id;
  
  const { data: field, error: e2 } = await supabase
      .from('tournament_golfers')
      .select(`
        owg_rank,
        golfer:golfers!inner(*)
      `)
      .eq('tournament_id', tournamentId)
      .order('owg_rank', { ascending: true })
      .limit(5);

  if (e2) console.error('E2:', e2);
  console.log('Field golfers:', field?.map(f => ({ name: f.golfer.name, rank: f.owg_rank })));
}

debug();
