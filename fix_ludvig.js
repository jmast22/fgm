import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vncclxchvaqieetqkhjj.supabase.co';
const supabaseAnonKey = 'sb_publishable_qd4CwXqZ4k6gbgQ0WB3qhg_UsjWewQo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function fix() {
  const golferId = '3dbe01f9-0750-4fcb-abb6-90812dc6e643'; // Ludvig Åberg
  const tournamentId = 'deb22cde-1b52-4677-9ee4-20e097af40d2'; // The Players Championship

  console.log('1. Adding Ludvig Aberg alias...');
  const { error: aliasError } = await supabase
    .from('golfer_aliases')
    .insert({
      golfer_id: golferId,
      alias_name: 'Ludvig Aberg'
    });

  if (aliasError && aliasError.code !== '23505') {
    console.error('Alias Error:', aliasError);
  } else {
    console.log('Alias added or already exists.');
  }

  console.log('2. Adding Ludvig to tournament field...');
  const { error: fieldError } = await supabase
    .from('tournament_golfers')
    .insert({
      tournament_id: tournamentId,
      golfer_id: golferId,
      owg_rank: 4 // Ludvig is roughly 4th/5th in world
    });

  if (fieldError) {
    if (fieldError.code === '23505') {
        console.log('Ludvig is already in the tournament field.');
    } else {
        console.error('Field Error:', fieldError);
    }
  } else {
    console.log('Ludvig added to tournament field successfully.');
  }
}

fix();
