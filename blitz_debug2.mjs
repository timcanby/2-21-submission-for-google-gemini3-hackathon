import WebSocket from 'ws';

const ws = new WebSocket('wss://ws1.blitzortung.org', {
  headers: { 'Origin': 'https://www.blitzortung.org', 'User-Agent': 'Mozilla/5.0' }
});

ws.on('open', () => {
  console.log('[OPEN]');
  ws.send(JSON.stringify({ a: 111 }));
});

ws.on('message', (data) => {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  
  // Print hex of first 60 bytes
  console.log('HEX:', buf.slice(0, 60).toString('hex'));
  console.log('RAW:', JSON.stringify(buf.slice(0, 60).toString('utf8')));
  
  // The data looks like JSON but with some chars replaced by unicode control chars
  // Let's try replacing them
  let str = buf.toString('utf8');
  
  // Blitzortung uses a simple substitution: digits 0-9 are replaced by unicode chars
  // Let's find what chars appear at positions that should be digits
  const sample = str.substring(0, 80);
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code > 127) {
      console.log(`  pos ${i}: char='${sample[i]}' code=${code} (0x${code.toString(16)})`);
    }
  }
  
  ws.close();
  process.exit(0);
});

ws.on('error', (e) => { console.log('[ERROR]', e.message); process.exit(1); });
setTimeout(() => process.exit(1), 15000);
