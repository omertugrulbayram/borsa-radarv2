export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { code = 'THYAO' } = req.query;
  const ticker = `${code}.IS`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com',
    'Cookie': 'GUC=AQE=',
  };

  const results = {};

  // Test 1: get crumb
  try {
    const cr = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers });
    const crumb = await cr.text();
    results.crumb = { status: cr.status, value: crumb.slice(0,30) };

    // Test 2: quoteSummary with crumb
    const modules = 'defaultKeyStatistics,financialData,summaryDetail,incomeStatementHistory,balanceSheetHistory';
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
    const r2 = await fetch(url, { headers });
    const d2 = await r2.json();
    results.quoteSummary = { status: r2.status, hasResult: !!d2?.quoteSummary?.result?.[0], error: d2?.quoteSummary?.error, sample: JSON.stringify(d2).slice(0,300) };
  } catch(e) {
    results.crumbError = e.message;
  }

  // Test 3: v8 chart (already works)
  try {
    const r3 = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1m`, { headers });
    const d3 = await r3.json();
    results.chart = { status: r3.status, hasMeta: !!d3?.chart?.result?.[0]?.meta };
  } catch(e) { results.chartError = e.message; }

  // Test 4: FMP stable profile (only free endpoint)
  try {
    const key = process.env.FMP_API_KEY;
    const r4 = await fetch(`https://financialmodelingprep.com/stable/profile?symbol=${ticker}&apikey=${key}`);
    const d4 = await r4.json();
    results.fmpProfile = { status: r4.status, sample: JSON.stringify(d4).slice(0,300) };
  } catch(e) { results.fmpError = e.message; }

  return res.status(200).json(results);
}
