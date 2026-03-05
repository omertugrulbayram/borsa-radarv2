export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker, code } = req.query;
  if (!ticker && !code) return res.status(400).json({ error: 'ticker required' });

  const query = ticker || code;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Referer': 'https://finance.yahoo.com/',
  };

  try {
    // Yahoo Finance search — returns news mixed with quotes
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=10&quotesCount=0&enableFuzzyQuery=false&enableCb=false`;
    const r = await fetch(url, { headers });
    const data = await r.json();

    const rawNews = data?.news || [];
    const news = rawNews.slice(0, 8).map(n => ({
      title:     n.title || '',
      publisher: n.publisher || 'Yahoo Finance',
      link:      n.link || `https://finance.yahoo.com/quote/${query}/news`,
      time:      n.providerPublishTime ? relTime(n.providerPublishTime * 1000) : 'Bugün',
    })).filter(n => n.title);

    return res.status(200).json({ news });
  } catch(e) {
    return res.status(500).json({ error: e.message, news: [] });
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
