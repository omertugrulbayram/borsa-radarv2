import yahooFinance from 'yahoo-finance2';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  try {
    const [summary, news] = await Promise.allSettled([
      yahooFinance.quoteSummary(ticker, {
        modules: ['defaultKeyStatistics','financialData','summaryDetail','assetProfile','incomeStatementHistory','balanceSheetHistory','cashflowStatementHistory']
      }),
      yahooFinance.search(ticker, { newsCount: 8, quotesCount: 0 })
    ]);

    const s = summary.status === 'fulfilled' ? summary.value : {};
    const ks  = s.defaultKeyStatistics || {};
    const fd  = s.financialData || {};
    const sd  = s.summaryDetail || {};
    const ap  = s.assetProfile || {};
    const is0 = s.incomeStatementHistory?.incomeStatementHistory?.[0] || {};
    const is1 = s.incomeStatementHistory?.incomeStatementHistory?.[1] || {};
    const bs0 = s.balanceSheetHistory?.balanceSheetHistory?.[0] || {};
    const cf0 = s.cashflowStatementHistory?.cashflowStatementHistory?.[0] || {};

    const n  = (v, dec=2) => v != null ? +parseFloat(v).toFixed(dec) : null;
    const pct = (v, dec=1) => v != null ? +(v*100).toFixed(dec) : null;
    const fmtRaw = v => v?.raw ?? v ?? null;

    // Income growth YoY
    const rev0 = fmtRaw(is0.totalRevenue);
    const rev1 = fmtRaw(is1.totalRevenue);
    const ni0  = fmtRaw(is0.netIncome);
    const ni1  = fmtRaw(is1.netIncome);
    const revGrowthCalc = (rev0 && rev1 && rev1 !== 0) ? +((rev0-rev1)/Math.abs(rev1)*100).toFixed(1) : null;
    const niGrowthCalc  = (ni0  && ni1  && ni1  !== 0) ? +((ni0-ni1)/Math.abs(ni1)*100).toFixed(1)   : null;

    const fundamentals = {
      // Değerleme
      pe:             n(fmtRaw(ks.trailingPE), 1),
      forwardPE:      n(fmtRaw(ks.forwardPE), 1),
      pb:             n(fmtRaw(ks.priceToBook), 2),
      ps:             n(fmtRaw(ks.priceToSalesTrailing12Months), 2),
      eps:            n(fmtRaw(ks.trailingEps), 2),
      forwardEps:     n(fmtRaw(ks.forwardEps), 2),
      // Karlılık
      roe:            pct(fmtRaw(fd.returnOnEquity)),
      roa:            pct(fmtRaw(fd.returnOnAssets)),
      grossMargin:    pct(fmtRaw(fd.grossMargins)),
      operMargin:     pct(fmtRaw(fd.operatingMargins)),
      profitMargin:   pct(fmtRaw(fd.profitMargins)),
      // Büyüme
      revenueGrowth:  pct(fmtRaw(fd.revenueGrowth)) ?? revGrowthCalc,
      earningsGrowth: pct(fmtRaw(fd.earningsGrowth)) ?? niGrowthCalc,
      // Bilanço sağlığı
      debtToEquity:   n(fmtRaw(fd.debtToEquity), 2),
      currentRatio:   n(fmtRaw(fd.currentRatio), 2),
      quickRatio:     n(fmtRaw(fd.quickRatio), 2),
      totalCash:      fmtRaw(fd.totalCash) ?? fmtRaw(bs0.cash),
      totalDebt:      fmtRaw(fd.totalDebt) ?? fmtRaw(bs0.longTermDebt),
      freeCashflow:   fmtRaw(fd.freeCashflow) ?? fmtRaw(cf0.freeCashflow),
      totalRevenue:   fmtRaw(is0.totalRevenue),
      netIncome:      fmtRaw(is0.netIncome),
      operatingIncome:fmtRaw(is0.operatingIncome),
      // Temettü
      dividendYield:  pct(fmtRaw(sd.dividendYield)),
      dividendRate:   n(fmtRaw(sd.dividendRate), 2),
      payoutRatio:    pct(fmtRaw(ks.payoutRatio)),
      // Analist
      targetPrice:    n(fmtRaw(fd.targetMeanPrice), 1),
      targetHigh:     n(fmtRaw(fd.targetHighPrice), 1),
      targetLow:      n(fmtRaw(fd.targetLowPrice), 1),
      recommendation: fd.recommendationKey ?? null,
      analystCount:   fmtRaw(fd.numberOfAnalystOpinions),
      // Meta
      sector:         ap.sector ?? null,
      industry:       ap.industry ?? null,
      employees:      ap.fullTimeEmployees ?? null,
      marketCap:      fmtRaw(sd.marketCap),
      beta:           n(fmtRaw(ks.beta), 2),
      week52High:     n(fmtRaw(ks.fiftyTwoWeekHigh), 2),
      week52Low:      n(fmtRaw(ks.fiftyTwoWeekLow), 2),
      sharesOutstanding: fmtRaw(ks.sharesOutstanding),
    };

    // News
    const rawNews = news.status === 'fulfilled' ? (news.value?.news || []) : [];
    const newsItems = rawNews.slice(0,8).map(n => ({
      title:     n.title || '',
      publisher: n.publisher || '',
      link:      n.link || '',
      time:      n.providerPublishTime ? relTime(n.providerPublishTime * 1000) : 'Bugün',
    }));

    return res.status(200).json({ fundamentals, news: newsItems });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}

function relTime(ms) {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} gün önce`;
  if (h > 0) return `${h} saat önce`;
  if (m > 0) return `${m} dk önce`;
  return 'Az önce';
}
