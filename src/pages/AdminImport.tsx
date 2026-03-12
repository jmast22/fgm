import { useState } from 'react';

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

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 animate-fade-in fade-in-up">
      <h1 className="text-3xl font-bold text-green-800 dark:text-green-400">Admin Data Import</h1>
      
      {status && (
        <div className="bg-blue-50 dark:bg-blue-900 border-l-4 border-blue-500 p-4 rounded-r-md">
          <p className="text-blue-700 dark:text-blue-200">{status}</p>
        </div>
      )}

      {/* Golfer Import */}
      <section className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
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
      <section className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
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
      <section className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
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
      
      {/* Note about RLS */}
      <div className="bg-yellow-50 dark:bg-yellow-900 border-l-4 border-yellow-500 p-4 mt-6 rounded-r-md">
        <h3 className="text-yellow-800 dark:text-yellow-200 font-semibold flex items-center gap-2">
          <span>⚠️</span> Important Database Note
        </h3>
        <p className="text-yellow-700 dark:text-yellow-300 text-sm mt-1">
          Make sure your Row Level Security (RLS) policies permit INSERT operations for your current authenticated user, 
          or temporarily disable RLS on `golfers`, `golfer_aliases`, `tournaments`, and `tournament_golfers` directly in the Supabase Dashboard to complete data seeding.
        </p>
      </div>
    </div>
  );
};

export default AdminImport;
