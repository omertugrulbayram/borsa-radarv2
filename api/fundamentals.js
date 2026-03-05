export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics,financialData,summaryDetail,assetProfile`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://finance.yahoo.com',
        }
      }
    );
    const d = await r.json();
    const res0 = d?.quoteSummary?.result?.[0] || {};
    const ks = res0.defaultKeyStatistics || {};
    const fd = res0.financialData || {};
    const sd = res0.summaryDetail || {};
    const ap = res0.assetProfile || {};

    const n = (v, dec = 2) => v?.raw != null ? +parseFloat(v.raw).toFixed(dec) : null;
    const pct = (v, dec = 1) => v?.raw != null ? +(v.raw * 100).toFixed(dec) : null;

    return res.status(200).json({
      // Değerleme
      pe:              n(ks.trailingPE, 1),
      forwardPE:       n(ks.forwardPE, 1),
      pb:              n(ks.priceToBook, 2),
      ps:              n(ks.priceToSalesTrailing12Months, 2),
      eps:             n(ks.trailingEps, 2),
      forwardEps:      n(ks.forwardEps, 2),
      // Karlılık
      roe:             pct(fd.returnOnEquity),
      roa:             pct(fd.returnOnAssets),
      grossMargin:     pct(fd.grossMargins),
      operMargin:      pct(fd.operatingMargins),
      profitMargin:    pct(fd.profitMargins),
      // Büyüme
      revenueGrowth:   pct(fd.revenueGrowth),
      earningsGrowth:  pct(fd.earningsGrowth),
      // Bilanço sağlığı
      debtToEquity:    n(fd.debtToEquity, 2),
      currentRatio:    n(fd.currentRatio, 2),
      quickRatio:      n(fd.quickRatio, 2),
      totalCash:       fd.totalCash?.raw ?? null,
      totalDebt:       fd.totalDebt?.raw ?? null,
      freeCashflow:    fd.freeCashflow?.raw ?? null,
      // Temettü
      dividendYield:   pct(sd.dividendYield),
      dividendRate:    n(sd.dividendRate, 2),
      payoutRatio:     pct(ks.payoutRatio),
      // Analist
      targetPrice:     n(fd.targetMeanPrice, 1),
      targetHigh:      n(fd.targetHighPrice, 1),
      targetLow:       n(fd.targetLowPrice, 1),
      recommendation:  fd.recommendationKey ?? null,
      analystCount:    fd.numberOfAnalystOpinions?.raw ?? null,
      // Şirket
      sector:          ap.sector ?? null,
      industry:        ap.industry ?? null,
      employees:       ap.fullTimeEmployees ?? null,
      marketCap:       sd.marketCap?.raw ?? null,
      beta:            n(ks.beta, 2),
      week52High:      n(ks.fiftyTwoWeekHigh, 2),
      week52Low:       n(ks.fiftyTwoWeekLow, 2),
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
