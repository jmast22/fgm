import { supabase } from '../lib/supabase';
import { parseCSVString } from '../lib/csvParser';

export interface CSVGolfer {
  Name: string;
  AGE: number | string;
}

export interface CSVTournament {
  Tournament: string;
  StartDate: string;
  EndDate: string;
  Course: string;
  City: string;
  State: string;
  Country: string;
}

export interface CSVFieldGolfer {
  Name: string;
  "DG Rank": string | number;
  "OWGR": string | number;
}

const normalizeName = (name: string) => {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, ""); // Catch any remaining non-ASCII
};

export const importGolfers = async (csvData: string) => {
  const parsedData = parseCSVString<CSVGolfer>(csvData);
  
  for (const row of parsedData) {
    if (!row.Name) continue; // Skip empty rows
    
    // Normalize age to handle "--" or empty strings
    const age = typeof row.AGE === 'number' ? row.AGE : parseInt(row.AGE?.toString() || '0');
    
    // 1. Insert golfer
    const { data: golferData, error: golferError } = await supabase
      .from('golfers')
      .insert({
        name: row.Name,
        age: isNaN(age) || age === 0 ? null : age,
      })
      .select('id')
      .single();

    if (golferError) {
      console.error('Error inserting golfer:', row.Name, golferError);
      continue; // Skip alias on failure
    }

    // 2. Insert aliases
    if (golferData) {
      const aliases = [row.Name];
      const normalized = normalizeName(row.Name);
      if (normalized !== row.Name) {
        aliases.push(normalized);
      }

      for (const aliasName of aliases) {
        const { error: aliasError } = await supabase
          .from('golfer_aliases')
          .insert({
            golfer_id: golferData.id,
            alias_name: aliasName
          });
          
        if (aliasError && aliasError.code !== '23505') {
          console.error('Error inserting alias for:', aliasName, aliasError);
        }
      }
    }
  }

  return parsedData.length;
};

export const importTournaments = async (csvData: string) => {
  const parsedData = parseCSVString<CSVTournament>(csvData);
  
  for (const row of parsedData) {
    if (!row.Tournament) continue;

    const { error } = await supabase
      .from('tournaments')
      .insert({
        name: row.Tournament,
        start_date: row.StartDate,
        end_date: row.EndDate,
        course_name: row.Course,
        city: row.City,
        state: row.State,
        country: row.Country,
        status: 'upcoming'
      });

    if (error) {
      console.error('Error inserting tournament:', row.Tournament, error);
    }
  }

  return parsedData.length;
};

export const importTournamentField = async (tournamentId: string, csvData: string) => {
  const parsedData = parseCSVString<CSVFieldGolfer>(csvData);
  let successCount = 0;

  for (const row of parsedData) {
    if (!row.Name) continue;

    // 1. Find golfer by alias or exact name
    let { data: aliasData, error: findError } = await supabase
      .from('golfer_aliases')
      .select('golfer_id')
      .ilike('alias_name', row.Name)
      .limit(1)
      .single();

    // If not found, try normalized name
    if (!aliasData || findError) {
      const normalized = normalizeName(row.Name);
      if (normalized !== row.Name) {
        const { data: normAlias } = await supabase
          .from('golfer_aliases')
          .select('golfer_id')
          .ilike('alias_name', normalized)
          .limit(1)
          .single();
        
        aliasData = normAlias;
      }
    }

    let golferId = aliasData?.golfer_id;

    if (!golferId) {
      // Fallback: search main table
      const { data: golferData } = await supabase
        .from('golfers')
        .select('id')
        .ilike('name', row.Name)
        .limit(1)
        .single();
        
      golferId = golferData?.id;

      // Final fallback: search main table with normalized name
      if (!golferId) {
        const normalized = normalizeName(row.Name);
        const { data: normGolfer } = await supabase
          .from('golfers')
          .select('id')
          .ilike('name', normalized)
          .limit(1)
          .single();
        golferId = normGolfer?.id;
      }
    }

    if (!golferId) {
      console.warn('Could not find golfer for field import:', row.Name);
      continue;
    }

    // Parse rankings safely
    const parseRank = (val: string | number) => {
        const parsed = parseInt(val?.toString());
        return isNaN(parsed) ? null : parsed;
    };

    // 2. Insert into tournament_golfers
    const { error: insertError } = await supabase
      .from('tournament_golfers')
      .insert({
        tournament_id: tournamentId,
        golfer_id: golferId,
        dg_rank: parseRank(row["DG Rank"]),
        owg_rank: parseRank(row["OWGR"]),
      });

    if (insertError) {
      // If already in field, just count as success (or ignore)
      if (insertError.code === '23505') {
        successCount++;
      } else {
        console.error('Error inserting field golfer:', row.Name, insertError);
      }
    } else {
        successCount++;
    }
  }
  
  return successCount;
};
