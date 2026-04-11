async function triggerScrape() {
  console.log('Triggering scrape-scores...');
  const res = await fetch('https://vncclxchvaqieetqkhjj.supabase.co/functions/v1/scrape-scores', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sb_publishable_qd4CwXqZ4k6gbgQ0WB3qhg_UsjWewQo' // Actually, Edge Functions usually require anon or service role
    }
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Response:', text);
}
triggerScrape();
