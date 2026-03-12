import { supabase } from './src/lib/supabase';

async function check() {
  const { data: drafts, error: dError } = await supabase.from('drafts').select('*').limit(5);
  if (dError) console.error('Drafts Error:', dError);
  else console.log('Drafts:', JSON.stringify(drafts, null, 2));

  const { data: picks, error: pError } = await supabase.from('draft_picks').select('*').order('created_at', {ascending: false}).limit(5);
  if (pError) console.error('Picks Error:', pError);
  else console.log('Picks:', JSON.stringify(picks, null, 2));

  const { data: leagues, error: lError } = await supabase.from('leagues').select('id, name, max_teams').limit(5);
  if (lError) console.error('Leagues Error:', lError);
  else console.log('Leagues:', JSON.stringify(leagues, null, 2));

  const { data: teams, error: tError } = await supabase.from('teams').select('id, team_name, league_id').limit(20);
  if (tError) console.error('Teams Error:', tError);
  else console.log('Teams:', JSON.stringify(teams, null, 2));
}

check();
