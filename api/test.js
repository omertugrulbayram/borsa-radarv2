export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { code = 'THYAO' } = req.query;
  const key = process.env.FMP_API_KEY;
  const ticker = `${code}.IS`;
  const base = 'https://financialmodelingprep.com/api/v3';

  const results = {};
  const endpoints = {
    profile:  `${base}/profile/${ticker}?apikey=${key}`,
    ratios:   `${base}/ratios-ttm/${ticker}?apikey=${key}`,
    income:   `${base}/income-statement/${ticker}?limit=2&apikey=${key}`,
    balance:  `${base}/balance-sheet-statement/${ticker}?limit=1&apikey=${key}`,
    cashflow: `${base}/cash-flow-statement/${ticker}?limit=1&apikey=${key}`,
    analyst:  `${base}/analyst-stock-recommendations/${ticker}?limit=3&apikey=${key}`,
    quote:    `${base}/quote/${ticker}?apikey=${key}`,
  };

  for (const [name, url] of Object.entries(endpoints)) {
    try {
      const r = await fetch(url);
      const d = await r.json();
      results[name] = { status: r.status, type: Array.isArray(d) ? 'array' : typeof d, length: Array.isArray(d) ? d.length : null, sample: JSON.stringify(d).slice(0, 300) };
    } catch(e) {
      results[name] = { error: e.message };
    }
  }

  return res.status(200).json(results);
}
