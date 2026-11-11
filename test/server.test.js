import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';

let s, base, dir;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'miniracing-'));
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist', 'index.html'), '<!doctype html><title>t</title>');
  s = await startServer({ port: 0, dist: join(dir, 'dist'), dataDir: dir });
  base = `http://localhost:${s.port}`;
});
after(() => s.close());

function client(origin = base) {
  const ws = new WebSocket(`ws://localhost:${s.port}/ws`, { headers: { origin } });
  const inbox = [], waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d); inbox.push(m);
    for (const w of [...waiters]) if (w.t === m.t) { waiters.splice(waiters.indexOf(w), 1); w.done(m); }
  });
  return {
    ws, inbox,
    open: () => new Promise((ok, no) => { ws.on('open', ok); ws.on('error', no); }),
    send: (m) => ws.send(JSON.stringify(m)),
    next: (t) => new Promise((done) => { waiters.push({ t, done }); }),
    closed: () => new Promise((done) => ws.on('close', done)),
  };
}

test('serves the app shell, health and a hardened header set', async () => {
  const res = await fetch(`${base}/some/deep/link`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await (await fetch(`${base}/health`)).json()).ok, true);
  assert.equal((await fetch(`${base}/missing.js`)).status, 404);
  assert.equal((await fetch(`${base}/..%2f..%2fpackage.json`)).status, 404);
});

test('lap records: sane laps are kept, cheats and junk are not, names are cleaned', async () => {
  const post = (body) => fetch(`${base}/api/records`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
  assert.equal((await post({ track: 'breakfast', name: '<img src=x>', ms: 15000 })).rank, 1);
  assert.equal((await post({ track: 'breakfast', name: 'Zed', ms: 100 })).rank, undefined);
  assert.equal((await post({ track: 'nowhere', name: 'Zed', ms: 15000 })).rank, undefined);
  assert.equal((await post({ track: 'breakfast', name: 'Zed', ms: 14000 })).rank, 1);
  const top = await (await fetch(`${base}/api/records`)).json();
  assert.deepEqual(top.breakfast.map((r) => r.name), ['ZED', 'IMG SRCX']);
  s.records.save();
  assert.equal(JSON.parse(readFileSync(join(dir, 'records.json'), 'utf8')).breakfast.length, 2);
});

test('a WebSocket from another site is refused', async () => {
  await assert.rejects(client('https://evil.example').open());
});

test('two players share a room: one creates, one joins by code, states are relayed', async () => {
  // Arrange
  const a = client(), b = client();
  await Promise.all([a.open(), b.open()]);
  a.send({ t: 'create', kind: 'party', name: 'Ann' });
  const ja = await a.next('joined');
  assert.match(ja.code, /^[A-Z]{4}$/);
  b.send({ t: 'join', code: ja.code.toLowerCase(), name: 'Bob' });
  const jb = await b.next('joined');
  assert.equal(jb.host, ja.you);
  // Act
  a.send({ t: 'set', settings: { bots: 0, laps: 1 } });
  a.send({ t: 'start' });
  const race = await b.next('race');
  a.send({ t: 'st', c: [[ja.car, 1, 2, 0, 0, 0, 0, 0, 5, 0]] });
  const snap = await b.next('snap');
  // Assert
  assert.equal(race.grid.length, 2);
  assert.deepEqual(snap.c[0].slice(0, 3), [ja.car, 1, 2]);
  a.ws.close(); b.ws.close();
});

test('joining a room that does not exist says so; flooding gets you dropped', async () => {
  const c = client();
  await c.open();
  c.send({ t: 'join', code: 'ZZZZ' });
  assert.match((await c.next('error')).error, /No room/);
  const gone = c.closed();
  for (let i = 0; i < 200; i++) c.send({ t: 'ping', c: i });
  await gone;
});
