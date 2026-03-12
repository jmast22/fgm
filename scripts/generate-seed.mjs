import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Papa from 'papaparse';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const playersCsv = fs.readFileSync(path.join(rootDir, 'data', '2026_complete_player_list.csv'), 'utf8');
const scheduleCsv = fs.readFileSync(path.join(rootDir, 'data', 'schedule.csv'), 'utf8');
const fieldCsv = fs.readFileSync(path.join(rootDir, 'data', 'players_field_the_players.csv'), 'utf8');

const sqlLines = [];

sqlLines.push('-- Fantasy Golf League Data Seed');
sqlLines.push('-- Copy and paste this into the Supabase SQL Editor and click "Run"\n');

// 1. Parse and Insert Golfers & Aliases
const parsedPlayers = Papa.parse(playersCsv, { header: true, skipEmptyLines: true }).data;
const golferMap = new Map(); // name -> uuid

sqlLines.push('-- Insert Golfers');
for (const row of parsedPlayers) {
  if (!row.Name) continue;
  const golferId = crypto.randomUUID();
  golferMap.set(row.Name.toLowerCase(), golferId);
  
  const name = row.Name.replace(/'/g, "''");
  const age = (row.AGE && !isNaN(parseInt(row.AGE))) ? parseInt(row.AGE) : 'NULL';
  
  sqlLines.push(`INSERT INTO public.golfers (id, name, age) VALUES ('${golferId}', '${name}', ${age});`);
  sqlLines.push(`INSERT INTO public.golfer_aliases (golfer_id, alias_name) VALUES ('${golferId}', '${name}');`);
}

// 2. Parse and Insert Tournaments
const parsedSchedule = Papa.parse(scheduleCsv, { header: true, skipEmptyLines: true }).data;
const tournamentMap = new Map(); // name -> uuid

sqlLines.push('\n-- Insert Tournaments');
for (const row of parsedSchedule) {
  if (!row['Tournament Name']) continue;
  const tourneyId = crypto.randomUUID();
  tournamentMap.set(row['Tournament Name'].toLowerCase(), tourneyId);
  
  const name = row['Tournament Name'].replace(/'/g, "''");
  const course = (row.Course || '').replace(/'/g, "''");
  const city = (row.City || '').replace(/'/g, "''");
  const state = (row.State || '').replace(/'/g, "''");
  const country = (row.Country || '').replace(/'/g, "''");
  
  // Basic date parsing mm/dd/yyyy -> yyyy-mm-dd
  let start_date = row['Start Date'];
  let end_date = row['End Date'];
  
  // Assume formats are manageable by Postgres (e.g. 2026-03-12)
  sqlLines.push(`INSERT INTO public.tournaments (id, name, start_date, end_date, course_name, city, state, country, status) VALUES ('${tourneyId}', '${name}', '${start_date}', '${end_date}', '${course}', '${city}', '${state}', '${country}', 'upcoming');`);
}

// 3. Parse and Insert The Players field
const parsedField = Papa.parse(fieldCsv, { header: true, skipEmptyLines: true }).data;
const playersTourneyId = tournamentMap.get('the players championship') || tournamentMap.get('the players');

if (playersTourneyId) {
  sqlLines.push('\n-- Insert The Players Championship Field');
  for (const row of parsedField) {
    if (!row['Player Name']) continue;
    const searchName = row['Player Name'].toLowerCase();
    let golferId = golferMap.get(searchName);
    
    // Quick fallback checks for common discrepancies if exact match fails
    if (!golferId) {
      for (const [key, id] of golferMap.entries()) {
        if (key.includes(searchName) || searchName.includes(key)) {
          golferId = id;
          break;
        }
      }
    }
    
    if (golferId) {
      const dgRank = parseInt(row["DG Rank"]) || 'NULL';
      const owgRank = parseInt(row["OWG Rank"]) || 'NULL';
      sqlLines.push(`INSERT INTO public.tournament_golfers (tournament_id, golfer_id, dg_rank, owg_rank) VALUES ('${playersTourneyId}', '${golferId}', ${dgRank}, ${owgRank}) ON CONFLICT DO NOTHING;`);
    } else {
        sqlLines.push(`-- WARNING: Could not find golfer ID for: ${row['Player Name']}`);
    }
  }
}

fs.writeFileSync(path.join(rootDir, 'seed.sql'), sqlLines.join('\n'), 'utf8');
console.log('Successfully generated seed.sql');
