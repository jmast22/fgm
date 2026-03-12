import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vncclxchvaqieetqkhjj.supabase.co';
const supabaseAnonKey = 'sb_publishable_qd4CwXqZ4k6gbgQ0WB3qhg_UsjWewQo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  try {
    const { data: golfers, error: gError } = await supabase
      .from('golfers')
      .select('*')
      .ilike('name', '%Ludvig%');
    
    if (gError) console.error('Golfers Error:', gError);
    else console.log('Golfers found:', JSON.stringify(golfers, null, 2));

    const { data: aliases, error: aError } = await supabase
      .from('golfer_aliases')
      .select('*, golfer:golfers(name)')
      .ilike('alias_name', '%Ludvig%');

    if (aError) console.error('Aliases Error:', aError);
    else console.log('Aliases found:', JSON.stringify(aliases, null, 2));

    if (golfers && golfers.length > 0) {
      const golferId = golfers[0].id;
      const { data: fields, error: fError } = await supabase
        .from('tournament_golfers')
        .select('*, tournament:tournaments(name, start_date)')
        .eq('golfer_id', golferId);
      
      if (fError) console.error('Field Error:', fError);
      else console.log('Tournament Fields for golfer:', JSON.stringify(fields, null, 2));
    }
  } catch (err) {
    console.error('Catch error:', err);
  }
}

check();
