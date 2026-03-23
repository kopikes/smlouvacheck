import mammoth from 'mammoth';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { fileData, fileName, fileType } = req.body;
    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'Missing file data' });
    }

    let messages;
    const prompt = 'Analyzuj tuto smlouvu. Vrať POUZE JSON.';

    if (fileType === 'text') {
      // Plain text - send directly
      messages = [{ role: 'user', content: prompt + '\n\nSMLOUVA:\n' + fileData }];
    } else if (fileType === 'docx') {
      // Word document - extract text with mammoth
      const buf = Buffer.from(fileData, 'base64');
      const result = await mammoth.extractRawText({ buffer: buf });
      const text = result.value;
      if (!text || text.trim().length === 0) {
        return res.status(400).json({ error: 'Dokument je prázdný nebo nečitelný.' });
      }
      messages = [{ role: 'user', content: prompt + '\n\nSMLOUVA:\n' + text }];
    } else {
      // PDF - use Anthropic document API
      messages = [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileData } },
          { type: 'text', text: prompt }
        ]
      }];
    }

    const systemPrompt = `Jsi právní asistent specializující se na analýzu smluv v češtině. Identifikuj potenciálně nevýhodné nebo rizikové klauzule pro klienta.

DŮLEŽITÉ: Vrať POUZE validní JSON, žádný markdown, žádný text před/po JSON. Nepoužívej znaky nového řádku uvnitř textových hodnot - vše piš na jeden řádek. Buď stručný.

Formát:
{"souhrn":"krátký souhrn","typ_smlouvy":"typ","rizika":[{"nazev":"název rizika","popis":"stručný popis","zavaznost":"vysoka","sekce":"odkaz na sekci"}],"pozitivni":[{"nazev":"název","popis":"stručný popis"}],"doporuceni":"stručné doporučení","celkove_hodnoceni":"bezpecna"}

Hodnoty zavaznost: vysoka|stredni|nizka
Hodnoty celkove_hodnoceni: bezpecna|opatrnost|nebezpecna
Max 5 rizik, max 3 pozitivní. Buď stručný v popisech (max 1-2 věty).`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).json({ error: data.error?.message || 'API error' });
    }

    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
