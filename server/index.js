// Mini Racing server: serves the built game, hosts race rooms over WebSocket
// and keeps the lap records. The rooms themselves are src/shared/room.js; this
// file is the plumbing and the limits that keep a public endpoint polite.

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Room, MAX_CARS } from '../src/shared/room.js';
import { Records } from './records.js';
import { Ghosts } from './ghosts.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
};
const CSP = "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: they read as 1 and 0
const LIMITS = { rooms: 300, perIp: 40, msgsPerSec: 90, payload: 8192, post: 512, ghostPost: 32768, postsPerMin: 30, idleMs: 30 * 60 * 1000 };

export function startServer({
  port = +(process.env.PORT || 8080),
  dist = resolve(fileURLToPath(new URL('../dist', import.meta.url))),
  dataDir = process.env.DATA_DIR || resolve(fileURLToPath(new URL('../data', import.meta.url))),
  origins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy = process.env.TRUST_PROXY === '1',
  recordsFile,
  ghostsFile,
  open = true, // timings for open rooms; tests shorten them
} = {}) {
  const records = new Records(recordsFile === undefined ? join(dataDir, 'records.json') : recordsFile);
  const ghosts = new Ghosts(ghostsFile === undefined ? join(dataDir, 'ghosts.json') : ghostsFile);
  const rooms = new Map(), perIp = new Map(), posts = new Map();

  const ipOf = (req) => (trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
  // Browsers always send Origin on a WebSocket handshake; it must be this site.
  const originOk = (req) => {
    const o = req.headers.origin;
    if (!o) return false;
    try {
      const u = new URL(o);
      return u.host === req.headers.host || origins.includes(o) || origins.includes(u.host);
    } catch { return false; }
  };
  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify(body));
  };

  // The two things anyone may write: a lap time and a ghost. Same site only,
  // a few a minute per address, a small body, and `use` checks every field.
  const post = (req, res, cap, use) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    if (req.headers.origin && !originOk(req)) return json(res, 403, { error: 'origin' });
    const ip = ipOf(req), now = Date.now(), p = posts.get(ip) || { n: 0, t: now };
    if (now - p.t > 60000) { p.n = 0; p.t = now; }
    posts.set(ip, p);
    if (++p.n > LIMITS.postsPerMin) return json(res, 429, { error: 'slow down' });
    let body = '', over = false;
    req.on('data', (c) => {
      if (over) return;
      body += c;
      if (body.length > cap) { over = true; body = ''; json(res, 413, { error: 'too big' }); req.destroy(); }
    });
    req.on('end', () => {
      if (over) return;
      try {
        const msg = JSON.parse(body);
        if (!msg || typeof msg !== 'object') throw new Error('not an object');
        json(res, 200, use(msg));
      } catch { json(res, 400, { error: 'bad request' }); }
    });
    return undefined;
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/health') return json(res, 200, { ok: true, rooms: rooms.size });
    if (url.pathname === '/api/records') {
      if (req.method === 'GET') return json(res, 200, records.top(10));
      return post(req, res, LIMITS.post, ({ track, name, ms }) => (
        { ...records.submit(String(track), name, Number(ms)), top: records.top(10)[String(track)] || [] }));
    }
    // The lap to beat in a time trial: the quickest one anybody has sent the path of.
    if (url.pathname === '/api/ghost') {
      if (req.method === 'GET') {
        const g = ghosts.get(String(url.searchParams.get('track')));
        return g ? json(res, 200, g) : json(res, 404, { error: 'no ghost yet' });
      }
      return post(req, res, LIMITS.ghostPost, ({ track, name, ms, d }) => ghosts.submit(String(track), name, ms, d));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' });

    // Static files from the build. Anything that isn't a file gets the app shell.
    let rel;
    try { rel = normalize(decodeURIComponent(url.pathname)); } catch { return json(res, 400, { error: 'bad path' }); }
    let file = join(dist, rel);
    if (file !== dist && !file.startsWith(dist + sep)) return json(res, 403, { error: 'forbidden' });
    if (!existsSync(file) || !statSync(file).isFile()) {
      if (extname(rel)) return json(res, 404, { error: 'not found' });
      file = join(dist, 'index.html');
      if (!existsSync(file)) return json(res, 503, { error: 'not built: run npm run build' });
    }
    const hashed = file.includes(`${sep}assets${sep}`);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      'content-security-policy': CSP, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (req.method === 'HEAD') return res.end();
    return createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.payload, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    const ip = ipOf(req);
    const refuse = (line) => { socket.write(`HTTP/1.1 ${line}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
    if (new URL(req.url, 'http://x').pathname !== '/ws') return refuse('404 Not Found');
    if (!originOk(req)) return refuse('403 Forbidden');
    if ((perIp.get(ip) || 0) >= LIMITS.perIp) return refuse('429 Too Many Requests');
    return wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, ip));
  });

  const sockets = new Map();
  const newCode = () => {
    for (let tries = 0; tries < 50; tries++) {
      const code = Array.from({ length: 4 }, () => LETTERS[randomInt(LETTERS.length)]).join('');
      if (!rooms.has(code)) return code;
    }
    return null;
  };
  const sendTo = (id, msg) => {
    const ws = sockets.get(id);
    if (ws && ws.readyState === 1 && ws.bufferedAmount < 256 * 1024) ws.send(JSON.stringify(msg));
  };
  const dropRoom = (room) => {
    rooms.delete(room.code);
    for (const id of room.clients.keys()) sockets.get(id)?.close(1000, 'room closed');
  };

  wss.on('connection', (ws, ip) => {
    const id = randomBytes(9).toString('base64url');
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    sockets.set(id, ws);
    let room = null, count = 0, windowStart = Date.now();
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data, isBinary) => {
      const now = Date.now();
      if (now - windowStart > 1000) { windowStart = now; count = 0; }
      if (++count > LIMITS.msgsPerSec || isBinary) return ws.close(1008, 'too many messages');
      let msg;
      try { msg = JSON.parse(data); } catch { return ws.close(1003, 'bad message'); }
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return undefined;
      if (room) return room.onMessage(id, msg);
      if (msg.t === 'create') {
        const code = rooms.size < LIMITS.rooms && newCode();
        if (!code) return sendTo(id, { t: 'error', error: 'The server is full. Try again in a bit.' });
        room = new Room({ code, kind: msg.kind === 'screen' ? 'screen' : 'party', send: sendTo, records });
        rooms.set(code, room);
        room.addClient(id, msg);
      } else if (msg.t === 'quick') {
        // Any open room with a space will do: the busiest first, so people end up together.
        let found = null;
        for (const r of rooms.values()) {
          const n = r.open && !r.dead ? r.humanCars().length : MAX_CARS;
          if (n < MAX_CARS && (!found || n > found.humanCars().length)) found = r;
        }
        if (!found) {
          const code = rooms.size < LIMITS.rooms && newCode();
          if (!code) return sendTo(id, { t: 'error', error: 'The server is full. Try again in a bit.' });
          found = new Room({ code, kind: 'party', open, send: sendTo, records });
          rooms.set(code, found);
        }
        const res = found.addClient(id, msg);
        if (res.error) return sendTo(id, { t: 'error', error: res.error });
        room = found;
      } else if (msg.t === 'join') {
        const found = rooms.get(String(msg.code || '').toUpperCase().slice(0, 4));
        const res = found ? found.addClient(id, msg) : { error: 'No room with that code' };
        if (res.error) return sendTo(id, { t: 'error', error: res.error });
        room = found;
      } else if (msg.t === 'ping') sendTo(id, { t: 'pong', c: msg.c, now });
      return undefined;
    });
    ws.on('close', () => {
      sockets.delete(id);
      const n = (perIp.get(ip) || 1) - 1;
      if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
      if (room) {
        room.removeClient(id);
        if (room.dead) dropRoom(room);
      }
    });
    ws.on('error', () => {});
  });

  const tick = setInterval(() => { for (const room of rooms.values()) room.tick(1 / 15); }, 1000 / 15);
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false; ws.ping();
    }
    for (const room of rooms.values()) if (room.dead || room.clients.size === 0 || now - room.touched > LIMITS.idleMs) dropRoom(room);
    for (const [ip, p] of posts) if (now - p.t > 120000) posts.delete(ip);
  }, 20000);

  const close = () => new Promise((done) => {
    clearInterval(tick); clearInterval(sweep);
    records.save(); ghosts.save();
    for (const ws of wss.clients) ws.terminate();
    server.close(() => done());
  });
  return new Promise((ready) => {
    server.listen(port, () => ready({ server, port: server.address().port, rooms, records, ghosts, close }));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startServer();
  console.log(`miniracing listening on :${s.port}`);
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => s.close().then(() => process.exit(0)));
}
