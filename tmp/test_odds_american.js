
const API_KEY = '6da4d1915966b3a09f8d286edc801861';

async function testOddsApi() {
  try {
    const sportKey = 'golf_masters_tournament_winner';
    console.log(`\nFetching odds for ${sportKey} in american format...`);
    const oddsResponse = await fetch(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${API_KEY}&regions=us&markets=outrights&oddsFormat=american`);
    const odds = await oddsResponse.json();
    if (Array.isArray(odds) && odds.length > 0) {
      console.log(`Odds Data for ${sportKey} (first bookmaker, first 5 outcomes):`);
      const outcomes = odds[0].bookmakers[0].markets[0].outcomes;
      console.log(JSON.stringify(outcomes.slice(0, 5), null, 2));
    }
  } catch (error) {
    console.error('Error testing Odds API:', error);
  }
}

testOddsApi();
