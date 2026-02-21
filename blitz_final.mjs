import WebSocket from 'ws';

/**
 * Blitzortung encoding analysis:
 * The server sends JSON with some characters replaced by Unicode chars in range U+0100-U+03FF.
 * Key findings from hex analysis:
 * - U+0106 (Ć) replaces ":" (colon)
 * - U+0119 (ę) replaces "," (comma) 
 * - Other Unicode chars in range U+0100-U+03FF are noise inserted into numeric values
 * - Some letters in key names are also replaced by Unicode (e.g. "alt" -> "al" + U+??)
 * 
 * The approach: replace U+0106->: and U+0119->comma, then strip remaining non-ASCII
 * But this leaves broken key names. Better approach: use regex to extract lat/lon/time directly.
 */
function decodeBlitzortung(buf) {
  const str = buf.toString('utf8');
  
  // Replace known structural chars
  let decoded = str
    .replace(/\u0106/g, ':')   // Ć -> :
    .replace(/\u0119/g, ',');  // ę -> ,
  
  // Remove remaining non-ASCII noise
  decoded = decoded.replace(/[^\x00-\x7F]/g, '');
  
  return decoded;
}

function extractStrike(raw) {
  // Try to extract lat, lon, time using regex on the raw/decoded string
  // The time is in nanoseconds, lat/lon are in degrees * 1e7 or direct degrees
  
  const decoded = decodeBlitzortung(raw);
  
  // Try JSON parse first
  try {
    const obj = JSON.parse(decoded);
    if (obj.lat !== undefined && obj.lon !== undefined) {
      return { lat: obj.lat, lon: obj.lon, time: obj.time };
    }
  } catch {}
  
  // Fallback: regex extraction
  const timeMatch = decoded.match(/"time":(\d+)/);
  const latMatch = decoded.match(/"lat":([-\d.]+)/);
  const lonMatch = decoded.match(/"lon":([-\d.]+)/);
  
  if (latMatch && lonMatch && timeMatch) {
    return {
      time: parseInt(timeMatch[1]),
      lat: parseFloat(latMatch[1]),
      lon: parseFloat(lonMatch[1])
    };
  }
  
  return null;
}

const ws = new WebSocket('wss://ws1.blitzortung.org', {
  headers: { 'Origin': 'https://www.blitzortung.org', 'User-Agent': 'Mozilla/5.0' }
});

let count = 0;
ws.on('open', () => {
  console.log('[OPEN]');
  ws.send(JSON.stringify({ a: 111 }));
});

ws.on('message', (data) => {
  count++;
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const decoded = decodeBlitzortung(buf);
  const strike = extractStrike(buf);
  
  console.log(`[MSG ${count}] decoded: ${decoded.substring(0, 100)}`);
  console.log(`         strike: ${JSON.stringify(strike)}`);
  
  if (count >= 5) {
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (e) => { console.log('[ERROR]', e.message); process.exit(1); });
setTimeout(() => process.exit(1), 15000);
