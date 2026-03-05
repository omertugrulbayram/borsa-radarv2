// Yahoo Finance v10 quoteSummary — server-side proxy (no CORS, no crumb needed from Vercel IP)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://finance.yahoo.com',
    'Referer': 'https://finance.yahoo.com/',
  };

  try {
    // Step 1: Get crumb by hitting the quote page
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers });
    const crumb = await crumbRes.text();

    const modules = 'defaultKeyStatistics,financialData,summaryDetail,assetProfile,incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory';
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;

    const r = await fetch(url, { headers });
    const data = await r.json();

    if (data.quoteSummary?.error || !data.quoteSummary?.result?.[0]) {
      // Try v11 as fallback
      const url11 = `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${ticker}?modules=${modules}`;
      const r11 = await fetch(url11, { headers });
      const d11 = await r11.json();
      if (!d11.quoteSummary?.result?.[0]) {
        return res.status(200).json({ fundamentals: {}, news: [], error: 'no_data' });
      }
      return res.status(200).json(parseResult(d11.quoteSummary.result[0]));
    }

    return res.status(200).json(parseResult(data.quoteSummary.result[0]));

  } catch(e) {
    return res.status(500).json({ error: e.message, fundamentals: {}, news: [] });
  }
}

function parseResult(s) {
  const ks  = s.defaultKeyStatistics || {};
  const fd  = s.financialData || {};
  const sd  = s.summaryDetail || {};
  const ap  = s.assetProfile || {};
  const is0 = s.incomeStatementHistory?.incomeStatementHistory?.[0] || {};
  const is1 = s.incomeStatementHistory?.incomeStatementHistory?.[1] || {};
  const bs0 = s.balanceSheetHistory?.balanceSheetHistory?.[0] || {};
  const cf0 = s.cashflowStatementHistory?.cashflowStatementHistory?.[0] || {};

  const r  = (v) => v?.raw ?? v ?? null;
  const n  = (v, d=2) => r(v) != null ? +parseFloat(r(v)).toFixed(d) : null;
  const pct = (v, d=1) => r(v) != null ? +(r(v)*100).toFixed(d) : null;

  const rev0 = r(is0.totalRevenue), rev1 = r(is1.totalRevenue);
  const ni0  = r(is0.netIncome),    ni1  = r(is1.netIncome);

  const fundamentals = {
    pe:             n(ks.trailingPE, 1),
    forwardPE:      n(ks.forwardPE, 1),
    pb:             n(ks.priceToBook, 2),
    ps:             n(ks.priceToSalesTrailing12Months, 2),
    eps:            n(ks.trailingEps, 2),
    forwardEps:     n(ks.forwardEps, 2),
    roe:            pct(fd.returnOnEquity),
    roa:            pct(fd.returnOnAssets),
    grossMargin:    pct(fd.grossMargins),
    operMargin:     pct(fd.operatingMargins),
    profitMargin:   pct(fd.profitMargins),
    revenueGrowth:  pct(fd.revenueGrowth) ?? (rev0&&rev1&&rev1!==0 ? +((rev0-rev1)/Math.abs(rev1)*100).toFixed(1) : null),
    earningsGrowth: pct(fd.earningsGrowth) ?? (ni0&&ni1&&ni1!==0 ? +((ni0-ni1)/Math.abs(ni1)*100).toFixed(1) : null),
    debtToEquity:   n(fd.debtToEquity, 2),
    currentRatio:   n(fd.currentRatio, 2),
    quickRatio:     n(fd.quickRatio, 2),
    totalCash:      r(fd.totalCash) ?? r(bs0.cash),
    totalDebt:      r(fd.totalDebt) ?? r(bs0.longTermDebt),
    freeCashflow:   r(fd.freeCashflow) ?? r(cf0.freeCashflow),
    totalRevenue:   r(is0.totalRevenue),
    netIncome:      r(is0.netIncome),
    operatingIncome:r(is0.operatingIncome),
    dividendYield:  pct(sd.dividendYield),
    dividendRate:   n(sd.dividendRate, 2),
    payoutRatio:    pct(ks.payoutRatio),
    targetPrice:    n(fd.targetMeanPrice, 1),
    targetHigh:     n(fd.targetHighPrice, 1),
    targetLow:      n(fd.targetLowPrice, 1),
    recommendation: fd.recommendationKey ?? null,
    analystCount:   r(fd.numberOfAnalystOpinions),
    sector:         ap.sector ?? null,
    industry:       ap.industry ?? null,
    employees:      ap.fullTimeEmployees ?? null,
    marketCap:      r(sd.marketCap),
    beta:           n(ks.beta, 2),
    week52High:     n(ks.fiftyTwoWeekHigh, 2),
    week52Low:      n(ks.fiftyTwoWeekLow, 2),
  };

  return { fundamentals, news: [] };
}
