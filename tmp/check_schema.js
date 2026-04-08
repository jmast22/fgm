
import { supabase } from '../src/lib/supabase';

async function checkSchema() {
  const { data, error } = await supabase
    .from('tournament_golfers')
    .select('*')
    .limit(1);
    
  if (error) {
    console.error('Error fetching tournament_golfers:', error);
  } else {
    console.log('Columns in tournament_golfers:', Object.keys(data[0] || {}));
  }
}

checkSchema();
