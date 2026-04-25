const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const AFFILIATE_URL = process.env.AFFILIATE_URL || 'https://aviasales.tpk.lv/09JBVSD2';
const TP_TOKEN = process.env.TP_TOKEN; // TravelPayouts API token

const SYSTEM_PROMPT = `Je Viktoria, asistente miqësore dhe eksperte e agjencisë "Viktoria Travel" në Shqipëri.

RREGULLI MË I RËNDËSISHËM: Kur dikush thotë një destinacion, MOS jep këshilla menjëherë.
Fillimisht mbledh këto të dhëna me një mesazh bisedor dhe njerëzor (jo si formular):
- Sa persona udhëtojnë? (dhe a ka fëmijë?)
- Sa netë qëndrim?
- Nga cili qytet niset udhëtimi? (zakonisht Tirana)
- Çfarë aktivitetesh preferojnë? (natyrë, histori, plazh, jetë nate, shopping, ushqim lokal, etj.)

VETËM pasi ke të gjitha këto, jep këshilla konkrete dhe personale.

TONI: Si mik i ngrohtë që ka udhëtuar shumë — jo si broshurë turistike. Paragrafë të shkurtra, pa lista të gjata me bullet points.

FLUTURIMET: Kur je gati të rekomandosh, në fund të mesazhit shto gjithmonë seksionin e fluturimeve me tagun special:
[SHOW_FLIGHTS:destinacion_anglisht]

Shembull: nëse klienti shkon në Maltë, shto [SHOW_FLIGHTS:Malta]
Nëse shkon në Berlin, shto [SHOW_FLIGHTS:Berlin]

NJOHURI LOKALE TË RËNDËSISHME:
- Nga Tirana, WizzAir dhe Ryanair kanë fluturime DIREKTE për shumë destinacione europiane
- Air Albania fluturon gjithashtu për disa destinacione
- Gjithmonë kontrollo nëse ka direkt para se të thuash "me ndalesë"
- Malta: WizzAir dhe Ryanair kanë direkt nga Tirana
- Greqi (Athinë, Korfuz, Selanik): fluturime të shumta direkte
- Itali (Milano, Romë, Bari, Bergamo): direkte
- Gjermani (Berlin, Mynih): direkte me WizzAir
- Mbaj mend: klienti është nga Shqipëria, jo nga vendet e tjera

Fol gjithmonë shqip.`;

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !GEMINI_API_KEY) {
    return res.status(400).json({ error: 'Missing messages or API key' });
  }

  try {
    // Convert to Gemini format
    const geminiMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: geminiMessages,
          generationConfig: { maxOutputTokens: 1000, temperature: 0.8 }
        })
      }
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Ndodhi një gabim.';

    // Check if we need to show flights
    const flightMatch = text.match(/\[SHOW_FLIGHTS:([^\]]+)\]/);
    const cleanText = text.replace(/\[SHOW_FLIGHTS:[^\]]+\]/g, '').trim();

    let flights = null;
    if (flightMatch && TP_TOKEN) {
      flights = await getFlights(flightMatch[1]);
    }

    res.json({ text: cleanText, flights, affiliateUrl: AFFILIATE_URL });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// TravelPayouts flight prices
async function getFlights(destination) {
  try {
    const destCodes = {
      'Malta': 'MLA', 'Berlin': 'BER', 'Rome': 'FCO', 'Milano': 'MXP',
      'Paris': 'CDG', 'London': 'LHR', 'Barcelona': 'BCN', 'Amsterdam': 'AMS',
      'Athens': 'ATH', 'Athinë': 'ATH', 'Dubai': 'DXB', 'Istanbul': 'IST',
      'Vienna': 'VIE', 'Prague': 'PRG', 'Budapest': 'BUD', 'Munich': 'MUC',
      'Mynih': 'MUC', 'Greqi': 'ATH', 'Itali': 'FCO', 'Gjermani': 'BER'
    };

    const iata = destCodes[destination] || destination;
    const url = `https://api.travelpayouts.com/v1/prices/cheap?origin=TIA&destination=${iata}&currency=EUR&token=${TP_TOKEN}`;
    const r = await fetch(url);
    const d = await r.json();

    if (d.data && d.data[iata]) {
      const prices = Object.values(d.data[iata]).slice(0, 3);
      return prices.map(p => ({
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
