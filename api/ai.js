export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { code, name, price, chg, type = 'analysis' } = req.body;

  // ── HABERLER: KAP RSS + Claude sentiment ──────────────────
  if (type === 'news') {
    try {
      const kapUrl = `https://www.kap.org.tr/tr/Bildirim/RSS/${code}`;
      const r = await fetch(kapUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml' }
      });
      const xml = await r.text();

      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) !== null && items.length < 6) {
        const item = match[1];
        const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                       item.match(/<title>(.*?)<\/title>/))?.[1] || '';
        const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/))?.[1] || '';
        const link = (item.match(/<link>(.*?)<\/link>/))?.[1] || '';
        if (title) items.push({ title: title.trim(), pubDate, link });
      }

      if (!items.length) {
        return res.status(200).json([{
          headline: `${code} icin henuz KAP bildirimi yok`,
          sentiment: 'NOTR',
          time: 'Simdi',
          source: 'KAP',
          link: `https://www.kap.org.tr`
        }]);
      }

      // Claude ile sentiment
      const titlesText = items.map((it, i) => `${i+1}. ${it.title}`).join('\n');
      const sr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `${code} KAP bildirimleri icin sentiment: POZİTİF, NEGATİF veya NÖTR. Sadece JSON array:\n${titlesText}\n\nOrnek: ["POZİTİF","NÖTR"]`
          }]
        })
      });
      const sd = await sr.json();
      let sentiments = [];
      try {
        const st = sd.content?.[0]?.text?.replace(/```json|```/g,'').trim() || '[]';
        sentiments = JSON.parse(st);
      } catch(e) {}

      return res.status(200).json(items.map((it, i) => ({
        headline: it.title,
        sentiment: sentiments[i] || 'NÖTR',
        time: relTime(new Date(it.pubDate)),
        source: 'KAP',
        link: it.link || 'https://www.kap.org.tr'
      })));

    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── AI ANALİZ ─────────────────────────────────────────────
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `Turk borsa analisti olarak ${code} (${name}) hissesini analiz et. Fiyat: ${price} TL | Degisim: ${chg}%
Sadece JSON don, baska hicbir sey yazma:
{"sentiment_score":70,"sentiment":"OLUMLU","technical_score":65,"fundamental_score":60,"momentum_score":72,"summary":"2-3 cumle Turkce analiz","signal":"AL","key_levels":{"destek":${(price*0.95).toFixed(1)},"direnc":${(price*1.05).toFixed(1)}},"risks":["risk1","risk2"],"opportunities":["firsat1","firsat2"]}`
        }]
      })
    });
    const data = await r.json();
    const text = data.content?.[0]?.text?.replace(/```json|```/g,'').trim() || '{}';
    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function relTime(date) {
  if (!date || isNaN(date)) return 'Bugun';
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} gun once`;
  if (h > 0) return `${h} saat once`;
  return `${m} dk once`;
}
