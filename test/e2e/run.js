// End-to-end run in real Chrome against a real server: a solo race to the
// flag, an elimination game, a full 16-car online room, a late joiner, a
// big-screen party with phones as pads, and two strangers in an open race.
// Needs `npm run build` first.
//   node test/e2e/run.js [name ...]     e.g. node test/e2e/run.js solo party

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { startServer } from '../../server/index.js';
import { launch, open, act, sleep, autopilot, state } from './lib.js';

assert.ok(existsSync(new URL('../../dist/index.html', import.meta.url)), 'run `npm run build` first');
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

// Open rooms run on short clocks here, so the test does not sit through the real ones.
const server = await startServer({
  port: 0, dataDir: mkdtempSync(join(tmpdir(), 'miniracing-e2e-')),
  open: { laps: 1, lobby: 6000, late: 3000, results: 8000 },
});
const url = `http://localhost:${server.port}`;
const browser = await launch();
const pages = [];
const page = async (view, path = '/') => { const p = await open(browser, url + path, view); pages.push(p); return p; };
const shot = (p, name) => p.screenshot({ path: `${SHOTS}e2e-${name}.png` });

const setLaps = async (p, n) => {
  for (let i = 0; i < 6; i++) {
    const now = +(await p.textContent('.stepper b'));
    if (now === n) return;
    await p.click(`[data-act=step][data-key=laps][data-val="${now > n ? -1 : 1}"]`);
    await p.waitForFunction((was) => +document.querySelector('.stepper b').textContent !== was, now);
  }
  throw new Error(`could not set laps to ${n}`);
};
const started = (p) => p.waitForFunction(() => window.miniracing.session?.game?.started, null, { timeout: 15000 });
const rows = (p) => p.$$eval('.results tbody tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim())));
const joinAs = async (p, name) => { await p.fill('#name', name); await act(p, 'join'); };

// A player with no browser: joins over the socket and then just sits on the grid.
function ghost(code, name) {
  const ws = new WebSocket(`ws://localhost:${server.port}/ws`, { headers: { origin: url } });
  return new Promise((done, fail) => {
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', code, name, color: -1 })));
    ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'joined') done({ ws, m }); else if (m.t === 'error') done({ ws, error: m.error }); });
    ws.on('error', fail);
  });
}

