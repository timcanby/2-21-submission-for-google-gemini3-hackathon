import WebSocket from 'ws';

const ws = new WebSocket('wss://ws1.blitzortung.org', {
  headers: {
    'Origin': 'https://www.blitzortung.org',
    'User-Agent': 'Mozilla/5.0'
  }
});

let msgCount = 0;

ws.on('open', () => {
  console.log('[OPEN] Connected');
  ws.send(JSON.stringify({ a: 111 }));
});

ws.on('message', (data) => {
  msgCount++;
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const str = buf.toString('utf8');
  
  console.log(`[MSG ${msgCount}] type=${typeof data}, isBuffer=${Buffer.isBuffer(data)}, len=${buf.length}`);
  console.log(`  first20chars: ${JSON.stringify(str.substring(0, 40))}`);
  
  // Try direct JSON parse
  try {
    const parsed = JSON.parse(str);
    console.log(`  DIRECT JSON: ${JSON.stringify(parsed).substring(0, 100)}`);
  } catch(e) {
    console.log(`  Not direct JSON: ${e.message}`);
  }
  
  if (msgCount >= 5) {
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (e) => console.log('[ERROR]', e.message));
ws.on('close', (code) => console.log('[CLOSE]', code));

setTimeout(() => { console.log('Timeout - no messages received'); process.exit(1); }, 15000);
