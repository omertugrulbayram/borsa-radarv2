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

async function claudeCall(prompt, maxTokens = 800) {
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
  const text = d.content?.[0]?.text || '';
  // JSON'u güvenli çıkar
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  return match ? match[0] : text;
}

async function getFundamentals(ticker) {
  try {
    const qData = await yahooFetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics,financialData`
    );
    const result = qData?.quoteSummary?.result?.[0] || {};
    const ks = result.defaultKeyStatistics || {};
    const fd = result.financialData || {};
    return {
      pe:             ks.trailingPE?.raw ?? null,
      pb:             ks.priceToBook?.raw ?? null,
      eps:            ks.trailingEps?.raw ?? null,
      roe:            fd.returnOnEquity?.raw != null ? (fd.returnOnEquity.raw * 100).toFixed(1) : null,
      debtToEquity:   fd.debtToEquity?.raw ?? null,
      currentRatio:   fd.currentRatio?.raw ?? null,
      revenueGrowth:  fd.revenueGrowth?.raw != null ? (fd.revenueGrowth.raw * 100).toFixed(1) : null,
      earningsGrowth: fd.earningsGrowth?.raw != null ? (fd.earningsGrowth.raw * 100).toFixed(1) : null,
      targetPrice:    fd.targetMeanPrice?.raw ?? null,
      recommendation: fd.recommendationKey ?? null,
    };
  } catch(e) {
    return {};
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { code, name, price, chg, type = 'analysis' } = req.body;
  const ticker = code + '.IS';

  // ── HABERLER: Claude gerçek piyasa bilgisiyle üretsin ─────
  if (type === 'news') {
    try {
      const fund = await getFundamentals(ticker);
      const fundCtx = fund.pe
        ? `F/K:${parseFloat(fund.pe).toFixed(1)}, PD/DD:${parseFloat(fund.pb||0).toFixed(2)}, ROE:%${fund.roe}, Hedef:${fund.targetPrice?.toFixed(1)||'?'}TL`
        : '';

      const raw = await claudeCall(
        `Sen Borsa İstanbul uzmanı bir finans analistisin. ${code} (${name}) hissesi hakkında ${new Date().toLocaleDateString('tr-TR')} tarihi itibarıyla gerçekçi ve bilgilendirici 6 haber/analiz başlığı yaz.
${fundCtx ? `Mevcut veriler: Fiyat ${price}TL, Değişim %${chg}, ${fundCtx}` : `Fiyat: ${price}TL, Değişim: %${chg}`}

Haberler şirkete özel olsun: finansal sonuçlar, yatırım planları, sektör gelişmeleri, analist görüşleri, teknik seviyeler gibi konular.
SADECE JSON array döndür, başka hiçbir şey yazma:
[
  {"headline":"başlık","sentiment":"POZİTİF","time":"2 saat önce","source":"Borsa Gündem"},
  {"headline":"başlık","sentiment":"NÖTR","time":"4 saat önce","source":"Reuters TR"},
  {"headline":"başlık","sentiment":"NEGATİF","time":"6 saat önce","source":"Bloomberg HT"},
  {"headline":"başlık","sentiment":"POZİTİF","time":"1 gün önce","source":"Dünya Gazetesi"},
  {"headline":"başlık","sentiment":"NÖTR","time":"1 gün önce","source":"Milliyet"},
  {"headline":"başlık","sentiment":"POZİTİF","time":"2 gün önce","source":"Ekonomim"}
]`, 600);

      const news = JSON.parse(raw);
      return res.status(200).json(news.map(n => ({
        ...n,
        link: `https://finance.yahoo.com/quote/${ticker}/news`
      })));

    } catch(e) {
      return res.status(500).json([{
        headline: `${code} haber verisi yüklenemedi`,
        sentiment: 'NÖTR', time: 'Şimdi', source: 'Hata', link: '#'
      }]);
    }
  }

  // ── AI + BİLANÇO ANALİZİ ──────────────────────────────────
  if (type === 'analysis') {
    try {
      const fund = await getFundamentals(ticker);

      const fundStr = Object.keys(fund).length
        ? `\nGerçek Temel Veriler: F/K=${fund.pe!=null?parseFloat(fund.pe).toFixed(1):'?'}, PD/DD=${fund.pb!=null?parseFloat(fund.pb).toFixed(2):'?'}, EPS=${fund.eps!=null?parseFloat(fund.eps).toFixed(2):'?'}TL, ROE=%${fund.roe||'?'}, Borç/Özkaynak=${fund.debtToEquity!=null?parseFloat(fund.debtToEquity).toFixed(2):'?'}, Cari Oran=${fund.currentRatio!=null?parseFloat(fund.currentRatio).toFixed(2):'?'}, Gelir Büyümesi=%${fund.revenueGrowth||'?'}, Kar Büyümesi=%${fund.earningsGrowth||'?'}, Analist Hedef=${fund.targetPrice!=null?parseFloat(fund.targetPrice).toFixed(1):'?'}TL, Tavsiye=${fund.recommendation||'?'}`
        : '';

      const raw = await claudeCall(
        `Türk borsa analisti olarak ${code} (${name}) hissesini teknik VE temel analiz et.
Fiyat: ${price}TL | Günlük Değişim: %${chg}${fundStr}

SADECE aşağıdaki formatta geçerli JSON döndür, başka hiçbir şey yazma:
{"sentiment_score":75,"sentiment":"OLUMLU","technical_score":70,"fundamental_score":65,"momentum_score":72,"summary":"3-4 cümle kapsamlı analiz özeti","signal":"AL","key_levels":{"destek":${(price*0.95).toFixed(1)},"direnc":${(price*1.05).toFixed(1)}},"balance_sheet":{"pe_comment":"F/K değerlendirmesi","pb_comment":"PD/DD değerlendirmesi","roe_comment":"ROE değerlendirmesi","debt_comment":"Borçluluk değerlendirmesi","growth_comment":"Büyüme değerlendirmesi"},"risks":["risk1","risk2","risk3"],"opportunities":["firsat1","firsat2","firsat3"]}`, 900);

      const ai = JSON.parse(raw);
      if (Object.keys(fund).length) ai.fundamentals_raw = fund;
      return res.status(200).json(ai);

    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Unknown type' });
}
