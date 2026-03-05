const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Referer': 'https://finance.yahoo.com',
};

async function yahooFetch(url) {
  const r = await fetch(url, { headers: YAHOO_HEADERS });
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  return r.json();
}

async function claudeCall(prompt, maxTokens = 600) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const d = await r.json();
  return d.content?.[0]?.text?.replace(/```json|```/g, '').trim() || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { code, name, price, chg, type = 'analysis' } = req.body;
  const ticker = code + '.IS';

  // ── HABERLER ──────────────────────────────────────────────
  if (type === 'news') {
    try {
      const data = await yahooFetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${ticker}&newsCount=8&quotesCount=0&enableFuzzyQuery=false`
      );

      const newsItems = data?.news || [];

      if (!newsItems.length) {
        // Fallback: genel hisse haberleri ara
        const data2 = await yahooFetch(
          `https://query1.finance.yahoo.com/v1/finance/search?q=${code}+borsa+hisse&newsCount=6&quotesCount=0`
        );
        newsItems.push(...(data2?.news || []));
      }

      if (!newsItems.length) {
        return res.status(200).json([{
          headline: `${code} için güncel haber bulunamadı`,
          sentiment: 'NÖTR', time: 'Şimdi', source: 'Yahoo Finance',
          link: `https://finance.yahoo.com/quote/${ticker}/news`
        }]);
      }

      const titles = newsItems.slice(0, 6).map(n => n.title || '').filter(Boolean);

      // Claude sentiment
      const sentText = await claudeCall(
        `${code} hissesiyle ilgili bu haberlerin her biri için POZİTİF, NEGATİF veya NÖTR yaz. Sadece JSON array, başka hiçbir şey:\n${titles.map((t,i)=>`${i+1}. ${t}`).join('\n')}\nÖrnek: ["POZİTİF","NÖTR","NEGATİF"]`,
        200
      );

      let sentiments = [];
      try { sentiments = JSON.parse(sentText); } catch(e) {}

      return res.status(200).json(newsItems.slice(0, 6).map((n, i) => ({
        headline: n.title || '',
        sentiment: sentiments[i] || 'NÖTR',
        time: relTime(n.providerPublishTime * 1000),
        source: n.publisher || 'Yahoo Finance',
        link: n.link || `https://finance.yahoo.com/quote/${ticker}/news`
      })));

    } catch(e) {
      return res.status(500).json([{
        headline: `Haber yüklenemedi: ${e.message}`,
        sentiment: 'NÖTR', time: 'Şimdi', source: 'Hata', link: '#'
      }]);
    }
  }

  // ── BİLANÇO + AI ANALİZ ───────────────────────────────────
  if (type === 'analysis') {
    try {
      // Yahoo Finance - temel veriler (F/K, PD/DD, EPS vs)
      let fundamentals = {};
      try {
        const qData = await yahooFetch(
          `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics,financialData,incomeStatementHistory`
        );
        const result = qData?.quoteSummary?.result?.[0] || {};
        const ks = result.defaultKeyStatistics || {};
        const fd = result.financialData || {};
        const is = result.incomeStatementHistory?.incomeStatementHistory?.[0] || {};

        fundamentals = {
          pe: ks.trailingPE?.raw,
          pb: ks.priceToBook?.raw,
          eps: ks.trailingEps?.raw,
          roe: fd.returnOnEquity?.raw ? (fd.returnOnEquity.raw * 100).toFixed(1) : null,
          revenue: is.totalRevenue?.raw,
          netIncome: is.netIncome?.raw,
          operatingIncome: is.operatingIncome?.raw,
          debtToEquity: fd.debtToEquity?.raw,
          currentRatio: fd.currentRatio?.raw,
          revenueGrowth: fd.revenueGrowth?.raw ? (fd.revenueGrowth.raw * 100).toFixed(1) : null,
          earningsGrowth: fd.earningsGrowth?.raw ? (fd.earningsGrowth.raw * 100).toFixed(1) : null,
          targetPrice: fd.targetMeanPrice?.raw,
          recommendation: fd.recommendationKey,
        };
      } catch(e) {
        // Temel veri yoksa devam et
      }

      const fundamentalContext = Object.keys(fundamentals).length > 0
        ? `\nTemel Veriler: F/K=${fundamentals.pe?.toFixed(1)||'?'}, PD/DD=${fundamentals.pb?.toFixed(2)||'?'}, EPS=${fundamentals.eps?.toFixed(2)||'?'} TL, ROE=%${fundamentals.roe||'?'}, Borç/Özkaynak=${fundamentals.debtToEquity?.toFixed(2)||'?'}, Cari Oran=${fundamentals.currentRatio?.toFixed(2)||'?'}, Gelir Büyümesi=%${fundamentals.revenueGrowth||'?'}, Kar Büyümesi=%${fundamentals.earningsGrowth||'?'}, Hedef Fiyat=${fundamentals.targetPrice?.toFixed(1)||'?'} TL`
        : '';

      const prompt = `Türk borsa analisti olarak ${code} (${name}) hissesini hem teknik hem temel (bilanço) açısından kapsamlı analiz et.
Fiyat: ${price} TL | Günlük Değişim: ${chg}%${fundamentalContext}

SADECE geçerli JSON döndür, başka hiçbir şey yazma:
{
  "sentiment_score": <0-100>,
  "sentiment": "<ÇOK OLUMLU|OLUMLU|NÖTR|OLUMSUZ|ÇOK OLUMSUZ>",
  "technical_score": <0-100>,
  "fundamental_score": <0-100>,
  "momentum_score": <0-100>,
  "summary": "<3-4 cümle Türkçe teknik+temel analiz özeti>",
  "signal": "<GÜÇLÜ AL|AL|TUT|SAT|GÜÇLÜ SAT>",
  "key_levels": {"destek": ${(price*0.95).toFixed(1)}, "direnc": ${(price*1.05).toFixed(1)}},
  "balance_sheet": {
    "pe_comment": "<F/K oranı değerlendirmesi veya veri yok>",
    "pb_comment": "<PD/DD değerlendirmesi veya veri yok>",
    "roe_comment": "<ROE değerlendirmesi veya veri yok>",
    "debt_comment": "<Borçluluk değerlendirmesi veya veri yok>",
    "growth_comment": "<Büyüme değerlendirmesi veya veri yok>"
  },
  "risks": ["<risk1>", "<risk2>", "<risk3>"],
  "opportunities": ["<fırsat1>", "<fırsat2>", "<fırsat3>"]
}`;

      const aiText = await claudeCall(prompt, 900);
      const ai = JSON.parse(aiText);

      // Gerçek fundamentals varsa ekle
      if (Object.keys(fundamentals).length) {
        ai.fundamentals_raw = fundamentals;
      }

      return res.status(200).json(ai);

    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Unknown type' });
}

function relTime(ms) {
  if (!ms) return 'Bugün';
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} gün önce`;
  if (h > 0) return `${h} saat önce`;
  if (m > 0) return `${m} dk önce`;
  return 'Az önce';
}
