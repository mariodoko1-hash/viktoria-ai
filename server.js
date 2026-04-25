const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const AFFILIATE_URL = process.env.AFFILIATE_URL || 'https://aviasales.tpk.lv/09JBVSD2';
const TP_TOKEN = process.env.TP_TOKEN;

const SYSTEM_PROMPT = `Je Viktoria, asistente miqesore e agjencise "Viktoria Travel" ne Shqiperi.

RREGULLI ME I RENDESISHEM: Kur dikush thote nje destinacion, MOS jep keshilla menjehere. Fillimisht mbledh keto te dhena me nje mesazh bisedor:
- Sa persona udhetojne? (dhe a ka femije?)
- Sa nete qendrim?
- Nga cili qytet niset udhetimi? (zakonisht Tirana)
- Cfare aktivitetesh preferojne? (natyre, histori, plazh, jete nate, shopping, ushqim lokal, etj.)

VETEM pasi ke te gjitha keto, jep keshilla konkrete dhe personale.

TONI: Si mik i ngrohe qe ka udhetuar shume. Paragrage te shkurtra, pa lista te gjata.

FLUTURIMET: Kur je gati te rekomandosh destinacionin, ne fund shto: [SHOW_FLIGHTS:IATA_CODE]
Shembull: per Malte shto [SHOW_FLIGHTS:MLA], per Berlin [SHOW_FLIGHTS:BER], per Greqi [SHOW_FLIGHTS:ATH]

NJOHURI LOKALE:
- WizzAir dhe Ryanair kane fluturime DIREKTE nga Tirana per shume destinacione europiane
- Malte: direkt nga Tirana me WizzAir/Ryanair
- Greqi: shume direkte
- Itali: direkte per Milano, Rome, Bari
- Gjermani: direkte per Berlin, Mynih

Fol gjithmone shqip.`;

app.get('/test', (req, res) => {
  res.json({ status: 'ok', gemini_key: GEMINI_API_KEY ? 'set' : 'missing' });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY missing' });
    }

    const geminiMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: geminiMessages,
          generationConfig: { maxOutputTokens: 800, temperature: 0.8 }
        })
      }
    );

    const data = await geminiRes.json();
    console.log('Gemini:', JSON.stringify(data).substring(0, 300));

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Ndodhi nje gabim.';
    const flightMatch = text.match(/\[SHOW_FLIGHTS:([^\]]+)\]/);
    const cleanText = text.replace(/\[SHOW_FLIGHTS:[^\]]+\]/g, '').trim();

    let flights = null;
    if (flightMatch && TP_TOKEN) {
      flights = await getFlights(flightMatch[1]);
    }

    res.json({ text: cleanText, flights, affiliateUrl: AFFILIATE_URL });

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function getFlights(iata) {
  try {
    const url = `https://api.travelpayouts.com/v1/prices/cheap?origin=TIA&destination=${iata}&currency=EUR&token=${TP_TOKEN}`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.data && d.data[iata]) {
      return Object.values(d.data[iata]).slice(0, 3).map(p => ({
        price: p.price,
        airline: p.airline,
        departure: p.departure_at,
        stops: p.transfers
      }));
    }
    return null;
  } catch (e) {
    return null;
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Viktoria AI running on port ${PORT}`));
