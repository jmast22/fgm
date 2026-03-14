import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { scraperService } from '../services/scraperService';
import type { ScrapeResult } from '../services/scraperService';

// Helper function to read file as text
const readFileContent = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
};

const AdminImport = () => {
  const [golferFile, setGolferFile] = useState<File | null>(null);
  const [scheduleFile, setScheduleFile] = useState<File | null>(null);
  const [fieldFile, setFieldFile] = useState<File | null>(null);
  const [tournamentId, setTournamentId] = useState('');
  
  const [status, setStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Scraper states
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [unmatchedAliases, setUnmatchedAliases] = useState<Record<string, string>>({}); // espnName -> golferId
  const [allGolfers, setAllGolfers] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    // Load golfers for alias mapping
    const loadGolfers = async () => {
      const { data } = await supabase.from('golfers').select('id, name').order('name');
      if (data) setAllGolfers(data);
    };
    loadGolfers();
  }, []);

  const handleGolferImport = async () => {
    if (!golferFile) return;
    setIsLoading(true);
    setStatus('Reading golfer file...');
    try {
      const { importGolfers } = await import('../services/importService');
      const content = await readFileContent(golferFile);
      setStatus('Importing golfers...');
      const count = await importGolfers(content);
      setStatus(`Successfully imported ${count} golfers!`);
    } catch (err: any) {
      console.error(err);
      setStatus(`Error importing golfers: ${err.message || 'Check console'}`);
    } finally {
      setIsLoading(false);
      setGolferFile(null);
    }
  };

  const handleScheduleImport = async () => {
    if (!scheduleFile) return;
    setIsLoading(true);
    setStatus('Reading schedule file...');
    try {
      const { importTournaments } = await import('../services/importService');
      const content = await readFileContent(scheduleFile);
      setStatus('Importing schedule...');
      const count = await importTournaments(content);
      setStatus(`Successfully imported ${count} tournaments!`);
    } catch (err: any) {
      console.error(err);
      setStatus(`Error importing schedule: ${err.message || 'Check console'}`);
    } finally {
      setIsLoading(false);
      setScheduleFile(null);
    }
  };

  const handleFieldImport = async () => {
    if (!fieldFile) return;
    if (!tournamentId) {
      setStatus('Please provide a Tournament ID.');
      return;
    }
    setIsLoading(true);
    setStatus('Reading field file...');
    try {
      const { importTournamentField } = await import('../services/importService');
      const content = await readFileContent(fieldFile);
      setStatus('Importing field...');
      const count = await importTournamentField(tournamentId, content);
      setStatus(`Successfully imported ${count} field golfers!`);
    } catch (err: any) {
      console.error(err);
      setStatus(`Error importing field: ${err.message || 'Check console'}`);
    } finally {
      setIsLoading(false);
      setFieldFile(null);
      setTournamentId('');
    }
  };

  const handleScrape = async () => {
    setIsLoading(true);
    setStatus('🚀 Starting ESPN score scrape...');
    try {
      const result = await scraperService.scrapeRoundScores();
      setScrapeResult(result);
      if (result.success) {
        setStatus(`✅ Scrape complete for ${result.tournamentName}! Upserted ${result.roundStatsUpserted} records.`);
      } else {
        setStatus(`⚠️ Scrape finished with errors. Check details below.`);
      }
    } catch (err: any) {
      setStatus(`❌ Scrape error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddAlias = async (espnName: string, golferId: string) => {
    if (!golferId) return;
    
    setIsLoading(true);
    try {
      const success = await scraperService.addGolferAlias(golferId, espnName);
      if (success) {
        setStatus(`✅ Added alias: "${espnName}" -> ${allGolfers.find(g => g.id === golferId)?.name}`);
        // Remove from list
        setScrapeResult(prev => prev ? {
          ...prev,
          unmatchedNames: prev.unmatchedNames.filter(n => n !== espnName)
        } : null);
      } else {
        setStatus('❌ Failed to add alias.');
      }
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 animate-fade-in fade-in-up">
      <h1 className="text-3xl font-bold text-green-800 dark:text-green-400">Admin Data Import</h1>
      
      {status && (
        <div className="bg-blue-50 dark:bg-blue-900 border-l-4 border-blue-500 p-4 rounded-r-md">
          <p className="text-blue-700 dark:text-blue-200">{status}</p>
        </div>
      )}

      {/* Scraper Section */}
      <section className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border-2 border-green-500 shadow-green-100 dark:shadow-green-900/20">
        <h2 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span>🏌️</span> Live ESPN Scraper (Phase 11)
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Fetch real-time round scores directly from ESPN's scoreboard API. 
          This will automatically match the current tournament and sync scores for all golfers.
        </p>

        <div className="flex flex-wrap gap-4">
          <button 
            onClick={handleScrape}
            disabled={isLoading}
            className="flex-1 px-6 py-3 bg-green-600 dark:bg-green-500 text-white font-bold rounded-lg hover:bg-green-700 dark:hover:bg-green-600 disabled:opacity-50 transition-all shadow-lg hover:shadow-green-200 dark:hover:shadow-none"
          >
            {isLoading ? '🔄 Scraping...' : '🚀 Scrape Live Round Scores'}
          </button>
        </div>

        {scrapeResult && (
          <div className="mt-6 space-y-4 border-t pt-4 border-gray-100 dark:border-gray-700">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                <span className="block text-xs text-gray-400 uppercase font-bold">Matched</span>
                <span className="text-xl font-bold text-green-600">{scrapeResult.golfersMatched}</span>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                <span className="block text-xs text-gray-400 uppercase font-bold">Unmatched</span>
                <span className="text-xl font-bold text-red-500">{scrapeResult.golfersUnmatched}</span>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                <span className="block text-xs text-gray-400 uppercase font-bold">Records</span>
                <span className="text-xl font-bold text-blue-600">{scrapeResult.roundStatsUpserted}</span>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                <span className="block text-xs text-gray-400 uppercase font-bold">Duration</span>
                <span className="text-xl font-bold text-gray-600 dark:text-gray-300">{(scrapeResult.durationMs / 1000).toFixed(1)}s</span>
              </div>
            </div>

            {scrapeResult.unmatchedNames.length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-100 dark:border-red-900/30">
                <h3 className="text-sm font-bold text-red-800 dark:text-red-400 mb-3 flex items-center gap-2">
                  <span>⚠️</span> Unmatched Golfers ({scrapeResult.unmatchedNames.length})
                </h3>
                <div className="max-h-60 overflow-y-auto space-y-3">
                  {scrapeResult.unmatchedNames.map(name => (
                    <div key={name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-white dark:bg-gray-800 rounded border border-red-100 dark:border-red-800">
                      <span className="text-sm font-medium">{name}</span>
                      <div className="flex gap-2">
                        <select 
                          className="text-xs p-1 border rounded bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                          value={unmatchedAliases[name] || ''}
                          onChange={(e) => setUnmatchedAliases(prev => ({ ...prev, [name]: e.target.value }))}
                        >
                          <option value="">Map to golfer...</option>
                          {allGolfers.map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                        <button 
                          onClick={() => handleAddAlias(name, unmatchedAliases[name])}
                          disabled={!unmatchedAliases[name] || isLoading}
                          className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          Add Alias
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {scrapeResult.errors.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-100 dark:border-yellow-900/30">
                <h3 className="text-sm font-bold text-yellow-800 dark:text-yellow-400 mb-2">Errors/Warnings</h3>
                <ul className="text-xs list-disc pl-4 space-y-1 text-yellow-700 dark:text-yellow-300">
                  {scrapeResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Golfer Import */}
      <section className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 opacity-80 hover:opacity-100 transition-opacity">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">1. Master Golfer List</h2>
        <p className="text-sm text-gray-500 mb-4">Import <code>2026_complete_player_list.csv</code>.</p>
        <div className="flex items-center gap-4">
          <input 
            type="file" 
            accept=".csv"
            onChange={e => setGolferFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 transition"
          />
          <button 
            onClick={handleGolferImport}
            disabled={!golferFile || isLoading}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            Import
          </button>
        </div>
      </section>

      {/* Schedule Import */}
      <section className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 opacity-80 hover:opacity-100 transition-opacity">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">2. Tournament Schedule</h2>
        <p className="text-sm text-gray-500 mb-4">Import <code>schedule.csv</code>.</p>
        <div className="flex items-center gap-4">
          <input 
            type="file" 
            accept=".csv"
            onChange={e => setScheduleFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 transition"
          />
          <button 
            onClick={handleScheduleImport}
            disabled={!scheduleFile || isLoading}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            Import
          </button>
        </div>
      </section>

      {/* Field Import */}
      <section className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 opacity-80 hover:opacity-100 transition-opacity">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">3. Tournament Field</h2>
        <p className="text-sm text-gray-500 mb-4">Import <code>players_field_the_players.csv</code>. Requires Tournament ID.</p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tournament ID (UUID)</label>
            <input 
              type="text" 
              value={tournamentId}
              onChange={e => setTournamentId(e.target.value)}
              placeholder="e.g. 123e4567-e89b-12d3... (check Supabase table)"
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none transition"
            />
          </div>
          
          <div className="flex items-center gap-4">
            <input 
              type="file" 
              accept=".csv"
              onChange={e => setFieldFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 transition"
            />
            <button 
              onClick={handleFieldImport}
              disabled={!fieldFile || !tournamentId || isLoading}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              Import
            </button>
          </div>
        </div>
      </section>

      {/* Seed Scores */}
      <section className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 opacity-50">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100 italic">4. Seed Tournament Scores (Legacy)</h2>
        <p className="text-sm text-gray-500 mb-4 italic">Generate realistic mock round scores for testing. Use the scraper above for real data.</p>
        <div className="flex items-center gap-4">
          <button 
            onClick={async () => {
              setIsLoading(true);
              setStatus('Seeding Players Championship scores...');
              try {
                const { seedPlayersChampionship } = await import('../services/seedScores');
                const result = await seedPlayersChampionship();
                if (result.success) {
                  setStatus(`✅ Seeded ${result.inserted} records! ${result.madeCut} made cut, ${result.missedCut} missed cut.`);
                } else {
                  setStatus(`❌ Seed failed: ${result.error}`);
                }
              } catch (err: any) {
                setStatus(`Error seeding scores: ${err.message}`);
              } finally {
                setIsLoading(false);
              }
            }}
            disabled={isLoading}
            className="px-6 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            🌱 Seed Players Championship Scores
          </button>
        </div>
      </section>
      
      {/* Note about RLS */}
      <div className="bg-yellow-50 dark:bg-yellow-900 border-l-4 border-yellow-500 p-4 mt-6 rounded-r-md">
        <h3 className="text-yellow-800 dark:text-yellow-200 font-semibold flex items-center gap-2">
          <span>⚠️</span> Important Database Note
        </h3>
        <p className="text-yellow-700 dark:text-yellow-300 text-sm mt-1">
          Make sure your Row Level Security (RLS) policies permit INSERT operations for your current authenticated user, 
          or temporarily disable RLS on `golfers`, `golfer_aliases`, `tournaments`, `tournament_golfers`, and `golfer_round_stats` directly in the Supabase Dashboard to complete data seeding.
        </p>
      </div>
    </div>
  );
};

export default AdminImport;
