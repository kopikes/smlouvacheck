export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SYSTEM = `Jsi právní asistent specializující se na analýzu smluv. Analyzuješ smlouvy v češtině a identifikuješ potenciálně nevýhodné nebo rizikové klauzule pro klienta.
Vrať POUZE validní JSON bez markdown nebo jiného textu:
{"souhrn":"...","typ_smlouvy":"...","rizika":[{"nazev":"...","popis":"...","zavaznost":"vysoka","sekce":"..."}],"pozitivni":[{"nazev":"...","popis":"..."}],"doporuceni":"...","celkove_hodnoceni":"bezpecna"}
zavaznost: vysoka|stredni|nizka. celkove_hodnoceni: bezpecna|opatrnost|nebezpecna`;

  try {
    // Manually read body from stream
    const rawBody = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk.toString(); });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      return res.status(400).json({ error: 'Neplatný JSON: ' + e.message });
    }

    const { messages } = body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Chybí messages' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: SYSTEM,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'Chyba API ' + response.status,
      });
    }

    const raw = (data.content || []).map(b => b.text || '').join('');
    const clean = raw.replace(/```json|```/g, '').trim();

    if (!clean) return res.status(500).json({ error: 'AI vrátila prázdnou odpověď' });

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return res.status(500).json({ error: 'Chyba parsování AI odpovědi: ' + clean.substring(0, 200) });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: 'Chyba: ' + err.message });
  }
}
