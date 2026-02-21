import WebSocket from 'ws';

const ws = new WebSocket('wss://ws1.blitzortung.org', {
  headers: { 'Origin': 'https://www.blitzortung.org', 'User-Agent': 'Mozilla/5.0' }
});

ws.on('open', () => {
  ws.send(JSON.stringify({ a: 111 }));
});

ws.on('message', (data) => {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const str = buf.toString('utf8');
  
  // Build a mapping of unicode code points found
  const mapping = new Map();
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code > 127) {
      mapping.set(code, (mapping.get(code) || 0) + 1);
    }
  }
  
  console.log('Unicode chars found:', [...mapping.entries()].sort((a,b) => a[0]-b[0]).map(([c, n]) => `0x${c.toString(16)}(${String.fromCharCode(c)})x${n}`).join(', '));
  
  // The pattern: Blitzortung encodes digits 0-9 as unicode chars starting at 0x100
  // Based on the hex: c4 88 = U+0108 appears where "8" should be
  // c4 8a = U+010A appears where "0" should be  
  // c4 86 = U+0106 appears where ":" (colon) should be... wait
  // Let's look at the actual JSON structure
  // {"time":1771648830329800,"lat":35.1...
  // At position 14 we have 0x108 - this is where "8" in "1771648830" should be
  // So 0x108 = digit 8? Let's check: 0x100 = 0, 0x101 = 1, ..., 0x108 = 8, 0x10a = 0 (but 0x10a != 0x100+0)
  // Actually: 0x108 = 8 (0x100 + 8), 0x10a = 0 (but 0x10a = 266, not 256)
  // Wait - 0x10a = 10 which is not a digit. Let me re-examine.
  // The time value is 1771648830329800
  // Position 14 in "{"time":177164" is after "177164" - next digit should be "8"
  // 0x108 = 264, 264 - 256 = 8 ✓ so 0x100+digit = unicode char
  // Position 18: after "177164?830" - but 0x10a = 266, 266-256=10 which is not a digit
  // Hmm, let me look at the raw hex more carefully
  
  // HEX: 7b2274696d65223a313737313634c488383330c48a3332393830302c
  // Breaking down: 31 37 37 31 36 34 = "177164"
  // c4 88 = U+0108 (Ĉ) - this is digit 8? No wait...
  // After U+0108 we have 38 38 33 30 = "8830"
  // So the sequence is: "177164" + U+0108 + "8830" + U+010A + "329800"
  // The original number is 1771648830329800
  // So U+0108 replaces nothing - it's inserted between digits as a separator?
  // No: 177164 + [U+0108] + 8830 + [U+010A] + 329800 = 1771648830329800
  // The unicode chars are INSERTED between groups of digits!
  // U+0108 and U+010A are just separators/obfuscation that should be removed!
  
  console.log('\nTrying: remove all chars > 0x7F');
  const cleaned = str.replace(/[^\x00-\x7F]/g, '');
  try {
    const parsed = JSON.parse(cleaned);
    console.log('SUCCESS! Parsed:', JSON.stringify(parsed).substring(0, 200));
  } catch(e) {
    console.log('Failed:', e.message);
    console.log('Cleaned sample:', cleaned.substring(0, 100));
  }
  
  ws.close();
  process.exit(0);
});

ws.on('error', (e) => { console.log('[ERROR]', e.message); process.exit(1); });
setTimeout(() => process.exit(1), 15000);
