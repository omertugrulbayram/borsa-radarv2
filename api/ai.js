const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Referer': 'https://finance.yahoo.com',
};

async function getFundamentals(ticker) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics,financialData`,
      { headers: YAHOO_HEADERS }
    );
    const d = await r.json();
    const ks = d?.quoteSummary?.result?.[0]?.defaultKeyStatistics || {};
    const fd = d?.quoteSummary?.result?.[0]?.financialData || {};
    return {
      pe:             ks.trailingPE?.raw ?? null,
      pb:             ks.priceToBook?.raw ?? null,
      eps:            ks.trailingEps?.raw ?? null,
      roe:            fd.returnOnEquity?.raw != null ? +(fd.returnOnEquity.raw * 100).toFixed(1) : null,
      debtToEquity:   fd.debtToEquity?.raw ?? null,
      currentRatio:   fd.currentRatio?.raw ?? null,
      revenueGrowth:  fd.revenueGrowth?.raw != null ? +(fd.revenueGrowth.raw * 100).toFixed(1) : null,
      earningsGrowth: fd.earningsGrowth?.raw != null ? +(fd.earningsGrowth.raw * 100).toFixed(1) : null,
      targetPrice:    fd.targetMeanPrice?.raw ?? null,
      recommendation: fd.recommendationKey ?? null,
      grossMargins:   fd.grossMargins?.raw != null ? +(fd.grossMargins.raw * 100).toFixed(1) : null,
      operMargins:    fd.operatingMargins?.raw != null ? +(fd.operatingMargins.raw * 100).toFixed(1) : null,
    };
  } catch(e) { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { code, name, price, chg } = req.body;
  const ticker = code + '.IS';

  try {
    const fund = await getFundamentals(ticker);

    const fundLine = [
      fund.pe != null      && `F/K:${parseFloat(fund.pe).toFixed(1)}`,
      fund.pb != null      && `PD/DD:${parseFloat(fund.pb).toFixed(2)}`,
      fund.eps != null     && `EPS:${parseFloat(fund.eps).toFixed(2)}TL`,
      fund.roe != null     && `ROE:%${fund.roe}`,
      fund.debtToEquity != null && `D/E:${parseFloat(fund.debtToEquity).toFixed(2)}`,
      fund.currentRatio != null && `CR:${parseFloat(fund.currentRatio).toFixed(2)}`,
      fund.revenueGrowth != null && `GelirBuy:%${fund.revenueGrowth}`,
      fund.targetPrice != null  && `Hedef:${parseFloat(fund.targetPrice).toFixed(1)}TL`,
    ].filter(Boolean).join(' | ');

    const prompt = `${code} (${name}) analiz et. Fiyat:${price}TL Degisim:%${chg}${fundLine ? '\n' + fundLine : ''}
Asagidaki JSON formatini AYNEN doldur, fazladan hicbir karakter ekleme:
{"s":75,"sentiment":"OLUMLU","t":70,"f":65,"m":72,"summary":"buraya 2 cumle yaz","signal":"AL","destek":${(price*0.95).toFixed(1)},"direnc":${(price*1.05).toFixed(1)},"pe_yorum":"buraya yaz","roe_yorum":"buraya yaz","borc_yorum":"buraya yaz","buyume_yorum":"buraya yaz","risk1":"buraya yaz","risk2":"buraya yaz","firsat1":"buraya yaz","firsat2":"buraya yaz"}`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const d = await r.json();
    const text = d.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON bulunamadı');
    const ai = JSON.parse(match[0]);

    return res.status(200).json({
      sentiment_score: ai.s || 50,
      sentiment: ai.sentiment || 'NÖTR',
      technical_score: ai.t || 50,
      fundamental_score: ai.f || 50,
      momentum_score: ai.m || 50,
      summary: ai.summary || '',
      signal: ai.signal || 'TUT',
      key_levels: { destek: ai.destek, direnc: ai.direnc },
      balance_sheet: {
        pe_comment:     ai.pe_yorum,
        roe_comment:    ai.roe_yorum,
        debt_comment:   ai.borc_yorum,
        growth_comment: ai.buyume_yorum,
      },
      risks: [ai.risk1, ai.risk2].filter(Boolean),
      opportunities: [ai.firsat1, ai.firsat2].filter(Boolean),
      fundamentals_raw: Object.keys(fund).length ? fund : undefined,
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
