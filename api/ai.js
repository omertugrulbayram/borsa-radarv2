export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { code, name, price, chg, type = 'analysis' } = req.body;

  // ── HABERLER ──────────────────────────────────────────────
  if (type === 'news') {
    try {
      // Bigpara hisse haberleri
      const url = `https://bigpara.hurriyet.com.tr/api/v1/hisse/haberler/${code}`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://bigpara.hurriyet.com.tr',
          'Accept': 'application/json',
        }
      });

      let items = [];

      if (r.ok) {
        const data = await r.json();
        // Bigpara response formatı: data.data veya data array
        const list = data?.data || data || [];
        items = (Array.isArray(list) ? list : []).slice(0, 6).map(n => ({
          title: n.title || n.baslik || n.BASLIK || '',
          time: relTime(new Date(n.publishDate || n.tarih || n.TARIH || Date.now())),
          link: n.url || n.link || `https://bigpara.hurriyet.com.tr/hisse/${code}/`
        })).filter(n => n.title);
      }

      // Bigpara çalışmadıysa Mynet dene
      if (!items.length) {
        const r2 = await fetch(`https://finans.mynet.com/api/v2/news/list?symbol=${code}&limit=6`, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
        });
        if (r2.ok) {
          const d2 = await r2.json();
          const list2 = d2?.data?.items || d2?.items || [];
          items = list2.slice(0,6).map(n => ({
            title: n.title || n.baslik || '',
            time: relTime(new Date(n.date || n.publishedAt || Date.now())),
            link: n.url || n.link || '#'
          })).filter(n => n.title);
        }
      }

      if (!items.length) {
        return res.status(200).json([{
          headline: `${code} için haber bulunamadı`,
          sentiment: 'NÖTR',
          time: 'Şimdi',
          source: 'Bigpara',
          link: `https://bigpara.hurriyet.com.tr/hisse/${code}/`
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
          max_tokens: 150,
          messages: [{
            role: 'user',
            content: `Bu ${code} haberleri için sentiment: POZİTİF, NEGATİF, NÖTR. Sadece JSON array, başka hiçbir şey:\n${titlesText}\nÖrnek: ["POZİTİF","NÖTR"]`
          }]
        })
      });
      const sd = await sr.json();
      let sentiments = [];
      try {
        sentiments = JSON.parse(sd.content?.[0]?.text?.replace(/```json|```/g,'').trim() || '[]');
      } catch(e) {}

      return res.status(200).json(items.map((it, i) => ({
        headline: it.title,
        sentiment: sentiments[i] || 'NÖTR',
        time: it.time,
        source: 'Bigpara',
        link: it.link
      })));

    } catch(e) {
      return res.status(500).json([{ headline: `Haber yüklenemedi: ${e.message}`, sentiment: 'NÖTR', time: 'Şimdi', source: 'Hata', link: '#' }]);
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
  if (!date || isNaN(date)) return 'Bugün';
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} gün önce`;
  if (h > 0) return `${h} saat önce`;
  if (m > 0) return `${m} dk önce`;
  return 'Az önce';
}
