
const API_KEY = '6da4d1915966b3a09f8d286edc801861';

async function testOddsApi() {
  try {
    const sportsResponse = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${API_KEY}`);
    const sports = await sportsResponse.json();
    console.log('Available Golf Sports:');
    const golfSports = sports.filter(s => s.key.includes('golf'));
    console.log(JSON.stringify(golfSports, null, 2));

    if (golfSports.length > 0) {
      // Try to fetch odds for the first golf sport
      const sportKey = 'golf_masters_tournament'; // Guessing the key for Masters
      console.log(`\nFetching odds for ${sportKey}...`);
      const oddsResponse = await fetch(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${API_KEY}&regions=us&markets=outrights`);
      const odds = await oddsResponse.json();
      console.log('Odds Data (first 2 events):');
      console.log(JSON.stringify(odds.slice(0, 2), null, 2));
    }
  } catch (error) {
    console.error('Error testing Odds API:', error);
  }
}

testOddsApi();