const tests = {
  async solo() {
    const p = await page('desktop');
    await p.fill('#name', 'tester');
    await act(p, 'solo');
    await p.waitForSelector('.lobby');
    await p.click('[data-key=track][data-val=kitchen]');
    await p.waitForSelector('[data-val=kitchen].on');
    await setLaps(p, 1);
    await act(p, 'start');
    await started(p);
    await autopilot(p);
    await sleep(4000);
    await shot(p, 'solo-race');
    await p.waitForSelector('.results', { timeout: 120000 });
    await shot(p, 'solo-results');
    const mine = (await rows(p)).find((r) => r[1] === 'TESTER');
    assert.ok(mine, 'the player is in the results');
    assert.match(mine[2], /^\d:\d\d\.\d\d$/, 'the player has a finishing time');
    const board = await (await fetch(`${url}/api/records`)).json();
    assert.ok(board.kitchen?.some((r) => r.name === 'TESTER'), 'the lap went on the record board');
    // Race again, then try the other look and camera from the in-race menu and leave.
    await act(p, 'start');
    await started(p);
    await p.keyboard.press('Escape');
    await p.click('[data-key=retro][data-val=true]');
    await p.click('[data-key=camera][data-val=classic]');
    await act(p, 'resume');
    await sleep(1500);
    await shot(p, 'solo-16bit-classic');
    await p.keyboard.press('Escape');
    await act(p, 'leave');
    await p.waitForSelector('.home');
    await act(p, 'records');
    await p.waitForSelector('.board .blurb');
    await p.click('[data-act=rectrack][data-val=kitchen]');
    await p.waitForFunction(() => document.querySelector('.board')?.textContent.includes('TESTER'));
    await shot(p, 'records');
  },

  async elimination() {
    const p = await page('phoneWide');
    await act(p, 'solo');
    await p.waitForSelector('.lobby');
    await p.click('[data-key=mode][data-val=elim]');
    await p.waitForSelector('[data-val=elim].on');
    await setLaps(p, 1);
    await act(p, 'start');
    await started(p);
    await autopilot(p);
    await sleep(6000);
    await shot(p, 'elim-race');
    await p.waitForSelector('.results', { timeout: 240000 });
    assert.equal(await p.textContent('.results h2'), 'LAST CAR STANDING');
    await shot(p, 'elim-results');
  },

  async party() {
    const host = await page('desktop');
    await host.fill('#name', 'host');
    await act(host, 'create');
    await host.waitForSelector('.lobby .code');
    const code = (await host.textContent('.lobby .code')).trim();
    assert.match(code, /^[A-Z]{4}$/);
    const guests = [await page('phone', `/?j=${code}`), await page('phoneWide', `/?j=${code}`), await page('desktop', `/?j=${code}`)];
    for (const [i, g] of guests.entries()) await joinAs(g, `guest${i + 1}`);
    for (const g of guests) await g.waitForSelector('.lobby');
    const ghosts = [];
    for (let i = 0; i < 12; i++) ghosts.push(await ghost(code, `ghost${i + 1}`));
    assert.ok(ghosts.every((g) => g.m), 'twelve more players get in');
    const extra = await ghost(code, 'toomany');
    assert.ok(extra.error, 'a seventeenth player is turned away');
    extra.ws.close();
    await host.waitForFunction(() => document.querySelector('.players h3 em')?.textContent === '16/16');
    await shot(host, 'party-lobby');
    await shot(guests[0], 'party-lobby-phone');
    assert.equal(await guests[0].$('[data-act=start]'), null, 'only the host can start');
    await setLaps(host, 1);
    await act(host, 'start');
    const drivers = [host, ...guests];
    for (const d of drivers) { await started(d); await autopilot(d); }
    await sleep(5000);
    // Every browser should have every other browser's car about where its driver has it.
    const views = await Promise.all(drivers.map(state));
    for (const [i, view] of views.entries()) {
      assert.equal(view.cars.length, 16, 'sixteen cars on track');
      for (const [j, own] of views.entries()) {
        const real = own.cars.find((c) => c.id === own.mine), seen = view.cars.find((c) => c.id === own.mine);
        assert.ok(real.total > 30, `driver ${j} is under way`);
        assert.ok(Math.hypot(seen.x - real.x, seen.z - real.z) < 15, `driver ${i} sees driver ${j} where they are`);
      }
    }
    await shot(host, 'party-race');
    await shot(guests[0], 'party-race-phone');
    for (const d of drivers) await d.waitForSelector('.results', { timeout: 150000 });
    const table = await rows(host);
    assert.equal(table.length, 16);
    for (const name of ['HOST', 'GUEST1', 'GUEST2', 'GUEST3']) assert.match(table.find((r) => r[1] === name)[2], /^\d:\d\d\.\d\d$/, `${name} finished`);
    await shot(host, 'party-results');
    for (const g of ghosts) g.ws.close();
  },

  async latecomer() {
    const host = await page('desktop');
    await act(host, 'create');
    await host.waitForSelector('.lobby .code');
    const code = (await host.textContent('.lobby .code')).trim();
    await act(host, 'start');
    await started(host);
    await autopilot(host);
    await sleep(2500);
    const late = await page('phone', `/?j=${code}`);
    await joinAs(late, 'late');
    await late.waitForFunction(() => document.querySelector('#hud .watch')?.textContent.includes('NEXT RACE'), null, { timeout: 15000 });
    await sleep(1500);
    const a = await state(late);
    await sleep(1000);
    const b = await state(late);
    const hostCar = (await state(host)).mine;
    assert.ok(Math.hypot(b.cars.find((c) => c.id === hostCar).x - a.cars.find((c) => c.id === hostCar).x, b.cars.find((c) => c.id === hostCar).z - a.cars.find((c) => c.id === hostCar).z) > 2, 'the latecomer watches the race');
    await shot(late, 'latecomer');
    // The host leaving hands the room on rather than closing it.
    await host.keyboard.press('Escape');
    await act(host, 'leave');
    await host.waitForSelector('.home');
  },

  async screen() {
    const tv = await page('tv');
    await act(tv, 'screen');
    await tv.waitForSelector('.lobby .code');
    const code = (await tv.textContent('.lobby .code')).trim();
    const pads = [await page('phoneWide', `/?j=${code}`), await page('phone', `/?j=${code}`)];
    for (const [i, p] of pads.entries()) { await joinAs(p, `pad${i + 1}`); await p.waitForSelector('.pad'); }
    await tv.waitForFunction(() => document.querySelectorAll('.players li').length >= 2 && document.querySelector('.players').textContent.includes('PAD2'));
    await shot(tv, 'screen-lobby');
    await shot(pads[0], 'pad-lobby');
    assert.ok(await pads[0].isVisible('[data-start]'), 'the first phone can start');
    assert.ok(!(await pads[1].isVisible('[data-start]')), 'the second cannot');
    await pads[0].click('[data-start]');
    await started(tv);
    // Steer from the first phone and check its car answers on the big screen.
    const box = await pads[0].locator('.pad .steer').boundingBox();
    const grid = await state(tv);
    assert.equal(grid.role, 'screen');
    for (let i = 0; i < 6; i++) {
      await pads[0].mouse.move(box.x + box.width * (i % 2 ? 0.75 : 0.25), box.y + box.height / 2);
      await pads[0].mouse.down(); await sleep(350); await pads[0].mouse.up(); await sleep(350);
    }
    const later = await state(tv);
    const humans = later.cars.filter((c) => !c.bot);
    assert.equal(humans.length, 2);
    for (const car of humans) { const g = grid.cars.find((c) => c.id === car.id); assert.ok(Math.hypot(car.x - g.x, car.z - g.z) > 10, `${car.name} drives on the big screen`); }
    await pads[0].waitForFunction(() => /\d(st|nd|rd|th)/.test(document.querySelector('.pad .st').textContent), null, { timeout: 10000 });
    await pads[0].locator('.pad .tb.item').click();
    await shot(tv, 'screen-race');
    await shot(pads[0], 'pad-race');
    await shot(pads[1], 'pad-race-portrait');
  },

  async quick() {
    const a = await page('phone'), b = await page('desktop');
    await shot(a, 'home-phone');
    await a.fill('#name', 'ann');
    await act(a, 'quick');
    await a.waitForSelector('.lobby');
    assert.match(await a.textContent('.lobby h2'), /OPEN RACE/);
    await a.waitForFunction(() => /STARTS IN \d+/.test(document.querySelector('.lobby .soon')?.textContent));
    assert.equal(await a.$('[data-act=start]'), null, 'nobody has a start button');
    await b.fill('#name', 'bob');
    await act(b, 'quick');
    await b.waitForSelector('.lobby');
    const room = (p) => p.evaluate(() => { const r = window.miniracing.session.room; return { code: r.code, track: r.settings.track, humans: r.cars.filter((c) => !c.bot).length, cars: r.cars.length }; });
    await a.waitForFunction(() => window.miniracing.session.room.cars.filter((c) => !c.bot).length === 2);
    const [ra, rb] = [await room(a), await room(b)];
    assert.equal(rb.code, ra.code, 'both were put in the same room');
    assert.deepEqual([rb.humans, rb.cars], [2, 8], 'two people and six bots');
    await shot(a, 'quick-lobby-phone');
    await shot(b, 'quick-lobby');
    // Nobody presses anything: the race starts on the room's own clock.
    for (const p of [a, b]) { await started(p); await autopilot(p); }
    for (const p of [a, b]) await p.waitForSelector('.results', { timeout: 150000 });
    await a.waitForFunction(() => / IN \d+/.test(document.querySelector('.results .soon')?.textContent));
    await shot(a, 'quick-results-phone');
    // ... and so does the next one, on the next track.
    await b.waitForFunction((was) => { const r = window.miniracing.session.room; return r.phase !== 'results' && r.settings.track !== was; }, ra.track, { timeout: 30000 });
    await started(b);
    assert.notEqual((await room(a)).track, ra.track);
    assert.equal(await b.$('.results'), null, 'the results made way for the race');
  },
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(tests);
let failed = 0;
for (const name of names) {
  const t0 = Date.now(), mark = pages.length;
  try {
    await tests[name]();
    const problems = pages.slice(mark).flatMap((p) => p.problems);
    assert.deepEqual(problems, [], 'no errors in any browser console');
    console.log(`ok   ${name} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${e.message}`);
    for (const [i, p] of pages.slice(mark).entries()) await p.screenshot({ path: `${SHOTS}fail-${name}-${i}.png` }).catch(() => {});
  }
  for (const p of pages.slice(mark)) await p.context().close().catch(() => {});
}
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
