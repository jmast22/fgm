
const API_KEY = '6da4d1915966b3a09f8d286edc801861';

async function testOddsApi() {
  try {
    const sportsResponse = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${API_KEY}`);
    const sports = await sportsResponse.json();
    console.log('Available Golf Sports:');
    const golfSports = sports.filter(s => s.key && s.key.toLowerCase().includes('golf'));
    console.log(JSON.stringify(golfSports, null, 2));

    for (const sport of golfSports) {
      if (sport.key.includes('masters') || sport.key.includes('pga')) {
        console.log(`\nFetching odds for ${sport.key}...`);
        const oddsResponse = await fetch(`https://api.the-odds-api.com/v4/sports/${sport.key}/odds/?apiKey=${API_KEY}&regions=us&markets=outrights`);
        const odds = await oddsResponse.json();
        if (Array.isArray(odds)) {
          console.log(`Odds Data for ${sport.key} (first event):`);
          console.log(JSON.stringify(odds[0], null, 2));
          break;
        } else {
          console.log(`Failed to fetch odds for ${sport.key}:`, JSON.stringify(odds));
        }
      }
    }
  } catch (error) {
    console.error('Error testing Odds API:', error);
  }
}

testOddsApi();
