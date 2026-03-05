export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'code required' });

  const key = process.env.FMP_API_KEY;
  const ticker = `${code}.IS`;

  try {
    const r = await fetch(`https://financialmodelingprep.com/stable/profile?symbol=${ticker}&apikey=${key}`);
    const data = await r.json();
    const d = Array.isArray(data) ? data[0] : data;
    if (!d || d['Error Message']) return res.status(200).json({ error: 'no_data' });

    // Parse 52w range "249.2-352.5"
    const range = d.range ? d.range.split('-') : [];
    const week52Low  = range[0] ? parseFloat(range[0]) : null;
    const week52High = range[1] ? parseFloat(range[1]) : null;

    return res.status(200).json({
      companyName:    d.companyName || null,
      sector:         d.sector || null,
      industry:       d.industry || null,
      currency:       d.currency || 'TRY',
      marketCap:      d.marketCap || null,
      beta:           d.beta != null ? +parseFloat(d.beta).toFixed(3) : null,
      price:          d.price || null,
      change:         d.change || null,
      changePct:      d.changePercentage || null,
      volume:         d.volume || null,
      avgVolume:      d.averageVolume || null,
      week52High,
      week52Low,
      lastDividend:   d.lastDividend || null,
      isin:           d.isin || null,
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
