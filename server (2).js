const http = require('http'), fs = require('fs'), path = require('path');
const CH = process.env.CHANNEL || 'javohirstars';
const PORT = process.env.PORT || 3000;
let cache = { t: 0, data: [] };
const TOKEN = process.env.BOT_TOKEN, ADMIN = process.env.ADMIN_ID;
const hits = new Map();
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cut = (s, n) => String(s || '').slice(0, n);
const readBody = req => new Promise((ok, no) => {
  let b = '';
  req.on('data', c => { b += c; if (b.length > 8000) { req.destroy(); no(new Error('big')); } });
  req.on('end', () => ok(b)); req.on('error', no);
});

const ent = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

async function posts() {
  if (Date.now() - cache.t < 300000 && cache.data.length) return cache.data;
  const r = await fetch('https://t.me/s/' + CH, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await r.text();
  const out = [];
  html.split('data-post="').slice(1).forEach(b => {
    const id = b.slice(0, b.indexOf('"'));
    const tm = b.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);
    const dt = b.match(/<time[^>]*datetime="([^"]+)"/);
    const ph = b.match(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/);
    const text = tm ? ent(tm[1].replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')).trim() : '';
    if (text || ph) out.push({ id, text: text.slice(0, 300), date: dt ? dt[1] : '', photo: ph ? ph[1] : '' });
  });
  cache = { t: Date.now(), data: out.reverse().slice(0, 6) };
  return cache.data;
}

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/order') {
    const send = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    try {
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 600000);
      if (h.length >= 5) return send(429, { ok: false });
      h.push(now); hits.set(ip, h);
      const d = JSON.parse(await readBody(req));
      if (d.hp) return send(200, { ok: true });
      if (!d.n || !d.c || !d.t) return send(400, { ok: false });
      if (!TOKEN || !ADMIN) return send(200, { ok: false, fallback: true });
      const text = '🛒 <b>Yangi buyurtma</b>\n\n👤 ' + esc(cut(d.n, 60)) + '\n📞 ' + esc(cut(d.c, 60)) +
        (d.tg ? '\n🔗 @' + esc(cut(d.tg, 40)) : '') + '\n🧩 ' + esc(cut(d.sv, 30)) +
        '\n💰 ' + esc(cut(d.b, 30)) + '\n⏱ ' + esc(cut(d.d, 30)) + '\n\n' + esc(cut(d.t, 800));
      const r = await fetch('https://api.telegram.org/bot' + TOKEN + '/sendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ADMIN, text, parse_mode: 'HTML' })
      });
      const j = await r.json();
      return send(200, { ok: !!j.ok, fallback: !j.ok });
    } catch (e) { return send(200, { ok: false, fallback: true }); }
  }
  if (req.url.startsWith('/api/posts')) {
    try {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' });
      res.end(JSON.stringify(await posts()));
    } catch (e) { res.end('[]'); }
    return;
  }
  if (req.url === '/healthz') { res.writeHead(200); return res.end('ok'); }
  const f = req.url.split('?')[0] === '/avatar.png' ? ['avatar.png', 'image/png'] : ['index.html', 'text/html; charset=utf-8'];
  fs.readFile(path.join(__dirname, f[0]), (e, d) => {
    if (e) { res.writeHead(500); return res.end('error'); }
    res.writeHead(200, { 'Content-Type': f[1], 'Cache-Control': 'public, max-age=3600' });
    res.end(d);
  });
}).listen(PORT, () => console.log('running on ' + PORT));
