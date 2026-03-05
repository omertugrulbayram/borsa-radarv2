// Financial Modeling Prep API — bilanço, çarpanlar, analist hedefleri
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'code required' });

  const key = process.env.FMP_API_KEY;
  if (!key) return res.status(500).json({ error: 'FMP_API_KEY not set' });

  // FMP BIST ticker format: THYAO.IS
  const ticker = `${code}.IS`;
  const base = 'https://financialmodelingprep.com/api/v3';

  try {
    const [profile, ratios, income, balance, cashflow, analyst, quote] = await Promise.allSettled([
      fetch(`${base}/profile/${ticker}?apikey=${key}`).then(r=>r.json()),
      fetch(`${base}/ratios-ttm/${ticker}?apikey=${key}`).then(r=>r.json()),
      fetch(`${base}/income-statement/${ticker}?limit=4&apikey=${key}`).then(r=>r.json()),
      fetch(`${base}/balance-sheet-statement/${ticker}?limit=2&apikey=${key}`).then(r=>r.json()),
      fetch(`${base}/cash-flow-statement/${ticker}?limit=2&apikey=${key}`).then(r=>r.json()),
      fetch(`${base}/analyst-stock-recommendations/${ticker}?limit=5&apikey=${key}`).then(r=>r.json()),
      fetch(`${base}/quote/${ticker}?apikey=${key}`).then(r=>r.json()),
    ]);

    const p  = Array.isArray(profile.value)  ? profile.value[0]  || {} : {};
    const r0 = Array.isArray(ratios.value)   ? ratios.value[0]   || {} : {};
    const i0 = Array.isArray(income.value)   ? income.value[0]   || {} : {};
    const i1 = Array.isArray(income.value)   ? income.value[1]   || {} : {};
    const b0 = Array.isArray(balance.value)  ? balance.value[0]  || {} : {};
    const cf = Array.isArray(cashflow.value) ? cashflow.value[0] || {} : {};
    const an = Array.isArray(analyst.value) ? analyst.value : [];
    const q0 = Array.isArray(quote.value)    ? quote.value[0]    || {} : {};

    const n = (v, d=2) => v != null && !isNaN(v) ? +parseFloat(v).toFixed(d) : null;
    const pct = (v, d=1) => v != null && !isNaN(v) ? +(v*100).toFixed(d) : null;
    const fmtGrowth = (cur, prev) => (cur && prev && prev !== 0) ? +((cur-prev)/Math.abs(prev)*100).toFixed(1) : null;

    // Analist özeti
    const analystSummary = an.slice(0,3).map(a => ({
      date: a.date,
      buy: a.analystRatingsBuy,
      hold: a.analystRatingsHold,
      sell: a.analystRatingsSell,
    }));
    const totalBuy  = an[0] ? (an[0].analystRatingsBuy||0) : 0;
    const totalHold = an[0] ? (an[0].analystRatingsHold||0) : 0;
    const totalSell = an[0] ? (an[0].analystRatingsSell||0) + (an[0].analystRatingsStrongSell||0) : 0;
    const totalAn   = totalBuy + totalHold + totalSell;
    const recText   = totalBuy > totalSell+totalHold ? 'GÜÇLÜ AL' : totalBuy > totalSell ? 'AL' : totalSell > totalBuy ? 'SAT' : 'TUT';
    const recCol    = recText.includes('AL') ? 'up' : recText === 'SAT' ? 'down' : 'neutral';

    return res.status(200).json({
      // Şirket bilgisi
      companyName:   p.companyName || null,
      sector:        p.sector || null,
      industry:      p.industry || null,
      description:   p.description ? p.description.substring(0,200)+'...' : null,
      employees:     p.fullTimeEmployees || null,
      website:       p.website || null,
      marketCap:     p.mktCap || null,
      beta:          n(p.beta),
      ipoDate:       p.ipoDate || null,

      // Değerleme çarpanları (TTM)
      pe:            n(r0.peRatioTTM, 1),
      pb:            n(r0.priceToBookRatioTTM, 2),
      ps:            n(r0.priceToSalesRatioTTM, 2),
      evEbitda:      n(r0.enterpriseValueMultipleTTM, 1),
      eps:           n(r0.epsTTM, 2),
      dividendYield: pct(r0.dividendYieldTTM),

      // Karlılık
      roe:           pct(r0.returnOnEquityTTM),
      roa:           pct(r0.returnOnAssetsTTM),
      roic:          pct(r0.returnOnCapitalEmployedTTM),
      grossMargin:   pct(r0.grossProfitMarginTTM),
      operMargin:    pct(r0.operatingProfitMarginTTM),
      netMargin:     pct(r0.netProfitMarginTTM),
      ebitdaMargin:  pct(r0.ebitdaPerShareTTM),

      // Likidite & Borç
      currentRatio:  n(r0.currentRatioTTM, 2),
      quickRatio:    n(r0.quickRatioTTM, 2),
      debtToEquity:  n(r0.debtEquityRatioTTM, 2),
      debtToAssets:  n(r0.debtRatioTTM, 2),
      interestCover: n(r0.interestCoverageTTM, 1),

      // Gelir tablosu (son dönem)
      revenue:       i0.revenue || null,
      grossProfit:   i0.grossProfit || null,
      operatingIncome: i0.operatingIncome || null,
      netIncome:     i0.netIncome || null,
      ebitda:        i0.ebitda || null,
      eps_reported:  n(i0.eps, 2),
      revenueGrowth: fmtGrowth(i0.revenue, i1.revenue),
      netIncomeGrowth: fmtGrowth(i0.netIncome, i1.netIncome),
      reportPeriod:  i0.date || null,

      // Bilanço
      totalAssets:   b0.totalAssets || null,
      totalDebt:     b0.totalDebt || null,
      totalEquity:   b0.totalStockholdersEquity || null,
      cash:          b0.cashAndCashEquivalents || null,
      shortTermDebt: b0.shortTermDebt || null,
      longTermDebt:  b0.longTermDebt || null,

      // Nakit akışı
      operatingCF:   cf.operatingCashFlow || null,
      capex:         cf.capitalExpenditure || null,
      freeCashFlow:  cf.freeCashFlow || null,
      dividendsPaid: cf.dividendsPaid || null,

      // Analist
      analystBuy:    totalBuy,
      analystHold:   totalHold,
      analystSell:   totalSell,
      analystTotal:  totalAn,
      recommendation: recText,
      recColor:      recCol,
      targetHigh:    n(q0.priceAvg200, 1),

      // 52 hafta
      week52High:    n(q0.yearHigh, 2),
      week52Low:     n(q0.yearLow, 2),
      avgVolume:     q0.avgVolume || null,
      sharesOut:     q0.sharesOutstanding || null,
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
