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
  
  // The cleaned sample showed: {"time":177164185319130,"lat33.244599lon-90.3815al:0pol"mds14mcg"stu:2regisi:[a5464039:-79.9729t},9:
  // This means the unicode chars ARE replacing JSON structural chars like ":", ",", "{", "}", "[", "]", and quote chars
  // Let's look at the raw hex carefully to understand the mapping
  
  // From first debug: HEX: 7b2274696d65223a313737313634c488383330c48a3332393830302c226c6174c48633352e31c488313031c4996c6f6ec4862d39342ec49539373033
  // 7b = {
  // 22 74 69 6d 65 22 = "time"
  // 3a = :
  // 31 37 37 31 36 34 = 177164
  // c4 88 = U+0108 (Ĉ) -- inserted between digits
  // 38 38 33 30 = 8830
  // c4 8a = U+010A (Ċ) -- inserted between digits  
  // 33 32 39 38 30 30 = 329800
  // 2c = ,
  // 22 6c 61 74 22 = "lat"
  // c4 86 = U+0106 (Ć) -- this replaces ":"
  // 33 35 2e 31 = 35.1
  // c4 88 = U+0108 (Ĉ) -- inserted
  // 31 30 31 = 101
  // c4 99 = U+0119 (ę) -- inserted
  // 6c 6f 6e = lon (this is the key name, but "," and ":" are missing!)
  
  // So the unicode chars are replacing the JSON structural chars:
  // U+0106 (Ć) = ":"  (after "lat")
  // U+0108 (Ĉ) = inserted noise in numbers
  // U+010A (Ċ) = inserted noise in numbers
  // U+0119 (ę) = "," (separator between lat value and "lon" key)
  
  // Let's verify by looking at what the cleaned sample shows vs expected JSON:
  // Expected: {"time":177164185319130,"lat":33.244599,"lon":-90.3815,"alt":0,"pol":...
  // Cleaned:  {"time":177164185319130,"lat33.244599lon-90.3815al:0pol"mds14mcg"stu:2regisi:[
  // 
  // So after "lat" the ":" was replaced by U+0106 (Ć) and got removed
  // After "33.244599" the "," was replaced by U+0119 (ę) and got removed
  // After "lon" the ":" was replaced and removed
  // The key names are also being truncated: "alt" -> "al", "pol" -> "pol", "mds" -> "mds"
  // Wait "alt" -> "al" means the "t" was replaced by a unicode char!
  
  // Let me look at the actual bytes around the "lat" value
  const hex = buf.toString('hex');
  console.log('Full hex:', hex);
  
  ws.close();
  process.exit(0);
});

ws.on('error', (e) => { console.log('[ERROR]', e.message); process.exit(1); });
setTimeout(() => process.exit(1), 15000);
