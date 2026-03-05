export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { code, name, price, chg, type = 'analysis' } = req.body;

  const prompts = {
    analysis: `Sen bir Türk borsa analistisin. ${code} (${name}) hissesini analiz et.
Fiyat: ${price} TL | Değişim: ${chg}%
SADECE JSON döndür:
{"sentiment_score":70,"sentiment":"OLUMLU","technical_score":65,"fundamental_score":60,"momentum_score":72,"summary":"2-3 cümle analiz","signal":"AL","key_levels":{"destek":${(price*0.95).toFixed(1)},"direnc":${(price*1.05).toFixed(1)}},"risks":["risk1","risk2"],"opportunities":["fırsat1","fırsat2"]}`,
    news: `${code} (${name}) hissesi için 5 güncel haber başlığı üret. SADECE JSON array döndür:
[{"headline":"başlık","sentiment":"POZİTİF","time":"2sa önce","source":"Borsa Gündem"},...]`
  };

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
        messages: [{ role: 'user', content: prompts[type] }]
      })
    });
    const data = await r.json();
    const text = data.content?.[0]?.text || '{}';
    const cleaned = text.replace(/```json|```/g, '').trim();
    return res.status(200).json(JSON.parse(cleaned));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
