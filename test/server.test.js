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
  s = await startServer({ port: 0, dist: join(dir, 'dist'), dataDir: dir, open: { lobby: 600, late: 300 } });
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

test('ghosts: the quickest sound lap is kept and served; slower ones, junk and oversized ones are not', async () => {
  // Arrange
  const post = (body) => fetch(`${base}/api/ghost`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
  const get = () => fetch(`${base}/api/ghost?track=breakfast`);
  const lap = (ms, fill = (i) => [i, -i, 0, 0]) => Array.from({ length: Math.floor(ms / 100) + 1 }, (_, i) => fill(i)).flat();
  // Assert: nothing to start with
  assert.equal((await get()).status, 404);
  // Act + assert: junk first, none of which is kept
  assert.equal((await post({ track: 'breakfast', name: 'A', ms: 15000, d: lap(15000).slice(0, 80) })).kept, false);
  assert.equal((await post({ track: 'breakfast', name: 'A', ms: 15000, d: lap(15000, () => [0.5, 0, 0, 0]) })).kept, false);
  assert.equal((await post({ track: 'breakfast', name: 'A', ms: 15000, d: lap(15000, () => [999999, 0, 0, 0]) })).kept, false);
  assert.equal((await post({ track: 'breakfast', name: 'A', ms: 15000, d: lap(15000, () => ['<b>', 0, 0, 0]) })).kept, false);
  assert.equal((await post({ track: 'breakfast', name: 'A', ms: 100, d: lap(100) })).kept, false);
  assert.equal((await post({ track: '__proto__', name: 'A', ms: 15000, d: lap(15000) })).kept, false);
  assert.equal((await get()).status, 404);
  const big = await fetch(`${base}/api/ghost`, { method: 'POST', body: JSON.stringify({ track: 'breakfast', name: 'A', ms: 15000, d: lap(15000, () => Array(60).fill(100000)) }) }).then((r) => r.status, () => 'dropped');
  assert.ok(big === 413 || big === 'dropped');
  // Act: a good lap, a slower one, then a quicker one
  assert.equal((await post({ track: 'breakfast', name: '<i>Ann', ms: 15000, d: lap(15000) })).kept, true);
  assert.equal((await post({ track: 'breakfast', name: 'Bob', ms: 16000, d: lap(16000) })).kept, false);
  assert.equal((await post({ track: 'breakfast', name: 'Cy', ms: 14000.4, d: lap(14000) })).kept, true);
  // Assert
  const held = await (await get()).json();
  assert.deepEqual([held.name, held.ms, held.d.length], ['CY', 14000, 141 * 4]);
  assert.equal((await fetch(`${base}/api/ghost?track=nowhere`)).status, 404);
  s.ghosts.save();
  assert.equal(JSON.parse(readFileSync(join(dir, 'ghosts.json'), 'utf8')).breakfast.name, 'CY');
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

test('playing with anyone: strangers land in the same open room, and it starts by itself', async () => {
  // Arrange
  const a = client(), b = client(), c = client();
  await Promise.all([a.open(), b.open(), c.open()]);
  c.send({ t: 'create', kind: 'party', name: 'Private' });
  const jc = await c.next('joined');
  // Act
  a.send({ t: 'quick', name: 'Ann' });
  const ja = await a.next('joined');
  b.send({ t: 'quick', name: 'Bob' });
  const jb = await b.next('joined');
  // Assert
  assert.equal(ja.open, true);
  assert.equal(jb.code, ja.code);
  assert.notEqual(ja.code, jc.code, 'a private room is never handed out');
  assert.equal(jb.cars.filter((x) => !x.bot).length, 2);
  a.send({ t: 'start' });
  const race = await b.next('race');
  assert.ok(Date.now() >= jb.startAt - 50, 'the race waited for its clock');
  assert.equal(race.grid.length, 8);
  a.ws.close(); b.ws.close(); c.ws.close();
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
