export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { code = 'THYAO' } = req.query;
  const key = process.env.FMP_API_KEY;
  const ticker = `${code}.IS`;
  const base4 = 'https://financialmodelingprep.com/api/v4';
  const baseS = 'https://financialmodelingprep.com/stable';

  const results = {};
  const endpoints = {
    // v4 endpoints
    'v4_profile':        `${base4}/company/profile?symbol=${ticker}&apikey=${key}`,
    'v4_ratios':         `${base4}/ratios?symbol=${ticker}&period=annual&limit=2&apikey=${key}`,
    'v4_income':         `${base4}/income-statement?symbol=${ticker}&period=annual&limit=2&apikey=${key}`,
    'v4_balance':        `${base4}/balance-sheet-statement?symbol=${ticker}&period=annual&limit=1&apikey=${key}`,
    'v4_cashflow':       `${base4}/cash-flow-statement?symbol=${ticker}&period=annual&limit=1&apikey=${key}`,
    'v4_quote':          `${base4}/quote?symbol=${ticker}&apikey=${key}`,
    'v4_analyst':        `${base4}/analyst-estimates?symbol=${ticker}&period=annual&limit=2&apikey=${key}`,
    // stable endpoints
    'stable_profile':    `${baseS}/profile?symbol=${ticker}&apikey=${key}`,
    'stable_income':     `${baseS}/income-statement?symbol=${ticker}&period=annual&limit=2&apikey=${key}`,
    'stable_ratios':     `${baseS}/ratios?symbol=${ticker}&period=annual&limit=1&apikey=${key}`,
    'stable_quote':      `${baseS}/quote?symbol=${ticker}&apikey=${key}`,
    'stable_key_metrics':`${baseS}/key-metrics?symbol=${ticker}&period=annual&limit=1&apikey=${key}`,
  };

  for (const [name, url] of Object.entries(endpoints)) {
    try {
      const r = await fetch(url);
      const d = await r.json();
      results[name] = { status: r.status, type: Array.isArray(d) ? 'array' : typeof d, len: Array.isArray(d) ? d.length : null, sample: JSON.stringify(d).slice(0, 200) };
    } catch(e) {
      results[name] = { error: e.message };
    }
  }
  return res.status(200).json(results);
}
